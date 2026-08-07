import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import FeatureSuggestions from '../components/FeatureSuggestions'

export default function Reports() {
  const { staff } = useAuth()
  const [stats, setStats] = useState({
    dealsWon: 0,
    revenueClosed: 0,
    invoicesPaid: 0,
    invoicesOutstanding: 0,
    totalTasks: 0,
    completedTasks: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!staff?.business_id) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const [{ data: wonDeals }, { data: paidInvoices }, { data: unpaidInvoices }, { data: allTasks }, { data: completedTasks }] = await Promise.all([
          supabase.from('deals').select('value').eq('business_id', staff.business_id).eq('stage', 'won'),
          supabase.from('invoices').select('total').eq('business_id', staff.business_id).eq('status', 'paid'),
          supabase.from('invoices').select('total').eq('business_id', staff.business_id).in('status', ['sent', 'overdue']),
          supabase.from('tasks').select('id').eq('business_id', staff.business_id),
          supabase.from('tasks').select('id').eq('business_id', staff.business_id).eq('status', 'done'),
        ])
        setStats({
          dealsWon: wonDeals?.length ?? 0,
          revenueClosed: (wonDeals ?? []).reduce((sum, d) => sum + (d.value ?? 0), 0),
          invoicesPaid: (paidInvoices ?? []).reduce((sum, i) => sum + (i.total ?? 0), 0),
          invoicesOutstanding: (unpaidInvoices ?? []).reduce((sum, i) => sum + (i.total ?? 0), 0),
          totalTasks: allTasks?.length ?? 0,
          completedTasks: completedTasks?.length ?? 0,
        })
      } catch (error) {
        console.error('Failed to load reports:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [staff?.business_id])

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `\u20a6${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `\u20a6${(value / 1000).toFixed(1)}K`
    return `\u20a6${value.toLocaleString()}`
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-medium text-gray-900 mb-6">Reports</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-white/5 rounded-xl"></div>
          ))}
        </div>
      </div>
    )
  }

  const rows = [
    { label: 'Deals won', value: stats.dealsWon, icon: '🎯' },
    { label: 'Revenue closed', value: formatCurrency(stats.revenueClosed), icon: '💰' },
    { label: 'Invoices paid', value: formatCurrency(stats.invoicesPaid), icon: '✅' },
    { label: 'Invoices outstanding', value: formatCurrency(stats.invoicesOutstanding), icon: '⏳' },
    { label: 'Tasks completed', value: `${stats.completedTasks}/${stats.totalTasks}`, icon: '📋' },
  ]

  return (
    <div>
      <h1 className="text-xl font-medium text-gray-900 mb-6">Reports</h1>
      <div className="bg-white rounded-2xl border border-black/[0.06] divide-y divide-black/[0.06]">
        {rows.map((r) => (
          <div key={r.label} className="px-4 py-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="text-lg">{r.icon}</span>
              <span className="text-black/60">{r.label}</span>
            </div>
            <span className="text-gray-900 font-medium">{r.value}</span>
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
