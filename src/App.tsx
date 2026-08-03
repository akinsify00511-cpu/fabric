import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ToastProvider } from './components/Toast'
import { GamificationProvider } from './lib/GamificationContext'
import { BrandingProvider } from './lib/BrandingContext'
import { LocaleProvider } from './lib/LocaleContext'
import Shell from './components/Shell'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import UpdatePassword from './pages/UpdatePassword'
import Onboarding from './pages/Onboarding'
import Join from './pages/Join'
import AuthCallback from './pages/AuthCallback'
import Dashboard from './pages/Dashboard'
import CRM from './pages/CRM'
// Projects imported as ProjectsNigeria
// Finance imported as FinanceNigeria
import People from './pages/People'
// Inventory imported as InventoryNigeria
import Payments from './pages/Payments'
import Pricing from './pages/Pricing'
import PricingIndustrial from './pages/PricingIndustrial'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
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
import SSOSettings from './pages/SSOSettings'
import APISettings from './pages/APISettings'
import CustomerPortal from './pages/CustomerPortal'
import Calendar from './pages/Calendar'
import Requisitions from './pages/Requisitions'
import TimeTracking from './pages/TimeTracking'
import Events from './pages/Events'
import Monitoring from './pages/Monitoring'
import Branding from './pages/Branding'
import Organogram from './pages/Organogram'
import Landing from './pages/Landing'
import LandingEnhanced from './pages/LandingEnhanced'
import Meetings from './pages/Meetings'
import ProjectsNigeria from './pages/ProjectsNigeria'
import InventoryNigeria from './pages/InventoryNigeria'
import FinanceNigeria from './pages/FinanceNigeria'
import NotificationBell from './components/NotificationBell'

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
      <Route path="/" element={<LandingEnhanced />} />
      <Route path="/v1" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/update-password" element={<UpdatePassword />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/join/:inviteId" element={<Join />} />
          <Route path="/pricing" element={<Pricing />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="crm" element={<CRM />} />
        <Route path="projects" element={<ProjectsNigeria />} />
        <Route path="finance" element={<FinanceNigeria />} />
          <Route path="payments" element={<Payments />} />
        <Route path="people" element={<People />} />
        <Route path="inventory" element={<InventoryNigeria />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/profile" element={<Profile />} />
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
        <Route path="sso" element={<SSOSettings />} />
        <Route path="api" element={<APISettings />} />
        <Route path="portal" element={<CustomerPortal />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="requisitions" element={<Requisitions />} />
        <Route path="time" element={<TimeTracking />} />
        <Route path="events" element={<Events />} />
        <Route path="monitoring" element={<Monitoring />} />
        <Route path="organogram" element={<Organogram />} />
	        <Route path="meetings" element={<Meetings />} />
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
