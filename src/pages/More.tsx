import { Link } from 'react-router-dom'
import { Users2, FolderKanban, Wallet, Contact, Boxes, BarChart3, Settings as SettingsIcon, Share2, CheckSquare, Award, DollarSign, MessageSquare } from 'lucide-react'

const ITEMS = [
  { to: '/chat', label: 'Chat', icon: MessageSquare, tint: 'bg-[#4F46E5]/10 text-[#4F46E5]', desc: 'Team messaging' },
  { to: '/crm', label: 'CRM', icon: Users2, tint: 'bg-purple-500/10 text-purple-500', desc: 'Contacts & deals' },
  { to: '/social', label: 'Social', icon: Share2, tint: 'bg-pink-500/10 text-pink-500', desc: 'Posts & branding' },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, tint: 'bg-cyan-500/10 text-cyan-500', desc: 'Assign & track' },
  { to: '/projects', label: 'Projects', icon: FolderKanban, tint: 'bg-indigo-500/10 text-indigo-500', desc: 'Project management' },
  { to: '/finance', label: 'Finance', icon: Wallet, tint: 'bg-[#FF7A59]/10 text-[#FF7A59]', desc: 'Invoices & billing' },
  { to: '/cashflow', label: 'Cash Flow', icon: DollarSign, tint: 'bg-green-500/10 text-green-500', desc: 'Income & expenses' },
  { to: '/people', label: 'People', icon: Contact, tint: 'bg-emerald-500/10 text-emerald-500', desc: 'Team & invites' },
  { to: '/merit', label: 'Merit', icon: Award, tint: 'bg-yellow-500/10 text-yellow-600', desc: 'Recognition & points' },
  { to: '/inventory', label: 'Inventory', icon: Boxes, tint: 'bg-amber-500/10 text-amber-500', desc: 'Stock & products' },
  { to: '/reports', label: 'Reports', icon: BarChart3, tint: 'bg-sky-500/10 text-sky-500', desc: 'Analytics' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, tint: 'bg-black/[0.06] text-black/60', desc: 'Profile & config' },
]

export default function More() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-[var(--avenize-black)] mb-1">All modules</h1>
      <p className="text-sm text-black/50 mb-6">Your complete business operating system</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {ITEMS.map((item) => (
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
        ))}
      </div>
    </div>
  )
}
