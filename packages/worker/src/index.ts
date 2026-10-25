import { Env, SectorRoom } from './sector-room';
import { handleDive } from './dive';

export { SectorRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // 1. "Dive" button endpoint
    if (url.pathname === '/api/dive') {
      const response = await handleDive(env);
      response.headers.set('Access-Control-Allow-Origin', '*');
      return response;
    }

    // 2. Tile pyramid serving from Cloudflare R2
    if (url.pathname.startsWith('/api/tiles/')) {
      const tilePath = url.pathname.replace('/api/tiles/', '');
      const object = await env.TILES_BUCKET.get(tilePath);

      if (!object) {
        return new Response('Tile not found', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(object.body, { headers });
    }

    // 3. WebSocket room upgrade routed to sector Durable Object
    if (url.pathname.startsWith('/api/room/')) {
      const sectorKey = decodeURIComponent(url.pathname.replace('/api/room/', ''));
      if (!sectorKey) {
        return new Response('Sector key required', { status: 400 });
      }

      // Route to the unique Durable Object instance for this sector
      const id = env.SECTOR_ROOMS.idFromName(sectorKey);
      const room = env.SECTOR_ROOMS.get(id);

      url.searchParams.set('sectorKey', sectorKey);
      return room.fetch(new Request(url.toString(), request));
    }

    return new Response('void.place worker API', { status: 200 });
  },
};
