import { CanvasElement, StrokeElement } from '@void-place/shared';
import { ViewportManager } from '../spatial/viewport';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private viewport: ViewportManager;
  private elements: Map<string, CanvasElement> = new Map();

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
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(0, 0, width, height);

    // Draw adaptive background grid
    this.drawGrid(ctx, width, height);

    // Draw elements
    for (const el of this.elements.values()) {
      if (el.type === 'stroke') {
        this.drawStroke(ctx, el as StrokeElement);
      }
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const baseStep = 100;
    const step = baseStep * this.viewport.zoom;
    if (step < 10) return; // Grid too dense

    const offsetX = (width / 2 - this.viewport.x * this.viewport.zoom) % step;
    const offsetY = (height / 2 - this.viewport.y * this.viewport.zoom) % step;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
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
}
