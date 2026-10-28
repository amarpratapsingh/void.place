import { ViewportManager } from './spatial/viewport';
import { CanvasRenderer } from './canvas/renderer';
import { HUD } from './ui/hud';
import { SectorSyncManager } from './sync/client-room';
import { PixelBatchElement, PixelData, parseSectorKey, DiveTarget, computePixelBatchBounds } from '@void-place/shared';

const canvas = document.getElementById('void-canvas') as HTMLCanvasElement;
const viewport = new ViewportManager();
const renderer = new CanvasRenderer(canvas, viewport);

let hud: HUD;

// Track cursor position for dynamic hover indicators
let lastClientX = window.innerWidth / 2;
let lastClientY = window.innerHeight / 2;
let mouseInsideCanvas = false;

const syncManager = new SectorSyncManager(
  (element) => {
    renderer.addElement(element);
  },
  (status) => {
    hud?.setConnectionStatus(status);
  },
  (areas) => {
    renderer.eraseAreas(areas);
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

function updateHoverIndicator(clientX: number, clientY: number): void {
  if (spaceHeld || !mouseInsideCanvas) {
    renderer.setHoverPixel(null);
    return;
  }

  const { x, y } = getSnappedWorldPos(clientX, clientY);
  const tool = hud.getTool();

  if (tool === 'erase') {
    const eraserSize = hud.getEraserSize();
    const half = Math.floor(eraserSize / 2);
    renderer.setHoverPixel({
      worldX: x - half,
      worldY: y - half,
      size: eraserSize,
      color: '',
      isEraser: true,
    });
  } else {
    renderer.setHoverPixel({
      worldX: x,
      worldY: y,
      size: 1,
      color: hud.getColor(),
      isEraser: false,
    });
  }
}

// Initialize reactive HUD
const hudRoot = document.getElementById('hud-root')!;
hud = new HUD(hudRoot, {
  onColorSelect: (_hex) => {
    updateHoverIndicator(lastClientX, lastClientY);
  },
  onToolSelect: (_tool) => {
    updateHoverIndicator(lastClientX, lastClientY);
  },
  onEraserSizeSelect: (_size) => {
    updateHoverIndicator(lastClientX, lastClientY);
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
let lastWorldX: number | null = null;
let lastWorldY: number | null = null;

// Active drawing batch
const currentBatchPixels = new Map<string, PixelData>();
let currentBatchOrigin: { x: number; y: number } | null = null;

// Active erase batch
const currentEraseSteps = new Map<string, { x: number; y: number; size: number }>();

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
    updateHoverIndicator(lastClientX, lastClientY);
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

// Bresenham line algorithm for continuous drawing without gaps
function paintLine(x0: number, y0: number, x1: number, y1: number): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let curX = x0;
  let curY = y0;

  while (true) {
    paintPixel(curX, curY);
    if (curX === x1 && curY === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      curX += sx;
    }
    if (e2 < dx) {
      err += dx;
      curY += sy;
    }
  }
}

// Erase area at specified start position
function eraseAreaAt(startX: number, startY: number, size: number): void {
  const key = `${startX},${startY},${size}`;
  if (!currentEraseSteps.has(key)) {
    currentEraseSteps.set(key, { x: startX, y: startY, size });
  }
  renderer.eraseArea(startX, startY, size);
}

// Bresenham line algorithm for continuous erasing without gaps
function eraseLine(x0: number, y0: number, x1: number, y1: number, size: number): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let curX = x0;
  let curY = y0;
  const half = Math.floor(size / 2);

  while (true) {
    eraseAreaAt(curX - half, curY - half, size);
    if (curX === x1 && curY === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      curX += sx;
    }
    if (e2 < dx) {
      err += dx;
      curY += sy;
    }
  }
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

  // Left click: draw or erase
  if (e.button === 0) {
    const { x, y } = getSnappedWorldPos(e.clientX, e.clientY);
    lastWorldX = x;
    lastWorldY = y;

    const tool = hud.getTool();
    if (tool === 'draw') {
      currentBatchPixels.clear();
      currentBatchOrigin = null;
      paintPixel(x, y);
    } else if (tool === 'erase') {
      currentEraseSteps.clear();
      const size = hud.getEraserSize();
      const half = Math.floor(size / 2);
      eraseAreaAt(x - half, y - half, size);
    }
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
  lastClientX = e.clientX;
  lastClientY = e.clientY;
  mouseInsideCanvas = true;

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
  const tool = hud.getTool();
  const eraserSize = hud.getEraserSize();

  // 2. Continuous stroke handling while dragging
  if (isMouseDown && !spaceHeld) {
    if (tool === 'draw') {
      if (lastWorldX !== null && lastWorldY !== null) {
        paintLine(lastWorldX, lastWorldY, x, y);
      } else {
        paintPixel(x, y);
      }
    } else if (tool === 'erase') {
      if (lastWorldX !== null && lastWorldY !== null) {
        eraseLine(lastWorldX, lastWorldY, x, y, eraserSize);
      } else {
        const half = Math.floor(eraserSize / 2);
        eraseAreaAt(x - half, y - half, eraserSize);
      }
    }
    lastWorldX = x;
    lastWorldY = y;
  }

  // 3. Hover indicator preview
  updateHoverIndicator(e.clientX, e.clientY);
});

// Mouse Up: Commit pixel or erase batch
window.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = spaceHeld ? 'grab' : 'crosshair';
  }

  // Commit draw batch
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

    // Clean up temporary optimistic previews and commit consolidated batch
    renderer.removePreviewElements();
    renderer.addElement(batch);

    const sectorKey = viewport.getCurrentCenterSector();
    syncManager.sendElement(sectorKey, batch);

    currentBatchPixels.clear();
    currentBatchOrigin = null;
  }

  // Commit erase operations
  if (isMouseDown && currentEraseSteps.size > 0) {
    const areas = Array.from(currentEraseSteps.values());
    const sectorKey = viewport.getCurrentCenterSector();
    syncManager.sendErase(sectorKey, areas);
    currentEraseSteps.clear();
  }

  isMouseDown = false;
  lastWorldX = null;
  lastWorldY = null;
});

// Canvas enter & leave
canvas.addEventListener('mouseenter', (e) => {
  mouseInsideCanvas = true;
  lastClientX = e.clientX;
  lastClientY = e.clientY;
  updateHoverIndicator(e.clientX, e.clientY);
});

document.addEventListener('mouseleave', () => {
  mouseInsideCanvas = false;
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
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    updateHoverIndicator(e.clientX, e.clientY);
  },
  { passive: false }
);

// Initial render & sync
onViewportChanged();
