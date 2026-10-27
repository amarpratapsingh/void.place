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
  private coordPopover!: HTMLElement;
  private inputX!: HTMLInputElement;
  private inputY!: HTMLInputElement;
  private copyBtn!: HTMLButtonElement;
  private activeColor: string = DEFAULT_PALETTE[12]; // Indigo default
  private callbacks: HUDCallbacks;

  public currentX: number = 0;
  public currentY: number = 0;

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
        <div class="coord-container hud-interactive">
          <div class="glass-panel status-pill">
            <div class="status-dot" id="hud-status-dot" title="Connection Status"></div>
            <div class="coord-wrapper">
              <span class="coord-badge" id="hud-coords" title="Click to enter custom coordinates">X: 0, Y: 0</span>
              <button class="icon-btn-inline" id="hud-copy-coords" title="Copy coordinates">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            <div class="divider"></div>
            <span class="sector-badge" id="hud-sector">Sector 0, 0</span>
            <div class="divider"></div>
            <span class="sector-badge" id="hud-online">1 online</span>
          </div>

          <!-- Custom Coordinates & Jump Popover -->
          <div class="glass-panel coord-popover" id="hud-coord-popover" style="display: none;">
            <div class="popover-header">
              <span>Go to Coordinates</span>
              <button class="popover-close" id="hud-popover-close" title="Close (Esc)">✕</button>
            </div>
            <div class="popover-inputs">
              <div class="input-group">
                <label for="hud-input-x">X</label>
                <input type="number" id="hud-input-x" value="0" step="1" />
              </div>
              <div class="input-group">
                <label for="hud-input-y">Y</label>
                <input type="number" id="hud-input-y" value="0" step="1" />
              </div>
            </div>
            <div class="popover-actions">
              <button class="btn-sm btn-secondary" id="hud-popover-copy-link" title="Copy coordinates to clipboard">Copy</button>
              <button class="btn-sm btn-secondary" id="hud-popover-origin" title="Jump to center (0,0)">Center (0,0)</button>
              <button class="btn-sm btn-primary" id="hud-popover-go">Jump</button>
            </div>
          </div>
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
    this.coordPopover = this.root.querySelector('#hud-coord-popover')!;
    this.inputX = this.root.querySelector('#hud-input-x') as HTMLInputElement;
    this.inputY = this.root.querySelector('#hud-input-y') as HTMLInputElement;
    this.copyBtn = this.root.querySelector('#hud-copy-coords') as HTMLButtonElement;

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

    // Quick Copy Coordinates Button
    this.copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyCurrentCoords();
    });

    // Toggle Coordinates Popover on Click
    this.coordEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCoordPopover();
    });

    // Popover Close Button
    this.root.querySelector('#hud-popover-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeCoordPopover();
    });

    // Popover Jump Action
    const handleJump = () => {
      const x = parseInt(this.inputX.value, 10);
      const y = parseInt(this.inputY.value, 10);
      if (!isNaN(x) && !isNaN(y)) {
        this.callbacks.onJumpToCoords?.(x, y);
        this.closeCoordPopover();
      }
    };

    this.root.querySelector('#hud-popover-go')?.addEventListener('click', handleJump);

    // Popover Jump to Origin
    this.root.querySelector('#hud-popover-origin')?.addEventListener('click', () => {
      this.inputX.value = '0';
      this.inputY.value = '0';
      handleJump();
    });

    // Popover Copy Coords Action
    this.root.querySelector('#hud-popover-copy-link')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      const textToCopy = `X: ${this.inputX.value}, Y: ${this.inputY.value}`;
      navigator.clipboard.writeText(textToCopy).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => {
          btn.textContent = orig;
        }, 1500);
      }).catch(() => {
        prompt('Coordinates:', textToCopy);
      });
    });

    // Enter Key in Popover inputs to Jump immediately
    [this.inputX, this.inputY].forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleJump();
        } else if (e.key === 'Escape') {
          this.closeCoordPopover();
        }
      });
    });

    // Close popover when clicking anywhere outside
    document.addEventListener('click', (e) => {
      if (
        this.coordPopover.style.display !== 'none' &&
        !this.coordPopover.contains(e.target as Node) &&
        !this.coordEl.contains(e.target as Node)
      ) {
        this.closeCoordPopover();
      }
    });
  }

  private copyCurrentCoords() {
    const text = `X: ${this.currentX}, Y: ${this.currentY}`;
    navigator.clipboard.writeText(text).then(() => {
      this.copyBtn.classList.add('copied');
      this.copyBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      setTimeout(() => {
        this.copyBtn.classList.remove('copied');
        this.copyBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        `;
      }, 1500);
    }).catch(() => {
      prompt('Coordinates:', text);
    });
  }

  public toggleCoordPopover() {
    if (this.coordPopover.style.display === 'none') {
      this.openCoordPopover();
    } else {
      this.closeCoordPopover();
    }
  }

  public openCoordPopover() {
    this.inputX.value = this.currentX.toString();
    this.inputY.value = this.currentY.toString();
    this.coordPopover.style.display = 'flex';
    setTimeout(() => {
      this.inputX.focus();
      this.inputX.select();
    }, 50);
  }

  public closeCoordPopover() {
    this.coordPopover.style.display = 'none';
  }

  private bindShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') this.closeCoordPopover();
        return;
      }
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
    this.currentX = Math.floor(worldX);
    this.currentY = Math.floor(worldY);
    this.coordEl.textContent = `X: ${this.currentX}, Y: ${this.currentY}`;
    this.sectorEl.textContent = `Sector ${sectorX}, ${sectorY}`;
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
