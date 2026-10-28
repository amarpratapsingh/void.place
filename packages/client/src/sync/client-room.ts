import { CanvasElement } from '@void-place/shared';

export type OnElementCallback = (element: CanvasElement) => void;
export type OnEraseCallback = (areas: Array<{ x: number; y: number; size: number }>) => void;
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export class SectorSyncManager {
  private activeSector: string | null = null;
  private activeWs: WebSocket | null = null;
  private onElementAdded: OnElementCallback;
  private onStatusChange?: (status: ConnectionStatus) => void;
  private onErase?: OnEraseCallback;
  private debounceTimer: number | null = null;

  constructor(
    onElementAdded: OnElementCallback,
    onStatusChange?: (status: ConnectionStatus) => void,
    onErase?: OnEraseCallback
  ) {
    this.onElementAdded = onElementAdded;
    this.onStatusChange = onStatusChange;
    this.onErase = onErase;
  }

  /**
   * Debounced sync to connect to the active center sector.
   * Avoids churning WebSockets rapidly during high-frequency mouse drags or wheel zooms.
   */
  public updateActiveSector(centerSectorKey: string): void {
    if (this.activeSector === centerSectorKey) return;

    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      this.switchSector(centerSectorKey);
    }, 250);
  }

  private switchSector(sectorKey: string): void {
    if (this.activeSector === sectorKey) return;
    this.activeSector = sectorKey;

    // Gracefully close previous WebSocket
    if (this.activeWs) {
      const oldWs = this.activeWs;
      this.activeWs = null;

      oldWs.onmessage = null;
      oldWs.onerror = null;

      if (oldWs.readyState === WebSocket.OPEN) {
        oldWs.close();
      } else if (oldWs.readyState === WebSocket.CONNECTING) {
        oldWs.onopen = () => oldWs.close();
      }
    }

    // Connect to new sector
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/api/room/${encodeURIComponent(sectorKey)}`;

    this.onStatusChange?.('connecting');
    const ws = new WebSocket(url);
    this.activeWs = ws;

    ws.onopen = () => {
      if (this.activeWs === ws) {
        this.onStatusChange?.('connected');
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'sync:init' && Array.isArray(data.elements)) {
          data.elements.forEach(this.onElementAdded);
        } else if (data.type === 'element:added' && data.element) {
          this.onElementAdded(data.element);
        } else if (data.type === 'element:erased' && Array.isArray(data.areas)) {
          this.onErase?.(data.areas);
        }
      } catch (e) {
        console.error('Failed to parse websocket message', e);
      }
    };

    ws.onerror = () => {
      // Suppress noisy console errors if connection was superseded
    };

    ws.onclose = () => {
      if (this.activeWs === ws) {
        this.activeWs = null;
        this.onStatusChange?.('disconnected');
      }
    };
  }

  public sendElement(sectorKey: string, element: CanvasElement): void {
    if (this.activeWs && this.activeWs.readyState === WebSocket.OPEN) {
      this.activeWs.send(JSON.stringify({ type: 'element:add', element }));
    }
  }

  public sendErase(sectorKey: string, areas: Array<{ x: number; y: number; size: number }>): void {
    if (this.activeWs && this.activeWs.readyState === WebSocket.OPEN) {
      this.activeWs.send(JSON.stringify({ type: 'element:erase', areas }));
    }
  }
}
