import { Coordinate, Viewport, SectorKey, BoundingBox, PixelData } from './types';

// Sector size in coordinate units at base zoom level 0
export const BASE_SECTOR_SIZE = 1024;

/**
 * Calculates sector size at a given discrete zoom level.
 * Higher zoom levels represent smaller, more detailed tiles.
 */
export function getSectorSize(zoomLevel: number): number {
  return BASE_SECTOR_SIZE / Math.pow(2, Math.floor(zoomLevel));
}

/**
 * Derives a deterministic sector key from world coordinates.
 * When zoomLevel is omitted, generates canonical world-space sector keys (sector:x{sx}:y{sy})
 * ensuring all users viewing the same coordinates connect to the same real-time sector room.
 */
export function toSectorKey(x: number, y: number, zoomLevel?: number): SectorKey {
  if (zoomLevel !== undefined) {
    const discreteZoom = Math.floor(zoomLevel);
    const size = getSectorSize(discreteZoom);
    const sx = Math.floor(x / size);
    const sy = Math.floor(y / size);
    return `sector:z${discreteZoom}:x${sx}:y${sy}`;
  }
  const sx = Math.floor(x / BASE_SECTOR_SIZE);
  const sy = Math.floor(y / BASE_SECTOR_SIZE);
  return `sector:x${sx}:y${sy}`;
}

/**
 * Parses a sector key back into discrete coordinates.
 * Supports both canonical (sector:x:y) and zoom-specific (sector:z:x:y) keys.
 */
export function parseSectorKey(key: SectorKey): { zoomLevel?: number; sectorX: number; sectorY: number } | null {
  const matchWithZoom = key.match(/^sector:z(-?\d+):x(-?\d+):y(-?\d+)$/);
  if (matchWithZoom) {
    return {
      zoomLevel: parseInt(matchWithZoom[1], 10),
      sectorX: parseInt(matchWithZoom[2], 10),
      sectorY: parseInt(matchWithZoom[3], 10),
    };
  }

  const matchCanonical = key.match(/^sector:x(-?\d+):y(-?\d+)$/);
  if (matchCanonical) {
    return {
      sectorX: parseInt(matchCanonical[1], 10),
      sectorY: parseInt(matchCanonical[2], 10),
    };
  }

  return null;
}

/**
 * Computes tight axis-aligned bounding box for a batch of pixels.
 */
export function computePixelBatchBounds(originX: number, originY: number, pixels: PixelData[]): BoundingBox {
  if (!pixels || pixels.length === 0) {
    return { minX: originX, minY: originY, maxX: originX, maxY: originY };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i];
    const px = originX + p.x;
    const py = originY + p.y;
    const sz = p.size || 1;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px + sz > maxX) maxX = px + sz;
    if (py + sz > maxY) maxY = py + sz;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Checks whether two 2D axis-aligned bounding boxes overlap.
 */
export function isBoxIntersecting(a: BoundingBox, b: BoundingBox): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Finds all sector keys intersecting a given client viewport.
 */
export function getVisibleSectorKeys(viewport: Viewport): SectorKey[] {
  const discreteZoom = Math.floor(viewport.zoom);
  const size = getSectorSize(discreteZoom);

  const startX = Math.floor(viewport.minX / size);
  const endX = Math.floor(viewport.maxX / size);
  const startY = Math.floor(viewport.minY / size);
  const endY = Math.floor(viewport.maxY / size);

  const keys: SectorKey[] = [];
  for (let x = startX; x <= endX; x++) {
    for (let y = startY; y <= endY; y++) {
      keys.push(`sector:z${discreteZoom}:x${x}:y${y}`);
    }
  }
  return keys;
}

/**
 * R2 tile storage key helper
 */
export function getTileStoragePath(zoom: number, x: number, y: number): string {
  return `tiles/${Math.floor(zoom)}/${x}/${y}.png`;
}

/**
 * Calculates distance and angle (in radians) between two world coordinates.
 */
export function getDistanceAndAngle(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): { distance: number; angleRad: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.hypot(dx, dy);
  const angleRad = Math.atan2(dy, dx);
  return { distance, angleRad };
}

/**
 * Formats world distance into human-readable compact notation (e.g. 850u, 12.4k u, 3.2M u).
 */
export function formatDistance(distance: number): string {
  if (distance < 1000) return `${Math.round(distance)}u`;
  if (distance < 1000000) return `${(distance / 1000).toFixed(1)}k u`;
  return `${(distance / 1000000).toFixed(1)}M u`;
}

