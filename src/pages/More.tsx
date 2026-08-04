import { Link } from 'react-router-dom'
import { Users2, FolderKanban, Wallet, Contact, Boxes, BarChart3, Settings as SettingsIcon, Share2, CheckSquare, Award, DollarSign, MessageSquare, Book, Zap, Headphones, Mail, Calculator, Lock } from 'lucide-react'
import { useSubscription } from '../lib/useSubscription'

const ITEMS = [
  { to: '/chat', label: 'Chat', icon: MessageSquare, tint: 'bg-[#4F46E5]/10 text-[#4F46E5]', desc: 'Team messaging', feature: 'chat' },
  { to: '/knowledge', label: 'Docs', icon: Book, tint: 'bg-orange-500/10 text-orange-500', desc: 'Knowledge base', feature: 'knowledge' },
  { to: '/tickets', label: 'Support', icon: Headphones, tint: 'bg-teal-500/10 text-teal-500', desc: 'Help desk', feature: 'tickets' },
  { to: '/automations', label: 'Automations', icon: Zap, tint: 'bg-violet-500/10 text-violet-500', desc: 'Workflow rules', feature: 'automations' },
  { to: '/campaigns', label: 'Email', icon: Mail, tint: 'bg-blue-500/10 text-blue-500', desc: 'Email marketing', feature: 'campaigns' },
  { to: '/accounting', label: 'Accounting', icon: Calculator, tint: 'bg-rose-500/10 text-rose-500', desc: 'Bookkeeping', feature: 'accounting' },
  { to: '/crm', label: 'CRM', icon: Users2, tint: 'bg-purple-500/10 text-purple-500', desc: 'Contacts & deals', feature: 'crm' },
  { to: '/social', label: 'Social', icon: Share2, tint: 'bg-pink-500/10 text-pink-500', desc: 'Posts & branding', feature: 'social' },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, tint: 'bg-cyan-500/10 text-cyan-500', desc: 'Assign & track', feature: 'tasks' },
  { to: '/projects', label: 'Projects', icon: FolderKanban, tint: 'bg-indigo-500/10 text-indigo-500', desc: 'Project management', feature: 'projects' },
  { to: '/finance', label: 'Finance', icon: Wallet, tint: 'bg-[#FF7A59]/10 text-[#FF7A59]', desc: 'Invoices & billing', feature: 'invoices' },
  { to: '/cashflow', label: 'Cash Flow', icon: DollarSign, tint: 'bg-green-500/10 text-green-500', desc: 'Income & expenses', feature: 'cashflow' },
  { to: '/people', label: 'People', icon: Contact, tint: 'bg-emerald-500/10 text-emerald-500', desc: 'Team & invites', feature: 'people' },
  { to: '/merit', label: 'Merit', icon: Award, tint: 'bg-yellow-500/10 text-yellow-600', desc: 'Recognition & points', feature: 'merit' },
  { to: '/inventory', label: 'Inventory', icon: Boxes, tint: 'bg-amber-500/10 text-amber-500', desc: 'Stock & products', feature: 'inventory' },
  { to: '/reports', label: 'Reports', icon: BarChart3, tint: 'bg-sky-500/10 text-sky-500', desc: 'Analytics', feature: 'reports' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, tint: 'bg-black/[0.06] text-black/60', desc: 'Profile & config', feature: null },
]

export default function More() {
  const { plan, hasFeature } = useSubscription()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--avenize-black)] mb-1">All modules</h1>
          <p className="text-sm text-black/50">Your complete business operating system</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          plan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
          plan === 'pro' ? 'bg-indigo-100 text-indigo-700' :
          plan === 'starter' ? 'bg-blue-100 text-blue-700' :
          'bg-gray-100 text-gray-600'
        }`}>
          {plan.charAt(0).toUpperCase() + plan.slice(1)} Plan
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {ITEMS.map((item) => {
          const isLocked = item.feature && !hasFeature(item.feature)
          
          return isLocked ? (
            <div
              key={item.to}
              className="bg-white rounded-2xl border border-black/[0.06] p-4 flex flex-col gap-2 opacity-60"
            >
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.tint}`}>
                  <item.icon size={18} strokeWidth={2} />
                </div>
                <Lock size={14} className="text-gray-400" />
              </div>
              <div>
                <span className="text-sm font-medium text-[var(--avenize-black)]">{item.label}</span>
                <p className="text-xs text-black/40">{item.desc}</p>
              </div>
              <Link
                to="/upgrade"
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Upgrade to unlock →
              </Link>
            </div>
          ) : (
            <Link
              key={item.to}
              to={item.to}
              className="bg-white rounded-2xl border border-black/[0.06] p-4 flex flex-col gap-2 hover:border-black/[0.12] transition"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.tint}`}>
                <item.icon size={18} strokeWidth={2} />
              </div>
              <div>
                <span className="text-sm font-medium text-[var(--avenize-black)]">{item.label}</span>
                <p className="text-xs text-black/40">{item.desc}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
