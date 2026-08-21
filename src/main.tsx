import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initErrorCapture } from './lib/errorCapture'
import { initSentry } from './lib/sentryLazy'
import GlobalOrganismRuntime from './components/GlobalOrganismRuntime'

// Error capture (console buffer + platform-ops feed) always runs; the Sentry
// SDK itself loads lazily at idle time so it never delays first paint.
initErrorCapture()
initSentry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GlobalOrganismRuntime />
      <App />
    </BrowserRouter>
  </StrictMode>,
)
