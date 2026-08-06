import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Home, Users2, FolderKanban, Wallet, Contact, Boxes, BarChart3, Settings as SettingsIcon, LayoutGrid, User, Search, Share2, CheckSquare, MessageSquare, Book, Headphones, Calendar as CalendarIcon, Clock, FileText, CalendarDays, Activity, Network, Palette, Crown, MessageSquare as ChatIcon, Plus, ArrowRight, Zap } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useBranding } from '../lib/BrandingContext'
import { useAccessibleTools } from '../lib/useToolAccess'
import { AvenizeMark } from './AvenizeMark'
import NotificationBell from './NotificationBell'

const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard', end: true, icon: Home, toolKey: 'dashboard' },
  { to: '/app/chat', label: 'Chat', icon: MessageSquare, toolKey: 'chat' },
  { to: '/app/tasks', label: 'Tasks', icon: CheckSquare, toolKey: 'tasks' },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarIcon, toolKey: 'calendar' },
  { to: '/app/time', label: 'Time', icon: Clock, toolKey: 'time-tracking' },
  { to: '/app/events', label: 'Events', icon: CalendarDays, toolKey: 'events' },
  { to: '/app/knowledge', label: 'Docs', icon: Book, toolKey: 'knowledge' },
  { to: '/app/tickets', label: 'Support', icon: Headphones, toolKey: 'tickets' },
  { to: '/app/crm', label: 'CRM', icon: Users2, toolKey: 'crm' },
  { to: '/app/social', label: 'Social', icon: Share2, toolKey: 'social' },
  { to: '/app/projects', label: 'Projects', icon: FolderKanban, toolKey: 'projects' },
  { to: '/app/finance', label: 'Finance', icon: Wallet, toolKey: 'finance' },
  { to: '/app/people', label: 'People', icon: Contact, toolKey: 'people' },
  { to: '/app/inventory', label: 'Inventory', icon: Boxes, toolKey: 'inventory' },
  { to: '/app/requisitions', label: 'Requests', icon: FileText, toolKey: 'requisitions' },
  { to: '/app/organogram', label: 'Org Chart', icon: Network, toolKey: 'merit' },
  { to: '/app/reports', label: 'Reports', icon: BarChart3, toolKey: 'reports' },
  { to: '/app/monitoring', label: 'Monitoring', icon: Activity, toolKey: 'dashboard' },
  { to: '/app/meetings', label: 'Meetings', icon: Headphones, toolKey: 'meetings' },
  { to: '/app/home', label: 'Company', icon: Home, toolKey: 'dashboard' },
  { to: '/app/branding', label: 'Branding', icon: Palette, toolKey: 'branding' },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon, toolKey: 'settings' },
]

const QUICK_ACTIONS = [
  { label: 'New Deal', icon: Plus, path: '/app/crm', action: 'new_deal' },
  { label: 'New Task', icon: Plus, path: '/app/tasks', action: 'new_task' },
  { label: 'New Contact', icon: Plus, path: '/app/crm', action: 'new_contact' },
]

const MOBILE_NAV_ITEMS = [
  { to: '/app', label: 'Home', end: true, icon: Home },
  { to: '/app/chat', label: 'Chat', end: false, icon: ChatIcon },
  { to: '/app/more', label: 'More', end: false, icon: LayoutGrid },
  { to: '/app/settings', label: 'Settings', end: false, icon: User },
]

type CmdItem = {
  label: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  kind: 'nav' | 'action'
  to?: string
  path?: string
  action?: string
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const allItems: CmdItem[] = [
    ...NAV_ITEMS.map(item => ({ ...item, kind: 'nav' as const })),
    ...QUICK_ACTIONS.map(item => ({ ...item, kind: 'action' as const })),
  ]

  const filtered = query.trim()
    ? allItems.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        (item.to?.toLowerCase().includes(query.toLowerCase())) ||
        (item.path?.toLowerCase().includes(query.toLowerCase()))
      )
    : allItems.slice(0, 8)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setSelected(0)
  }, [query])

  const handleSelect = useCallback((item: CmdItem) => {
    const destination = item.path ?? item.to
    if (destination) navigate(destination)
    onClose()
  }, [navigate, onClose])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && filtered[selected]) handleSelect(filtered[selected])
    if (e.key === 'Escape') onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-black/[0.08] overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-black/[0.06]">
          <Search size={18} className="text-black/40 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, actions..."
            className="flex-1 text-sm text-black/80 bg-transparent outline-none placeholder:text-black/30"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/[0.05] text-[10px] text-black/40 font-mono">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-black/40">No results for "{query}"</p>
          )}
          {filtered.map((item, i) => {
            const Icon = item.icon
            return (
              <button
                key={(item.path ?? item.to ?? item.action ?? i) as string}
                onClick={() => handleSelect(item)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selected ? 'bg-indigo-50' : 'hover:bg-black/[0.03]'
                }`}
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  item.kind === 'action' ? 'bg-indigo-100 text-indigo-600' : 'bg-black/[0.05] text-black/50'
                }`}>
                  <Icon size={15} strokeWidth={2} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${
                    item.kind === 'action' ? 'text-indigo-700' : 'text-[var(--avenize-black)]'
                  }`}>{item.label}</p>
                  {'path' in item && item.path && (
                    <p className="text-xs text-black/30 truncate">{item.path}</p>
                  )}
                  {'desc' in item && (
                    <p className="text-xs text-black/30">{('desc' as any) in item ? (item as any).desc : ''}</p>
                  )}
                </div>
                {i === selected && (
                  <ArrowRight size={14} className="text-indigo-400 shrink-0" />
                )}
              </button>
            )
          })}
        </div>
        <div className="px-4 py-2 border-t border-black/[0.06] flex items-center gap-4 text-[10px] text-black/30">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-black/[0.06] font-mono">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-black/[0.06] font-mono">↵</kbd> select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-black/[0.06] font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}

export default function Shell() {
  const { staff, signOut, isDemo } = useAuth()
  const { branding } = useBranding()
  const { tools: accessibleTools, loading } = useAccessibleTools()
  const [cmdOpen, setCmdOpen] = useState(false)

  const isPrivileged = staff?.role === 'owner' || staff?.role === 'admin'
  const visibleNavItems = loading || isPrivileged
    ? NAV_ITEMS
    : NAV_ITEMS.filter(item => accessibleTools.includes(item.toolKey as any))

  const companyName = branding.custom_name || staff?.business_name || 'My Company'
  const displayLogo = branding.logo_url || branding.brand_name ? null : <AvenizeMark size={22} />

  // Global keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      <div className="min-h-screen bg-[var(--avenize-offwhite)]">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-56 shrink-0 bg-white border-r border-black/[0.06] flex-col fixed inset-y-0 left-0">
          <div className="px-5 py-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {displayLogo}
              {branding.logo_url && (
                <img
                  src={branding.logo_url}
                  alt="Logo"
                  className="h-6 w-auto object-contain"
                  style={{ maxHeight: '28px' }}
                />
              )}
              <span className="text-base font-semibold tracking-tight text-[var(--avenize-black)] truncate">
                {companyName}
              </span>
            </div>
          </div>
          <nav className="flex-1 px-2 space-y-0.5">
            {visibleNavItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                      isActive
                        ? 'bg-black/[0.04] text-[var(--avenize-black)] font-medium'
                        : 'text-black/50 hover:bg-black/[0.03] hover:text-black/80'
                    }`
                  }
                >
                  <Icon size={16} strokeWidth={2} />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>

          {/* Upgrade CTA */}
          {!isDemo && (
            <div className="px-3 pb-3">
              <a
                href="/upgrade"
                className="flex items-center gap-2 px-3 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium hover:shadow-lg transition"
              >
                <Crown size={16} />
                <span>Upgrade to Pro</span>
              </a>
            </div>
          )}

          {/* Demo mode badge */}
          {isDemo && (
            <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2">
              <Zap size={13} className="text-amber-500 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-amber-700">Demo Mode</p>
                <p className="text-[10px] text-amber-500">Data is not saved</p>
              </div>
            </div>
          )}

          <div className="px-5 py-4 border-t border-black/[0.06] text-xs text-black/40">
            <p className="text-black/60 truncate">{staff?.full_name ?? staff?.name ?? '...'}</p>
            <p className="text-black/40 text-[10px] capitalize">{staff?.role || 'Staff'}</p>
            <button onClick={signOut} className="mt-1 hover:text-black/70">
              Sign out
            </button>
          </div>
        </aside>

        {/* Mobile top header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-black/[0.06] sticky top-0 z-10">
          <div className="flex items-center gap-2">
            {!branding.logo_url && <AvenizeMark size={20} />}
            {branding.logo_url && (
              <img
                src={branding.logo_url}
                alt="Logo"
                className="h-5 w-auto object-contain"
              />
            )}
            <span className="text-sm font-semibold tracking-tight text-[var(--avenize-black)] truncate">
              {companyName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={() => setCmdOpen(true)}
              className="w-8 h-8 rounded-full bg-black/[0.04] flex items-center justify-center text-black/50 hover:bg-black/[0.08] transition-colors"
            >
              <Search size={15} strokeWidth={2} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="md:ml-56 p-4 md:p-8 pb-28 md:pb-8">
          <Outlet />
        </main>

        {/* Mobile bottom navigation — FIXED: labels now use item.label */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-black/[0.06] px-2 py-2 z-20">
          <div className="flex items-center justify-around">
            {MOBILE_NAV_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition ${
                      isActive ? 'text-indigo-600' : 'text-black/40'
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
    </>
  )
}
