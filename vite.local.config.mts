import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 12000,
    allowedHosts: true,
    proxy: {
      '/rest/v1': { target: 'http://127.0.0.1:3000', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/rest\/v1/, '') },
      '/auth/v1': { target: 'http://127.0.0.1:9999', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/auth\/v1/, '') },
    },
  },
})
