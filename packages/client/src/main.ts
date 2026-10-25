import { ViewportManager } from './spatial/viewport';
import { CanvasRenderer } from './canvas/renderer';
import { HUDController } from './ui/hud';
import { SectorSyncManager } from './sync/client-room';
import { StrokeElement } from '@void-place/shared';

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

// HUD controller with hyperspace camera navigation
const hud = new HUDController(
  viewport,
  (target) => {
    // Smooth hyperspace dive into coordinates
    const targetZoom = Math.pow(2, target.zoom);
    renderer.flyTo(target.x, target.y, targetZoom, onViewportChanged, () => {
      hud.showToast(`✨ Arrived at ${target.description || 'uncharted sector'}`);
    });
  },
  () => {
    // Return to Origin (0,0)
    renderer.flyTo(0, 0, 1.0, onViewportChanged, () => {
      hud.showToast('🎯 Returned to Origin (0,0)');
    });
  }
);

// Continuous loop for smooth ink regeneration & rendering
let lastTime = performance.now();
function gameLoop(now: number): void {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  hud.updateInk(dt);

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// User interactions: Pan, Zoom, and Ink-limited Drawing
let isDragging = false;
let isDrawing = false;
let lastMouseX = 0;
let lastMouseY = 0;
let lastWorldX = 0;
let lastWorldY = 0;
let currentStroke: StrokeElement | null = null;

window.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    if (e.shiftKey) {
      // Check if user has sufficient ink to start a stroke
      if (!hud.consumeInk(3)) {
        hud.showToast('⚠️ Out of ink! Wait for reserves to regenerate.');
        return;
      }

      isDrawing = true;
      const world = viewport.screenToWorld(e.clientX, e.clientY);
      lastWorldX = world.x;
      lastWorldY = world.y;

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
    const segDist = Math.hypot(world.x - lastWorldX, world.y - lastWorldY);

    // Only add points if moved minimum world distance
    const minThreshold = 2 / viewport.zoom;
    if (segDist > minThreshold) {
      // Calculate ink cost proportional to segment length
      const cost = Math.max(0.2, (segDist * viewport.zoom) * 0.05);

      if (!hud.consumeInk(cost)) {
        // Out of ink! End current stroke
        const sectorKey = viewport.getCurrentCenterSector();
        syncManager.sendElement(sectorKey, currentStroke);
        currentStroke = null;
        isDrawing = false;
        hud.showToast('⚠️ Depleted ink reserves! Regenerating...');
        return;
      }

      const relX = world.x - currentStroke.x;
      const relY = world.y - currentStroke.y;
      currentStroke.points.push(relX, relY);

      lastWorldX = world.x;
      lastWorldY = world.y;
      renderer.render();
    }
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
