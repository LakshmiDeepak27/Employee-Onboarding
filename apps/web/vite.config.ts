import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Calls to /api are proxied to the API, so the browser sees one origin
    // and cookie-based refresh works without CORS gymnastics in development.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
});
