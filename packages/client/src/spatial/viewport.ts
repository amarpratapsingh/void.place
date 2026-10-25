import { Coordinate, Viewport, toSectorKey, getVisibleSectorKeys, getDistanceAndAngle, formatDistance } from '@void-place/shared';

export class ViewportManager {
  public x: number = 0;
  public y: number = 0;
  public zoom: number = 1.0;
  public width: number = window.innerWidth;
  public height: number = window.innerHeight;

  private urlUpdateTimer: number | null = null;

  constructor() {
    this.parseUrlHash();

    window.addEventListener('resize', () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
    });

    window.addEventListener('hashchange', () => {
      this.parseUrlHash();
    });
  }

  public screenToWorld(screenX: number, screenY: number): Coordinate {
    const worldX = this.x + (screenX - this.width / 2) / this.zoom;
    const worldY = this.y + (screenY - this.height / 2) / this.zoom;
    return { x: worldX, y: worldY, zoom: this.zoom };
  }

  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const screenX = (worldX - this.x) * this.zoom + this.width / 2;
    const screenY = (worldY - this.y) * this.zoom + this.height / 2;
    return { x: screenX, y: screenY };
  }

  public getBounds(): Viewport {
    const halfW = (this.width / 2) / this.zoom;
    const halfH = (this.height / 2) / this.zoom;
    return {
      minX: this.x - halfW,
      maxX: this.x + halfW,
      minY: this.y - halfH,
      maxY: this.y + halfH,
      zoom: Math.log2(this.zoom),
    };
  }

  public getVisibleSectors(): string[] {
    return getVisibleSectorKeys(this.getBounds());
  }

  public getCurrentCenterSector(): string {
    return toSectorKey(this.x, this.y, Math.log2(this.zoom));
  }

  /**
   * Calculates distance, angle, and directional arrow pointing towards Origin (0,0).
   */
  public getCompassToOrigin(): { distance: number; formatted: string; arrow: string; isAtOrigin: boolean } {
    const { distance, angleRad } = getDistanceAndAngle(this.x, this.y, 0, 0);

    // If within close range of origin
    if (distance < 150 / this.zoom) {
      return { distance, formatted: '0u', arrow: '🎯', isAtOrigin: true };
    }

    // Convert angle to 8-point compass arrow
    // angleRad: 0 = East, PI/2 = South, PI = West, -PI/2 = North
    const deg = (angleRad * 180) / Math.PI;
    let arrow = '➔';
    if (deg >= -22.5 && deg < 22.5) arrow = '→';
    else if (deg >= 22.5 && deg < 67.5) arrow = '↘';
    else if (deg >= 67.5 && deg < 112.5) arrow = '↓';
    else if (deg >= 112.5 && deg < 157.5) arrow = '↙';
    else if (deg >= 157.5 || deg < -157.5) arrow = '←';
    else if (deg >= -157.5 && deg < -112.5) arrow = '↖';
    else if (deg >= -112.5 && deg < -67.5) arrow = '↑';
    else if (deg >= -67.5 && deg < -22.5) arrow = '↗';

    return {
      distance,
      formatted: formatDistance(distance),
      arrow,
      isAtOrigin: false,
    };
  }

  /**
   * Syncs current coordinates to browser URL hash (#/@x,y,zoom) with debounce.
   */
  public queueUrlSync(): void {
    if (this.urlUpdateTimer !== null) {
      window.clearTimeout(this.urlUpdateTimer);
    }
    this.urlUpdateTimer = window.setTimeout(() => {
      const hash = `#/@${this.x.toFixed(1)},${this.y.toFixed(1)},${this.zoom.toFixed(2)}`;
      history.replaceState(null, '', hash);
    }, 300);
  }

  /**
   * Generates a shareable URL to the current viewport.
   */
  public getShareUrl(): string {
    const hash = `#/@${this.x.toFixed(1)},${this.y.toFixed(1)},${this.zoom.toFixed(2)}`;
    return `${window.location.origin}${window.location.pathname}${hash}`;
  }

  private parseUrlHash(): void {
    const hash = window.location.hash;
    // Format: #/@x,y,zoom
    const match = hash.match(/^#\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/);
    if (match) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      const zoom = parseFloat(match[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(zoom) && zoom > 0) {
        this.x = x;
        this.y = y;
        this.zoom = zoom;
      }
    }
  }
}
