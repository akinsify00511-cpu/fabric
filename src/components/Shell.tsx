import { NavLink, Outlet } from 'react-router-dom'
import { Home, Users2, FolderKanban, Wallet, Contact, Boxes, BarChart3, Settings as SettingsIcon, LayoutGrid, User, Search, Share2, CheckSquare, MessageSquare, Book, Headphones, Calendar as CalendarIcon, Clock, FileText, CalendarDays, Activity, Network, Palette, Crown, MessageSquare as ChatIcon, Building2 } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useBranding } from '../lib/BrandingContext'
import { useAccessibleTools } from '../lib/useToolAccess'
import { AvenizeMark } from './AvenizeMark'
import NotificationBell from './NotificationBell'

// Map nav routes to tool keys
const TOOL_KEY_MAP: Record<string, string> = {
  '/app': 'dashboard',
  '/app/chat': 'chat',
  '/app/tasks': 'tasks',
  '/app/calendar': 'calendar',
  '/app/time': 'time-tracking',
  '/app/events': 'events',
  '/app/knowledge': 'knowledge',
  '/app/tickets': 'tickets',
  '/app/crm': 'crm',
  '/app/social': 'social',
  '/app/projects': 'projects',
  '/app/finance': 'finance',
  '/app/hr': 'people',
  '/app/inventory': 'inventory',
  '/app/requisitions': 'requisitions',
  '/app/organogram': 'merit',
  '/app/reports': 'reports',
  '/app/monitoring': 'dashboard',
  '/app/meetings': 'meetings',
  '/app/home': 'dashboard',
  '/app/branding': 'branding',
  '/app/settings': 'settings',
}

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
  { to: '/app/hr', label: 'HR', icon: Contact, toolKey: 'people' },
  { to: '/app/inventory', label: 'Inventory', icon: Boxes, toolKey: 'inventory' },
  { to: '/app/requisitions', label: 'Requests', icon: FileText, toolKey: 'requisitions' },
  { to: '/app/organogram', label: 'Org Chart', icon: Network, toolKey: 'merit' },
  { to: '/app/departments', label: 'Departments', icon: Building2, toolKey: 'merit' },
  { to: '/app/reports', label: 'Reports', icon: BarChart3, toolKey: 'reports' },
  { to: '/app/monitoring', label: 'Monitoring', icon: Activity, toolKey: 'dashboard' },
  { to: '/app/meetings', label: 'Meetings', icon: Headphones, toolKey: 'meetings' },
  { to: '/app/home', label: 'Company', icon: Home, toolKey: 'dashboard' },
  { to: '/app/branding', label: 'Branding', icon: Palette, toolKey: 'branding' },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon, toolKey: 'settings' },
]

const MOBILE_NAV_ITEMS = [
  { to: '/app', end: true, icon: Home },
  { to: '/app/chat', end: false, icon: ChatIcon },
  { to: '/app/more', end: false, icon: LayoutGrid },
  { to: '/app/settings', end: false, icon: User },
]

export default function Shell() {
  const { staff, signOut } = useAuth()
  const { branding } = useBranding()
  const { tools: accessibleTools, loading } = useAccessibleTools()
  
  // Check if user is admin/owner (they see everything)
  const isPrivileged = staff?.role === 'owner' || staff?.role === 'admin'
  
  // Filter nav items based on tool access (unless privileged)
  const visibleNavItems = loading || isPrivileged 
    ? NAV_ITEMS 
    : NAV_ITEMS.filter(item => accessibleTools.includes(item.toolKey as any))
  
  const companyName = branding.custom_name || staff?.business_name || 'My Company'
  const displayLogo = branding.logo_url || branding.brand_name ? null : <AvenizeMark size={22} />
  
  // Get branding colors - use actual branding values
  const bgColor = branding.background_color
  const textColor = branding.text_color
  // Check for dark backgrounds (light backgrounds are white/light gray)
  const isLightBg = bgColor === '#FAFAFA' || bgColor === '#F8F9FA' || bgColor === '#FFFFFF' || bgColor === '#F3F4F6'
  const isDarkBg = !isLightBg

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 border-r flex-col fixed inset-y-0 left-0" style={{ backgroundColor: isLightBg ? '#17150F' : '#FFFFFF', borderColor: isLightBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
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
            <span className="text-base font-semibold tracking-tight truncate" style={{ color: textColor }}>
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
                      ? 'bg-white/[0.08] font-medium'
                      : ''
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive ? textColor : isDarkBg ? 'rgba(247,244,238,0.5)' : 'rgba(17,17,17,0.5)',
                })}
              >
                <Icon size={16} strokeWidth={2} />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        
        {/* Upgrade CTA */}
        <div className="px-3 pb-3">
          <a
            href="/upgrade"
            className="flex items-center gap-2 px-3 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium hover:shadow-lg transition"
          >
            <Crown size={16} />
            <span>Upgrade to Pro</span>
          </a>
        </div>
        
        <div className="px-5 py-4 border-t text-xs" style={{ borderColor: isDarkBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: isDarkBg ? 'rgba(247,244,238,0.4)' : 'rgba(17,17,17,0.4)' }}>
          <p className="truncate" style={{ color: isDarkBg ? 'rgba(247,244,238,0.6)' : 'rgba(17,17,17,0.6)' }}>{staff?.full_name ?? staff?.name ?? '...'}</p>
          <p className="text-[10px] capitalize" style={{ color: isDarkBg ? 'rgba(247,244,238,0.4)' : 'rgba(17,17,17,0.4)' }}>{staff?.role || 'Staff'}</p>
          <button onClick={signOut} className="mt-1 hover:opacity-70">
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b sticky top-0 z-10" style={{ backgroundColor: isDarkBg ? '#17150F' : '#FFFFFF', borderColor: isDarkBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-2">
          {!branding.logo_url && <AvenizeMark size={20} fill={isDarkBg ? "#F7F4EE" : "#111111"} />}
          {branding.logo_url && (
            <img 
              src={branding.logo_url} 
              alt="Logo" 
              className="h-5 w-auto object-contain"
            />
          )}
          <span className="text-sm font-semibold tracking-tight truncate" style={{ color: textColor }}>
            {companyName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: isDarkBg ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', color: isDarkBg ? 'rgba(247,244,238,0.5)' : 'rgba(17,17,17,0.5)' }}>
            <Search size={15} strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="md:ml-56 p-4 md:p-8 pb-28 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t px-2 py-2 z-20" style={{ backgroundColor: isDarkBg ? '#17150F' : '#FFFFFF', borderColor: isDarkBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
        <div className="flex items-center justify-around">
          {MOBILE_NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition"
                style={({ isActive }) => ({
                  color: isActive ? '#6366F1' : isDarkBg ? 'rgba(247,244,238,0.4)' : 'rgba(17,17,17,0.4)',
                })}
              >
                <Icon size={20} strokeWidth={2} />
                <span className="text-[10px] font-medium">
                  {item.to === '/' ? 'Home' : 
                   item.to === '/chat' ? 'Chat' :
                   item.to === '/more' ? 'More' : 'Settings'}
                </span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
