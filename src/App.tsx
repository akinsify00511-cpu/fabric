import { useState, useEffect, lazy, Suspense, type ReactNode, type ComponentType } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ToastProvider } from './components/Toast'
import { GamificationProvider } from './lib/GamificationContext'
import { BrandingProvider } from './lib/BrandingContext'
import { LocaleProvider } from './lib/LocaleContext'
import Shell from './components/Shell'
import BetaFeedbackButton from './components/BetaFeedbackButton'

// Lazy load heavy pages for code splitting
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const UpdatePassword = lazy(() => import('./pages/UpdatePassword'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Join = lazy(() => import('./pages/Join'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CRM = lazy(() => import('./pages/CRM'))
const Jobs = lazy(() => import('./pages/Jobs'))
const People = lazy(() => import('./pages/People'))
const HumanResources = lazy(() => import('./pages/HumanResources'))
const Operations = lazy(() => import('./pages/Operations'))
const SalesPerformance = lazy(() => import('./pages/SalesPerformance'))
const FinanceCenter = lazy(() => import('./pages/FinanceCenter'))
const Logistics = lazy(() => import('./pages/Logistics'))
const Equipment = lazy(() => import('./pages/Equipment'))
const LabQC = lazy(() => import('./pages/LabQC'))
const Payments = lazy(() => import('./pages/Payments'))
const Invoices = lazy(() => import('./pages/Invoices'))
const Pricing = lazy(() => import('./pages/Pricing'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))
const Profile = lazy(() => import('./pages/Profile'))
const More = lazy(() => import('./pages/More'))
const Social = lazy(() => import('./pages/Social'))
const Approvals = lazy(() => import('./pages/Approvals'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Merit = lazy(() => import('./pages/Merit'))
const CashFlow = lazy(() => import('./pages/CashFlow'))
const Chat = lazy(() => import('./pages/Chat'))
const Knowledge = lazy(() => import('./pages/Knowledge'))
const Automations = lazy(() => import('./pages/Automations'))
const Tickets = lazy(() => import('./pages/Tickets'))
const Campaigns = lazy(() => import('./pages/Campaigns'))
const Accounting = lazy(() => import('./pages/Accounting'))
const BrandingSettings = lazy(() => import('./pages/BrandingSettings'))
const SecuritySettings = lazy(() => import('./pages/SecuritySettings'))
const SSOSettings = lazy(() => import('./pages/SSOSettings'))
const Integrations = lazy(() => import('./pages/Integrations'))
const APISettings = lazy(() => import('./pages/APISettings'))
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'))
const ProjectSettings = lazy(() => import('./pages/ProjectSettings'))
const RoleSettings = lazy(() => import('./pages/RoleSettings'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Requisitions = lazy(() => import('./pages/Requisitions'))
const TimeTracking = lazy(() => import('./pages/TimeTracking'))
const Events = lazy(() => import('./pages/Events'))
const Monitoring = lazy(() => import('./pages/Monitoring'))
const Organogram = lazy(() => import('./pages/Organogram'))
const Landing = lazy(() => import('./pages/Landing'))
const LandingEnhanced = lazy(() => import('./pages/LandingEnhanced'))
const CompanyHome = lazy(() => import('./pages/CompanyHome'))
const Meetings = lazy(() => import('./pages/Meetings'))
const ProjectsNigeria = lazy(() => import('./pages/ProjectsNigeria'))
const InventoryNigeria = lazy(() => import('./pages/InventoryNigeria'))
const FinanceNigeria = lazy(() => import('./pages/FinanceNigeria'))
const Quotes = lazy(() => import('./pages/Quotes'))
const TrialBanner = lazy(() => import('./components/TrialBanner'))
const OwnerInsights = lazy(() => import('./pages/OwnerInsights'))
const FieldLocation = lazy(() => import('./pages/FieldLocation'))
const LeadCapture = lazy(() => import('./pages/LeadCapture'))
const InvoicePreview = lazy(() => import('./components/InvoicePreview'))
const OnboardingWizard = lazy(() => import('./components/OnboardingWizard'))
const Premium = lazy(() => import('./pages/Premium'))
const StaffProfile = lazy(() => import('./pages/StaffProfile'))
const BusinessInfrastructure = lazy(() => import('./pages/BusinessInfrastructure'))
const SarahChat = lazy(() => import('./components/SarahChat'))
const ErrorBoundary = lazy(() => import('./components/ErrorBoundary'))
const CookieConsent = lazy(() => import('./components/CookieConsent'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))
const Contact = lazy(() => import('./pages/Contact'))
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'))
const HelpCenter = lazy(() => import('./pages/HelpCenter'))

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-3 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm text-black/50">Loading...</p>
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading, staff, staffChecked, isDemo } = useAuth()

  // Check if onboarding is needed
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  
  useEffect(() => {
    if (staffChecked && staff && !isDemo) {
      const localOnboarding = localStorage.getItem('avenize_onboarding_complete')
      const staffOnboarding = (staff as any)?.onboarding_completed
      if (!localOnboarding && !staffOnboarding) {
        setNeedsOnboarding(true)
      }
    }
  }, [staffChecked, staff, isDemo])

  if (loading || (session && !staffChecked)) {
    return <div className="min-h-screen flex items-center justify-center text-black/40 text-sm">Loading…</div>
  }
  
  if (!session && !isDemo) return <Navigate to="/login" replace />
  
  // If staff exists but onboarding not complete, redirect to onboarding page
  if (staff && needsOnboarding) {
    return <Navigate to="/onboarding" replace />
  }
  
  // No staff record yet
  if (!staff) return <Navigate to="/onboarding" replace />

  return (
    <>
      <TrialBanner />
      <SarahChat />
      <BetaFeedbackButton />
      {children}
    </>
  )
}

function AppRoutes() {
  // Backward-compatible redirects: old flat paths → new /app/... paths
  const appRoutes = [
    'dashboard', 'crm', 'jobs', 'projects', 'finance', 'quotes', 'invoices', 'payments', 'people',
    'inventory', 'reports', 'settings', 'more', 'social', 'approvals', 'tasks',
    'merit', 'cashflow', 'chat', 'knowledge', 'automations', 'tickets',
    'campaigns', 'accounting', 'branding', 'security', 'sso', 'api', 'portal',
    'calendar', 'requisitions', 'time', 'events', 'monitoring', 'organogram',
    'meetings'
  ]

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
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
        <Route path="/upgrade" element={<Premium />} />
        <Route path="/owner-insights" element={<OwnerInsights />} />
        <Route path="/field-location" element={<FieldLocation />} />
        <Route path="/lead/:source?" element={<LeadCapture />} />
        <Route path="/leads" element={<LeadCapture />} />
        <Route path="/knowledge" element={<HelpCenter />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/cookies" element={<CookiePolicy />} />
        {/* Backward-compatible redirects for old flat paths → /app/... */}
        {appRoutes.map(route => (
          <Route key={route} path={route} element={<Navigate to={`/app/${route}`} replace />} />
        ))}
        <Route path="settings/profile" element={<Navigate to="/app/settings/profile" replace />} />
        <Route path="*" element={<NotFound />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <Shell />
            </RequireAuth>
          }
        >
        <Route index element={<CompanyHome />} />
        <Route path="crm" element={<CRM />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="projects" element={<ProjectsNigeria />} />
        <Route path="finance" element={<FinanceCenter />} />
        <Route path="quotes" element={<Quotes />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="payments" element={<Payments />} />
        <Route path="people" element={<People />} />
        <Route path="hr" element={<HumanResources />} />
        <Route path="operations" element={<Operations />} />
        <Route path="sales-performance" element={<SalesPerformance />} />
        <Route path="logistics" element={<Logistics />} />
        <Route path="equipment" element={<Equipment />} />
        <Route path="lab" element={<LabQC />} />
        <Route path="inventory" element={<InventoryNigeria />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/projects" element={<ProjectSettings />} />
        <Route path="settings/roles" element={<RoleSettings />} />
        <Route path="settings/profile" element={<Profile />} />
        <Route path="premium" element={<Premium />} />
        <Route path="staff/:staffId" element={<StaffProfile />} />
        <Route path="infrastructure" element={<BusinessInfrastructure />} />
        <Route path="home" element={<CompanyHome />} />
        <Route path="more" element={<More />} />
        <Route path="social" element={<Social />} />
        <Route path="approvals" element={<Approvals />} />
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
        <Route path="integrations" element={<Integrations />} />
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
      </Suspense>
    </ErrorBoundary>
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
                <CookieConsent />
                <AppRoutes />
              </BrowserRouter>
            </LocaleProvider>
          </BrandingProvider>
        </GamificationProvider>
      </ToastProvider>
    </AuthProvider>
  )
}
