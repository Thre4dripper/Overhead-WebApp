import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // HTTPS in dev (self-signed): phones only expose geolocation, camera and orientation sensors to secure origins.
  // Set DEV_HTTP=1 to serve plain HTTP on localhost.
  plugins: [react(), ...(process.env.DEV_HTTP ? [] : [basicSsl()])],
  worker: { format: 'es' },
  // MapLibre spawns its worker via new URL('maplibre-gl-worker.mjs', import.meta.url); esbuild pre-bundling breaks that URL in dev
  optimizeDeps: { exclude: ['maplibre-gl'] },
  // the monorepo root holds the single .env (VITE_* keys are read from there)
  envDir: '../../',
  server: {
    port: 5173, strictPort: true,
    // same-origin in dev: /api and /ws proxy to the Fastify service, so a blank VITE_API_URL works
    proxy: {
      '/api': { target: process.env.API_PROXY ?? 'http://localhost:8787', changeOrigin: true },
      '/ws': { target: (process.env.API_PROXY ?? 'http://localhost:8787').replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('maplibre-gl') && !/worker/i.test(id)) return 'maplibre';
          if (id.includes('/node_modules/three/') || id.includes('/node_modules/.pnpm/three@')) return 'three';
          return undefined;
        },
      },
    },
  },
});
