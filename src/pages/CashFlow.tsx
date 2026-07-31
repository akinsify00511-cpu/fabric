import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { ListSkeleton } from '../components/Skeleton'
import { Plus, TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react'

type CashFlowEntry = {
  id: string
  type: 'income' | 'expense'
  category: string
  amount: number
  description: string | null
  date: string
  staff_id: string | null
  created_at: string
}

type MonthlyTotal = {
  month: string
  income: number
  expense: number
  net: number
}

const CATEGORIES = {
  income: ['Sales', 'Services', 'Subscriptions', 'Investments', 'Other Income'],
  expense: ['Payroll', 'Marketing', 'Operations', 'Software', 'Facilities', 'Travel', 'Cost of Goods', 'Other Expense'],
}

export default function CashFlow() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<CashFlowEntry[]>([])
  const [monthlyData, setMonthlyData] = useState<MonthlyTotal[]>([])
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('cashflow_entries')
      .select('*')
      .order('date', { ascending: false })
      .limit(100)
    const entriesData = (data as CashFlowEntry[]) ?? []
    setEntries(entriesData)

    // Calculate monthly totals
    const monthly: Record<string, { income: number; expense: number }> = {}
    entriesData.forEach((e) => {
      const month = e.date.substring(0, 7)
      if (!monthly[month]) monthly[month] = { income: 0, expense: 0 }
      if (e.type === 'income') monthly[month].income += e.amount
      else monthly[month].expense += e.amount
    })
    const monthlyTotals = Object.entries(monthly)
      .map(([month, data]) => ({
        month,
        income: data.income,
        expense: data.expense,
        net: data.income - data.expense,
      }))
      .sort((a, b) => b.month.localeCompare(a.month))
    setMonthlyData(monthlyTotals)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const addEntry = async () => {
    if (!category || !amount) {
      showToast('Select category and enter amount', 'error')
      return
    }
    const { error } = await supabase.from('cashflow_entries').insert({
      type,
      category,
      amount: Number(amount),
      description: description || null,
      date,
      staff_id: staff?.id,
    })
    if (error) {
      showToast('Failed to add entry', 'error')
    } else {
      showToast(`${type === 'income' ? 'Income' : 'Expense'} recorded!`, 'success')
      setAmount('')
      setDescription('')
      setCategory('')
      load()
    }
  }

  const deleteEntry = async (id: string) => {
    await supabase.from('cashflow_entries').delete().eq('id', id)
    showToast('Entry deleted', 'info')
    load()
  }

  const filteredEntries = entries.filter((e) => {
    if (filter === 'all') return true
    return e.type === filter
  })

  const totalIncome = entries.reduce((sum, e) => e.type === 'income' ? sum + e.amount : sum, 0)
  const totalExpense = entries.reduce((sum, e) => e.type === 'expense' ? sum + e.amount : sum, 0)
  const netFlow = totalIncome - totalExpense

  const formatCurrency = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium text-[var(--avenize-black)]">Cash Flow</h1>
        <p className="text-sm text-black/50 mt-0.5">Track income and expenses</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpRight size={14} className="text-green-500" />
            <span className="text-xs text-black/50 uppercase tracking-wide">Income</span>
          </div>
          <p className="text-lg font-semibold text-green-600">{formatCurrency(totalIncome)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownRight size={14} className="text-red-500" />
            <span className="text-xs text-black/50 uppercase tracking-wide">Expenses</span>
          </div>
          <p className="text-lg font-semibold text-red-600">{formatCurrency(totalExpense)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-blue-500" />
            <span className="text-xs text-black/50 uppercase tracking-wide">Net</span>
          </div>
          <p className={`text-lg font-semibold ${netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(netFlow)}
          </p>
        </div>
      </div>

      {/* Add Entry */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-6">
        <p className="text-sm font-medium text-[var(--avenize-black)] mb-4">Add Entry</p>
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="flex rounded-lg overflow-hidden border border-black/10">
            <button
              onClick={() => { setType('income'); setCategory('') }}
              className={`px-4 py-2 text-sm font-medium transition ${type === 'income' ? 'avenize-gradient text-white' : 'bg-white text-black/60'}`}
            >
              Income
            </button>
            <button
              onClick={() => { setType('expense'); setCategory('') }}
              className={`px-4 py-2 text-sm font-medium transition ${type === 'expense' ? 'bg-red-500 text-white' : 'bg-white text-black/60'}`}
            >
              Expense
            </button>
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex-1 min-w-32 rounded-lg border border-black/10 px-3 py-2 text-sm"
          >
            <option value="">Category...</option>
            {CATEGORIES[type].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="w-32 rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <button
            onClick={addEntry}
            className={`rounded-lg text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition flex items-center gap-1.5 ${
              type === 'income' ? 'avenize-gradient' : 'bg-red-500'
            }`}
          >
            <Plus size={14} />
            Add
          </button>
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-4">
        {[
          { id: 'all', label: 'All' },
          { id: 'income', label: 'Income' },
          { id: 'expense', label: 'Expenses' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as typeof filter)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter === f.id ? 'avenize-gradient text-white' : 'bg-white text-black/50 border border-black/[0.06]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Entries List */}
      {loading ? (
        <ListSkeleton items={6} />
      ) : (
        <div className="bg-white rounded-2xl border border-black/[0.06] divide-y divide-black/[0.06]">
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  entry.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                }`}>
                  {entry.type === 'income' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                </div>
                <div>
                  <p className="text-sm text-[var(--avenize-black)] font-medium">{entry.category}</p>
                  <p className="text-xs text-black/40">{entry.description || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className={`text-sm font-semibold ${entry.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
                  </p>
                  <p className="text-xs text-black/30">{new Date(entry.date).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => deleteEntry(entry.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {filteredEntries.length === 0 && (
            <p className="px-4 py-8 text-sm text-black/40 text-center">No entries yet. Add your first above!</p>
          )}
        </div>
      )}

      {/* Monthly Breakdown */}
      {monthlyData.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-medium text-[var(--avenize-black)] mb-3">Monthly Breakdown</p>
          <div className="bg-white rounded-2xl border border-black/[0.06] divide-y divide-black/[0.06]">
            {monthlyData.map((m) => (
              <div key={m.month} className="px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-black/60">{new Date(m.month + '-01').toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</span>
                <div className="flex items-center gap-4">
                  <span className="text-green-600">+{formatCurrency(m.income)}</span>
                  <span className="text-red-600">-{formatCurrency(m.expense)}</span>
                  <span className={`font-medium ${m.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {m.net >= 0 ? '+' : ''}{formatCurrency(m.net)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
