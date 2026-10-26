export interface HUDCallbacks {
  onColorSelect?: (hex: string) => void;
  onDiveClick?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onJumpToCoords?: (x: number, y: number) => void;
}

const DEFAULT_PALETTE = [
  '#ffffff', '#d4d4d8', '#71717a', '#18181b',
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#10b981', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'
];

export class HUD {
  private root: HTMLElement;
  private statusDot!: HTMLElement;
  private coordEl!: HTMLElement;
  private sectorEl!: HTMLElement;
  private zoomEl!: HTMLElement;
  private onlineEl!: HTMLElement;
  private activeColor: string = DEFAULT_PALETTE[12]; // Indigo default
  private callbacks: HUDCallbacks;

  constructor(rootElement: HTMLElement, callbacks: HUDCallbacks = {}) {
    this.root = rootElement;
    this.callbacks = callbacks;
    this.render();
    this.bindShortcuts();
  }

  private render() {
    this.root.innerHTML = `
      <!-- Top Bar -->
      <div class="hud-top">
        <div class="glass-panel status-pill hud-interactive">
          <div class="status-dot" id="hud-status-dot" title="Connection Status"></div>
          <span class="coord-badge" id="hud-coords" title="Click to jump to coordinates">X: 0, Y: 0</span>
          <div class="divider"></div>
          <span class="sector-badge" id="hud-sector">SEC 0:0</span>
          <div class="divider"></div>
          <span class="sector-badge" id="hud-online">1 online</span>
        </div>

        <div class="hud-actions hud-interactive">
          <button class="btn-glass btn-primary" id="hud-dive-btn" title="Dive to an active or random location">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
            </svg>
            Dive
          </button>
        </div>
      </div>

      <div></div> <!-- Center spacer -->

      <!-- Bottom Dock -->
      <div class="hud-bottom">
        <div class="glass-panel dock-container hud-interactive">
          <div class="palette-grid" id="hud-palette">
            ${DEFAULT_PALETTE.map(
              (color) => `
              <button
                class="color-swatch ${color === this.activeColor ? 'active' : ''}"
                style="background-color: ${color}"
                data-color="${color}"
                aria-label="Select color ${color}"
              ></button>
            `
            ).join('')}
            <label class="custom-color-wrapper" title="Custom Color">
              <input type="color" id="hud-custom-color" value="${this.activeColor}" />
            </label>
          </div>

          <div class="divider"></div>

          <div class="zoom-controls">
            <button class="icon-btn" id="hud-zoom-out" title="Zoom Out (-)">−</button>
            <span class="zoom-readout" id="hud-zoom-readout" title="Reset Zoom">100%</span>
            <button class="icon-btn" id="hud-zoom-in" title="Zoom In (+)">+</button>
          </div>
        </div>
      </div>
    `;

    this.statusDot = this.root.querySelector('#hud-status-dot')!;
    this.coordEl = this.root.querySelector('#hud-coords')!;
    this.sectorEl = this.root.querySelector('#hud-sector')!;
    this.zoomEl = this.root.querySelector('#hud-zoom-readout')!;
    this.onlineEl = this.root.querySelector('#hud-online')!;

    this.attachListeners();
  }

  private attachListeners() {
    // Palette swatches
    const palette = this.root.querySelector('#hud-palette')!;
    palette.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.color-swatch') as HTMLElement | null;
      if (!target || !target.dataset.color) return;
      this.setColor(target.dataset.color);
    });

    // Custom color picker
    const customInput = this.root.querySelector('#hud-custom-color') as HTMLInputElement;
    customInput.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      this.setColor(val, true);
    });

    // Dive Button
    this.root.querySelector('#hud-dive-btn')?.addEventListener('click', () => {
      this.callbacks.onDiveClick?.();
    });

    // Zoom Controls
    this.root.querySelector('#hud-zoom-in')?.addEventListener('click', () => this.callbacks.onZoomIn?.());
    this.root.querySelector('#hud-zoom-out')?.addEventListener('click', () => this.callbacks.onZoomOut?.());
    this.zoomEl.addEventListener('click', () => this.callbacks.onResetZoom?.());

    // Coordinate Jump Prompt
    this.coordEl.addEventListener('click', () => {
      const input = prompt('Jump to coordinates (X, Y):', '0, 0');
      if (!input) return;
      const parts = input.split(',').map((s) => parseInt(s.trim(), 10));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        this.callbacks.onJumpToCoords?.(parts[0], parts[1]);
      }
    });
  }

  private bindShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'h') {
        this.root.style.opacity = this.root.style.opacity === '0' ? '1' : '0';
      }
    });
  }

  public setColor(color: string, isCustom = false) {
    this.activeColor = color;
    this.root.querySelectorAll('.color-swatch').forEach((el) => {
      const swatch = el as HTMLElement;
      swatch.classList.toggle('active', !isCustom && swatch.dataset.color === color);
    });
    this.callbacks.onColorSelect?.(color);
  }

  public getColor(): string {
    return this.activeColor;
  }

  public updatePosition(worldX: number, worldY: number, sectorX: number, sectorY: number) {
    this.coordEl.textContent = `X: ${Math.floor(worldX)}, Y: ${Math.floor(worldY)}`;
    this.sectorEl.textContent = `SEC ${sectorX}:${sectorY}`;
  }

  public updateZoom(scale: number) {
    this.zoomEl.textContent = `${Math.round(scale * 100)}%`;
  }

  public setConnectionStatus(status: 'connecting' | 'connected' | 'disconnected') {
    this.statusDot.className = `status-dot ${status}`;
  }

  public updateOnlineCount(count: number) {
    this.onlineEl.textContent = `${count} online`;
  }
}
