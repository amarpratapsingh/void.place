import { CanvasElement, StrokeElement, PixelBatchElement, PixelData, computePixelBatchBounds } from '@void-place/shared';
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
  private dpr: number = window.devicePixelRatio || 1;

  public showGrid: boolean = true;
  private hoverPixel: HoverPixelInfo | null = null;

  constructor(canvasOrContainer: HTMLCanvasElement | HTMLElement, viewport: ViewportManager) {
    this.viewport = viewport;
    if (canvasOrContainer instanceof HTMLCanvasElement) {
      this.canvas = canvasOrContainer;
    } else {
      this.canvas = document.createElement('canvas');
      canvasOrContainer.appendChild(this.canvas);
    }

    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not get 2D canvas context');
    this.ctx = context;

    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  private resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.render();
  }

  public addElement(element: CanvasElement): void {
    if (!this.elements.has(element.id)) {
      this.elements.set(element.id, element);
      this.render();
    }
  }

  public removeElement(id: string): void {
    if (this.elements.delete(id)) {
      this.render();
    }
  }

  public removePreviewElements(): void {
    let anyRemoved = false;
    for (const id of this.elements.keys()) {
      if (id.startsWith('preview_')) {
        this.elements.delete(id);
        anyRemoved = true;
      }
    }
    if (anyRemoved) {
      this.render();
    }
  }

  public setHoverPixel(info: HoverPixelInfo | null): void {
    this.hoverPixel = info;
    this.render();
  }

  public render(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ctx = this.ctx;
    const bounds = this.viewport.getBounds();

    ctx.save();
    // High-DPI hardware pixel scaling
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 1. Artist Canvas Surface (Clean White Art Canvas)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 2. Drafting Canvas Grid
    this.drawCanvasGrid(ctx, width, height);

    // 3. Center Origin Mark (0, 0)
    this.drawOriginMark(ctx);

    // 4. Draw Canvas Elements with Viewport Frustum Culling
    for (const el of this.elements.values()) {
      if (el.bounds) {
        if (
          el.bounds.maxX < bounds.minX ||
          el.bounds.minX > bounds.maxX ||
          el.bounds.maxY < bounds.minY ||
          el.bounds.minY > bounds.maxY
        ) {
          continue; // Culled: completely off-screen
        }
      }

      if (el.type === 'pixel_batch') {
        this.drawPixelBatch(ctx, el as PixelBatchElement);
      } else if (el.type === 'stroke') {
        this.drawStroke(ctx, el as StrokeElement);
      }
    }

    // 5. Pixel Alignment Grid (when zoomed into fine detail)
    if (this.showGrid) {
      this.drawPixelGrid(ctx, width, height);
    }

    // 6. Active Brush Hover Preview
    if (this.hoverPixel) {
      this.drawHoverIndicator(ctx, this.hoverPixel);
    }

    ctx.restore();
  }

  /**
   * Samples the color at screen coordinates (for eyedropper).
   */
  public getColorAt(screenX: number, screenY: number): string {
    const pixel = this.ctx.getImageData(
      Math.floor(screenX * this.dpr),
      Math.floor(screenY * this.dpr),
      1,
      1
    ).data;
    const r = pixel[0].toString(16).padStart(2, '0');
    const g = pixel[1].toString(16).padStart(2, '0');
    const b = pixel[2].toString(16).padStart(2, '0');
    return `#${r}${g}${b}`.toLowerCase();
  }

  /**
   * Erases pixels intersecting the world-space bounding box starting at (startX, startY)
   * with dimensions size x size.
   */
  public eraseArea(startX: number, startY: number, size: number): boolean {
    let modified = false;
    const endX = startX + size;
    const endY = startY + size;

    for (const [id, el] of this.elements.entries()) {
      if (el.type === 'pixel_batch') {
        const batch = el as PixelBatchElement;
        const initialLen = batch.pixels.length;

        // Bounding box culling: skip batch if completely outside eraser box
        if (el.bounds) {
          if (
            el.bounds.maxX <= startX ||
            el.bounds.minX >= endX ||
            el.bounds.maxY <= startY ||
            el.bounds.minY >= endY
          ) {
            continue;
          }
        }

        batch.pixels = batch.pixels.filter((p) => {
          const px = el.x + p.x;
          const py = el.y + p.y;
          const psz = p.size || 1;
          // AABB intersection check
          const intersects =
            px + psz > startX &&
            px < endX &&
            py + psz > startY &&
            py < endY;
          return !intersects;
        });

        if (batch.pixels.length === 0) {
          this.elements.delete(id);
          modified = true;
        } else if (batch.pixels.length !== initialLen) {
          batch.bounds = computePixelBatchBounds(el.x, el.y, batch.pixels);
          modified = true;
        }
      }
    }

    if (modified) this.render();
    return modified;
  }

  /**
   * Erases multiple areas at once (e.g. from network synchronization or drag strokes).
   */
  public eraseAreas(areas: Array<{ x: number; y: number; size: number }>): boolean {
    let anyModified = false;
    for (let i = 0; i < areas.length; i++) {
      const a = areas[i];
      if (this.eraseArea(a.x, a.y, a.size || 1)) {
        anyModified = true;
      }
    }
    return anyModified;
  }

  /**
   * Backward-compatible eraseAt centered around (worldX, worldY).
   */
  public eraseAt(worldX: number, worldY: number, size: number): boolean {
    const half = Math.floor(size / 2);
    return this.eraseArea(worldX - half, worldY - half, size);
  }

  private drawPixelBatch(ctx: CanvasRenderingContext2D, el: PixelBatchElement): void {
    // Group pixels by color to minimize fillStyle pipeline switching
    const byColor = new Map<string, PixelData[]>();
    for (let i = 0; i < el.pixels.length; i++) {
      const p = el.pixels[i];
      let group = byColor.get(p.color);
      if (!group) {
        group = [];
        byColor.set(p.color, group);
      }
      group.push(p);
    }

    for (const [color, pixels] of byColor.entries()) {
      ctx.fillStyle = color;
      for (let i = 0; i < pixels.length; i++) {
        const p = pixels[i];
        const screen = this.viewport.worldToScreen(el.x + p.x, el.y + p.y);
        const pixelSize = Math.max(1, p.size * this.viewport.zoom);

        ctx.fillRect(
          Math.floor(screen.x),
          Math.floor(screen.y),
          Math.ceil(pixelSize),
          Math.ceil(pixelSize)
        );
      }
    }
  }

  /**
   * Subtle pixel alignment grid for precise pixel placement.
   */
  private drawPixelGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.viewport.zoom < 3.5) return;

    const step = this.viewport.zoom;
    const startX = (width / 2 - this.viewport.x * this.viewport.zoom) % step;
    const startY = (height / 2 - this.viewport.y * this.viewport.zoom) % step;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
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
   * Hover indicator previewing the pixel in the user's selected paint color or eraser box.
   */
  private drawHoverIndicator(ctx: CanvasRenderingContext2D, hover: HoverPixelInfo): void {
    const screen = this.viewport.worldToScreen(hover.worldX, hover.worldY);
    const pixelSize = Math.max(1, hover.size * this.viewport.zoom);
    const screenX = Math.floor(screen.x);
    const screenY = Math.floor(screen.y);
    const boxSize = Math.ceil(pixelSize);

    ctx.save();
    if (hover.isEraser) {
      // Clean drafting eraser preview: light coral wash with crisp red drafting edge
      ctx.fillStyle = 'rgba(239, 68, 68, 0.16)';
      ctx.fillRect(screenX, screenY, boxSize, boxSize);

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX + 0.5, screenY + 0.5, boxSize, boxSize);

      // Fine center crosshair if eraser preview is large enough
      if (boxSize >= 22) {
        const cx = screenX + boxSize / 2;
        const cy = screenY + boxSize / 2;
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy); ctx.lineTo(cx + 3, cy);
        ctx.moveTo(cx, cy - 3); ctx.lineTo(cx, cy + 3);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = hover.color;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';

      ctx.globalAlpha = 0.75;
      ctx.fillRect(screenX, screenY, boxSize, boxSize);

      ctx.globalAlpha = 1.0;
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX + 0.5, screenY + 0.5, boxSize, boxSize);
    }

    ctx.restore();
  }

  /**
   * Understated artist drafting mark at (0, 0).
   */
  private drawOriginMark(ctx: CanvasRenderingContext2D): void {
    const origin = this.viewport.worldToScreen(0, 0);
    const radius = 24 * this.viewport.zoom;

    if (
      origin.x < -radius * 2 ||
      origin.x > window.innerWidth + radius * 2 ||
      origin.y < -radius * 2 ||
      origin.y > window.innerHeight + radius * 2
    ) {
      return;
    }

    ctx.save();
    ctx.translate(origin.x, origin.y);

    // Center ring
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(4, Math.min(16, radius * 0.4)), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center point
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fill();

    // Fine drafting crosshairs
    const arm = Math.max(14, Math.min(36, radius * 0.8));
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-arm, 0); ctx.lineTo(-4, 0);
    ctx.moveTo(4, 0); ctx.lineTo(arm, 0);
    ctx.moveTo(0, -arm); ctx.lineTo(0, -4);
    ctx.moveTo(0, 4); ctx.lineTo(0, arm);
    ctx.stroke();

    // Clean label
    ctx.font = '500 11px Inter, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.textAlign = 'center';
    ctx.fillText('0, 0', 0, Math.max(18, radius * 0.5 + 14));

    ctx.restore();
  }

  /**
   * Subtle drafting canvas grid.
   */
  private drawCanvasGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const baseStep = 100;
    const step = baseStep * this.viewport.zoom;
    if (step < 12) return;

    const offsetX = (width / 2 - this.viewport.x * this.viewport.zoom) % step;
    const offsetY = (height / 2 - this.viewport.y * this.viewport.zoom) % step;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = offsetX; x < width; x += step) {
      const px = Math.floor(x) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    }
    for (let y = offsetY; y < height; y += step) {
      const py = Math.floor(y) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawStroke(ctx: CanvasRenderingContext2D, el: StrokeElement): void {
    if (el.points.length < 2) return;

    const start = this.viewport.worldToScreen(el.x + el.points[0], el.y + el.points[1]);

    ctx.strokeStyle = el.color || '#18181b';
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
    const duration = 900;

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
