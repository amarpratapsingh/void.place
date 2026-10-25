import { CanvasElement, SectorKey, StrokeElement } from '@void-place/shared';

export interface Env {
  SECTOR_ROOMS: DurableObjectNamespace;
  TILES_BUCKET: R2Bucket;
  DB: D1Database;
}

const MAX_ELEMENTS_PER_SECTOR = 1500;
const MAX_STROKE_POINTS = 1000;
const RATE_LIMIT_MAX_REQUESTS = 15;
const RATE_LIMIT_WINDOW_MS = 5000;

interface RateLimitState {
  count: number;
  windowStart: number;
}

export class SectorRoom implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Set<WebSocket> = new Set();
  private sessionRateLimits: WeakMap<WebSocket, RateLimitState> = new WeakMap();
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
    this.sessionRateLimits.set(ws, { count: 0, windowStart: Date.now() });

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
          // 1. Anti-griefing: Rate limit check per session
          if (!this.checkRateLimit(ws)) {
            ws.send(
              JSON.stringify({
                type: 'error:ratelimit',
                message: 'Rate limit exceeded. Slow down your strokes.',
              })
            );
            return;
          }

          // 2. Anti-griefing: Validate element payload
          const element = msg.element as CanvasElement;
          if (!this.isValidElement(element)) {
            return;
          }

          // 3. Prevent memory exhaustion: prune oldest if beyond sector limit
          if (this.elements.size >= MAX_ELEMENTS_PER_SECTOR) {
            const oldestKey = this.elements.keys().next().value;
            if (oldestKey) this.elements.delete(oldestKey);
          }

          this.elements.set(element.id, element);

          // Broadcast to other peers in this sector
          this.broadcast(
            JSON.stringify({
              type: 'element:added',
              element,
            }),
            ws
          );

          // Persist state
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

  private checkRateLimit(ws: WebSocket): boolean {
    const now = Date.now();
    let limit = this.sessionRateLimits.get(ws);
    if (!limit) {
      limit = { count: 0, windowStart: now };
      this.sessionRateLimits.set(ws, limit);
    }

    if (now - limit.windowStart > RATE_LIMIT_WINDOW_MS) {
      limit.count = 0;
      limit.windowStart = now;
    }

    limit.count++;
    return limit.count <= RATE_LIMIT_MAX_REQUESTS;
  }

  private isValidElement(element: CanvasElement): boolean {
    if (!element || typeof element.id !== 'string' || !element.id) return false;
    if (!Number.isFinite(element.x) || !Number.isFinite(element.y) || !Number.isFinite(element.zoom)) return false;

    if (element.type === 'stroke') {
      const stroke = element as StrokeElement;
      if (!Array.isArray(stroke.points)) return false;
      if (stroke.points.length < 2 || stroke.points.length > MAX_STROKE_POINTS) return false;
      return true;
    }

    if (element.type === 'pixel_batch') {
      const batch = element as any;
      if (!Array.isArray(batch.pixels)) return false;
      if (batch.pixels.length === 0 || batch.pixels.length > MAX_STROKE_POINTS) return false;
      return true;
    }

    return true;
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
