import { ViewportManager } from './spatial/viewport';
import { CanvasRenderer } from './canvas/renderer';
import { HUDController } from './ui/hud';
import { SectorSyncManager } from './sync/client-room';
import { StrokeElement } from '@void-place/shared';

const container = document.getElementById('canvas-container')!;
const viewport = new ViewportManager();
const renderer = new CanvasRenderer(container, viewport);

let syncManager: SectorSyncManager;

syncManager = new SectorSyncManager((element) => {
  renderer.addElement(element);
});

// Update HUD & sync sectors on viewport movement
function onViewportChanged(): void {
  renderer.render();
  hud.update();
  syncManager.updateVisibleSectors(viewport.getVisibleSectors());
}

const hud = new HUDController(viewport, (target) => {
  // Animate/jump to Dive coordinates
  viewport.x = target.x;
  viewport.y = target.y;
  viewport.zoom = Math.pow(2, target.zoom);
  onViewportChanged();
});

// User interactions: Pan, Zoom, and Draw
let isDragging = false;
let isDrawing = false;
let lastMouseX = 0;
let lastMouseY = 0;
let currentStroke: StrokeElement | null = null;

window.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    if (e.shiftKey) {
      // Draw mode with Shift + Click
      isDrawing = true;
      const world = viewport.screenToWorld(e.clientX, e.clientY);
      currentStroke = {
        id: crypto.randomUUID(),
        type: 'stroke',
        x: world.x,
        y: world.y,
        zoom: Math.log2(viewport.zoom),
        createdAt: Date.now(),
        color: '#a855f7',
        width: 3 / viewport.zoom,
        points: [0, 0],
      };
      renderer.addElement(currentStroke);
    } else {
      // Pan mode
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
  }
});

window.addEventListener('mousemove', (e) => {
  if (isDragging) {
    const dx = (e.clientX - lastMouseX) / viewport.zoom;
    const dy = (e.clientY - lastMouseY) / viewport.zoom;
    viewport.x -= dx;
    viewport.y -= dy;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    onViewportChanged();
  } else if (isDrawing && currentStroke) {
    const world = viewport.screenToWorld(e.clientX, e.clientY);
    const relX = world.x - currentStroke.x;
    const relY = world.y - currentStroke.y;
    currentStroke.points.push(relX, relY);
    renderer.render();
  }
});

window.addEventListener('mouseup', () => {
  if (isDrawing && currentStroke) {
    const sectorKey = viewport.getCurrentCenterSector();
    syncManager.sendElement(sectorKey, currentStroke);
    currentStroke = null;
    isDrawing = false;
  }
  isDragging = false;
});

window.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;

    // Zoom centered on cursor
    const mouseWorldBefore = viewport.screenToWorld(e.clientX, e.clientY);
    viewport.zoom *= zoomFactor;
    viewport.zoom = Math.max(0.0001, Math.min(100000, viewport.zoom));

    const mouseWorldAfter = viewport.screenToWorld(e.clientX, e.clientY);
    viewport.x += mouseWorldBefore.x - mouseWorldAfter.x;
    viewport.y += mouseWorldBefore.y - mouseWorldAfter.y;

    onViewportChanged();
  },
  { passive: false }
);

// Initial render & sync
onViewportChanged();
