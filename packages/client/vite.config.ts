import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err: any) => {
            // Ignore normal socket disconnects during quick pan/zoom
            if (err?.code !== 'EPIPE' && err?.code !== 'ECONNRESET') {
              console.error('[vite proxy error]', err);
            }
          });
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', (err: any) => {
              if (err?.code !== 'EPIPE' && err?.code !== 'ECONNRESET') {
                console.error('[vite ws proxy error]', err);
              }
            });
          });
        },
      },
    },
  },
});

