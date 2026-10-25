import { CanvasElement } from '@void-place/shared';

export type OnElementCallback = (element: CanvasElement) => void;

export class SectorSyncManager {
  private activeConnections: Map<string, WebSocket> = new Map();
  private onElementAdded: OnElementCallback;

  constructor(onElementAdded: OnElementCallback) {
    this.onElementAdded = onElementAdded;
  }

  /**
   * Sync active WebSocket rooms with currently visible sectors.
   * Closes connections to out-of-view sectors and joins new ones.
   */
  public updateVisibleSectors(visibleSectorKeys: string[]): void {
    const desired = new Set(visibleSectorKeys);

    // Close connections that are no longer in viewport
    for (const [key, ws] of this.activeConnections.entries()) {
      if (!desired.has(key)) {
        ws.close();
        this.activeConnections.delete(key);
      }
    }

    // Connect to newly entered sectors
    for (const key of desired) {
      if (!this.activeConnections.has(key)) {
        this.connectToSector(key);
      }
    }
  }

  private connectToSector(sectorKey: string): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/api/room/${encodeURIComponent(sectorKey)}`;

    const ws = new WebSocket(url);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'sync:init' && Array.isArray(data.elements)) {
          data.elements.forEach(this.onElementAdded);
        } else if (data.type === 'element:added' && data.element) {
          this.onElementAdded(data.element);
        }
      } catch (e) {
        console.error('Failed to parse websocket message', e);
      }
    };

    ws.onclose = () => {
      this.activeConnections.delete(sectorKey);
    };

    this.activeConnections.set(sectorKey, ws);
  }

  public sendElement(sectorKey: string, element: CanvasElement): void {
    const ws = this.activeConnections.get(sectorKey);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'element:add', element }));
    }
  }
}
