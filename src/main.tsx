import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.tsx'
import { initErrorCapture } from './lib/errorCapture'
import { initSentry } from './lib/sentry'
import GlobalOrganismRuntime from './components/GlobalOrganismRuntime'
import PremiumMotion from './components/PremiumMotion'

// Error capture (console buffer + platform-ops feed) always runs.
initErrorCapture()
// Sentry loads lazily during idle and only when VITE_SENTRY_DSN is set.
initSentry()

// Native OAuth returns to the Capacitor deep-link scheme. Bring the returned
// PKCE code back onto the web callback route so the existing Supabase callback
// exchange remains the single source of truth on iOS and Android.
if (Capacitor.isNativePlatform()) {
  void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'com.avenize.app:' || parsed.host !== 'auth' || parsed.pathname !== '/callback') {
        return
      }
      window.location.assign(`/auth/callback${parsed.search}${parsed.hash}`)
    } catch {
      // Ignore unrelated or malformed native URLs.
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GlobalOrganismRuntime />
      <PremiumMotion />
      <App />
    </BrowserRouter>
  </StrictMode>,
)
