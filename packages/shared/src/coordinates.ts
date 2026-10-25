import { Coordinate, Viewport, SectorKey } from './types';

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
 * Derives a deterministic sector key from world coordinates and zoom.
 */
export function toSectorKey(x: number, y: number, zoomLevel: number): SectorKey {
  const discreteZoom = Math.floor(zoomLevel);
  const size = getSectorSize(discreteZoom);
  const sx = Math.floor(x / size);
  const sy = Math.floor(y / size);
  return `sector:z${discreteZoom}:x${sx}:y${sy}`;
}

/**
 * Parses a sector key back into discrete coordinates.
 */
export function parseSectorKey(key: SectorKey): { zoomLevel: number; sectorX: number; sectorY: number } | null {
  const match = key.match(/^sector:z(-?\d+):x(-?\d+):y(-?\d+)$/);
  if (!match) return null;
  return {
    zoomLevel: parseInt(match[1], 10),
    sectorX: parseInt(match[2], 10),
    sectorY: parseInt(match[3], 10),
  };
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
