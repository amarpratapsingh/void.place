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

    // 1. Deep Abyssal Cosmic Void
    ctx.fillStyle = '#040609';
    ctx.fillRect(0, 0, width, height);

    // 2. Cosmic Background Parallax Stars & Nebula Dust
    this.drawCosmicField(ctx, width, height);

    // 3. Macro Coordinate Grids & Laser Crosshairs
    this.drawMacroGrid(ctx, width, height);

    // 4. The Singularity (Origin 0,0 Celestial Monument)
    this.drawSingularity(ctx);

    // 5. Draw Canvas Elements (Pixel Batches & Strokes)
    for (const el of this.elements.values()) {
      if (el.type === 'pixel_batch') {
        this.drawPixelBatch(ctx, el as PixelBatchElement);
      } else if (el.type === 'stroke') {
        this.drawStroke(ctx, el as StrokeElement);
      }
    }

    // 6. High-zoom Pixel Alignment Grid
    if (this.showGrid) {
      this.drawPixelGrid(ctx, width, height);
    }

    // 7. Tactical Cursor Hover Indicator
    if (this.hoverPixel) {
      this.drawHoverIndicator(ctx, this.hoverPixel);
    }
  }

  /**
   * Deterministic celestial starfield that glides with smooth parallax as you navigate the void.
   */
  private drawCosmicField(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const starSpacing = 160;
    const startX = Math.floor((this.viewport.x * 0.2 - width / 2) / starSpacing) * starSpacing;
    const endX = startX + width + starSpacing * 2;
    const startY = Math.floor((this.viewport.y * 0.2 - height / 2) / starSpacing) * starSpacing;
    const endY = startY + height + starSpacing * 2;

    ctx.save();
    for (let x = startX; x <= endX; x += starSpacing) {
      for (let y = startY; y <= endY; y += starSpacing) {
        // Pseudo-random star offset & luminance
        const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const rand = hash - Math.floor(hash);

        if (rand > 0.45) {
          const screenX = (x - this.viewport.x * 0.2) + width / 2;
          const screenY = (y - this.viewport.y * 0.2) + height / 2;

          const size = rand > 0.92 ? 1.5 : 1.0;
          const alpha = rand > 0.85 ? 0.35 : 0.15;

          ctx.fillStyle = rand > 0.8 ? `rgba(0, 240, 255, ${alpha})` : `rgba(255, 200, 120, ${alpha})`;
          ctx.fillRect(Math.floor(screenX), Math.floor(screenY), size, size);
        }
      }
    }
    ctx.restore();
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

  private drawPixelGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.viewport.zoom < 3.5) return;

    const step = this.viewport.zoom;
    const startX = (width / 2 - this.viewport.x * this.viewport.zoom) % step;
    const startY = (height / 2 - this.viewport.y * this.viewport.zoom) % step;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.09)';
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

  private drawHoverIndicator(ctx: CanvasRenderingContext2D, hover: HoverPixelInfo): void {
    const screen = this.viewport.worldToScreen(hover.worldX, hover.worldY);
    const pixelSize = Math.max(2, hover.size * this.viewport.zoom);

    ctx.save();
    if (hover.isEraser) {
      ctx.strokeStyle = '#ff0055';
      ctx.fillStyle = 'rgba(255, 0, 85, 0.25)';
    } else {
      ctx.strokeStyle = '#00f0ff';
      ctx.fillStyle = hover.color;
      ctx.globalAlpha = 0.65;
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

    // Corner targeting reticle ticks
    const tLen = Math.max(3, Math.min(8, pixelSize * 0.3));
    ctx.strokeStyle = hover.isEraser ? '#ff0055' : '#00f0ff';
    ctx.lineWidth = 1.5;
    const sx = Math.floor(screen.x);
    const sy = Math.floor(screen.y);
    const sz = Math.ceil(pixelSize);

    ctx.beginPath();
    // Top-left
    ctx.moveTo(sx - 2, sy + tLen); ctx.lineTo(sx - 2, sy - 2); ctx.lineTo(sx + tLen, sy - 2);
    // Top-right
    ctx.moveTo(sx + sz + 2 - tLen, sy - 2); ctx.lineTo(sx + sz + 2, sy - 2); ctx.lineTo(sx + sz + 2, sy + tLen);
    // Bottom-left
    ctx.moveTo(sx - 2, sy + sz + 2 - tLen); ctx.lineTo(sx - 2, sy + sz + 2); ctx.lineTo(sx + tLen, sy + sz + 2);
    // Bottom-right
    ctx.moveTo(sx + sz + 2 - tLen, sy + sz + 2); ctx.lineTo(sx + sz + 2, sy + sz + 2); ctx.lineTo(sx + sz + 2, sy + sz + 2 - tLen);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * The Singularity (Origin 0,0 Celestial Monument).
   */
  private drawSingularity(ctx: CanvasRenderingContext2D): void {
    const origin = this.viewport.worldToScreen(0, 0);
    const radius = 50 * this.viewport.zoom;

    if (
      origin.x < -radius * 2 ||
      origin.x > this.canvas.width + radius * 2 ||
      origin.y < -radius * 2 ||
      origin.y > this.canvas.height + radius * 2
    ) {
      return;
    }

    ctx.save();
    ctx.translate(origin.x, origin.y);

    // 1. Accretion Disc Radial Glow
    const gradient = ctx.createRadialGradient(0, 0, 2, 0, 0, Math.max(30, radius * 1.5));
    gradient.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
    gradient.addColorStop(0.3, 'rgba(255, 176, 32, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(30, radius * 1.5), 0, Math.PI * 2);
    ctx.fill();

    // 2. Outer Astrolabe Ring with Degree Ticks
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(20, radius), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.stroke();

    // 3. Inner Pulsar Ring
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(10, radius * 0.5), 0, Math.PI * 2);
    ctx.strokeStyle = '#ffb020';
    ctx.lineWidth = Math.max(1, 1.5 * this.viewport.zoom);
    ctx.stroke();

    // 4. Central Diamond Core
    ctx.save();
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#00f0ff';
    const coreSz = Math.max(4, 5 * this.viewport.zoom);
    ctx.fillRect(-coreSz / 2, -coreSz / 2, coreSz, coreSz);
    ctx.restore();

    // 5. Cardinal Coordinate Axes with Tickmarks
    const arm = Math.max(32, radius * 1.8);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-arm, 0); ctx.lineTo(-radius * 0.6, 0);
    ctx.moveTo(radius * 0.6, 0); ctx.lineTo(arm, 0);
    ctx.moveTo(0, -arm); ctx.lineTo(0, -radius * 0.6);
    ctx.moveTo(0, radius * 0.6); ctx.lineTo(arm, 0);
    ctx.stroke();

    // 6. Cybernetic Origin Label
    ctx.font = '700 10px "Share Tech Mono", monospace';
    ctx.fillStyle = '#00f0ff';
    ctx.textAlign = 'center';
    ctx.fillText('⌖ SINGULARITY [0, 0]', 0, Math.max(32, radius + 22));

    ctx.restore();
  }

  private drawMacroGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const baseStep = 100;
    const step = baseStep * this.viewport.zoom;
    if (step < 12) return;

    const offsetX = (width / 2 - this.viewport.x * this.viewport.zoom) % step;
    const offsetY = (height / 2 - this.viewport.y * this.viewport.zoom) % step;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.025)';
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

    // Subtle coordinate intersection tick marks
    ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
    for (let x = offsetX; x < width; x += step) {
      for (let y = offsetY; y < height; y += step) {
        ctx.fillRect(x - 1, y - 1, 3, 3);
      }
    }
    ctx.restore();
  }

  private drawStroke(ctx: CanvasRenderingContext2D, el: StrokeElement): void {
    if (el.points.length < 2) return;

    const start = this.viewport.worldToScreen(el.x + el.points[0], el.y + el.points[1]);

    ctx.strokeStyle = el.color || '#00f0ff';
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
    const duration = 1200;

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
