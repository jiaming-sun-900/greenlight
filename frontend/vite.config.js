import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // In production Vercel serves the frontend and the API from one domain, so the
  // app calls /api/screen. This proxy gives the dev server the same shape: /api is
  // forwarded to the local uvicorn process with the prefix stripped, so a fresh
  // clone runs with `npm run dev` + `uvicorn main:app` and no configuration, and
  // there is no cross-origin request in either environment.
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
