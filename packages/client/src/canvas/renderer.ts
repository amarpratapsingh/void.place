import { CanvasElement, StrokeElement } from '@void-place/shared';
import { ViewportManager } from '../spatial/viewport';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private viewport: ViewportManager;
  private elements: Map<string, CanvasElement> = new Map();
  private animFrameId: number | null = null;

  constructor(container: HTMLElement, viewport: ViewportManager) {
    this.viewport = viewport;
    this.canvas = document.createElement('canvas');
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    container.appendChild(this.canvas);

    const context = this.canvas.getContext('2d');
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

  public render(): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Clear background
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, width, height);

    // Draw adaptive background grid
    this.drawGrid(ctx, width, height);

    // Draw Origin Landmark (The center anchor of void.place)
    this.drawOrigin(ctx);

    // Draw elements
    for (const el of this.elements.values()) {
      if (el.type === 'stroke') {
        this.drawStroke(ctx, el as StrokeElement);
      }
    }
  }

  /**
   * Draws a glowing futuristic monument at (0, 0) so the center of the universe is always recognizable.
   */
  private drawOrigin(ctx: CanvasRenderingContext2D): void {
    const originScreen = this.viewport.worldToScreen(0, 0);
    const radius = 40 * this.viewport.zoom;

    // Only draw if reasonably near screen bounds
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

    // Center dot
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(3, 4 * this.viewport.zoom), 0, Math.PI * 2);
    ctx.fillStyle = '#ec4899';
    ctx.fill();

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

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const baseStep = 100;
    const step = baseStep * this.viewport.zoom;
    if (step < 10) return; // Grid too dense

    const offsetX = (width / 2 - this.viewport.x * this.viewport.zoom) % step;
    const offsetY = (height / 2 - this.viewport.y * this.viewport.zoom) % step;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
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

  /**
   * Smoothly interpolates the camera to a target location (Hyperspace Dive).
   */
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
    const duration = 1000; // 1 second

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
