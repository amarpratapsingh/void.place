import { ViewportManager } from './spatial/viewport';
import { CanvasRenderer } from './canvas/renderer';
import { HUD } from './ui/hud';
import { SectorSyncManager } from './sync/client-room';
import { PixelBatchElement, PixelData, parseSectorKey, DiveTarget, computePixelBatchBounds } from '@void-place/shared';

const canvas = document.getElementById('void-canvas') as HTMLCanvasElement;
const viewport = new ViewportManager();
const renderer = new CanvasRenderer(canvas, viewport);

let hud: HUD;

const syncManager = new SectorSyncManager(
  (element) => {
    renderer.addElement(element);
  },
  (status) => {
    hud?.setConnectionStatus(status);
  }
);

// Update HUD, URL hash, and real-time room sync
function onViewportChanged(): void {
  renderer.render();
  const parsed = parseSectorKey(viewport.getCurrentCenterSector());
  hud?.updatePosition(viewport.x, viewport.y, parsed?.sectorX ?? 0, parsed?.sectorY ?? 0);
  hud?.updateZoom(viewport.zoom);
  viewport.queueUrlSync();
  syncManager.updateActiveSector(viewport.getCurrentCenterSector());
}

// Initialize reactive HUD
const hudRoot = document.getElementById('hud-root')!;
hud = new HUD(hudRoot, {
  onColorSelect: (_hex) => {
    // Active color updated
  },
  onDiveClick: async () => {
    try {
      const res = await fetch('/api/dive');
      if (res.ok) {
        const data: DiveTarget = await res.json();
        const targetZoom = Math.pow(2, data.zoom);
        renderer.flyTo(data.x, data.y, targetZoom, onViewportChanged);
      }
    } catch (err) {
      console.error('Dive failed', err);
    }
  },
  onZoomIn: () => {
    viewport.zoom = Math.min(100000, viewport.zoom * 1.3);
    onViewportChanged();
  },
  onZoomOut: () => {
    viewport.zoom = Math.max(0.0001, viewport.zoom * 0.7);
    onViewportChanged();
  },
  onResetZoom: () => {
    viewport.zoom = 1.0;
    onViewportChanged();
  },
  onJumpToCoords: (x, y) => {
    renderer.flyTo(x, y, viewport.zoom, onViewportChanged);
  },
});

// Canvas Interaction State
let isMouseDown = false;
let isPanning = false;
let spaceHeld = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Active drawing batch
const currentBatchPixels = new Map<string, PixelData>();
let currentBatchOrigin: { x: number; y: number } | null = null;

// Spacebar pan mode
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !spaceHeld && !(e.target instanceof HTMLInputElement)) {
    spaceHeld = true;
    canvas.style.cursor = 'grab';
    renderer.setHoverPixel(null);
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    spaceHeld = false;
    canvas.style.cursor = 'crosshair';
  }
});

// Calculate snapped 1x1 pixel world position
function getSnappedWorldPos(clientX: number, clientY: number): { x: number; y: number } {
  const world = viewport.screenToWorld(clientX, clientY);
  return {
    x: Math.floor(world.x),
    y: Math.floor(world.y),
  };
}

// Paint pixel at snapped position
function paintPixel(snappedX: number, snappedY: number): void {
  const key = `${snappedX},${snappedY}`;
  if (currentBatchPixels.has(key)) return;

  if (!currentBatchOrigin) {
    currentBatchOrigin = { x: snappedX, y: snappedY };
  }

  const pixelData: PixelData = {
    x: snappedX - currentBatchOrigin.x,
    y: snappedY - currentBatchOrigin.y,
    color: hud.getColor(),
    size: 1,
  };

  currentBatchPixels.set(key, pixelData);

  // Optimistic preview in current session
  renderer.addElement({
    id: `preview_${key}`,
    type: 'pixel_batch',
    x: currentBatchOrigin.x,
    y: currentBatchOrigin.y,
    zoom: Math.log2(viewport.zoom),
    createdAt: Date.now(),
    bounds: computePixelBatchBounds(currentBatchOrigin.x, currentBatchOrigin.y, [pixelData]),
    pixels: [pixelData],
  });
}

// Mouse Down
window.addEventListener('mousedown', (e) => {
  // Ignore clicks outside the canvas
  if ((e.target as HTMLElement).closest('#hud-root')) return;

  isMouseDown = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  // Pan via Middle Click, Right Click, or Space + Click
  if (e.button === 1 || e.button === 2 || spaceHeld) {
    isPanning = true;
    canvas.style.cursor = 'grabbing';
    return;
  }

  // Left click: draw pixel
  if (e.button === 0) {
    const { x, y } = getSnappedWorldPos(e.clientX, e.clientY);
    currentBatchPixels.clear();
    currentBatchOrigin = null;
    paintPixel(x, y);
  }
});

// Context Menu: Prevent default on canvas to allow right-click pan
window.addEventListener('contextmenu', (e) => {
  if ((e.target as HTMLElement).id === 'void-canvas') {
    e.preventDefault();
  }
});

// Mouse Move
window.addEventListener('mousemove', (e) => {
  // 1. Pan handling
  if (isPanning) {
    const dx = (e.clientX - lastMouseX) / viewport.zoom;
    const dy = (e.clientY - lastMouseY) / viewport.zoom;
    viewport.x -= dx;
    viewport.y -= dy;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    onViewportChanged();
    return;
  }

  const { x, y } = getSnappedWorldPos(e.clientX, e.clientY);

  // 2. Drawing while dragging
  if (isMouseDown && !spaceHeld) {
    paintPixel(x, y);
  }

  // 3. Hover indicator
  if (!spaceHeld) {
    renderer.setHoverPixel({
      worldX: x,
      worldY: y,
      size: 1,
      color: hud.getColor(),
      isEraser: false,
    });
  } else {
    renderer.setHoverPixel(null);
  }
});

// Mouse Up: Commit pixel batch
window.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = spaceHeld ? 'grab' : 'crosshair';
  }

  if (isMouseDown && currentBatchPixels.size > 0 && currentBatchOrigin) {
    const pixels = Array.from(currentBatchPixels.values());
    const batch: PixelBatchElement = {
      id: crypto.randomUUID(),
      type: 'pixel_batch',
      x: currentBatchOrigin.x,
      y: currentBatchOrigin.y,
      zoom: Math.log2(viewport.zoom),
      createdAt: Date.now(),
      bounds: computePixelBatchBounds(currentBatchOrigin.x, currentBatchOrigin.y, pixels),
      pixels,
    };

    const sectorKey = viewport.getCurrentCenterSector();
    syncManager.sendElement(sectorKey, batch);

    currentBatchPixels.clear();
    currentBatchOrigin = null;
  }

  isMouseDown = false;
});

// Hide hover indicator when mouse leaves canvas
document.addEventListener('mouseleave', () => {
  renderer.setHoverPixel(null);
});

// Mouse Wheel: Zoom centered on cursor
window.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;

    const mouseWorldBefore = viewport.screenToWorld(e.clientX, e.clientY);
    viewport.zoom *= zoomFactor;
    viewport.zoom = Math.max(0.0001, Math.min(100000, viewport.zoom));

    const mouseWorldAfter = viewport.screenToWorld(e.clientX, e.clientY);
    viewport.x += mouseWorldBefore.x - mouseWorldAfter.x;
    viewport.y += mouseWorldBefore.y - mouseWorldAfter.y;

    onViewportChanged();

    // Refresh hover position under new zoom
    const { x, y } = getSnappedWorldPos(e.clientX, e.clientY);
    if (!spaceHeld) {
      renderer.setHoverPixel({
        worldX: x,
        worldY: y,
        size: 1,
        color: hud.getColor(),
        isEraser: false,
      });
    }
  },
  { passive: false }
);

// Initial render & sync
onViewportChanged();
