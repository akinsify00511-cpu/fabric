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

// Browser/runtime recovery: a stale service-worker cache can leave an older
// application shell referencing a hashed chunk that no longer exists. That
// manifests as a dynamic-import MIME error or a corrupted browser cache.
// Recover automatically once instead of leaving the user on a broken route.
const recoverableRuntimeError = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value ?? '')
  return /Failed to fetch dynamically imported module|Importing a module script failed|block checksum mismatch|Loading chunk/i.test(message)
}

const recoverRuntimeState = async () => {
  const key = 'avenize-runtime-recovery'
  if (sessionStorage.getItem(key) === '1') return
  sessionStorage.setItem(key, '1')

  try {
    const registrations = await navigator.serviceWorker?.getRegistrations()
    await Promise.all((registrations ?? []).map((registration) => registration.unregister()))
  } catch {
    // Best-effort recovery only.
  }

  try {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((name) => caches.delete(name)))
  } catch {
    // Best-effort recovery only.
  }

  window.location.reload()
}

window.addEventListener('error', (event) => {
  if (recoverableRuntimeError(event.error) || recoverableRuntimeError(event.message)) {
    void recoverRuntimeState()
  }
})

window.addEventListener('unhandledrejection', (event) => {
  if (recoverableRuntimeError(event.reason)) {
    event.preventDefault()
    void recoverRuntimeState()
  }
})

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
