import { ViewportManager } from '../spatial/viewport';
import { DiveTarget } from '@void-place/shared';

export type ToolMode = 'pencil' | 'eraser' | 'picker' | 'pan';

export const RETRO_PALETTE = [
  '#000000', '#1d2b53', '#7e2553', '#008751',
  '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436',
  '#29adff', '#83769c', '#ff77a8', '#ffccaa'
];

export class HUDController {
  private coordsEl: HTMLElement | null;
  private sectorEl: HTMLElement | null;
  private diveBtn: HTMLElement | null;
  private shareBtn: HTMLElement | null;
  private radarBtn: HTMLElement | null;
  private radarIcon: HTMLElement | null;
  private radarText: HTMLElement | null;
  private inkFill: HTMLElement | null;
  private inkPercent: HTMLElement | null;
  private toastEl: HTMLElement | null;

  // Pixel Canvas Tools & Palette Elements
  private activeColorSwatch: HTMLElement | null;
  private customColorInput: HTMLInputElement | null;
  private paletteContainer: HTMLElement | null;
  private gridBtn: HTMLElement | null;

  private viewport: ViewportManager;
  private onDive: (target: DiveTarget) => void;
  private onFlyToOrigin: () => void;
  private onToolChange: (tool: ToolMode) => void;
  private onGridToggle: (enabled: boolean) => void;

  // Active Tool State
  public currentTool: ToolMode = 'pencil';
  public currentColor: string = '#ff004d';
  public currentPixelSize: number = 1;
  public gridEnabled: boolean = true;

  // Ink mechanics: 0 to 100
  public ink: number = 100;
  private maxInk: number = 100;
  private regenRatePerSec: number = 12;

  constructor(
    viewport: ViewportManager,
    onDive: (target: DiveTarget) => void,
    onFlyToOrigin: () => void,
    onToolChange: (tool: ToolMode) => void,
    onGridToggle: (enabled: boolean) => void
  ) {
    this.viewport = viewport;
    this.onDive = onDive;
    this.onFlyToOrigin = onFlyToOrigin;
    this.onToolChange = onToolChange;
    this.onGridToggle = onGridToggle;

    this.coordsEl = document.getElementById('coords');
    this.sectorEl = document.getElementById('sector');
    this.diveBtn = document.getElementById('dive-btn');
    this.shareBtn = document.getElementById('share-btn');
    this.radarBtn = document.getElementById('radar-btn');
    this.radarIcon = document.getElementById('radar-icon');
    this.radarText = document.getElementById('radar-text');
    this.inkFill = document.getElementById('ink-fill');
    this.inkPercent = document.getElementById('ink-percent');
    this.toastEl = document.getElementById('toast');

    this.activeColorSwatch = document.getElementById('active-color-swatch');
    this.customColorInput = document.getElementById('custom-color-input') as HTMLInputElement;
    this.paletteContainer = document.getElementById('palette-swatches');
    this.gridBtn = document.getElementById('toggle-grid');

    this.initPalette();
    this.setupListeners();
    this.setTool('pencil');
    this.setColor('#ff004d');
  }

  public update(): void {
    if (this.coordsEl) {
      this.coordsEl.innerText = `x: ${Math.round(this.viewport.x)} | y: ${Math.round(this.viewport.y)} | zoom: ${this.viewport.zoom.toFixed(2)}x`;
    }
    if (this.sectorEl) {
      this.sectorEl.innerText = `Sector: ${this.viewport.getCurrentCenterSector()}`;
    }

    if (this.radarIcon && this.radarText) {
      const compass = this.viewport.getCompassToOrigin();
      this.radarIcon.innerText = compass.arrow;
      this.radarText.innerText = compass.isAtOrigin ? 'At Origin (0,0)' : `Origin (${compass.formatted})`;
    }
  }

  public updateInk(dtSeconds: number): void {
    if (this.ink < this.maxInk) {
      this.ink = Math.min(this.maxInk, this.ink + this.regenRatePerSec * dtSeconds);
      this.renderInk();
    }
  }

  public consumeInk(cost: number): boolean {
    if (this.ink < cost) return false;
    this.ink = Math.max(0, this.ink - cost);
    this.renderInk();
    return true;
  }

  private renderInk(): void {
    if (this.inkFill && this.inkPercent) {
      const pct = Math.round((this.ink / this.maxInk) * 100);
      this.inkFill.style.width = `${pct}%`;
      this.inkPercent.innerText = `${pct}%`;

      if (pct < 15) {
        this.inkFill.style.background = '#ef4444';
      } else {
        this.inkFill.style.background = 'linear-gradient(90deg, #ec4899, #a855f7, #38bdf8)';
      }
    }
  }

  public setTool(tool: ToolMode): void {
    this.currentTool = tool;

    // Update body cursor class
    document.body.className = `tool-${tool}`;

    // Update UI active buttons
    ['pencil', 'eraser', 'picker', 'pan'].forEach((t) => {
      const btn = document.getElementById(`tool-${t}`);
      if (btn) {
        if (t === tool) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });

    this.onToolChange(tool);
  }

  public setColor(color: string): void {
    this.currentColor = color.toLowerCase();
    if (this.activeColorSwatch) {
      this.activeColorSwatch.style.backgroundColor = this.currentColor;
    }
    if (this.customColorInput) {
      this.customColorInput.value = this.currentColor;
    }

    // Highlight selected swatch
    const swatches = document.querySelectorAll('.swatch');
    swatches.forEach((s) => {
      const el = s as HTMLElement;
      if (el.dataset.color === this.currentColor) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }

  private initPalette(): void {
    if (!this.paletteContainer) return;
    this.paletteContainer.innerHTML = '';

    RETRO_PALETTE.forEach((color) => {
      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      swatch.style.backgroundColor = color;
      swatch.dataset.color = color;
      swatch.title = color;

      swatch.addEventListener('click', () => {
        this.setColor(color);
        if (this.currentTool === 'eraser') {
          this.setTool('pencil');
        }
      });

      this.paletteContainer?.appendChild(swatch);
    });
  }

  public showToast(message: string): void {
    if (this.toastEl) {
      this.toastEl.innerText = message;
      this.toastEl.classList.add('show');
      setTimeout(() => {
        this.toastEl?.classList.remove('show');
      }, 2200);
    }
  }

  private setupListeners(): void {
    // 1. Tool buttons
    document.getElementById('tool-pencil')?.addEventListener('click', () => this.setTool('pencil'));
    document.getElementById('tool-eraser')?.addEventListener('click', () => this.setTool('eraser'));
    document.getElementById('tool-picker')?.addEventListener('click', () => this.setTool('picker'));
    document.getElementById('tool-pan')?.addEventListener('click', () => this.setTool('pan'));

    // 2. Pixel size selector
    const sizeBtns = document.querySelectorAll('.size-btn');
    sizeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        sizeBtns.forEach((b) => b.classList.remove('active'));
        const el = e.currentTarget as HTMLElement;
        el.classList.add('active');
        this.currentPixelSize = parseInt(el.dataset.size || '1', 10);
      });
    });

    // 3. Grid toggle
    this.gridBtn?.addEventListener('click', () => {
      this.gridEnabled = !this.gridEnabled;
      if (this.gridEnabled) this.gridBtn?.classList.add('active');
      else this.gridBtn?.classList.remove('active');
      this.onGridToggle(this.gridEnabled);
    });

    // 4. Custom color input
    this.customColorInput?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.setColor(target.value);
    });

    // 5. Dive, Share & Origin
    this.diveBtn?.addEventListener('click', async () => {
      try {
        this.diveBtn!.innerText = '🌀 Diving...';
        const res = await fetch('/api/dive');
        if (res.ok) {
          const data: DiveTarget = await res.json();
          this.onDive(data);
        }
      } catch (e) {
        console.error('Dive failed', e);
      } finally {
        this.diveBtn!.innerText = '✨ Dive into Void';
      }
    });

    this.shareBtn?.addEventListener('click', async () => {
      const url = this.viewport.getShareUrl();
      try {
        await navigator.clipboard.writeText(url);
        this.showToast('🔗 Coordinates link copied to clipboard!');
      } catch {
        prompt('Copy this link to share your coordinates:', url);
      }
    });

    this.radarBtn?.addEventListener('click', () => {
      this.onFlyToOrigin();
    });

    // 6. Keyboard Shortcuts: B (pencil), E (eraser), I (picker), H (pan), G (grid)
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;

      const key = e.key.toLowerCase();
      if (key === 'b' || key === 'p') this.setTool('pencil');
      else if (key === 'e') this.setTool('eraser');
      else if (key === 'i') this.setTool('picker');
      else if (key === 'h') this.setTool('pan');
      else if (key === 'g') {
        this.gridEnabled = !this.gridEnabled;
        if (this.gridEnabled) this.gridBtn?.classList.add('active');
        else this.gridBtn?.classList.remove('active');
        this.onGridToggle(this.gridEnabled);
      } else if (key === '1') {
        this.setPixelSize(1);
      } else if (key === '2') {
        this.setPixelSize(2);
      } else if (key === '3' || key === '4') {
        this.setPixelSize(4);
      } else if (key === '8') {
        this.setPixelSize(8);
      }
    });
  }

  private setPixelSize(size: number): void {
    this.currentPixelSize = size;
    const sizeBtns = document.querySelectorAll('.size-btn');
    sizeBtns.forEach((b) => {
      const el = b as HTMLElement;
      if (parseInt(el.dataset.size || '1', 10) === size) el.classList.add('active');
      else el.classList.remove('active');
    });
  }
}
