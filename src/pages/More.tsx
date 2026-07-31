import { Link } from 'react-router-dom'
import { Users2, FolderKanban, Wallet, Contact, Boxes, BarChart3, Settings as SettingsIcon } from 'lucide-react'

const ITEMS = [
  { to: '/crm', label: 'CRM', icon: Users2, tint: 'bg-[#4F46E5]/10 text-[#4F46E5]' },
  { to: '/projects', label: 'Projects', icon: FolderKanban, tint: 'bg-pink-500/10 text-pink-500' },
  { to: '/finance', label: 'Finance', icon: Wallet, tint: 'bg-[#FF7A59]/10 text-[#FF7A59]' },
  { to: '/people', label: 'People', icon: Contact, tint: 'bg-emerald-500/10 text-emerald-500' },
  { to: '/inventory', label: 'Inventory', icon: Boxes, tint: 'bg-amber-500/10 text-amber-500' },
  { to: '/reports', label: 'Reports', icon: BarChart3, tint: 'bg-sky-500/10 text-sky-500' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, tint: 'bg-black/[0.06] text-black/60' },
]

export default function More() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-[var(--fabric-black)] mb-6">All modules</h1>
      <div className="grid grid-cols-2 gap-3">
        {ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="bg-white rounded-2xl border border-black/[0.06] p-4 flex flex-col gap-3"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.tint}`}>
              <item.icon size={18} strokeWidth={2} />
            </div>
            <span className="text-sm font-medium text-[var(--fabric-black)]">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
