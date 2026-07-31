import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ToastProvider } from './components/Toast'
import { GamificationProvider } from './lib/GamificationContext'
import { BrandingProvider } from './lib/BrandingContext'
import { LocaleProvider } from './lib/LocaleContext'
import Shell from './components/Shell'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Onboarding from './pages/Onboarding'
import Join from './pages/Join'
import Dashboard from './pages/Dashboard'
import CRM from './pages/CRM'
import Projects from './pages/Projects'
import Finance from './pages/Finance'
import People from './pages/People'
import Inventory from './pages/Inventory'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import More from './pages/More'
import Social from './pages/Social'
import Tasks from './pages/Tasks'
import Merit from './pages/Merit'
import CashFlow from './pages/CashFlow'
import Chat from './pages/Chat'
import Knowledge from './pages/Knowledge'
import Automations from './pages/Automations'
import Tickets from './pages/Tickets'
import Campaigns from './pages/Campaigns'
import Accounting from './pages/Accounting'
import BrandingSettings from './pages/BrandingSettings'
import SecuritySettings from './pages/SecuritySettings'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading, staff, staffChecked } = useAuth()

  if (loading || (session && !staffChecked)) {
    return <div className="min-h-screen flex items-center justify-center text-black/40 text-sm">Loading…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  if (!staff) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/join/:inviteId" element={<Join />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="crm" element={<CRM />} />
        <Route path="projects" element={<Projects />} />
        <Route path="finance" element={<Finance />} />
        <Route path="people" element={<People />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="more" element={<More />} />
        <Route path="social" element={<Social />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="merit" element={<Merit />} />
        <Route path="cashflow" element={<CashFlow />} />
        <Route path="chat" element={<Chat />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="automations" element={<Automations />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="accounting" element={<Accounting />} />
        <Route path="branding" element={<BrandingSettings />} />
        <Route path="security" element={<SecuritySettings />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <GamificationProvider>
          <BrandingProvider>
            <LocaleProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </LocaleProvider>
          </BrandingProvider>
        </GamificationProvider>
      </ToastProvider>
    </AuthProvider>
  )
}
