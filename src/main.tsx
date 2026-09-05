import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GlobalOrganismRuntime />
      <PremiumMotion />
      <App />
    </BrowserRouter>
  </StrictMode>,
)
