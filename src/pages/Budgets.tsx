// ============================================
// BUDGET MANAGEMENT PAGE
// Budget vs Actual tracking for departments/cost centers
// ============================================

import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import {
  Wallet, TrendingUp, TrendingDown, Plus, ChevronDown,
  ChevronRight, Target, DollarSign, PieChart, Calendar,
  Edit2, Trash2, AlertTriangle, CheckCircle2
} from 'lucide-react'

interface Budget {
  id: string
  name: string
  fiscal_year: number
  period_type: 'monthly' | 'quarterly' | 'yearly'
  total_amount: number
  allocated_amount: number
  spent_amount: number
  status: 'draft' | 'active' | 'closed' | 'overbudget'
  start_date: string
  end_date: string
  department_id: string | null
  cost_center_id: string | null
  department_name?: string
  cost_center_name?: string
}

interface Department {
  id: string
  name: string
}

interface CostCenter {
  id: string
  name: string
  code: string
}

export default function Budgets() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set())
  const [showModal, setShowModal] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const [form, setForm] = useState({
    name: '',
    fiscal_year: new Date().getFullYear(),
    period_type: 'yearly' as 'monthly' | 'quarterly' | 'yearly',
    total_amount: 0,
    department_id: '',
    cost_center_id: '',
    start_date: '',
    end_date: '',
  })

  useEffect(() => {
    if (staff?.business_id) {
      loadData()
    }
  }, [staff?.business_id])

  async function loadData() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      // Load budgets
      const { data: budgetData } = await supabase
        .from('budgets')
        .select(`
          *,
          departments:department_id (name),
          cost_centers:cost_center_id (name)
        `)
        .eq('business_id', staff.business_id)
        .order('fiscal_year', { ascending: false })

      if (budgetData) {
        const formattedBudgets = budgetData.map(b => ({
          ...b,
          department_name: (b as any).departments?.name,
          cost_center_name: (b as any).cost_centers?.name,
        }))
        setBudgets(formattedBudgets)
        
        // Expand current year by default
        const currentYear = new Date().getFullYear()
        setExpandedYears(new Set([currentYear]))
      }

      // Load departments
      const { data: deptData } = await supabase
        .from('departments')
        .select('id, name')
        .eq('business_id', staff.business_id)
        .eq('is_active', true)
      if (deptData) setDepartments(deptData)

      // Load cost centers
      const { data: ccData } = await supabase
        .from('cost_centers')
        .select('id, name, code')
        .eq('business_id', staff.business_id)
        .eq('is_active', true)
      if (ccData) setCostCenters(ccData)

    } catch (error) {
      console.error('Error loading budget data:', error)
      showToast('Failed to load budget data', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Group budgets by fiscal year
  const budgetsByYear = budgets.reduce((acc, budget) => {
    const year = budget.fiscal_year
    if (!acc[year]) acc[year] = []
    acc[year].push(budget)
    return acc
  }, {} as Record<number, Budget[]>)

  // Calculate totals for a year
  const getYearTotals = (yearBudgets: Budget[]) => {
    return yearBudgets.reduce((acc, b) => ({
      total: acc.total + Number(b.total_amount),
      allocated: acc.allocated + Number(b.allocated_amount),
      spent: acc.spent + Number(b.spent_amount),
    }), { total: 0, allocated: 0, spent: 0 })
  }

  const toggleYear = (year: number) => {
    const newExpanded = new Set(expandedYears)
    if (newExpanded.has(year)) {
      newExpanded.delete(year)
    } else {
      newExpanded.add(year)
    }
    setExpandedYears(newExpanded)
  }

  const openCreateModal = () => {
    setEditingBudget(null)
    setForm({
      name: '',
      fiscal_year: selectedYear,
      period_type: 'yearly',
      total_amount: 0,
      department_id: '',
      cost_center_id: '',
      start_date: '',
      end_date: '',
    })
    setShowModal(true)
  }

  const openEditModal = (budget: Budget) => {
    setEditingBudget(budget)
    setForm({
      name: budget.name,
      fiscal_year: budget.fiscal_year,
      period_type: budget.period_type,
      total_amount: Number(budget.total_amount),
      department_id: budget.department_id || '',
      cost_center_id: budget.cost_center_id || '',
      start_date: budget.start_date || '',
      end_date: budget.end_date || '',
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staff?.business_id) return

    try {
      const budgetData = {
        name: form.name,
        fiscal_year: form.fiscal_year,
        period_type: form.period_type,
        total_amount: form.total_amount,
        allocated_amount: 0,
        spent_amount: 0,
        status: 'draft',
        department_id: form.department_id || null,
        cost_center_id: form.cost_center_id || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        business_id: staff.business_id,
        created_by: staff.id,
      }

      if (editingBudget) {
        const { error } = await supabase
          .from('budgets')
          .update(budgetData)
          .eq('id', editingBudget.id)
        
        if (error) throw error
        showToast('Budget updated successfully', 'success')
      } else {
        const { error } = await supabase
          .from('budgets')
          .insert(budgetData)
        
        if (error) throw error
        showToast('Budget created successfully', 'success')
      }

      setShowModal(false)
      loadData()
    } catch (error) {
      console.error('Error saving budget:', error)
      showToast('Failed to save budget', 'error')
    }
  }

  const toggleBudgetStatus = async (budget: Budget) => {
    const newStatus = budget.status === 'active' ? 'closed' : 'active'
    
    try {
      const { error } = await supabase
        .from('budgets')
        .update({ status: newStatus })
        .eq('id', budget.id)
      
      if (error) throw error
      showToast(`Budget ${newStatus === 'active' ? 'activated' : 'closed'}`, 'success')
      loadData()
    } catch (error) {
      showToast('Failed to update budget status', 'error')
    }
  }

  const deleteBudget = async (budget: Budget) => {
    if (!confirm(`Delete budget "${budget.name}"? This cannot be undone.`)) return

    try {
      const { error } = await supabase
        .from('budgets')
        .delete()
        .eq('id', budget.id)
      
      if (error) throw error
      showToast('Budget deleted', 'success')
      loadData()
    } catch (error) {
      showToast('Failed to delete budget', 'error')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-[var(--av-success)] bg-[var(--av-success-soft)]'
      case 'draft': return 'text-[var(--av-warning)] bg-[var(--av-warning-soft)]'
      case 'closed': return 'text-[var(--av-text-muted)] bg-gray-50'
      case 'overbudget': return 'text-[var(--av-danger)] bg-[var(--av-danger-soft)]'
      default: return 'text-[var(--av-text-muted)] bg-gray-50'
    }
  }

  const getUtilizationPercent = (spent: number, total: number) => {
    if (total === 0) return 0
    return Math.min(100, (spent / total) * 100)
  }

  const getUtilizationColor = (percent: number) => {
    if (percent >= 100) return 'bg-[var(--av-danger)]'
    if (percent >= 80) return 'bg-[var(--av-warning)]'
    return 'bg-[var(--av-success)]'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--av-primary)]"></div>
      </div>
    )
  }

  const years = Object.keys(budgetsByYear).map(Number).sort((a, b) => b - a)
  const allYears = years.length > 0 ? years : [selectedYear]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--av-text)]">Budget Management</h1>
          <p className="text-[var(--av-text-muted)] mt-1">Track and manage departmental budgets</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg hover:bg-[var(--av-primary-hover)] transition"
        >
          <Plus size={20} />
          Create Budget
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Total Budget"
          value={budgets.reduce((sum, b) => sum + Number(b.total_amount), 0)}
          icon={<Wallet className="text-[var(--av-primary)]" />}
          color="blue"
        />
        <SummaryCard
          title="Total Allocated"
          value={budgets.reduce((sum, b) => sum + Number(b.allocated_amount), 0)}
          icon={<PieChart className="text-purple-600" />}
          color="purple"
        />
        <SummaryCard
          title="Total Spent"
          value={budgets.reduce((sum, b) => sum + Number(b.spent_amount), 0)}
          icon={<TrendingUp className="text-[var(--av-success)]" />}
          color="green"
          subtitle={`${getUtilizationPercent(
            budgets.reduce((sum, b) => sum + Number(b.spent_amount), 0),
            budgets.reduce((sum, b) => sum + Number(b.total_amount), 0)
          ).toFixed(1)}% utilized`}
        />
      </div>

      {/* Budget List by Year */}
      <div className="space-y-4">
        {allYears.map(year => {
          const yearBudgets = budgetsByYear[year] || []
          const totals = yearBudgets.length > 0 ? getYearTotals(yearBudgets) : { total: 0, allocated: 0, spent: 0 }
          const isExpanded = expandedYears.has(year)

          return (
            <div key={year} className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] overflow-hidden">
              {/* Year Header */}
              <button
                onClick={() => toggleYear(year)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown size={20} className="text-[var(--av-text-disabled)]" />
                  ) : (
                    <ChevronRight size={20} className="text-[var(--av-text-disabled)]" />
                  )}
                  <span className="text-lg font-semibold">{year}</span>
                  <span className="text-sm text-[var(--av-text-muted)]">
                    {yearBudgets.length} budget{yearBudgets.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <p className="text-[var(--av-text-muted)]">Total</p>
                    <p className="font-semibold">₦{totals.total.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[var(--av-text-muted)]">Spent</p>
                    <p className="font-semibold">₦{totals.spent.toLocaleString()}</p>
                  </div>
                  <div className="w-24">
                    <div className="flex justify-between text-xs text-[var(--av-text-muted)] mb-1">
                      <span>Utilization</span>
                      <span>{totals.total > 0 ? ((totals.spent / totals.total) * 100).toFixed(0) : 0}%</span>
                    </div>
                    <div className="h-2 bg-[var(--av-surface-3)] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getUtilizationColor(totals.total > 0 ? (totals.spent / totals.total) * 100 : 0)}`}
                        style={{ width: `${totals.total > 0 ? Math.min(100, (totals.spent / totals.total) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </button>

              {/* Year Budgets */}
              {isExpanded && (
                <div className="border-t border-[var(--av-border)]">
                  {yearBudgets.length === 0 ? (
                    <div className="p-8 text-center text-[var(--av-text-muted)]">
                      <Target className="mx-auto mb-2 text-[var(--av-text-disabled)]" size={40} />
                      <p>No budgets for {year}</p>
                      <button
                        onClick={() => {
                          setSelectedYear(year)
                          openCreateModal()
                        }}
                        className="mt-2 text-[var(--av-primary)] hover:underline"
                      >
                        Create one
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {yearBudgets.map(budget => {
                        const utilization = getUtilizationPercent(
                          Number(budget.spent_amount),
                          Number(budget.total_amount)
                        )
                        
                        return (
                          <div key={budget.id} className="p-4 hover:bg-gray-50 transition">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-medium">{budget.name}</h3>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(budget.status)}`}>
                                    {budget.status}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 mt-1 text-sm text-[var(--av-text-muted)]">
                                  {budget.department_name && (
                                    <span>{budget.department_name}</span>
                                  )}
                                  {budget.cost_center_name && (
                                    <span>• {budget.cost_center_name}</span>
                                  )}
                                  <span>• {budget.period_type}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <p className="text-sm text-[var(--av-text-muted)]">Budget</p>
                                  <p className="font-semibold">₦{Number(budget.total_amount).toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm text-[var(--av-text-muted)]">Spent</p>
                                  <p className="font-semibold">₦{Number(budget.spent_amount).toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm text-[var(--av-text-muted)]">Remaining</p>
                                  <p className={`font-semibold ${Number(budget.total_amount) - Number(budget.spent_amount) < 0 ? 'text-[var(--av-danger)]' : 'text-[var(--av-success)]'}`}>
                                    ₦{(Number(budget.total_amount) - Number(budget.spent_amount)).toLocaleString()}
                                  </p>
                                </div>
                                <div className="w-20">
                                  <div className="h-2 bg-[var(--av-surface-3)] rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${getUtilizationColor(utilization)} transition-all`}
                                      style={{ width: `${utilization}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-center mt-1">{utilization.toFixed(0)}%</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => toggleBudgetStatus(budget)}
                                    className={`p-2 rounded-lg ${budget.status === 'active' ? 'text-[var(--av-success)] hover:bg-[var(--av-success-soft)]' : 'text-[var(--av-text-disabled)] hover:bg-[var(--av-surface-2)]'}`}
                                    title={budget.status === 'active' ? 'Close Budget' : 'Activate Budget'}
                                  >
                                    <CheckCircle2 size={18} />
                                  </button>
                                  <button
                                    onClick={() => openEditModal(budget)}
                                    className="p-2 text-[var(--av-text-disabled)] hover:text-[var(--av-primary)] hover:bg-[var(--av-primary-soft)] rounded-lg"
                                  >
                                    <Edit2 size={18} />
                                  </button>
                                  <button
                                    onClick={() => deleteBudget(budget)}
                                    className="p-2 text-[var(--av-text-disabled)] hover:text-[var(--av-danger)] hover:bg-[var(--av-danger-soft)] rounded-lg"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {utilization >= 80 && (
                              <div className="mt-3 flex items-center gap-2 text-sm text-[var(--av-warning)]">
                                <AlertTriangle size={16} />
                                <span>
                                  {utilization >= 100 
                                    ? 'Budget exceeded! Consider reviewing expenses.'
                                    : 'Approaching budget limit. Consider reviewing expenses.'}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--av-surface-elevated)] rounded-xl w-full max-w-lg mx-4 shadow-xl">
            <div className="p-6 border-b border-[var(--av-border)]">
              <h2 className="text-xl font-semibold">
                {editingBudget ? 'Edit Budget' : 'Create Budget'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Budget Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--av-border-strong)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-[var(--av-primary)]"
                  placeholder="e.g., Marketing Budget 2025"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Fiscal Year</label>
                  <select
                    value={form.fiscal_year}
                    onChange={e => setForm({ ...form, fiscal_year: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-[var(--av-border-strong)] rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {[2024, 2025, 2026, 2027, 2028].map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Period</label>
                  <select
                    value={form.period_type}
                    onChange={e => setForm({ ...form, period_type: e.target.value as any })}
                    className="w-full px-4 py-2 border border-[var(--av-border-strong)] rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="yearly">Yearly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Total Budget Amount (₦)</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={form.total_amount}
                  onChange={e => setForm({ ...form, total_amount: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-[var(--av-border-strong)] rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Department (Optional)</label>
                  <select
                    value={form.department_id}
                    onChange={e => setForm({ ...form, department_id: e.target.value })}
                    className="w-full px-4 py-2 border border-[var(--av-border-strong)] rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Cost Center (Optional)</label>
                  <select
                    value={form.cost_center_id}
                    onChange={e => setForm({ ...form, cost_center_id: e.target.value })}
                    className="w-full px-4 py-2 border border-[var(--av-border-strong)] rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No cost center</option>
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.name} ({cc.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-2)] rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg hover:bg-[var(--av-primary-hover)] transition"
                >
                  {editingBudget ? 'Save Changes' : 'Create Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// Summary Card Component
function SummaryCard({
  title,
  value,
  icon,
  color,
  subtitle
}: {
  title: string
  value: number
  icon: React.ReactNode
  color: 'blue' | 'purple' | 'green'
  subtitle?: string
}) {
  const colorClasses = {
    blue: 'bg-[var(--av-primary-soft)] border-[var(--av-primary-soft)]',
    purple: 'bg-purple-50 border-purple-100',
    green: 'bg-[var(--av-success-soft)] border-[var(--av-success-soft)]',
  }

  return (
    <div className={`p-4 rounded-xl border ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--av-text-muted)]">{title}</p>
          <p className="text-2xl font-bold mt-1">₦{value.toLocaleString()}</p>
          {subtitle && <p className="text-sm text-[var(--av-text-muted)] mt-1">{subtitle}</p>}
        </div>
        <div className="p-3 bg-[var(--av-surface-elevated)] rounded-lg shadow-sm">
          {icon}
        </div>
      </div>
    </div>
  )
}
