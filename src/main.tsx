import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import './index.css'
import './styles/app-brand-overrides.css'
import './styles/accessibility-overrides.css'
import AppRoot from './App.tsx'
import { initErrorCapture } from './lib/errorCapture'
import { initSentry } from './lib/sentry'
import GlobalOrganismRuntime from './components/GlobalOrganismRuntime'
import PremiumMotion from './components/PremiumMotion'

// Mark the authenticated browser surface so the app-only visual system never
// changes the public Avenize marketing site.
if (typeof document !== 'undefined') {
  const host = window.location.hostname
  if (host === 'app.avenize.com' || host === 'localhost' || host === '127.0.0.1') {
    document.documentElement.dataset.avenizeSurface = 'app'
  }
}

initErrorCapture()
initSentry()

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
  void App.addListener('appUrlOpen', ({ url }: { url: string }) => {
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
      <AppRoot />
    </BrowserRouter>
  </StrictMode>,
)
