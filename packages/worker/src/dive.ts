import { DiveTarget, parseSectorKey, getSectorSize } from '@void-place/shared';
import { Env } from './sector-room';

/**
 * Handles the "Dive" button request.
 * Returns coordinates to an active sector, or picks a random mathematically unbounded coordinate.
 */
export async function handleDive(env: Env): Promise<Response> {
  let target: DiveTarget | null = null;

  try {
    if (env.DB) {
      // Pick a random sector with recorded activity from D1
      const result = await env.DB.prepare(
        `SELECT key, element_count FROM sectors WHERE element_count > 0 ORDER BY RANDOM() LIMIT 1`
      ).first<{ key: string; element_count: number }>();

      if (result) {
        const parsed = parseSectorKey(result.key);
        if (parsed) {
          const size = getSectorSize(parsed.zoomLevel);
          target = {
            x: parsed.sectorX * size + size / 2,
            y: parsed.sectorY * size + size / 2,
            zoom: parsed.zoomLevel,
            sectorKey: result.key,
            description: `A sector with ${result.element_count} creations`,
          };
        }
      }
    }
  } catch {
    // Fall back if D1 table is empty or uninitialized
  }

  // Fallback: Drop somewhere in the infinite void
  if (!target) {
    const randomZoom = Math.floor(Math.random() * 8); // z0 to z7
    const range = 50000;
    const rx = Math.floor((Math.random() - 0.5) * range);
    const ry = Math.floor((Math.random() - 0.5) * range);
    target = {
      x: rx,
      y: ry,
      zoom: randomZoom,
      sectorKey: `sector:z${randomZoom}:x0:y0`,
      description: 'The Uncharted Void',
    };
  }

  return Response.json(target);
}
