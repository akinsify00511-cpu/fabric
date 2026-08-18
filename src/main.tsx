import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { initErrorCapture } from './lib/errorCapture'
import GlobalOrganismRuntime from './components/GlobalOrganismRuntime'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'development',
    release: import.meta.env.VITE_GIT_SHA || 'dev',
    beforeSend(event) {
      event.tags = {
        ...event.tags,
        app_version: import.meta.env.VITE_GIT_SHA || 'unknown',
        app_env: import.meta.env.VITE_APP_ENV || 'development',
      }
      return event
    },
  })
  initErrorCapture()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GlobalOrganismRuntime />
      <App />
    </BrowserRouter>
  </StrictMode>,
)
