import { ViewportManager } from './spatial/viewport';
import { CanvasRenderer } from './canvas/renderer';
import { HUDController, ToolMode } from './ui/hud';
import { SectorSyncManager } from './sync/client-room';
import { PixelBatchElement, PixelData } from '@void-place/shared';

const container = document.getElementById('canvas-container')!;
const viewport = new ViewportManager();
const renderer = new CanvasRenderer(container, viewport);

const syncManager = new SectorSyncManager((element) => {
  renderer.addElement(element);
});

// Update HUD, URL hash, and real-time room sync
function onViewportChanged(): void {
  renderer.render();
  hud.update();
  viewport.queueUrlSync();
  syncManager.updateActiveSector(viewport.getCurrentCenterSector());
}

// HUD controller with tool actions and camera navigation
let hud: HUDController;

hud = new HUDController(
  viewport,
  (target) => {
    // Smooth hyperspace dive into coordinates
    const targetZoom = Math.pow(2, target.zoom);
    renderer.flyTo(target.x, target.y, targetZoom, onViewportChanged, () => {
      hud.showToast(`⌖ ARRIVED AT ${target.description ? target.description.toUpperCase() : 'UNCHARTED SECTOR'}`);
    });
  },
  () => {
    // Return to Singularity (0,0)
    renderer.flyTo(0, 0, 1.0, onViewportChanged, () => {
      hud.showToast('⌖ ANCHORED AT SINGULARITY [0,0]');
    });
  },
  (tool: ToolMode) => {
    if (tool === 'pan' || tool === 'picker') {
      renderer.setHoverPixel(null);
    }
  },
  (gridEnabled: boolean) => {
    renderer.showGrid = gridEnabled;
    renderer.render();
  }
);

// Continuous loop for smooth ink regeneration
let lastTime = performance.now();
function gameLoop(now: number): void {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  hud.updateInk(dt);
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// Interaction state
let isMouseDown = false;
let isPanning = false;
let spaceHeld = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Active drawing batch
let currentBatchPixels = new Map<string, PixelData>();
let currentBatchOrigin: { x: number; y: number } | null = null;

// Spacebar pan mode
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !spaceHeld && !(e.target instanceof HTMLInputElement)) {
    spaceHeld = true;
    document.body.classList.add('tool-pan');
    renderer.setHoverPixel(null);
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    spaceHeld = false;
    document.body.classList.remove('tool-pan');
    document.body.classList.add(`tool-${hud.currentTool}`);
  }
});

// Calculate snapped pixel grid coordinate
function getSnappedWorldPos(clientX: number, clientY: number): { x: number; y: number; size: number } {
  const world = viewport.screenToWorld(clientX, clientY);
  const size = hud.currentPixelSize;
  const snappedX = Math.floor(world.x / size) * size;
  const snappedY = Math.floor(world.y / size) * size;
  return { x: snappedX, y: snappedY, size };
}

// Paint pixel at snapped position
function paintPixel(snappedX: number, snappedY: number, size: number): void {
  const key = `${snappedX},${snappedY}`;
  if (currentBatchPixels.has(key)) return;

  // Ink cost: 0.35 ink per 1x1 pixel unit
  const cost = 0.35 * (size * size);
  if (!hud.consumeInk(cost)) {
    hud.showToast('⚠️ VOID MATTER DEPLETED · REGENERATING...');
    return;
  }

  if (!currentBatchOrigin) {
    currentBatchOrigin = { x: snappedX, y: snappedY };
  }

  const pixelData: PixelData = {
    x: snappedX - currentBatchOrigin.x,
    y: snappedY - currentBatchOrigin.y,
    color: hud.currentColor,
    size,
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
    pixels: [pixelData],
  });
}

// Mouse Down
window.addEventListener('mousedown', (e) => {
  // Ignore clicks outside the canvas (e.g. on HUD toolbar buttons)
  if ((e.target as HTMLElement).closest('#hud')) return;

  isMouseDown = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  // Pan via Middle Click, Space + Click, or Pan Tool
  if (e.button === 1 || spaceHeld || hud.currentTool === 'pan') {
    isPanning = true;
    document.body.classList.add('dragging');
    return;
  }

  if (e.button === 0) {
    // Eyedropper Tool
    if (hud.currentTool === 'picker') {
      const pickedColor = renderer.getColorAt(e.clientX, e.clientY);
      hud.setColor(pickedColor);
      hud.setTool('pencil');
      hud.showToast(`Picked color: ${pickedColor.toUpperCase()}`);
      return;
    }

    const { x, y, size } = getSnappedWorldPos(e.clientX, e.clientY);

    // Eraser Tool
    if (hud.currentTool === 'eraser') {
      renderer.eraseAt(x, y, size);
      return;
    }

    // Pencil Tool
    if (hud.currentTool === 'pencil') {
      currentBatchPixels.clear();
      currentBatchOrigin = null;
      paintPixel(x, y, size);
    }
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

  const { x, y, size } = getSnappedWorldPos(e.clientX, e.clientY);

  // 2. Drawing / Erasing while dragging
  if (isMouseDown) {
    if (hud.currentTool === 'pencil') {
      paintPixel(x, y, size);
    } else if (hud.currentTool === 'eraser') {
      renderer.eraseAt(x, y, size);
    }
  }

  // 3. Hover indicator (crosshair pixel cell preview)
  if (!spaceHeld && (hud.currentTool === 'pencil' || hud.currentTool === 'eraser')) {
    renderer.setHoverPixel({
      worldX: x,
      worldY: y,
      size,
      color: hud.currentColor,
      isEraser: hud.currentTool === 'eraser',
    });
  } else {
    renderer.setHoverPixel(null);
  }
});

// Mouse Up: Commit pixel batch
window.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    document.body.classList.remove('dragging');
  }

  if (isMouseDown && hud.currentTool === 'pencil' && currentBatchPixels.size > 0 && currentBatchOrigin) {
    const batch: PixelBatchElement = {
      id: crypto.randomUUID(),
      type: 'pixel_batch',
      x: currentBatchOrigin.x,
      y: currentBatchOrigin.y,
      zoom: Math.log2(viewport.zoom),
      createdAt: Date.now(),
      pixels: Array.from(currentBatchPixels.values()),
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

    // Refresh hover pixel position under new zoom
    const { x, y, size } = getSnappedWorldPos(e.clientX, e.clientY);
    if (!spaceHeld && (hud.currentTool === 'pencil' || hud.currentTool === 'eraser')) {
      renderer.setHoverPixel({
        worldX: x,
        worldY: y,
        size,
        color: hud.currentColor,
        isEraser: hud.currentTool === 'eraser',
      });
    }
  },
  { passive: false }
);

// Initial render & sync
onViewportChanged();
