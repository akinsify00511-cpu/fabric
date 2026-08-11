import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  Home, Users2, FolderKanban, Wallet, Contact, Boxes, BarChart3, Settings as SettingsIcon,
  LayoutGrid, User, Search, Share2, CheckSquare, MessageSquare, Book, Headphones,
  Calendar as CalendarIcon, Clock, FileText, CalendarDays, Activity, Network, Palette,
  Crown, MessageSquare as ChatIcon, Building2, Target, UserPlus, Briefcase, Award,
  Receipt, Building, MessageSquareText, HeadphonesIcon, MessageCircle, FileText as FileTextIcon,
  Shield, Tag, UserRound, TrendingUp, Truck, ClipboardList, Sparkles, FlaskConical, Brain,
  ShieldCheck, ChevronDown, Plus, LogOut, Zap, Mail, Calculator, DollarSign, LineChart,
  Wrench, CreditCard, Bell, Megaphone, Users, Hash, LifeBuoy, Settings2,
  Scale, ShoppingCart, BookOpen, Globe, Stethoscope, GitCompare,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useBranding } from '../lib/BrandingContext'
import { useAccessibleTools } from '../lib/useToolAccess'
import { useAccessibleModules, type ModuleKey } from '../lib/useModuleAccess'
import { useUsageTracking } from '../lib/useUsageTracking'
import { useLocale } from '../lib/LocaleContext'
import { AvenizeMark } from './AvenizeMark'
import NotificationBell from './NotificationBell'
import ToolOnboardingPopup from './ToolOnboardingPopup'

// Map nav routes to tool keys (for onboarding popups)
const TOOL_KEY_MAP: Record<string, string> = {
  '/app': 'dashboard',
  '/app/capture': 'dashboard',
  '/app/chat': 'chat',
  '/app/tasks': 'tasks',
  '/app/calendar': 'calendar',
  '/app/time': 'time-tracking',
  '/app/crm': 'crm',
  '/app/projects': 'projects',
  '/app/finance': 'finance',
  '/app/hr': 'people',
  '/app/inventory': 'inventory',
  '/app/settings': 'settings',
}

// ── New information architecture ──────────────────────────────────────
// The old sidebar listed 49 items flat. This redesign groups them into ≤7
// top-level sections (Slack/Discord/Trello pattern) with plain-language
// labels a small-business owner understands, collapses each section, and
// moves admin/secondary items to a Discord-style user card at the bottom.
// Routes are unchanged — only the navigation is reorganized.
type NavItem = { to: string; label: string; icon: typeof Home; toolKey?: string; end?: boolean }
type NavGroup = { id: string; label: string; icon: typeof Home; items: NavItem[]; defaultOpen?: boolean }

// Route → module gate. Drives the two-flag sidebar filter: a nav item only
// shows when the business is entitled to the module AND the module is
// ready (wired to real data). This MUST stay in sync with the mg() map in
// App.tsx — both layers enforce the same server-side can_access_module.
const ROUTE_MODULE: Record<string, ModuleKey> = {
  '/app/cockpit': 'cockpit', '/app/executive': 'cockpit',
  '/app/intelligence': 'intelligence', '/app/scenarios': 'intelligence',
  '/app/simulation': 'intelligence', '/app/market': 'market',
  '/app/wall': 'wall', '/app/legal': 'legal', '/app/procurement': 'procurement',
  '/app/rfqs': 'procurement', '/app/vendor-portal': 'procurement',
  '/app/memory': 'memory', '/app/reality-gap': 'reality_gap',
  '/app/self-audit': 'self_audit', '/app/governance': 'self_audit',
  '/app/control': 'self_audit', '/app/chat': 'chat', '/app/live-chat': 'chat',
  '/app/whatsapp': 'chat', '/app/sms': 'chat',
  '/app/crm': 'crm', '/app/leads': 'crm', '/app/quotes': 'crm',
  '/app/properties': 'crm', '/app/property-owners': 'crm',
  '/app/property-sales': 'crm', '/app/leases': 'crm', '/app/social': 'crm',
  '/app/sales-performance': 'crm', '/app/signatures': 'legal',
  '/app/finance': 'finance', '/app/payments': 'finance', '/app/payroll': 'finance',
  '/app/budgets': 'finance', '/app/cashflow': 'finance', '/app/accounting': 'finance',
  '/app/e-invoicing': 'finance',
  '/app/hr': 'hr', '/app/recruitment': 'hr', '/app/appraisals': 'hr',
  '/app/merit': 'hr', '/app/personas': 'hr', '/app/staff': 'hr',
  '/app/projects': 'projects', '/app/operations': 'projects',
  '/app/inventory': 'inventory', '/app/logistics': 'inventory',
  '/app/equipment': 'inventory', '/app/lab': 'inventory',
  '/app/maintenance': 'inventory', '/app/infrastructure': 'inventory',
  '/app/migration': 'inventory', '/app/knowledge': 'knowledge',
  '/app/documents': 'knowledge', '/app/approvals': 'approvals',
  '/app/tasks': 'tasks', '/app/tickets': 'tasks', '/app/reports': 'reports',
  '/app/automations': 'automations', '/app/calendar': 'calendar',
  '/app/api': 'api', '/app/settings/api-keys': 'api', '/app/sso': 'sso',
  '/app/security': 'security',
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    defaultOpen: false,
    items: [
      { to: '/app', label: 'Dashboard', icon: Home, toolKey: 'dashboard', end: true },
      { to: '/app/cockpit', label: 'Executive Cockpit', icon: Target, toolKey: 'dashboard' },
      { to: '/app/capture', label: 'Quick Capture', icon: Sparkles, toolKey: 'dashboard' },
      { to: '/app/activity', label: 'Activity', icon: Activity, toolKey: 'dashboard' },
      { to: '/app/scenarios', label: 'Scenarios', icon: FlaskConical, toolKey: 'dashboard' },
      { to: '/app/intelligence', label: 'Insights', icon: Brain, toolKey: 'dashboard' },
      { to: '/app/market', label: 'Market Index', icon: Globe, toolKey: 'dashboard' },
    ],
  },
  {
    id: 'communicate',
    label: 'Communicate',
    icon: MessageSquare,
    defaultOpen: false,
    items: [
      { to: '/app/chat', label: 'Chat', icon: ChatIcon, toolKey: 'chat' },
      { to: '/app/live-chat', label: 'Live Chat', icon: HeadphonesIcon, toolKey: 'tickets' },
      { to: '/app/whatsapp', label: 'WhatsApp', icon: MessageCircle, toolKey: 'settings' },
      { to: '/app/sms', label: 'SMS Broadcast', icon: MessageSquareText, toolKey: 'settings' },
      { to: '/app/meetings', label: 'Meetings', icon: Headphones, toolKey: 'meetings' },
      { to: '/app/announcements', label: 'Announcements', icon: Megaphone, toolKey: 'dashboard' },
      { to: '/app/wall', label: 'Company Wall', icon: Sparkles, toolKey: 'dashboard' },
    ],
  },
  {
    id: 'sell',
    label: 'Sell',
    icon: Users2,
    defaultOpen: false,
    items: [
      { to: '/app/crm', label: 'CRM', icon: Users2, toolKey: 'crm' },
      { to: '/app/leads', label: 'Leads', icon: UserPlus, toolKey: 'crm' },
      { to: '/app/quotes', label: 'Quotes', icon: FileText, toolKey: 'crm' },
      { to: '/app/properties', label: 'Properties', icon: Building, toolKey: 'projects' },
      { to: '/app/property-sales', label: 'Property Sales', icon: TrendingUp, toolKey: 'projects' },
      { to: '/app/social', label: 'Social', icon: Share2, toolKey: 'social' },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    icon: Wallet,
    defaultOpen: false,
    items: [
      { to: '/app/finance', label: 'Finance', icon: Wallet, toolKey: 'finance' },
      { to: '/app/e-invoicing', label: 'Invoices', icon: FileTextIcon, toolKey: 'finance' },
      { to: '/app/payments', label: 'Payments', icon: DollarSign, toolKey: 'finance' },
      { to: '/app/budgets', label: 'Budgets', icon: Target, toolKey: 'finance' },
      { to: '/app/expenses', label: 'Expenses', icon: Receipt, toolKey: 'finance' },
      { to: '/app/payroll', label: 'Payroll', icon: CreditCard, toolKey: 'payroll' },
      { to: '/app/accounting', label: 'Accounting', icon: Calculator, toolKey: 'finance' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    icon: Contact,
    defaultOpen: false,
    items: [
      { to: '/app/hr', label: 'Team', icon: Contact, toolKey: 'people' },
      { to: '/app/recruitment', label: 'Recruit', icon: Briefcase, toolKey: 'people' },
      { to: '/app/appraisals', label: 'Appraisals', icon: Award, toolKey: 'people' },
      { to: '/app/leave', label: 'Leave', icon: CalendarIcon, toolKey: 'people' },
      { to: '/app/attendance', label: 'Attendance', icon: Clock, toolKey: 'people' },
      { to: '/app/organogram', label: 'Org Chart', icon: Network, toolKey: 'merit' },
    ],
  },
  {
    id: 'ops',
    label: 'Operations',
    icon: FolderKanban,
    defaultOpen: false,
    items: [
      { to: '/app/projects', label: 'Projects', icon: FolderKanban, toolKey: 'projects' },
      { to: '/app/inventory', label: 'Inventory', icon: Boxes, toolKey: 'inventory' },
      { to: '/app/vendors', label: 'Vendors', icon: Truck, toolKey: 'inventory' },
      { to: '/app/purchase-orders', label: 'Purchase Orders', icon: ClipboardList, toolKey: 'inventory' },
      { to: '/app/procurement', label: 'Procurement & RFQs', icon: ShoppingCart, toolKey: 'inventory' },
      { to: '/app/legal', label: 'Legal', icon: Scale, toolKey: 'settings' },
      { to: '/app/services', label: 'Services', icon: Tag, toolKey: 'settings' },
      { to: '/app/requisitions', label: 'Requests', icon: FileText, toolKey: 'requisitions' },
      { to: '/app/assets', label: 'Assets', icon: Wrench, toolKey: 'dashboard' },
    ],
  },
  {
    id: 'work',
    label: 'My Work',
    icon: CheckSquare,
    defaultOpen: false,
    items: [
      { to: '/app/tasks', label: 'Tasks', icon: CheckSquare, toolKey: 'tasks' },
      { to: '/app/calendar', label: 'Calendar', icon: CalendarIcon, toolKey: 'calendar' },
      { to: '/app/time', label: 'Time Tracking', icon: Clock, toolKey: 'time-tracking' },
      { to: '/app/approvals', label: 'Approvals', icon: ShieldCheck, toolKey: 'approvals' },
      { to: '/app/knowledge', label: 'Docs', icon: Book, toolKey: 'knowledge' },
      { to: '/app/memory', label: 'Org Memory', icon: BookOpen, toolKey: 'knowledge' },
      { to: '/app/tickets', label: 'Support', icon: LifeBuoy, toolKey: 'tickets' },
    ],
  },
]

// Secondary links that live in the user card / overflow (Discord-style):
// Settings, Branding, Reports, Controls, Integrations, API — admin/secondary.
const SECONDARY_LINKS: NavItem[] = [
  { to: '/app/reports', label: 'Reports', icon: BarChart3, toolKey: 'reports' },
  { to: '/app/governance', label: 'Controls', icon: Shield, toolKey: 'dashboard' },
  { to: '/app/self-audit', label: 'Self-Audit', icon: Stethoscope, toolKey: 'dashboard' },
  { to: '/app/reality-gap', label: 'Reality Gap', icon: GitCompare, toolKey: 'dashboard' },
  { to: '/app/control', label: 'Audit Log', icon: ShieldCheck, toolKey: 'dashboard' },
  { to: '/app/integrations', label: 'Integrations', icon: Network, toolKey: 'integrations' },
  { to: '/app/api', label: 'API & Webhooks', icon: FileTextIcon, toolKey: 'api' },
]

const MOBILE_NAV_ITEMS = [
  { to: '/app', end: true, icon: Home, label: 'Home' },
  { to: '/app/capture', end: false, icon: Sparkles, label: 'Capture' },
  { to: '/app/chat', end: false, icon: ChatIcon, label: 'Chat' },
  { to: '/app/more', end: false, icon: LayoutGrid, label: 'More' },
]

export default function Shell() {
  const { staff, signOut } = useAuth()
  const { branding } = useBranding()
  const { tools: accessibleTools, loading } = useAccessibleTools()
  const { modules: accessibleModules, loading: modulesLoading } = useAccessibleModules()
  useUsageTracking()  // telemetry: which modules actually get opened (builder decisions, not a feature)
  const { t } = useLocale()
  const location = useLocation()
  const navigate = useNavigate()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const isPrivileged = staff?.role === 'owner' || staff?.role === 'admin'

  // Two independent gates ANDed:
  //  (a) tool-role access (existing) — does this user's functional role see it?
  //  (b) module gate (new)        — is the business entitled AND is it ready?
  // A paying customer on a not-ready module still doesn't see it (readiness
  // is the safety net); a ready module hidden by role still stays hidden.
  const itemVisible = (item: NavItem) => {
    // While either gate is loading, don't hide (prevents flash of empty nav).
    if (loading || modulesLoading) return true
    // Settings/capture/dashboard are always visible (core chrome).
    if (!item.toolKey || item.toolKey === 'settings' || item.toolKey === 'dashboard') return true
    // Role gate: privileged roles bypass; otherwise tool must be in role set.
    const roleOk = isPrivileged || accessibleTools.includes(item.toolKey as any)
    if (!roleOk) return false
    // Module gate: if this route maps to a module, the business must be
    // entitled AND the module must be ready.
    const mod = ROUTE_MODULE[item.to]
    if (!mod) return true
    return isPrivileged || accessibleModules.has(mod)
  }

  const groupHasActive = (group: NavGroup) =>
    group.items.some(i => location.pathname === i.to ||
      (i.to !== '/app' && location.pathname.startsWith(i.to)))

  // Auto-expand the group containing the active route on first render.
  const effectiveOpen = (g: NavGroup) =>
    openGroups[g.id] ?? g.defaultOpen ?? groupHasActive(g)

  const companyName = branding.custom_name || staff?.business_name || 'My Company'

  const handleSearch = () => {
    // Cmd+K command palette is globally bound in AppShell; trigger it.
    const isMac = navigator.platform.includes('Mac')
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k', metaKey: isMac, ctrlKey: !isMac, bubbles: true
    }))
  }

  return (
    <div className="min-h-screen bg-[var(--av-surface-2)]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 bg-[var(--av-surface)] border-r border-[var(--av-border)] flex-col fixed inset-y-0 left-0 z-30">
        {/* Workspace header */}
        <div className="px-4 py-3.5 flex items-center gap-2 border-b border-[var(--av-border)]">
          {branding.logo_url ? (
            <img src={branding.logo_url} alt="Logo" className="h-7 w-auto object-contain rounded-lg" style={{ maxHeight: '28px' }} />
          ) : (
            <AvenizeMark size={24} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight truncate text-[var(--av-text)]">{companyName}</p>
            <p className="text-[11px] text-[var(--av-text-muted)] truncate capitalize">{staff?.role || 'workspace'}</p>
          </div>
        </div>

        {/* Quick Capture button — the hero feature, always one tap away */}
        <div className="px-3 pt-3">
          <button
            onClick={() => navigate('/app/capture')}
            className="w-full flex items-center justify-center gap-2 rounded-[var(--av-radius-md)] bg-[var(--av-primary)] text-white text-sm font-medium py-2.5 hover:bg-[var(--av-primary-hover)] transition shadow-[var(--av-shadow-sm)]"
          >
            <Sparkles size={16} />
            Quick Capture
          </button>
        </div>

        {/* Grouped nav — collapsible sections */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {NAV_GROUPS.map((group) => {
            const GIcon = group.icon
            const open = effectiveOpen(group)
            const active = groupHasActive(group)
            const visibleItems = group.items.filter(itemVisible)
            if (visibleItems.length === 0) return null
            return (
              <div key={group.id}>
                <button
                  onClick={() => setOpenGroups(s => ({ ...s, [group.id]: !open }))}
                  className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                    active ? 'text-[var(--av-text)]' : 'text-[var(--av-text-muted)] hover:text-[var(--av-text-secondary)]'
                  }`}
                >
                  <GIcon size={15} strokeWidth={2.2} />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
                </button>
                {open && (
                  <div className="ml-1 mt-0.5 space-y-0.5">
                    {visibleItems.map((item) => {
                      const Icon = item.icon
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.end}
                          className={({ isActive }) =>
                            `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition ${
                              isActive
                                ? 'bg-[var(--av-primary-soft)] text-[var(--av-primary)] font-medium'
                                : 'text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-2)] hover:text-[var(--av-text)]'
                            }`
                          }
                        >
                          <Icon size={16} strokeWidth={2} />
                          {item.label}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Secondary / admin links */}
          <div className="pt-2 mt-2 border-t border-[var(--av-border)]">
            {SECONDARY_LINKS.filter(itemVisible).map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition ${
                      isActive
                        ? 'bg-[var(--av-primary-soft)] text-[var(--av-primary)] font-medium'
                        : 'text-[var(--av-text-muted)] hover:bg-[var(--av-surface-2)] hover:text-[var(--av-text)]'
                    }`
                  }
                >
                  <Icon size={16} strokeWidth={2} />
                  {item.label}
                </NavLink>
              )
            })}
            <NavLink
              to="/app/more"
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition ${
                  isActive
                    ? 'bg-[var(--av-primary-soft)] text-[var(--av-primary)] font-medium'
                    : 'text-[var(--av-text-muted)] hover:bg-[var(--av-surface-2)] hover:text-[var(--av-text)]'
                }`
              }
            >
              <LayoutGrid size={16} strokeWidth={2} />
              More
            </NavLink>
          </div>
        </nav>

        {/* Upgrade CTA */}
        <div className="px-3 pb-2">
          <a
            href="/upgrade"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#4285F4] to-[#8B5CF6] text-white text-sm font-medium hover:shadow-[var(--av-shadow-md)] transition"
          >
            <Crown size={16} />
            <span>Upgrade to Pro</span>
          </a>
        </div>

        {/* Discord-style user card — settings live here, not in the nav */}
        <div className="relative border-t border-[var(--av-border)]">
          <button
            onClick={() => setUserMenuOpen(o => !o)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[var(--av-surface-2)] transition"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--av-primary)] text-white flex items-center justify-center text-sm font-semibold shrink-0">
              {(staff?.full_name ?? staff?.name ?? '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium truncate text-[var(--av-text)]">{staff?.full_name ?? staff?.name ?? 'User'}</p>
              <p className="text-[11px] text-[var(--av-text-muted)] truncate">{staff?.email ?? ''}</p>
            </div>
            <Settings2 size={16} className="text-[var(--av-text-muted)] shrink-0" />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 rounded-xl border border-[var(--av-border)] bg-[var(--av-surface)] shadow-[var(--av-shadow-lg)] overflow-hidden">
              <UserMenuItem to="/app/settings" icon={SettingsIcon} label="Settings" onClick={() => setUserMenuOpen(false)} />
              <UserMenuItem to="/app/branding" icon={Palette} label="Branding" onClick={() => setUserMenuOpen(false)} />
              <UserMenuItem to="/app/notifications" icon={Bell} label="Notifications" onClick={() => setUserMenuOpen(false)} />
              <div className="border-t border-[var(--av-border)]">
                <button
                  onClick={() => { setUserMenuOpen(false); signOut() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--av-danger)] hover:bg-[var(--av-danger-soft)] transition"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Desktop top bar */}
      <header className="hidden md:flex items-center gap-3 fixed top-0 right-0 left-60 h-14 px-6 bg-[var(--av-surface)] border-b border-[var(--av-border)] z-20">
        <button
          onClick={handleSearch}
          className="flex items-center gap-2 flex-1 max-w-md rounded-lg border border-[var(--av-border)] bg-[var(--av-surface-2)] px-3 py-1.5 text-sm text-[var(--av-text-muted)] hover:border-[var(--av-border-strong)] hover:bg-[var(--av-surface)] transition"
        >
          <Search size={16} />
          <span>Search or jump to\u2026</span>
          <kbd className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--av-surface-3)] text-[var(--av-text-muted)]">\u2318K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
        </div>
      </header>

      {/* Mobile top header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--av-border)] sticky top-0 z-10 bg-[var(--av-surface)]">
        <div className="flex items-center gap-2">
          {!branding.logo_url && <AvenizeMark size={20} />}
          {branding.logo_url && (
            <img src={branding.logo_url} alt="Logo" className="h-5 w-auto object-contain" />
          )}
          <span className="text-sm font-semibold tracking-tight truncate text-[var(--av-text)]">
            {companyName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button onClick={() => navigate('/app/capture')} className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--av-primary)] text-white">
            <Sparkles size={15} strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="md:ml-60 md:mt-14 p-4 md:p-6 pb-28 md:pb-8">
        <Outlet />
      </main>

      {/* First-visit onboarding popup for the current tool */}
      <ToolOnboardingPopup toolKey={TOOL_KEY_MAP[location.pathname] || ''} />

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-[var(--av-border)] px-2 py-2 z-20 bg-[var(--av-surface)]">
        <div className="flex items-center justify-around">
          {MOBILE_NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition ${
                    isActive ? 'text-[var(--av-primary)]' : 'text-[var(--av-text-muted)]'
                  }`
                }
              >
                <Icon size={20} strokeWidth={2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function UserMenuItem({ to, icon: Icon, label, onClick }: { to: string; icon: typeof Home; label: string; onClick: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--av-text)] hover:bg-[var(--av-surface-2)] transition"
    >
      <Icon size={16} className="text-[var(--av-text-muted)]" />
      {label}
    </NavLink>
  )
}
