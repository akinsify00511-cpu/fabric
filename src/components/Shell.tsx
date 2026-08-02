import { NavLink, Outlet } from 'react-router-dom'
import { Home, Users2, FolderKanban, Wallet, Contact, Boxes, BarChart3, Settings as SettingsIcon, LayoutGrid, User, Search, Share2, CheckSquare, MessageSquare, Book, Headphones, Calendar as CalendarIcon, Clock, FileText, CalendarDays, Activity, Network, Palette } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import FabricMark from './FabricMark'
import GamificationBar from './GamificationBar'
import NotificationBell from './NotificationBell'

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true, icon: Home },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/time', label: 'Time', icon: Clock },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/knowledge', label: 'Docs', icon: Book },
  { to: '/tickets', label: 'Support', icon: Headphones },
  { to: '/crm', label: 'CRM', icon: Users2 },
  { to: '/social', label: 'Social', icon: Share2 },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/people', label: 'People', icon: Contact },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/requisitions', label: 'Requests', icon: FileText },
  { to: '/organogram', label: 'Org Chart', icon: Network },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/monitoring', label: 'Monitoring', icon: Activity },
  { to: '/branding', label: 'Branding', icon: Palette },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

const MOBILE_NAV_ITEMS = [
  { to: '/', end: true, icon: Home },
  { to: '/more', end: false, icon: LayoutGrid },
  { to: '/reports', end: false, icon: BarChart3 },
  { to: '/settings', end: false, icon: User },
]

export default function Shell() {
  const { staff, session, signOut } = useAuth()
  const userId = session?.user?.id

  return (
    <div className="min-h-screen bg-[var(--avenize-offwhite)]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 bg-white border-r border-black/[0.06] flex-col fixed inset-y-0 left-0">
        <div className="px-5 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FabricMark size={22} />
            <span className="text-base font-semibold tracking-tight text-[var(--avenize-black)]">Avenize</span>
          </div>
          {userId && <GamificationBar userId={userId} />}
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
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
        <div className="px-5 py-4 border-t border-black/[0.06] text-xs text-black/40">
          <p className="text-black/60">{staff?.full_name ?? staff?.name ?? '…'}</p>
          <button onClick={signOut} className="mt-1 hover:text-black/70">
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-black/[0.06] sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <FabricMark size={20} />
          <span className="text-sm font-semibold tracking-tight text-[var(--avenize-black)]">Avenize</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button className="w-8 h-8 rounded-full bg-black/[0.04] flex items-center justify-center text-black/50">
            <Search size={15} strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="md:ml-56 p-4 md:p-8 pb-28 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile floating bottom pill nav */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-[var(--avenize-black)] rounded-full px-6 py-3 flex items-center justify-between shadow-lg">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `w-9 h-9 rounded-full flex items-center justify-center transition ${
                  isActive ? 'avenize-gradient text-white' : 'text-white/50'
                }`
              }
            >
              <Icon size={18} strokeWidth={2} />
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
