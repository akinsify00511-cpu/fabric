import { useState, useEffect } from 'react'
import { 
  FileText, Plus, Search, DollarSign,
  AlertCircle, CheckCircle, Clock
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'

interface Lease {
  id: string
  property_id: string
  property?: {
    title: string
    address: string
    city: string
  }
  landlord_id: string
  landlord?: {
    name: string
    email: string
  }
  tenant_id: string
  tenant?: {
    name: string
    email: string
    phone: string
  }
  lease_type: 'residential' | 'commercial' | 'land' | 'short_term'
  start_date: string
  end_date: string
  duration_months: number
  monthly_rent: number
  rent_due_day: number
  security_deposit: number
  advance_months: number
  terms_conditions: string
  renewal_option: boolean
  status: 'draft' | 'pending_signature' | 'active' | 'renewed' | 'terminated' | 'expired'
  next_rent_due: string
  signed_at: string
  created_at: string
}

interface RentPayment {
  id: string
  lease_id: string
  amount: number
  period_start: string
  period_end: string
  due_date: string
  paid_date: string
  payment_method: string
  status: 'pending' | 'paid' | 'partial' | 'overdue' | 'waived'
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-[#9AA0A6]/10 text-[#9AA0A6]',
  pending_signature: 'bg-[var(--av-warning)]/10 text-[var(--av-warning)]',
  active: 'bg-[var(--av-success)]/10 text-[var(--av-success)]',
  renewed: 'bg-[var(--av-primary)]/10 text-[var(--av-primary)]',
  terminated: 'bg-[var(--av-danger)]/10 text-[var(--av-danger)]',
  expired: 'bg-[#9AA0A6]/10 text-[#9AA0A6]',
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[var(--av-warning)]/10 text-[var(--av-warning)]',
  paid: 'bg-[var(--av-success)]/10 text-[var(--av-success)]',
  partial: 'bg-[var(--av-primary)]/10 text-[var(--av-primary)]',
  overdue: 'bg-[var(--av-danger)]/10 text-[var(--av-danger)]',
  waived: 'bg-[#9AA0A6]/10 text-[#9AA0A6]',
}

export default function LeaseManagement() {
  
  const { staff } = useAuth()
  const [leases, setLeases] = useState<Lease[]>([])
  const [payments, setPayments] = useState<Record<string, RentPayment[]>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showLeaseModal, setShowLeaseModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'leases' | 'payments'>('leases')

  const [leaseForm, setLeaseForm] = useState({
    property_id: '',
    tenant_id: '',
    lease_type: 'residential' as Lease['lease_type'],
    start_date: '',
    end_date: '',
    monthly_rent: 0,
    rent_due_day: 1,
    security_deposit: 0,
    advance_months: 1,
    renewal_option: false,
  })

  useEffect(() => {
    fetchLeases()
  }, [staff])

  const fetchLeases = async () => {
    if (!staff?.business_id) return
    
    try {
      const { data: leasesData, error: leasesError } = await supabase
        .from('lease_agreements')
        .select(`
          *,
          property:properties(title, address, city),
          tenant:clients(name, email, phone)
        `)
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      if (leasesError) throw leasesError

      // Fetch rent payments for each lease
      const leaseIds = (leasesData || []).map(l => l.id)
      const { data: paymentsData } = await supabase
        .from('rent_payments')
        .select('*')
        .in('lease_id', leaseIds)

      const paymentsByLease: Record<string, RentPayment[]> = {}
      ;(paymentsData || []).forEach(payment => {
        if (!paymentsByLease[payment.lease_id]) {
          paymentsByLease[payment.lease_id] = []
        }
        paymentsByLease[payment.lease_id].push(payment)
      })

      setLeases(leasesData || [])
      setPayments(paymentsByLease)
    } catch (error) {
      console.error('Error fetching leases:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateLease = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staff?.business_id) return

    try {
      const { error } = await supabase
        .from('lease_agreements')
        .insert([{
          ...leaseForm,
          business_id: staff.business_id,
          status: 'draft',
          landlord_id: staff.id,
        }])

      if (error) throw error

      setShowLeaseModal(false)
      resetLeaseForm()
      fetchLeases()
    } catch (error) {
      console.error('Error creating lease:', error)
    }
  }

  const handleMarkPaid = async (payment: RentPayment) => {
    try {
      const { error } = await supabase
        .from('rent_payments')
        .update({
          status: 'paid',
          paid_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', payment.id)

      if (error) throw error
      fetchLeases()
    } catch (error) {
      console.error('Error marking payment:', error)
    }
  }

  const resetLeaseForm = () => {
    setLeaseForm({
      property_id: '',
      tenant_id: '',
      lease_type: 'residential',
      start_date: '',
      end_date: '',
      monthly_rent: 0,
      rent_due_day: 1,
      security_deposit: 0,
      advance_months: 1,
      renewal_option: false,
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const filteredLeases = leases.filter(lease => {
    const matchesSearch = 
      lease.property?.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lease.tenant?.name.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = filterStatus === 'all' || lease.status === filterStatus

    return matchesSearch && matchesStatus
  })

  // Get all payments for display
  const allPayments = Object.values(payments).flat().sort((a, b) => 
    new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
  )

  const overduePayments = allPayments.filter(p => p.status === 'overdue')
  const pendingPayments = allPayments.filter(p => p.status === 'pending')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[var(--av-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Lease Management</h1>
          <p className="text-sm text-black/60 mt-1">
            Manage lease agreements and rent payments
          </p>
        </div>
        <button
          onClick={() => setShowLeaseModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition"
        >
          <Plus size={18} />
          New Lease
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--av-primary)]/10 flex items-center justify-center">
              <FileText size={20} className="text-[var(--av-primary)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{leases.length}</p>
              <p className="text-xs text-black/60">Total Leases</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--av-success)]/10 flex items-center justify-center">
              <CheckCircle size={20} className="text-[var(--av-success)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {leases.filter(l => l.status === 'active').length}
              </p>
              <p className="text-xs text-black/60">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--av-danger)]/10 flex items-center justify-center">
              <AlertCircle size={20} className="text-[var(--av-danger)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{overduePayments.length}</p>
              <p className="text-xs text-black/60">Overdue Payments</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--av-warning)]/10 flex items-center justify-center">
              <Clock size={20} className="text-[var(--av-warning)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingPayments.length}</p>
              <p className="text-xs text-black/60">Pending Payments</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab('leases')}
          className={`px-4 py-2 rounded-xl font-medium transition ${
            activeTab === 'leases'
              ? 'bg-[var(--av-primary)] text-white'
              : 'bg-white text-black/60 hover:bg-[#F8F9FA]'
          }`}
        >
          Leases ({filteredLeases.length})
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-xl font-medium transition ${
            activeTab === 'payments'
              ? 'bg-[var(--av-primary)] text-white'
              : 'bg-white text-black/60 hover:bg-[#F8F9FA]'
          }`}
        >
          Rent Payments ({allPayments.length})
        </button>
      </div>

      {/* Filters */}
      {activeTab === 'leases' && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
              <input
                type="text"
                placeholder="Search leases..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[var(--av-primary)] transition"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="pending_signature">Pending Signature</option>
              <option value="active">Active</option>
              <option value="renewed">Renewed</option>
              <option value="terminated">Terminated</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>
      )}

      {/* Leases Table */}
      {activeTab === 'leases' && (
        filteredLeases.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No leases found"
            description={searchQuery || filterStatus !== 'all'
              ? "Try adjusting your filters"
              : "Create your first lease agreement"
            }
            action={{
              label: "Create Lease",
              onClick: () => setShowLeaseModal(true)
            }}
            gamified={!(searchQuery || filterStatus !== 'all')}
            hint={!(searchQuery || filterStatus !== 'all') ? "Leases are the heartbeat of rental income — your first one starts the rent schedule and renewal reminders." : undefined}
            tip={!(searchQuery || filterStatus !== 'all') ? "Pick the property, the tenant, and the term — Avenize tracks payments and renewals." : undefined}
          />
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-[#F8F9FA]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Property</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Tenant</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Term</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Monthly Rent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filteredLeases.map(lease => (
                  <tr key={lease.id} className="hover:bg-[#F8F9FA]/50 transition">
                    <td className="px-4 py-3">
                      <p className="font-medium text-black">{lease.property?.title || 'N/A'}</p>
                      <p className="text-sm text-black/60">{lease.property?.city}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-black">{lease.tenant?.name || 'N/A'}</p>
                      <p className="text-sm text-black/60">{lease.tenant?.phone || lease.tenant?.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm">{formatDate(lease.start_date)} - {formatDate(lease.end_date)}</p>
                      <p className="text-xs text-black/60">{lease.duration_months} months</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--av-primary)]">{formatCurrency(lease.monthly_rent)}</p>
                      <p className="text-xs text-black/60">Due day {lease.rent_due_day}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[lease.status]}`}>
                        {lease.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Payments Table */}
      {activeTab === 'payments' && (
        allPayments.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title="No payments found"
            description="Payments will appear here when leases are active"
          />
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-[#F8F9FA]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Lease</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Period</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-black/60 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {allPayments.map(payment => {
                  const lease = leases.find(l => l.id === payment.lease_id)
                  return (
                    <tr key={payment.id} className="hover:bg-[#F8F9FA]/50 transition">
                      <td className="px-4 py-3">
                        <p className="font-medium text-black">{lease?.property?.title || 'N/A'}</p>
                        <p className="text-sm text-black/60">{lease?.tenant?.name}</p>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatDate(payment.period_start)} - {formatDate(payment.period_end)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatDate(payment.due_date)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--av-primary)]">{formatCurrency(payment.amount)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${PAYMENT_STATUS_COLORS[payment.status]}`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {payment.status === 'pending' || payment.status === 'overdue' ? (
                          <button
                            onClick={() => handleMarkPaid(payment)}
                            className="px-3 py-1 bg-[var(--av-success)] text-white rounded-lg text-xs font-medium hover:bg-[#2D8F47] transition"
                          >
                            Mark Paid
                          </button>
                        ) : (
                          <span className="text-xs text-black/60">
                            {payment.paid_date && `Paid ${formatDate(payment.paid_date)}`}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Create Lease Modal */}
      <Modal
        isOpen={showLeaseModal}
        onClose={() => {
          setShowLeaseModal(false)
          resetLeaseForm()
        }}
        title="Create New Lease"
        size="lg"
      >
        <form onSubmit={handleCreateLease} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Property *</label>
              <select
                required
                value={leaseForm.property_id}
                onChange={(e) => setLeaseForm({ ...leaseForm, property_id: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              >
                <option value="">Select Property</option>
                <option value="demo-property-1">3 Bedroom Flat - Victoria Island</option>
                <option value="demo-property-2">Office Space - Lekki</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Tenant *</label>
              <select
                required
                value={leaseForm.tenant_id}
                onChange={(e) => setLeaseForm({ ...leaseForm, tenant_id: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              >
                <option value="">Select Tenant</option>
                <option value="demo-tenant-1">John Adeyemi</option>
                <option value="demo-tenant-2">Tech Startup Ltd</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Lease Type</label>
              <select
                value={leaseForm.lease_type}
                onChange={(e) => setLeaseForm({ ...leaseForm, lease_type: e.target.value as Lease['lease_type'] })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="land">Land</option>
                <option value="short_term">Short Term</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Monthly Rent (NGN) *</label>
              <input
                type="number"
                required
                min="0"
                value={leaseForm.monthly_rent}
                onChange={(e) => setLeaseForm({ ...leaseForm, monthly_rent: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
                placeholder="e.g., 500000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={leaseForm.start_date}
                onChange={(e) => setLeaseForm({ ...leaseForm, start_date: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">End Date *</label>
              <input
                type="date"
                required
                value={leaseForm.end_date}
                onChange={(e) => setLeaseForm({ ...leaseForm, end_date: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Rent Due Day</label>
              <input
                type="number"
                min="1"
                max="28"
                value={leaseForm.rent_due_day}
                onChange={(e) => setLeaseForm({ ...leaseForm, rent_due_day: parseInt(e.target.value) || 1 })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Security Deposit</label>
              <input
                type="number"
                min="0"
                value={leaseForm.security_deposit}
                onChange={(e) => setLeaseForm({ ...leaseForm, security_deposit: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
                placeholder="e.g., 1000000"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setShowLeaseModal(false)
                resetLeaseForm()
              }}
              className="flex-1 px-4 py-2 border border-black/10 rounded-xl font-medium hover:bg-black/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition"
            >
              Create Lease
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
