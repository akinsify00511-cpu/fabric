import { useEffect, useState } from 'react'
import { Wallet, Users2, FolderKanban } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

type Activity = { id: string; label: string; detail: string; at: string }

export default function Dashboard() {
  const { staff } = useAuth()
  const [revenue, setRevenue] = useState(0)
  const [leads, setLeads] = useState(0)
  const [projects, setProjects] = useState(0)
  const [activity, setActivity] = useState<Activity[]>([])

  useEffect(() => {
    const load = async () => {
      const [{ data: wonDeals }, { count: leadCount }, { count: projectCount }, { data: recentDeals }, { data: recentInvoices }] =
        await Promise.all([
          supabase.from('deals').select('value').eq('stage', 'won'),
          supabase.from('deals').select('*', { count: 'exact', head: true }).neq('stage', 'lost').neq('stage', 'won'),
          supabase.from('projects').select('*', { count: 'exact', head: true }).neq('status', 'done'),
          supabase.from('deals').select('title, stage, created_at').eq('stage', 'won').order('created_at', { ascending: false }).limit(3),
          supabase.from('invoices').select('amount, status, created_at').eq('status', 'paid').order('created_at', { ascending: false }).limit(3),
        ])

      setRevenue((wonDeals ?? []).reduce((sum, d) => sum + (d.value ?? 0), 0))
      setLeads(leadCount ?? 0)
      setProjects(projectCount ?? 0)

      const dealActivity: Activity[] = (recentDeals ?? []).map((d, i) => ({
        id: `deal-${i}`,
        label: 'New deal closed',
        detail: d.title,
        at: d.created_at,
      }))
      const invoiceActivity: Activity[] = (recentInvoices ?? []).map((inv, i) => ({
        id: `inv-${i}`,
        label: 'Invoice paid',
        detail: `${inv.amount.toLocaleString()}`,
        at: inv.created_at,
      }))
      setActivity(
        [...dealActivity, ...invoiceActivity]
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .slice(0, 5),
      )
    }
    load()
  }, [])

  const cards = [
    { label: 'Revenue', value: `${revenue.toLocaleString()}`, icon: Wallet, tint: 'bg-[#4F46E5]/10 text-[#4F46E5]' },
    { label: 'Leads', value: leads, icon: Users2, tint: 'bg-[#FF7A59]/10 text-[#FF7A59]' },
    { label: 'Projects', value: projects, icon: FolderKanban, tint: 'bg-pink-500/10 text-pink-500' },
  ]

  return (
    <div>
      <h1 className="text-xl font-semibold text-[var(--fabric-black)]">
        Good morning{staff?.full_name ? `, ${staff.full_name.split(' ')[0]}` : ''}
      </h1>
      <p className="text-sm text-black/50 mt-1 mb-6">Here's what's happening in your business.</p>

      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${c.tint}`}>
              <c.icon size={16} strokeWidth={2} />
            </div>
            <p className="text-xs text-black/50">{c.label}</p>
            <p className="text-xl font-semibold text-[var(--fabric-black)] mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-black/[0.06]">
        <p className="px-4 py-3 text-sm font-medium text-[var(--fabric-black)] border-b border-black/[0.06]">
          Recent activity
        </p>
        <div className="divide-y divide-black/[0.06]">
          {activity.map((a) => (
            <div key={a.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <p className="text-[var(--fabric-black)]">{a.label}</p>
                <p className="text-black/40 text-xs mt-0.5">{a.detail}</p>
              </div>
              <span className="text-xs text-black/30">{new Date(a.at).toLocaleDateString()}</span>
            </div>
          ))}
          {activity.length === 0 && <p className="px-4 py-3 text-sm text-black/40">No activity yet.</p>}
        </div>
      </div>
    </div>
  )
}
