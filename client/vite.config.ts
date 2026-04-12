import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // NOTE: Do not add an /api proxy here.
    // In local dev, always open the Wrangler port (default 8788) instead of
    // this Vite port directly. Wrangler (npm run pages:dev) intercepts /api/*
    // requests and routes them to Pages Functions before proxying everything
    // else to this Vite server. Proxying /api from Vite would only cause
    // ECONNREFUSED because nothing listens at an extra backend port.
  },
});
