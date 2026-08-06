import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import FeatureSuggestions from '../components/FeatureSuggestions'

type CashFlowEntry = {
  id: string
  description: string
  amount: number
  type: 'income' | 'expense'
  category: string
  date: string
  created_at: string
}

export default function CashFlow() {
  const { staff } = useAuth()
  const [entries, setEntries] = useState<CashFlowEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      if (!staff?.business_id) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('cashflow')
          .select('*')
          .eq('business_id', staff.business_id)
          .order('date', { ascending: false })

        if (error) throw error
        setEntries(data || [])
      } catch (error) {
        console.error('Failed to load cashflow:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [staff?.business_id])

  const totalIncome = entries.filter(e => e.type === 'income').reduce((sum, e) => sum + (e.amount || 0), 0)
  const totalExpenses = entries.filter(e => e.type === 'expense').reduce((sum, e) => sum + (e.amount || 0), 0)
  const netFlow = totalIncome - totalExpenses

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1000000) return `\u20a6${(value / 1000000).toFixed(1)}M`
    if (Math.abs(value) >= 1000) return `\u20a6${(value / 1000).toFixed(1)}K`
    return `\u20a6${value.toLocaleString()}`
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-medium text-[var(--avenize-black)] mb-6">Cash Flow</h1>
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/5 rounded-xl"></div>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-medium text-[var(--avenize-black)] mb-6">Cash Flow</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 border border-black/[0.06]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <TrendingUp size={20} className="text-green-600" />
            </div>
            <span className="text-sm text-black/50">Income</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(totalIncome)}</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-black/[0.06]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <TrendingDown size={20} className="text-red-600" />
            </div>
            <span className="text-sm text-black/50">Expenses</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{formatCurrency(totalExpenses)}</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-black/[0.06]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <DollarSign size={20} className="text-blue-600" />
            </div>
            <span className="text-sm text-black/50">Net Flow</span>
          </div>
          <div className={`text-2xl font-bold ${netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {netFlow >= 0 ? '+' : ''}{formatCurrency(netFlow)}
          </div>
        </div>
      </div>

      {/* Entries List */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        <div className="px-4 py-3 border-b border-black/[0.06]">
          <h2 className="font-semibold">Recent Transactions</h2>
        </div>
        {entries.length === 0 ? (
          <div className="p-8 text-center text-black/40">
            No transactions recorded yet
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {entries.map(entry => (
              <div key={entry.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{entry.description}</div>
                  <div className="text-xs text-black/40">{entry.category} \u2022 {new Date(entry.date).toLocaleDateString()}</div>
                </div>
                <div className={`font-semibold ${entry.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                  {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <FeatureSuggestions suggestions={[
        { label: 'Finance', path: '/app/finance', description: 'View financial reports' },
        { label: 'Invoices', path: '/app/finance/invoices', description: 'Manage invoices' },
      ]} />
    </div>
  )
}
