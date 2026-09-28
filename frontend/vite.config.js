import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API base URL is injected at build time so the same bundle can point at
// localhost, a staging host, or the deployed Render service.
//   VITE_API_URL=https://mams-api.onrender.com  npm run build
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev convenience: /api/* is forwarded to the Express server,
      // so no CORS configuration is needed while developing.
      '/api': { target: 'http://localhost:4000', changeOrigin: true }
    }
  },
  preview: { port: 4173 }
});
