import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { initErrorCapture } from './lib/errorCapture'

// Initialize Sentry for error monitoring
// Set VITE_SENTRY_DSN in .env to enable
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.1, // 10% of transactions
    environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'development',
    release: import.meta.env.VITE_GIT_SHA || 'dev',
    // Enable global error capture
    beforeSend(event) {
      // Add app context to every event
      event.tags = {
        ...event.tags,
        app_version: import.meta.env.VITE_GIT_SHA || 'unknown',
        app_env: import.meta.env.VITE_APP_ENV || 'development',
      }
      return event
    },
  })

  // Initialize console error capture
  initErrorCapture()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
