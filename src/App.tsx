import { useState, useEffect, lazy, Suspense, type ReactNode, type ComponentType } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ToastProvider } from './components/Toast'
import { GamificationProvider } from './lib/GamificationContext'
import { BrandingProvider } from './lib/BrandingContext'
import { LocaleProvider } from './lib/LocaleContext'
import Shell from './components/Shell'
import BetaFeedbackButton from './components/BetaFeedbackButton'
import QCDashboard from './components/QCDashboard'
import PersonalizationHub from './components/PersonalizationHub'
import { setupGlobalErrorHandlers } from './lib/quality-control'
import CommandPalette, { useGlobalCommands, useCommandPalette } from './components/CommandPalette'
import { useKeyboardShortcuts, GLOBAL_SHORTCUTS } from './hooks/useKeyboardShortcuts'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { PageSkeleton } from './components/Skeleton'
import RequireModule from './components/RequireModule'
import type { ModuleKey } from './lib/useModuleAccess'
import { getUserMfa, mfaRequired, isMfaVerified } from './lib/mfa'
import { KeyboardShortcutsModal } from './components/KeyboardShortcuts'

// Initialize QC system on app load
setupGlobalErrorHandlers()

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
const HumanResources = lazy(() => import('./pages/HumanResources'))
const Operations = lazy(() => import('./pages/Operations'))
const SalesPerformance = lazy(() => import('./pages/SalesPerformance'))
const FinanceCenter = lazy(() => import('./pages/FinanceCenter'))
const Logistics = lazy(() => import('./pages/Logistics'))
const Equipment = lazy(() => import('./pages/Equipment'))
const LabQC = lazy(() => import('./pages/LabQC'))
const Payments = lazy(() => import('./pages/Payments'))
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
const SMSBroadcast = lazy(() => import('./pages/SMSBroadcast'))
const LiveChat = lazy(() => import('./pages/LiveChat'))
const WhatsAppIntegration = lazy(() => import('./pages/WhatsAppIntegration'))
const PublicAppointments = lazy(() => import('./pages/PublicAppointments'))
const EInvoicing = lazy(() => import('./pages/EInvoicing'))
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
const AICapture = lazy(() => import('./pages/AICapture'))
const ObserverView = lazy(() => import('./pages/ObserverView'))
const Simulation = lazy(() => import('./pages/Simulation'))
const IntelligenceHub = lazy(() => import('./pages/IntelligenceHub'))
const GovernanceHub = lazy(() => import('./pages/GovernanceHub'))
const MigrationPipeline = lazy(() => import('./pages/MigrationPipeline'))
const VendorPortal = lazy(() => import('./pages/VendorPortal'))
const ControlAuditHub = lazy(() => import('./pages/ControlAuditHub'))
const PersonaHub = lazy(() => import('./pages/PersonaHub'))
const ExecutiveCockpit = lazy(() => import('./pages/ExecutiveCockpit'))
const CompanyWall = lazy(() => import('./pages/CompanyWall'))
const MarketIndex = lazy(() => import('./pages/MarketIndex'))
const Legal = lazy(() => import('./pages/Legal'))
const Procurement = lazy(() => import('./pages/Procurement'))
const OrganizationalMemory = lazy(() => import('./pages/OrganizationalMemory'))
const RealityGap = lazy(() => import('./pages/RealityGap'))
const SelfAudit = lazy(() => import('./pages/SelfAudit'))
const DataQuality = lazy(() => import('./pages/DataQuality'))
const Meetings = lazy(() => import('./pages/Meetings'))
const MeetingsV2 = lazy(() => import('./pages/MeetingsV2'))
const ProjectsNigeria = lazy(() => import('./pages/ProjectsNigeria'))
const InventoryNigeria = lazy(() => import('./pages/InventoryNigeria'))
const FinanceNigeria = lazy(() => import('./pages/FinanceNigeria'))
const Quotes = lazy(() => import('./pages/Quotes'))
const TrialBanner = lazy(() => import('./components/TrialBanner'))
const OwnerInsights = lazy(() => import('./pages/OwnerInsights'))
const LeaseManagement = lazy(() => import('./pages/LeaseManagement'))
const MaintenanceRequests = lazy(() => import('./pages/MaintenanceRequests'))
const ElectronicSignatures = lazy(() => import('./pages/ElectronicSignatures'))
const SignDocument = lazy(() => import('./pages/SignDocument'))
const DocumentsHub = lazy(() => import('./pages/DocumentsHub'))
const FieldLocation = lazy(() => import('./pages/FieldLocation'))
const LeadCapture = lazy(() => import('./pages/LeadCapture'))
const Leads = lazy(() => import('./pages/Leads'))
const Recruitment = lazy(() => import('./pages/Recruitment'))
const People = lazy(() => import('./pages/People'))
const Webhooks = lazy(() => import('./pages/Webhooks'))
const Appraisals = lazy(() => import('./pages/Appraisals'))
const Payroll = lazy(() => import('./pages/Payroll'))
const APIKeys = lazy(() => import('./pages/APIKeys'))
const Properties = lazy(() => import('./pages/Properties'))
const PropertyOwners = lazy(() => import('./pages/PropertyOwners'))
const PropertySales = lazy(() => import('./pages/PropertySales'))
const InvoicePreview = lazy(() => import('./components/InvoicePreview'))
const Premium = lazy(() => import('./pages/Premium'))
const StaffProfile = lazy(() => import('./pages/StaffProfile'))
const BusinessInfrastructure = lazy(() => import('./pages/BusinessInfrastructure'))
const SarahChat = lazy(() => import('./components/SarahChat'))
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'))
const ErrorBoundary = lazy(() => import('./components/ErrorBoundary'))
const CookieConsent = lazy(() => import('./components/CookieConsent'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Terms = lazy(() => import('./pages/Terms'))
const Contact = lazy(() => import('./pages/Contact'))
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'))
const HelpCenter = lazy(() => import('./pages/HelpCenter'))
const AuditLog = lazy(() => import('./pages/AuditLog'))
const DataExport = lazy(() => import('./pages/DataExport'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const CommentsAndTimeline = lazy(() => import('./pages/CommentsAndTimeline'))
const CommentsPage = lazy(() => import('./pages/CommentsAndTimeline').then(m => ({ default: m.CommentsPage })))
const CurrencyExchange = lazy(() => import('./pages/CurrencyExchange'))
const WorkflowBuilder = lazy(() => import('./pages/WorkflowBuilder'))
const Organization = lazy(() => import('./pages/Organization'))
const LeaveManagement = lazy(() => import('./pages/LeaveManagement'))
const Announcements = lazy(() => import('./pages/Announcements'))
const ExpenseClaims = lazy(() => import('./pages/ExpenseClaims'))
const AssetManagement = lazy(() => import('./pages/AssetManagement'))
const ResourceBooking = lazy(() => import('./pages/ResourceBooking'))
const Services = lazy(() => import('./pages/Services'))
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'))
const Vendors = lazy(() => import('./pages/Vendors'))
const Attendance = lazy(() => import('./pages/Attendance'))
const PaymentSettings = lazy(() => import('./pages/PaymentSettings'))
const NotificationsCenter = lazy(() => import('./pages/NotificationsCenter'))
const Departments = lazy(() => import('./pages/Departments'))
const Subscription = lazy(() => import('./pages/Subscription'))
const Budgets = lazy(() => import('./pages/Budgets'))

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen p-6 bg-[#F8F9FA]">
      <PageSkeleton />
    </div>
  )
}

// MFA gate: once a session + staff record exist, verify the user has cleared
// their second factor (if they have TOTP enabled) before rendering the app.
// This closes the bypass where a user with an existing session cookie could
// type an /app URL and skip the login-page MFA challenge.
function MfaGate({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const [checking, setChecking] = useState(true)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      if (!session?.user?.id) {
        if (!cancelled) setChecking(false)
        return
      }
      // Already verified this session (e.g. came through the login challenge).
      if (isMfaVerified(session.user.id)) {
        if (!cancelled) { setChecking(false); setBlocked(false) }
        return
      }
      const mfa = await getUserMfa(session)
      if (cancelled) return
      if (mfaRequired(mfa)) {
        // Session exists but second factor not supplied — bounce to login,
        // which will present the challenge UI.
        setBlocked(true)
      }
      setChecking(false)
    }
    check()
    return () => { cancelled = true }
  }, [session])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-black border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }
  if (blocked) {
    return <Navigate to="/login?mfa=1" replace />
  }
  return <>{children}</>
}

// Session-only gate for the onboarding route. Lighter than RequireAuth
// (which also checks the staff record and redirects to /onboarding, which
// would loop). Ensures the auth client has restored a session before the
// onboarding page can fire any authed RPC -- the create_business_and_owner
// RPC is granted only to `authenticated` and runs as `anon` (-> 404 / NULL
// auth.uid) if the request leaves before getSession() resolves.
function RequireSession({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-black border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading, staff, staffChecked, refreshStaff } = useAuth()
  const [stuck, setStuck] = useState(false)

  // Safety net: if the staff fetch hasn't resolved after several seconds
  // (DB unreachable / all retries exhausted on a hard error), stop spinning
  // and offer a retry instead of hanging on the loader forever.
  useEffect(() => {
    if (loading || !staffChecked) {
      setStuck(false)
      const t = setTimeout(() => setStuck(true), 6000)
      return () => clearTimeout(t)
    }
    setStuck(false)
  }, [loading, staffChecked])

  // While any auth check is pending, show loading (or a retry prompt if stuck)
  if (loading || !staffChecked) {
    if (stuck) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-4 text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-xl">A</span>
            </div>
            <p className="text-black font-medium">Taking a moment to load your workspace…</p>
            <p className="text-sm text-black/50">This usually finishes in a second. If it doesn't, check your connection and retry.</p>
            <button
              onClick={() => { setStuck(false); refreshStaff() }}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <div className="w-8 h-8 border-2 border-black border-t-blue-600 rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // No session - redirect to login
  if (!session) {
    return <Navigate to="/login" replace />
  }

  // User has a session - check staff record
  if (!staff) {
    // No staff record - send to onboarding
    return <Navigate to="/onboarding" replace />
  }

  // Check if onboarding is complete in database
  if (!staff.onboarding_completed) {
    return <Navigate to="/onboarding" replace />
  }

  // User is fully authenticated and onboarded - verify MFA then show app
  return (
    <MfaGate>
      <TrialBanner />
      <SarahChat />
      <BetaFeedbackButton />
      {children}
    </MfaGate>
  )
}

// Module gate helper: wraps a route element in <RequireModule> so the
// server-side can_access_module check is enforced at the route layer, not
// just in the sidebar. A user can't reach a gated module by typing the URL.
function mg(module: ModuleKey, el: React.ReactElement) {
  return <RequireModule module={module}>{el}</RequireModule>
}

function AppRoutes() {
  // Backward-compatible redirects: old flat paths → new /app/... paths
  const appRoutes = [
    'dashboard', 'crm', 'projects', 'finance', 'quotes', 'payments', 'hr',
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
        <Route path="/onboarding" element={<RequireSession><Onboarding /></RequireSession>} />
        <Route path="/join/:inviteId" element={<Join />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/upgrade" element={<Premium />} />
        <Route path="/owner-insights" element={<OwnerInsights />} />
        <Route path="/field-location" element={<FieldLocation />} />
        <Route path="/lead/:source?" element={<LeadCapture />} />
        <Route path="/leads" element={<LeadCapture />} />
        <Route path="/book" element={<PublicAppointments />} />
        <Route path="/book/:slug" element={<PublicAppointments />} />
        <Route path="/sign/:token" element={<SignDocument />} />
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
        <Route path="crm" element={mg('crm', <CRM />)} />
        <Route path="leads" element={mg('crm', <Leads />)} />
        <Route path="projects" element={mg('projects', <ProjectsNigeria />)} />
        <Route path="finance" element={mg('finance', <FinanceCenter />)} />
        <Route path="quotes" element={mg('crm', <Quotes />)} />
        <Route path="payments" element={mg('finance', <Payments />)} />
        <Route path="hr" element={mg('hr', <HumanResources />)} />
        <Route path="people" element={mg('hr', <People />)} />
        {/* Aliases for paths referenced elsewhere (CommandPalette, CompanyHome,
            Shell) that had no route and 404'd. */}
        <Route path="dashboard" element={<Navigate to="/app" replace />} />
        <Route path="profile" element={<Navigate to="/app/settings/profile" replace />} />
        <Route path="staff" element={<Navigate to="/app/people" replace />} />
        <Route path="awards" element={<Navigate to="/app/wall?tab=recognition" replace />} />
        <Route path="kudos" element={<Navigate to="/app/wall?tab=recognition" replace />} />
        <Route path="polls" element={<Navigate to="/app/wall?tab=polls" replace />} />
        {/* Nested-path aliases: callers used a deeper path than the route. */}
        <Route path="finance/invoices" element={<Navigate to="/app/e-invoicing" replace />} />
        <Route path="settings/subscription" element={<Navigate to="/app/subscription" replace />} />
        <Route path="recruitment" element={mg('hr', <Recruitment />)} />
        <Route path="appraisals" element={mg('hr', <Appraisals />)} />
        <Route path="payroll" element={mg('finance', <Payroll />)} />
        <Route path="operations" element={mg('projects', <Operations />)} />
        <Route path="sales-performance" element={mg('crm', <SalesPerformance />)} />
        <Route path="logistics" element={mg('inventory', <Logistics />)} />
        <Route path="equipment" element={mg('inventory', <Equipment />)} />
        <Route path="lab" element={mg('inventory', <LabQC />)} />
        <Route path="inventory" element={mg('inventory', <InventoryNigeria />)} />
        <Route path="reports" element={mg('reports', <Reports />)} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/projects" element={<ProjectSettings />} />
        <Route path="settings/roles" element={<RoleSettings />} />
        <Route path="settings/profile" element={<Profile />} />
        <Route path="settings/payments" element={<PaymentSettings />} />
        <Route path="settings/webhooks" element={<Webhooks />} />
        <Route path="settings/api-keys" element={mg('api', <APIKeys />)} />
        <Route path="properties" element={mg('crm', <Properties />)} />
        <Route path="property-owners" element={mg('crm', <PropertyOwners />)} />
        <Route path="property-sales" element={mg('crm', <PropertySales />)} />
        <Route path="leases" element={mg('crm', <LeaseManagement />)} />
        <Route path="maintenance" element={mg('inventory', <MaintenanceRequests />)} />
        <Route path="signatures" element={mg('legal', <ElectronicSignatures />)} />
        <Route path="documents" element={mg('knowledge', <DocumentsHub />)} />
        <Route path="budgets" element={mg('finance', <Budgets />)} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="premium" element={<Premium />} />
        <Route path="staff/:staffId" element={mg('hr', <StaffProfile />)} />
        <Route path="infrastructure" element={mg('inventory', <BusinessInfrastructure />)} />
        <Route path="home" element={<Dashboard />} />
        <Route path="capture" element={<AICapture />} />
        <Route path="observer" element={<ObserverView />} />
        <Route path="activity" element={<ObserverView />} />
        <Route path="simulation" element={mg('intelligence', <Simulation />)} />
        <Route path="scenarios" element={mg('intelligence', <Simulation />)} />
        <Route path="intelligence" element={mg('intelligence', <IntelligenceHub />)} />
        <Route path="governance" element={mg('self_audit', <GovernanceHub />)} />
        <Route path="migration" element={mg('inventory', <MigrationPipeline />)} />
        <Route path="vendor-portal" element={mg('procurement', <VendorPortal />)} />
        <Route path="control" element={mg('self_audit', <ControlAuditHub />)} />
        <Route path="personas" element={mg('hr', <PersonaHub />)} />
        <Route path="cockpit" element={mg('cockpit', <ExecutiveCockpit />)} />
        <Route path="executive" element={mg('cockpit', <ExecutiveCockpit />)} />
        <Route path="wall" element={mg('wall', <CompanyWall />)} />
        <Route path="market" element={mg('market', <MarketIndex />)} />
        <Route path="legal" element={mg('legal', <Legal />)} />
        <Route path="procurement" element={mg('procurement', <Procurement />)} />
        <Route path="rfqs" element={mg('procurement', <Procurement />)} />
        <Route path="memory" element={mg('memory', <OrganizationalMemory />)} />
        <Route path="reality-gap" element={mg('reality_gap', <RealityGap />)} />
        <Route path="self-audit" element={mg('self_audit', <SelfAudit />)} />
        <Route path="data-quality" element={mg('self_audit', <DataQuality />)} />
        <Route path="more" element={<More />} />
        <Route path="social" element={mg('crm', <Social />)} />
        <Route path="approvals" element={mg('approvals', <Approvals />)} />
        <Route path="tasks" element={mg('tasks', <Tasks />)} />
        <Route path="merit" element={mg('hr', <Merit />)} />
        <Route path="cashflow" element={mg('finance', <CashFlow />)} />
        <Route path="chat" element={mg('chat', <Chat />)} />
        <Route path="knowledge" element={mg('knowledge', <Knowledge />)} />
        <Route path="automations" element={mg('automations', <Automations />)} />
        <Route path="tickets" element={mg('tasks', <Tickets />)} />
        <Route path="campaigns" element={mg('crm', <Campaigns />)} />
        <Route path="accounting" element={mg('finance', <Accounting />)} />
        <Route path="branding" element={<BrandingSettings />} />
        <Route path="security" element={mg('security', <SecuritySettings />)} />
        <Route path="sso" element={mg('sso', <SSOSettings />)} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="sms" element={mg('finance', <SMSBroadcast />)} />
        <Route path="live-chat" element={mg('chat', <LiveChat />)} />
        <Route path="whatsapp" element={mg('chat', <WhatsAppIntegration />)} />
        <Route path="e-invoicing" element={mg('finance', <EInvoicing />)} />
        <Route path="api" element={mg('api', <APISettings />)} />
        <Route path="portal" element={<CustomerPortal />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="requisitions" element={<Requisitions />} />
        <Route path="time" element={<TimeTracking />} />
        <Route path="events" element={<Events />} />
        <Route path="monitoring" element={<Monitoring />} />
        <Route path="organogram" element={<Organogram />} />
          <Route path="departments" element={<Departments />} />
        <Route path="meetings" element={<Meetings />} />
        <Route path="meetings-new" element={<MeetingsV2 />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="admin-analytics" element={<AdminAnalytics />} />
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="export" element={<DataExport />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="comments" element={<CommentsPage />} />
        <Route path="currency" element={<CurrencyExchange />} />
        <Route path="workflows" element={<WorkflowBuilder />} />
        <Route path="organization" element={<Organization />} />
        <Route path="leave" element={<LeaveManagement />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="expenses" element={<ExpenseClaims />} />
        <Route path="assets" element={<AssetManagement />} />
        <Route path="booking" element={<ResourceBooking />} />
        <Route path="services" element={<Services />} />
        <Route path="purchase-orders" element={<PurchaseOrders />} />
        <Route path="vendors" element={<Vendors />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="notifications-center" element={<NotificationsCenter />} />
        </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

// Wrapper component that uses hooks requiring provider context
function AppShell() {
  const globalCommands = useGlobalCommands()
  const { isOpen, openPalette, closePalette, CommandPaletteComponent } = useCommandPalette(globalCommands)
  const { isOnline, isOffline } = useOnlineStatus()
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Global keyboard shortcut to show shortcuts modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd + / to show shortcuts
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        setShowShortcuts(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <ToastProvider>
      <GamificationProvider>
        <BrandingProvider>
          <LocaleProvider>
            <CookieConsent />
            <AppRoutes />
            {/* Command Palette - Like Slack/Notion Cmd+K */}
            <CommandPaletteComponent />
            {/* Keyboard Shortcuts Modal */}
            <KeyboardShortcutsModal
              isOpen={showShortcuts}
              onClose={() => setShowShortcuts(false)}
            />
            {/* Offline indicator banner */}
            {isOffline && (
              <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 px-4 py-3 bg-amber-500 text-white rounded-xl shadow-lg flex items-center gap-3">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
                </svg>
                <div>
                  <p className="font-medium text-sm">You're offline</p>
                  <p className="text-xs opacity-90">Changes will sync when you're back online</p>
                </div>
              </div>
            )}
            {/* Quality Control Dashboard - visible in dev mode */}
            {import.meta.env.DEV && <QCDashboard />}
            {/* Personalization Hub - suggestions based on user behavior */}
            <PersonalizationHub />
          </LocaleProvider>
        </BrandingProvider>
      </GamificationProvider>
    </ToastProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
// force redeploy Sun Aug  9 00:01:15 UTC 2026
// deploy-1786234570-dxvwho2g
