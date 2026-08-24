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
            // @sentry/react must stay out of the eager vendor-react chunk —
            // it is only reachable via dynamic import (idle-time, DSN-gated).
            if (id.includes('@sentry')) return 'vendor-sentry'
            if (id.includes('react-router') || id.includes('@remix-run')) return 'vendor-router'
            if (id.includes('react')) return 'vendor-react'
            if (id.includes('supabase')) return 'vendor-supabase'
            if (id.includes('lucide')) return 'vendor-icons'
            if (id.includes('otpauth') || id.includes('@simplewebauthn')) return 'vendor-auth'
          }
        },
      },
    },
    // vendor-pdf (jspdf+html2canvas, ~660KB) is intentionally large and
    // intentionally lazy — it loads only when a user generates a PDF.
    chunkSizeWarningLimit: 700,
    modulePreload: {
      // Preload entry dependencies (vendor-react/-router/-supabase) in
      // parallel with the entry chunk, but never the on-demand heavy chunks
      // (pdf/html2canvas/tesseract) — those stay lazy by design.
      resolveDependencies(_filename, deps) {
        return deps.filter(
          (d) => !/vendor-pdf|vendor-sentry|html2canvas|purify|tesseract|index\.es/.test(d),
        )
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  preview: {
    port: 4173,
  },
})
