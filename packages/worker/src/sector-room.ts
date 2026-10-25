import { CanvasElement, SectorKey } from '@void-place/shared';

export interface Env {
  SECTOR_ROOMS: DurableObjectNamespace;
  TILES_BUCKET: R2Bucket;
  DB: D1Database;
}

export class SectorRoom implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Set<WebSocket> = new Set();
  private elements: Map<string, CanvasElement> = new Map();
  private sectorKey: SectorKey = '';

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Record<string, CanvasElement>>('elements');
      if (stored) {
        this.elements = new Map(Object.entries(stored));
      }
      this.sectorKey = (await this.state.storage.get<string>('sectorKey')) || '';
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') !== 'websocket') {
      // HTTP API for snapshot
      if (url.pathname === '/snapshot') {
        return Response.json({
          sectorKey: this.sectorKey,
          elements: Array.from(this.elements.values()),
        });
      }
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const sectorKey = url.searchParams.get('sectorKey') || 'default';
    if (!this.sectorKey) {
      this.sectorKey = sectorKey;
      await this.state.storage.put('sectorKey', sectorKey);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.handleSession(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleSession(ws: WebSocket): void {
    ws.accept();
    this.sessions.add(ws);

    // Send initial sector state
    ws.send(
      JSON.stringify({
        type: 'sync:init',
        elements: Array.from(this.elements.values()),
      })
    );

    ws.addEventListener('message', async (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === 'element:add') {
          const element = msg.element as CanvasElement;
          this.elements.set(element.id, element);

          // Broadcast to other peers in this sector
          this.broadcast(
            JSON.stringify({
              type: 'element:added',
              element,
            }),
            ws
          );

          // Persist state periodically
          await this.state.storage.put('elements', Object.fromEntries(this.elements));
          
          // Register sector activity in D1 for the Dive button
          await this.recordSectorActivity();
        }
      } catch (err) {
        console.error('Error handling WebSocket message', err);
      }
    });

    ws.addEventListener('close', () => {
      this.sessions.delete(ws);
    });

    ws.addEventListener('error', () => {
      this.sessions.delete(ws);
    });
  }

  private broadcast(data: string, sender?: WebSocket): void {
    for (const session of this.sessions) {
      if (session !== sender) {
        try {
          session.send(data);
        } catch {
          this.sessions.delete(session);
        }
      }
    }
  }

  private async recordSectorActivity(): Promise<void> {
    try {
      if (!this.env.DB) return;
      await this.env.DB.prepare(
        `INSERT INTO sectors (key, element_count, last_active)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           element_count = excluded.element_count,
           last_active = excluded.last_active`
      )
        .bind(this.sectorKey, this.elements.size, Date.now())
        .run();
    } catch {
      // Non-fatal if DB is not configured locally yet
    }
  }
}
