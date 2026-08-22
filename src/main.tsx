import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initErrorCapture } from './lib/errorCapture'
import GlobalOrganismRuntime from './components/GlobalOrganismRuntime'

// Error capture (console buffer + platform-ops feed) always runs.
initErrorCapture()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GlobalOrganismRuntime />
      <App />
    </BrowserRouter>
  </StrictMode>,
)
