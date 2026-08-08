import { useState, useEffect } from 'react'
import {
  CreditCard, DollarSign, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, Settings, Eye, EyeOff, Key, Globe, Zap,
  Plus, Trash2, Edit2, Save, TestTube
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface PaymentGateway {
  id: string
  provider: string
  is_active: boolean
  is_test_mode: boolean
  status: string
  supported_currencies: string[]
}

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

export default function PaymentSettingsPage() {
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'
  const [gateways, setGateways] = useState<PaymentGateway[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [staff?.business_id])

  async function loadData() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      const { data: gw } = await supabase
        .from('payment_gateways')
        .select('*')
        .eq('business_id', staff.business_id)

      setGateways(gw || [])

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

  const providerLogos: Record<string, string> = {
    paystack: 'https://paystack.com/favicon.ico',
    flutterwave: 'https://flutterwave.com/favicon.ico',
    stripe: 'https://stripe.com/favicon.ico',
  }

  const providerNames: Record<string, string> = {
    paystack: 'Paystack',
    flutterwave: 'Flutterwave',
    stripe: 'Stripe',
  }

  const statusConfig: Record<string, { bg: string; text: string }> = {
    successful: { bg: 'bg-green-100', text: 'text-green-600' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-600' },
    failed: { bg: 'bg-red-100', text: 'text-red-600' },
    processing: { bg: 'bg-blue-100', text: 'text-blue-600' },
  }

  const availableProviders = [
    {
      id: 'paystack',
      name: 'Paystack',
      description: 'Accept payments from Nigeria and Africa',
      currencies: ['NGN', 'USD', 'GHS', 'ZAR'],
      logo: providerLogos.paystack,
      docs: 'https://paystack.com/docs',
    },
    {
      id: 'flutterwave',
      name: 'Flutterwave',
      description: 'Pan-African payment gateway',
      currencies: ['NGN', 'USD', 'EUR', 'GBP', 'KES', 'GHS', 'ZAR'],
      logo: providerLogos.flutterwave,
      docs: 'https://developer.flutterwave.com',
    },
    {
      id: 'stripe',
      name: 'Stripe',
      description: 'Global payment processing',
      currencies: ['USD', 'EUR', 'GBP', 'NGN', 'KES', 'ZAR'],
      logo: providerLogos.stripe,
      docs: 'https://stripe.com/docs',
    },
  ]

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <CreditCard size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Payment Settings</h1>
            <p className="text-sm text-black">Configure payment gateways</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard 
          title="Total Received" 
          value={`₦${payments.filter(p => p.status === 'successful').reduce((sum, p) => sum + p.amount, 0).toLocaleString()}`}
          icon={<DollarSign size={18} />} 
          color="bg-green-500" 
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
          color="bg-amber-500" 
        />
        <StatCard 
          title="Failed" 
          value={payments.filter(p => p.status === 'failed').length.toString()}
          icon={<XCircle size={18} />} 
          color="bg-red-500" 
        />
      </div>

      {/* Payment Gateways */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden mb-6">
        <div className="p-4 border-b border-black/[0.06] flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Payment Gateways</h2>
            <p className="text-sm text-black">Connect your payment providers</p>
          </div>
          <button
            onClick={() => setShowModal('add')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm"
          >
            <Plus size={16} />
            Add Gateway
          </button>
        </div>

        <div className="divide-y divide-black/[0.06]">
          {gateways.length === 0 ? (
            <div className="p-12 text-center text-black">
              <CreditCard size={48} className="mx-auto mb-4 text-black/50" />
              <p className="font-medium mb-2">No payment gateways configured</p>
              <p className="text-sm">Add a payment gateway to start accepting payments</p>
            </div>
          ) : (
            gateways.map(gw => (
              <div key={gw.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <img src={providerLogos[gw.provider]} alt={providerNames[gw.provider]} className="w-10 h-10 rounded" />
                    <div>
                      <div className="font-medium">{providerNames[gw.provider] || gw.provider}</div>
                      <div className="flex items-center gap-2 text-sm text-black">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          gw.is_active ? 'bg-green-100 text-green-600' : 'bg-white text-black'
                        }`}>
                          {gw.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {gw.is_test_mode && (
                          <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-600">
                            Test Mode
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-black">
                      {gw.supported_currencies?.join(', ') || 'NGN'}
                    </span>
                    <button className="p-2 hover:bg-black/10 rounded-lg">
                      <Settings size={16} className="text-black" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
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
            <p>No payments yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-black/[0.02]">
                  <th className="p-3 text-left text-xs font-medium text-black">Reference</th>
                  <th className="p-3 text-left text-xs font-medium text-black">Amount</th>
                  <th className="p-3 text-left text-xs font-medium text-black">Provider</th>
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
                        <span className="capitalize">{payment.provider}</span>
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

      {/* Add Gateway Modal */}
      {showModal === 'add' && (
        <AddGatewayModal
          availableProviders={availableProviders}
          existingGateways={gateways.map(g => g.provider)}
          onClose={() => setShowModal(null)}
          onSuccess={() => { setShowModal(null); loadData() }}
        />
      )}
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

function AddGatewayModal({ 
  availableProviders, existingGateways, onClose, onSuccess 
}: { 
  availableProviders: any[]
  existingGateways: string[]
  onClose: () => void
  onSuccess: () => void 
}) {
  const { staff } = useAuth()
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState({
    public_key: '',
    secret_key: '',
    test_public_key: '',
    test_secret_key: '',
    is_test_mode: true,
    currencies: ['NGN'],
  })
  const [saving, setSaving] = useState(false)

  const provider = availableProviders.find(p => p.id === selected)

  async function handleSave() {
    if (!staff?.business_id || !selected) return
    setSaving(true)

    try {
      await supabase.from('payment_gateways').insert({
        business_id: staff.business_id,
        provider: selected,
        public_key: form.is_test_mode ? form.test_public_key : form.public_key,
        secret_key_encrypted: form.is_test_mode ? form.test_secret_key : form.secret_key,
        is_test_mode: form.is_test_mode,
        supported_currencies: form.currencies,
        is_active: false,
      })
      onSuccess()
    } catch (e) {
      console.error('Failed to save:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-black/[0.06]">
          <h2 className="text-lg font-bold">Add Payment Gateway</h2>
        </div>

        {!selected ? (
          <div className="p-6 space-y-4">
            {availableProviders.filter(p => !existingGateways.includes(p.id)).map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className="w-full p-4 rounded-xl border border-black/10 hover:border-[var(--av-primary, #4285F4)] text-left flex items-center gap-4"
              >
                <img src={p.logo} alt={p.name} className="w-12 h-12 rounded" />
                <div className="flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-black">{p.description}</div>
                  <div className="text-xs text-black mt-1">
                    Supports: {p.currencies.join(', ')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 p-3 bg-black/[0.02] rounded-xl">
              <img src={provider?.logo} alt={provider?.name} className="w-8 h-8 rounded" />
              <div className="font-medium">{provider?.name}</div>
            </div>

            <div>
              <label className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  checked={form.is_test_mode}
                  onChange={e => setForm({ ...form, is_test_mode: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm">Use test mode</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Test Public Key</label>
              <input
                type="text"
                value={form.test_public_key}
                onChange={e => setForm({ ...form, test_public_key: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10 font-mono text-sm"
                placeholder="pk_test_..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Test Secret Key</label>
              <input
                type="password"
                value={form.test_secret_key}
                onChange={e => setForm({ ...form, test_secret_key: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10 font-mono text-sm"
                placeholder="sk_test_..."
              />
            </div>

            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              <strong>Note:</strong> Get your API keys from {provider?.name} dashboard. Test keys start with <code>pk_test_</code> and <code>sk_test_</code>.
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={() => setSelected(null)} className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium">
                Back
              </button>
              <button 
                onClick={handleSave} 
                disabled={saving}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--av-primary, #4285F4)] text-white font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Gateway'}
              </button>
            </div>
          </div>
        )}

        <div className="p-6 border-t border-black/[0.06]">
          <button onClick={onClose} className="w-full px-4 py-3 rounded-xl border border-black/10 font-medium">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
