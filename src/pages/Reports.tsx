import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import FeatureSuggestions from '../components/FeatureSuggestions'

// Demo stats
const DEMO_STATS = {
  dealsWon: 12,
  revenueClosed: 142500,
  invoicesPaid: 8,
  invoicesOutstanding: 5,
}

export default function Reports() {
  const { isDemo } = useAuth()
  const [stats, setStats] = useState({
    dealsWon: 0,
    revenueClosed: 0,
    invoicesPaid: 0,
    invoicesOutstanding: 0,
  })

  useEffect(() => {
    const load = async () => {
      if (isDemo) {
        setStats(DEMO_STATS)
        return
      }

      try {
        const [{ data: wonDeals }, { data: paidInvoices }, { data: unpaidInvoices }] = await Promise.all([
          supabase.from('deals').select('value').eq('stage', 'won'),
          supabase.from('invoices').select('total').eq('status', 'paid'),
          supabase.from('invoices').select('total').in('status', ['sent', 'overdue']),
        ])
        setStats({
          dealsWon: wonDeals?.length ?? 0,
          revenueClosed: (wonDeals ?? []).reduce((sum, d) => sum + (d.value ?? 0), 0),
          invoicesPaid: (paidInvoices ?? []).reduce((sum, i) => sum + (i.total ?? 0), 0),
          invoicesOutstanding: (unpaidInvoices ?? []).reduce((sum, i) => sum + (i.total ?? 0), 0),
        })
      } catch {
        setStats(DEMO_STATS)
      }
    }
    load()
  }, [isDemo])

  const rows = [
    { label: 'Deals won', value: stats.dealsWon },
    { label: 'Revenue closed', value: stats.revenueClosed.toLocaleString() },
    { label: 'Invoices paid', value: stats.invoicesPaid.toLocaleString() },
    { label: 'Invoices outstanding', value: stats.invoicesOutstanding.toLocaleString() },
  ]

  return (
    <div>
      <h1 className="text-xl font-medium text-[var(--avenize-black)] mb-6">Reports</h1>
      <div className="bg-white rounded-2xl border border-black/[0.06] divide-y divide-black/[0.06]">
        {rows.map((r) => (
          <div key={r.label} className="px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-black/60">{r.label}</span>
            <span className="text-[var(--avenize-black)] font-medium">{r.value}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-black/40 mt-4">
        Deterministic, non-AI view — the natural-language reporting layer comes in a later build phase.
      </p>

      {/* Contextual Feature Suggestions */}
      <FeatureSuggestions suggestions={[
        { label: 'Finance', path: '/app/finance', description: 'Financial reports' },
        { label: 'Projects', path: '/app/projects', description: 'Project analytics' },
        { label: 'CRM', path: '/app/crm', description: 'Sales reports' },
      ]} />
    </div>
  )
}
