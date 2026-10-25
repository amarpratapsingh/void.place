# void.place — Infinite Canvas Social

A collaborative canvas that is literally infinite—not "very large," but mathematically unbounded. Zoom from a single pixel to a galaxy. Every scale has content. Users leave drawings, text, photos, entire websites at any zoom level. And it's all real-time multiplayer.

## The Magic

Quadtree spatial indexing with lazy loading. Content addressed by coordinate + zoom level. At high zoom, you see individual pixels people drew. At low zoom, those pixels become texture on massive structures built by communities. WebGL rendering with level-of-detail streaming.

## Tech Stack

- **Client**: TypeScript, WebGL / PixiJS for rendering, client-side Quadtree/R-tree (`rbush` / TypedArrays)
- **Real-time & Compute**: Cloudflare Workers + Durable Objects (spatial WebSocket rooms running Yjs CRDTs)
- **Storage**: Cloudflare R2 (tile pyramid storage with zero egress fees) + D1 (sector registry)
- **Edge Routing**: Cloudflare CDN for tile caching & dynamic coordinate routing

## Killer Feature

**"Dive" button** — Picks a random coordinate at a random zoom, drops you somewhere in the infinite void. Could be a masterpiece, could be a single dot.