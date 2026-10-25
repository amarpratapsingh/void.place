import { ViewportManager } from '../spatial/viewport';
import { DiveTarget } from '@void-place/shared';

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

  private viewport: ViewportManager;
  private onDive: (target: DiveTarget) => void;
  private onFlyToOrigin: () => void;

  // Ink mechanics: 0 to 100
  public ink: number = 100;
  private maxInk: number = 100;
  private regenRatePerSec: number = 12; // 12% per second

  constructor(
    viewport: ViewportManager,
    onDive: (target: DiveTarget) => void,
    onFlyToOrigin: () => void
  ) {
    this.viewport = viewport;
    this.onDive = onDive;
    this.onFlyToOrigin = onFlyToOrigin;

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

    this.setupListeners();
  }

  public update(): void {
    // 1. Coordinates & Sector
    if (this.coordsEl) {
      this.coordsEl.innerText = `x: ${Math.round(this.viewport.x)} | y: ${Math.round(this.viewport.y)} | zoom: ${this.viewport.zoom.toFixed(2)}x`;
    }
    if (this.sectorEl) {
      this.sectorEl.innerText = `Sector: ${this.viewport.getCurrentCenterSector()}`;
    }

    // 2. Compass to Origin
    if (this.radarIcon && this.radarText) {
      const compass = this.viewport.getCompassToOrigin();
      this.radarIcon.innerText = compass.arrow;
      this.radarText.innerText = compass.isAtOrigin ? 'At Origin (0,0)' : `Origin (${compass.formatted})`;
    }
  }

  /**
   * Regenerates ink smoothly over elapsed time dt (seconds).
   */
  public updateInk(dtSeconds: number): void {
    if (this.ink < this.maxInk) {
      this.ink = Math.min(this.maxInk, this.ink + this.regenRatePerSec * dtSeconds);
      this.renderInk();
    }
  }

  /**
   * Consumes ink for drawing a segment. Returns true if ink was available.
   */
  public consumeInk(cost: number): boolean {
    if (this.ink < cost) {
      return false;
    }
    this.ink = Math.max(0, this.ink - cost);
    this.renderInk();
    return true;
  }

  private renderInk(): void {
    if (this.inkFill && this.inkPercent) {
      const pct = Math.round((this.ink / this.maxInk) * 100);
      this.inkFill.style.width = `${pct}%`;
      this.inkPercent.innerText = `${pct}%`;

      // Visual warning when low on ink
      if (pct < 15) {
        this.inkFill.style.background = '#ef4444';
      } else {
        this.inkFill.style.background = 'linear-gradient(90deg, #ec4899, #a855f7, #6366f1)';
      }
    }
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
    // 1. Dive Button
    if (this.diveBtn) {
      this.diveBtn.addEventListener('click', async () => {
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
    }

    // 2. Share Coordinates Button
    if (this.shareBtn) {
      this.shareBtn.addEventListener('click', async () => {
        const url = this.viewport.getShareUrl();
        try {
          await navigator.clipboard.writeText(url);
          this.showToast('🔗 Coordinates link copied to clipboard!');
        } catch {
          // Fallback if clipboard API blocked
          prompt('Copy this link to share your coordinates:', url);
        }
      });
    }

    // 3. Radar / Origin Compass Button
    if (this.radarBtn) {
      this.radarBtn.addEventListener('click', () => {
        this.onFlyToOrigin();
      });
    }
  }
}
