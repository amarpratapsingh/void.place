import { ViewportManager } from '../spatial/viewport';
import { DiveTarget } from '@void-place/shared';

export class HUDController {
  private coordsEl: HTMLElement | null;
  private sectorEl: HTMLElement | null;
  private diveBtn: HTMLElement | null;
  private viewport: ViewportManager;
  private onDive: (target: DiveTarget) => void;

  constructor(viewport: ViewportManager, onDive: (target: DiveTarget) => void) {
    this.viewport = viewport;
    this.onDive = onDive;
    this.coordsEl = document.getElementById('coords');
    this.sectorEl = document.getElementById('sector');
    this.diveBtn = document.getElementById('dive-btn');

    this.setupListeners();
  }

  public update(): void {
    if (this.coordsEl) {
      this.coordsEl.innerText = `x: ${Math.round(this.viewport.x)} | y: ${Math.round(this.viewport.y)} | zoom: ${this.viewport.zoom.toFixed(2)}x`;
    }
    if (this.sectorEl) {
      this.sectorEl.innerText = `Sector: ${this.viewport.getCurrentCenterSector()}`;
    }
  }

  private setupListeners(): void {
    if (this.diveBtn) {
      this.diveBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/dive');
          if (res.ok) {
            const data: DiveTarget = await res.json();
            this.onDive(data);
          }
        } catch (e) {
          console.error('Dive failed', e);
        }
      });
    }
  }
}
