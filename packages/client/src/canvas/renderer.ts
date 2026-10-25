import { CanvasElement, StrokeElement, PixelBatchElement } from '@void-place/shared';
import { ViewportManager } from '../spatial/viewport';

export interface HoverPixelInfo {
  worldX: number;
  worldY: number;
  size: number;
  color: string;
  isEraser: boolean;
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private viewport: ViewportManager;
  private elements: Map<string, CanvasElement> = new Map();
  private animFrameId: number | null = null;

  public showGrid: boolean = true;
  private hoverPixel: HoverPixelInfo | null = null;

  constructor(container: HTMLElement, viewport: ViewportManager) {
    this.viewport = viewport;
    this.canvas = document.createElement('canvas');
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    container.appendChild(this.canvas);

    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not get 2D canvas context');
    this.ctx = context;

    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.render();
    });
  }

  public addElement(element: CanvasElement): void {
    if (!this.elements.has(element.id)) {
      this.elements.set(element.id, element);
      this.render();
    }
  }

  public setHoverPixel(info: HoverPixelInfo | null): void {
    this.hoverPixel = info;
    this.render();
  }

  public render(): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Clear background
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(0, 0, width, height);

    // 1. Draw macro sector grid
    this.drawMacroGrid(ctx, width, height);

    // 2. Draw Origin Landmark (The center monument)
    this.drawOrigin(ctx);

    // 3. Draw elements (pixel batches & strokes)
    for (const el of this.elements.values()) {
      if (el.type === 'pixel_batch') {
        this.drawPixelBatch(ctx, el as PixelBatchElement);
      } else if (el.type === 'stroke') {
        this.drawStroke(ctx, el as StrokeElement);
      }
    }

    // 4. Draw Pixel-Art Grid (when zoomed into pixel scale)
    if (this.showGrid) {
      this.drawPixelGrid(ctx, width, height);
    }

    // 5. Draw active cursor hover pixel preview
    if (this.hoverPixel) {
      this.drawHoverIndicator(ctx, this.hoverPixel);
    }
  }

  /**
   * Samples the color at screen coordinates (for Eyedropper).
   */
  public getColorAt(screenX: number, screenY: number): string {
    const pixel = this.ctx.getImageData(screenX, screenY, 1, 1).data;
    const r = pixel[0].toString(16).padStart(2, '0');
    const g = pixel[1].toString(16).padStart(2, '0');
    const b = pixel[2].toString(16).padStart(2, '0');
    return `#${r}${g}${b}`.toLowerCase();
  }

  /**
   * Erases pixels near the given world coordinate.
   */
  public eraseAt(worldX: number, worldY: number, size: number): boolean {
    let modified = false;
    for (const [id, el] of this.elements.entries()) {
      if (el.type === 'pixel_batch') {
        const batch = el as PixelBatchElement;
        const initialLen = batch.pixels.length;
        batch.pixels = batch.pixels.filter((p) => {
          const px = el.x + p.x;
          const py = el.y + p.y;
          return Math.hypot(px - worldX, py - worldY) > Math.max(1, size);
        });

        if (batch.pixels.length === 0) {
          this.elements.delete(id);
          modified = true;
        } else if (batch.pixels.length !== initialLen) {
          modified = true;
        }
      }
    }
    if (modified) this.render();
    return modified;
  }

  /**
   * Draws a pixel batch as crisp integer-aligned rectangles.
   */
  private drawPixelBatch(ctx: CanvasRenderingContext2D, el: PixelBatchElement): void {
    for (let i = 0; i < el.pixels.length; i++) {
      const p = el.pixels[i];
      const screen = this.viewport.worldToScreen(el.x + p.x, el.y + p.y);
      const pixelSize = Math.max(1, p.size * this.viewport.zoom);

      ctx.fillStyle = p.color;
      ctx.fillRect(
        Math.floor(screen.x),
        Math.floor(screen.y),
        Math.ceil(pixelSize),
        Math.ceil(pixelSize)
      );
    }
  }

  /**
   * Pixel-level grid lines for Aseprite / r-place precision.
   */
  private drawPixelGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.viewport.zoom < 4) return; // Only show when zoomed in close

    const step = this.viewport.zoom;
    if (step < 4) return;

    const startX = (width / 2 - this.viewport.x * this.viewport.zoom) % step;
    const startY = (height / 2 - this.viewport.y * this.viewport.zoom) % step;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = startX; x < width; x += step) {
      const px = Math.floor(x) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    }
    for (let y = startY; y < height; y += step) {
      const py = Math.floor(y) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Hover cursor preview highlighting the exact pixel cell that will be painted.
   */
  private drawHoverIndicator(ctx: CanvasRenderingContext2D, hover: HoverPixelInfo): void {
    const screen = this.viewport.worldToScreen(hover.worldX, hover.worldY);
    const pixelSize = Math.max(2, hover.size * this.viewport.zoom);

    ctx.save();
    if (hover.isEraser) {
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillStyle = hover.color;
      ctx.globalAlpha = 0.6;
    }

    ctx.lineWidth = 1;
    ctx.fillRect(
      Math.floor(screen.x),
      Math.floor(screen.y),
      Math.ceil(pixelSize),
      Math.ceil(pixelSize)
    );

    ctx.globalAlpha = 1.0;
    ctx.strokeRect(
      Math.floor(screen.x) + 0.5,
      Math.floor(screen.y) + 0.5,
      Math.ceil(pixelSize),
      Math.ceil(pixelSize)
    );

    ctx.restore();
  }

  private drawOrigin(ctx: CanvasRenderingContext2D): void {
    const originScreen = this.viewport.worldToScreen(0, 0);
    const radius = 40 * this.viewport.zoom;

    if (
      originScreen.x < -radius * 2 ||
      originScreen.x > this.canvas.width + radius * 2 ||
      originScreen.y < -radius * 2 ||
      originScreen.y > this.canvas.height + radius * 2
    ) {
      return;
    }

    ctx.save();
    ctx.translate(originScreen.x, originScreen.y);

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(16, radius), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
    ctx.lineWidth = Math.max(1, 2 * this.viewport.zoom);
    ctx.setLineDash([6, 6]);
    ctx.stroke();

    // Inner ring
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(8, radius * 0.5), 0, Math.PI * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(1, 1.5 * this.viewport.zoom);
    ctx.stroke();

    // Center pixel
    ctx.fillStyle = '#ec4899';
    ctx.fillRect(-3, -3, 6, 6);

    // Crosshairs
    const arm = Math.max(24, radius * 1.4);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-arm, 0); ctx.lineTo(-radius * 0.7, 0);
    ctx.moveTo(radius * 0.7, 0); ctx.lineTo(arm, 0);
    ctx.moveTo(0, -arm); ctx.lineTo(0, -radius * 0.7);
    ctx.moveTo(0, radius * 0.7); ctx.lineTo(0, arm);
    ctx.stroke();

    // Label
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('ORIGIN (0,0)', 0, Math.max(28, radius + 18));

    ctx.restore();
  }

  private drawMacroGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const baseStep = 100;
    const step = baseStep * this.viewport.zoom;
    if (step < 12) return;

    const offsetX = (width / 2 - this.viewport.x * this.viewport.zoom) % step;
    const offsetY = (height / 2 - this.viewport.y * this.viewport.zoom) % step;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = offsetX; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = offsetY; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  private drawStroke(ctx: CanvasRenderingContext2D, el: StrokeElement): void {
    if (el.points.length < 2) return;

    const start = this.viewport.worldToScreen(el.x + el.points[0], el.y + el.points[1]);

    ctx.strokeStyle = el.color || '#38bdf8';
    ctx.lineWidth = Math.max(1, el.width * this.viewport.zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);

    for (let i = 2; i < el.points.length; i += 2) {
      const pt = this.viewport.worldToScreen(el.x + el.points[i], el.y + el.points[i + 1]);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }

  public flyTo(
    targetX: number,
    targetY: number,
    targetZoom: number,
    onProgress: () => void,
    onDone?: () => void
  ): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }

    const startX = this.viewport.x;
    const startY = this.viewport.y;
    const startZoom = this.viewport.zoom;
    const startTime = performance.now();
    const duration = 1000;

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeInOutCubic(progress);

      this.viewport.x = startX + (targetX - startX) * eased;
      this.viewport.y = startY + (targetY - startY) * eased;
      this.viewport.zoom = startZoom + (targetZoom - startZoom) * eased;

      onProgress();

      if (progress < 1) {
        this.animFrameId = requestAnimationFrame(step);
      } else {
        this.animFrameId = null;
        if (onDone) onDone();
      }
    };

    this.animFrameId = requestAnimationFrame(step);
  }
}
