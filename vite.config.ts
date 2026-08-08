import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'vendor-react'
            if (id.includes('react-router')) return 'vendor-router'
            if (id.includes('supabase')) return 'vendor-supabase'
            if (id.includes('date-fns') || id.includes('uuid')) return 'vendor-utils'
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf'
            if (id.includes('lucide')) return 'vendor-icons'
            if (id.includes('@supabase')) return 'vendor-supabase'
            if (id.includes('dompurify')) return 'vendor-sanitize'
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    open: false,
  },
  preview: {
    port: 4173,
  },
})
