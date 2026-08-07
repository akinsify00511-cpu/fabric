// Payroll Page
// Payroll runs, salary calculations, and payment management

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { hasPermission } from '../lib/permissions'
import {
  Wallet, Plus, Search, Filter, ChevronDown, ChevronRight,
  Calendar, Users, FileText, CheckCircle2, Clock, AlertCircle,
  Edit2, Trash2, Eye, Download, Send, X
} from 'lucide-react'

interface PayrollRun {
  id: string
  business_id: string
  period_start: string
  period_end: string
  status: 'draft' | 'calculated' | 'approved' | 'paid'
  total_gross: number
  total_deductions: number
  total_net: number
  approved_by?: string
  paid_at?: string
  created_at: string
  payroll_items?: PayrollItem[]
}

interface PayrollItem {
  id: string
  payroll_run_id: string
  staff_id: string
  basic_salary: number
  allowances: number
  overtime: number
  bonuses: number
  gross_salary?: number
  pension: number
  paye: number
  nhf: number
  nsitf: number
  other_deductions: number
  total_deductions?: number
  net_salary?: number
  bank_name?: string
  account_number?: string
  created_at: string
  staff_name?: string
}

interface Staff {
  id: string
  full_name: string
  email: string
}

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  calculated: 'bg-blue-100 text-blue-700',
  approved: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
}

const STATUS_LABELS = {
  draft: 'Draft',
  calculated: 'Calculated',
  approved: 'Approved',
  paid: 'Paid',
}

export default function PayrollPage() {
  const { staff } = useAuth()
  const { showToast } = useToast()

  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([])
  const [allStaff, setAllStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'runs' | 'overview'>('runs')
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null)
  const [selectedItems, setSelectedItems] = useState<PayrollItem[]>([])

  // Form state
  const [formData, setFormData] = useState({
    period_start: '',
    period_end: '',
  })

  const canManage = staff ? hasPermission(staff.role || 'staff', 'payroll', 'manage') : false
  const canApprove = staff ? hasPermission(staff.role || 'staff', 'payroll', 'approve') : false

  useEffect(() => {
    if (staff?.business_id) {
      fetchPayrollRuns()
      fetchStaff()
    }
  }, [staff?.business_id])

  async function fetchPayrollRuns() {
    if (!staff?.business_id) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('payroll_runs')
        .select(`
          *,
          payroll_items(count)
        `)
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setPayrollRuns(data || [])
    } catch (error) {
      console.error('Error fetching payroll runs:', error)
      showToast('Failed to load payroll runs', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function fetchStaff() {
    if (!staff?.business_id) return

    try {
      const { data } = await supabase
        .from('staff')
        .select('id, full_name, email')
        .eq('business_id', staff.business_id)
        .eq('is_active', true)
        .order('full_name')

      if (data) setAllStaff(data)
    } catch (error) {
      console.error('Error fetching staff:', error)
    }
  }

  async function fetchPayrollItems(runId: string) {
    try {
      const { data, error } = await supabase
        .from('payroll_items')
        .select(`
          *,
          staff:staff_id(full_name)
        `)
        .eq('payroll_run_id', runId)

      if (error) throw error

      const itemsWithNames = (data || []).map(item => ({
        ...item,
        staff_name: item.staff?.full_name,
      }))

      setSelectedItems(itemsWithNames)
    } catch (error) {
      console.error('Error fetching payroll items:', error)
      showToast('Failed to load payroll details', 'error')
    }
  }

  // Stats
  const stats = useMemo(() => {
    const totalRuns = payrollRuns.length
    const pendingRuns = payrollRuns.filter(r => r.status === 'draft' || r.status === 'calculated').length
    const paidRuns = payrollRuns.filter(r => r.status === 'paid').length
    const totalPaid = payrollRuns
      .filter(r => r.status === 'paid')
      .reduce((sum, r) => sum + (r.total_net || 0), 0)

    return { totalRuns, pendingRuns, paidRuns, totalPaid }
  }, [payrollRuns])

  function openModal(run?: PayrollRun) {
    if (run) {
      setFormData({
        period_start: run.period_start,
        period_end: run.period_end,
      })
    } else {
      // Default to current month
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      setFormData({
        period_start: start.toISOString().split('T')[0],
        period_end: end.toISOString().split('T')[0],
      })
    }
    setShowModal(true)
  }

  async function viewRunDetails(run: PayrollRun) {
    setSelectedRun(run)
    await fetchPayrollItems(run.id)
    setShowDetailModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id) return

    try {
      const { error } = await supabase
        .from('payroll_runs')
        .insert({
          business_id: staff.business_id,
          period_start: formData.period_start,
          period_end: formData.period_end,
          status: 'draft',
        })

      if (error) throw error
      showToast('Payroll run created', 'success')
      setShowModal(false)
      fetchPayrollRuns()
    } catch (error) {
      console.error('Error creating payroll run:', error)
      showToast('Failed to create payroll run', 'error')
    }
  }

  async function updateRunStatus(run: PayrollRun, newStatus: string) {
    try {
      const updateData: any = { status: newStatus }

      if (newStatus === 'approved') {
        updateData.approved_by = staff?.id
      }

      if (newStatus === 'paid') {
        updateData.paid_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('payroll_runs')
        .update(updateData)
        .eq('id', run.id)

      if (error) throw error
      showToast(`Payroll ${newStatus}`, 'success')
      fetchPayrollRuns()
    } catch (error) {
      console.error('Error updating payroll run:', error)
      showToast('Failed to update payroll run', 'error')
    }
  }

  async function deleteRun(id: string) {
    if (!confirm('Are you sure you want to delete this payroll run?')) return

    try {
      const { error } = await supabase
        .from('payroll_runs')
        .delete()
        .eq('id', id)

      if (error) throw error
      showToast('Payroll run deleted', 'success')
      fetchPayrollRuns()
    } catch (error) {
      console.error('Error deleting payroll run:', error)
      showToast('Failed to delete payroll run', 'error')
    }
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount)
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Payroll</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage payroll runs and salary payments
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => openModal()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Payroll Run
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.totalRuns}</p>
                <p className="text-sm text-gray-500">Total Runs</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.pendingRuns}</p>
                <p className="text-sm text-gray-500">Pending</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.paidRuns}</p>
                <p className="text-sm text-gray-500">Paid</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Wallet className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalPaid)}</p>
                <p className="text-sm text-gray-500">Total Paid</p>
              </div>
            </div>
          </div>
        </div>

        {/* Payroll Runs List */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search payroll runs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gross</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deductions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                    </td>
                  </tr>
                ) : payrollRuns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No payroll runs found
                    </td>
                  </tr>
                ) : (
                  payrollRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {formatDate(run.period_start)} - {formatDate(run.period_end)}
                            </p>
                            <p className="text-xs text-gray-500">
                              {(run as any).payroll_items?.[0]?.count || 0} employees
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[run.status]}`}>
                          {STATUS_LABELS[run.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {formatCurrency(run.total_gross || 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600">
                        -{formatCurrency(run.total_deductions || 0)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {formatCurrency(run.total_net || 0)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => viewRunDetails(run)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {run.status === 'draft' && canManage && (
                            <button
                              onClick={() => updateRunStatus(run, 'calculated')}
                              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                              title="Calculate"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          )}
                          {run.status === 'calculated' && canApprove && (
                            <button
                              onClick={() => updateRunStatus(run, 'approved')}
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                              title="Approve"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {run.status === 'approved' && canManage && (
                            <button
                              onClick={() => updateRunStatus(run, 'paid')}
                              className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded"
                              title="Mark as Paid"
                            >
                              <Wallet className="w-4 h-4" />
                            </button>
                          )}
                          {run.status === 'draft' && canManage && (
                            <button
                              onClick={() => deleteRun(run.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Payroll Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">New Payroll Run</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Period Start</label>
                <input
                  type="date"
                  required
                  value={formData.period_start}
                  onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Period End</label>
                <input
                  type="date"
                  required
                  value={formData.period_end}
                  onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  Create Run
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payroll Detail Modal */}
      {showDetailModal && selectedRun && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Payroll Details</h2>
                <p className="text-sm text-gray-500">
                  {formatDate(selectedRun.period_start)} - {formatDate(selectedRun.period_end)}
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 uppercase">Gross Pay</p>
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(selectedRun.total_gross || 0)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 uppercase">Deductions</p>
                  <p className="text-xl font-bold text-red-600">-{formatCurrency(selectedRun.total_deductions || 0)}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 uppercase">Net Pay</p>
                  <p className="text-xl font-bold text-green-600">{formatCurrency(selectedRun.total_net || 0)}</p>
                </div>
              </div>

              {/* Items Table */}
              <h3 className="text-sm font-medium text-gray-700 mb-3">Employee Breakdown</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Basic</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Allowances</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Gross</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Deductions</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                          No employees in this payroll run
                        </td>
                      </tr>
                    ) : (
                      selectedItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {item.staff_name || 'Unknown'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right">
                            {formatCurrency(item.basic_salary)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right">
                            {formatCurrency(item.allowances + item.overtime + item.bonuses)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                            {formatCurrency(item.gross_salary || 0)}
                          </td>
                          <td className="px-4 py-3 text-sm text-red-600 text-right">
                            -{formatCurrency(item.total_deductions || 0)}
                          </td>
                          <td className="px-4 py-3 text-sm text-green-600 text-right font-medium">
                            {formatCurrency(item.net_salary || 0)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
