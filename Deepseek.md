Infinite Canvas Social — void.place

    The jaw-drop: A collaborative canvas that is literally infinite—not "very large," but mathematically unbounded. Zoom from a single pixel to a galaxy. Every scale has content. Users leave drawings, text, photos, entire websites at any zoom level. And it's all real-time multiplayer.
    The magic: Quadtree spatial indexing with lazy loading. Content addressed by coordinate + zoom level. At high zoom, you see individual pixels people drew. At low zoom, those pixels become texture on massive structures built by communities. WebGL rendering with level-of-detail streaming.
    Stack: Rust/Wasm for client-side quadtree, WebGL/Three.js for rendering, Yjs or CRDTs for conflict-free concurrent editing, S3 with tile pyramid storage, WebSocket rooms that dynamically split/merge based on viewport density.
    Killer feature: "Dive" button—picks a random coordinate at a random zoom, drops you somewhere in the infinite void. Could be a masterpiece, could be a single dot.
