import { Coordinate, Viewport, toSectorKey, getVisibleSectorKeys } from '@void-place/shared';

export class ViewportManager {
  public x: number = 0;
  public y: number = 0;
  public zoom: number = 1.0;
  public width: number = window.innerWidth;
  public height: number = window.innerHeight;

  constructor() {
    window.addEventListener('resize', () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
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
}
