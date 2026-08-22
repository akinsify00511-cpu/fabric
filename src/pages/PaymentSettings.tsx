import { useState, useEffect } from 'react'
import { CreditCard, DollarSign, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface Payment {
  id: string
  amount: number
  currency: string
  provider: string
  status: string
  reference: string
  paid_at: string
  customer?: any
  invoice?: any
}

// No external payment providers in this deployment: payments are recorded
// manually (Finance records them against invoices). This page is the
// read-only ledger of what has come in.
export default function PaymentSettingsPage() {
  const { staff } = useAuth()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [staff?.business_id])

  async function loadData() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      const { data: pmt } = await supabase
        .from('payments')
        .select('*, customer:contacts(*), invoice:invoices(*)')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })
        .limit(50)

      setPayments(pmt || [])
    } catch (e) {
      console.error('Failed to load:', e)
    } finally {
      setLoading(false)
    }
  }

  const statusConfig: Record<string, { bg: string; text: string }> = {
    successful: { bg: 'bg-green-100', text: 'text-[var(--av-success)]' },
    pending: { bg: 'bg-amber-100', text: 'text-[var(--av-warning)]' },
    failed: { bg: 'bg-red-100', text: 'text-[var(--av-danger)]' },
    processing: { bg: 'bg-blue-100', text: 'text-[var(--av-primary)]' },
  }

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <CreditCard size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Payments</h1>
            <p className="text-sm text-black">Money received from customers</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Received"
          value={`₦${payments.filter(p => p.status === 'successful').reduce((sum, p) => sum + p.amount, 0).toLocaleString()}`}
          icon={<DollarSign size={18} />}
          color="bg-[var(--av-success-soft)]0"
        />
        <StatCard
          title="Successful"
          value={payments.filter(p => p.status === 'successful').length.toString()}
          icon={<CheckCircle size={18} />}
          color="bg-emerald-500"
        />
        <StatCard
          title="Pending"
          value={payments.filter(p => p.status === 'pending').length.toString()}
          icon={<RefreshCw size={18} />}
          color="bg-[var(--av-warning-soft)]0"
        />
        <StatCard
          title="Failed"
          value={payments.filter(p => p.status === 'failed').length.toString()}
          icon={<XCircle size={18} />}
          color="bg-[var(--av-danger-soft)]0"
        />
      </div>

      {/* How payments get here */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-6">
        <p className="text-sm text-black">
          Payments appear here when your team records them against invoices in Finance.
          Share your invoice with the customer, they pay by bank transfer, and you mark it paid.
        </p>
      </div>

      {/* Recent Payments */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        <div className="p-4 border-b border-black/[0.06]">
          <h2 className="font-semibold">Recent Payments</h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-black">
            <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
            Loading...
          </div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center text-black">
            <DollarSign size={48} className="mx-auto mb-4 text-black/50" />
            <p className="font-medium mb-2">No payments yet</p>
            <p className="text-sm">Record your first payment against an invoice in Finance.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-black/[0.02]">
                  <th className="p-3 text-left text-xs font-medium text-black">Reference</th>
                  <th className="p-3 text-left text-xs font-medium text-black">Amount</th>
                  <th className="p-3 text-left text-xs font-medium text-black">Method</th>
                  <th className="p-3 text-left text-xs font-medium text-black">Status</th>
                  <th className="p-3 text-left text-xs font-medium text-black">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {payments.map(payment => {
                  const status = statusConfig[payment.status] || statusConfig.pending
                  return (
                    <tr key={payment.id} className="hover:bg-black/10">
                      <td className="p-3 text-sm font-mono">{payment.reference}</td>
                      <td className="p-3 text-sm font-medium">
                        {payment.currency} {payment.amount.toLocaleString()}
                      </td>
                      <td className="p-3 text-sm">
                        <span className="capitalize">{payment.provider === 'paystack' || payment.provider === 'flutterwave' ? 'online' : payment.provider}</span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${status.bg} ${status.text}`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-black">
                        {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center text-white mb-3`}>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-black">{title}</div>
    </div>
  )
}
