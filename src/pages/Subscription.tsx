/**
 * Subscription / Billing Page
 * Shows current plan, subscription details, payment history, invoices
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CreditCard,
  Calendar,
  Clock,
  Check,
  X,
  Download,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Star,
  Zap,
  Users,
  Shield,
  ExternalLink,
  Loader2,
  ArrowUpCircle,
} from 'lucide-react'
import { useSubscriptionData } from '../lib/useSubscriptionData'
import { useAuth } from '../lib/AuthContext'

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  active: { color: 'text-green-600', bg: 'bg-green-100', label: 'Active' },
  trialing: { color: 'text-blue-600', bg: 'bg-blue-100', label: 'Trial' },
  cancelled: { color: 'text-red-600', bg: 'bg-red-100', label: 'Cancelled' },
  expired: { color: 'text-red-600', bg: 'bg-red-100', label: 'Expired' },
  past_due: { color: 'text-amber-600', bg: 'bg-amber-100', label: 'Past Due' },
  paused: { color: 'text-gray-600', bg: 'bg-gray-100', label: 'Paused' },
  successful: { color: 'text-green-600', bg: 'bg-green-100', label: 'Paid' },
  pending: { color: 'text-amber-600', bg: 'bg-amber-100', label: 'Pending' },
  failed: { color: 'text-red-600', bg: 'bg-red-100', label: 'Failed' },
  refunded: { color: 'text-purple-600', bg: 'bg-purple-100', label: 'Refunded' },
  paid: { color: 'text-green-600', bg: 'bg-green-100', label: 'Paid' },
  void: { color: 'text-gray-600', bg: 'bg-gray-100', label: 'Void' },
}

export default function Subscription() {
  const { staff } = useAuth()
  const {
    subscription,
    payments,
    invoices,
    availablePlans,
    loading,
    error,
    refresh,
    cancelSubscription,
    createCheckout,
  } = useSubscriptionData()

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelMessage, setCancelMessage] = useState('')
  const [processingPlan, setProcessingPlan] = useState<string | null>(null)

  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'

  const handleCancel = async () => {
    setCancelling(true)
    const result = await cancelSubscription(true)
    setCancelMessage(result.message)
    setTimeout(() => {
      setShowCancelModal(false)
      setCancelMessage('')
      setCancelling(false)
    }, 2000)
  }

  const handleUpgrade = async (planCode: string) => {
    setProcessingPlan(planCode)
    const result = await createCheckout(planCode, billingCycle)
    if (result?.checkout_url) {
      window.location.href = result.checkout_url
    } else {
      // Fallback: open pricing page
      window.location.href = '/upgrade'
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatCurrency = (amount: number, currency = 'NGN') => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Subscription & Billing</h1>
            <p className="text-sm text-black">Manage your plan and payment history</p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="p-2 hover:bg-black/10 rounded-lg transition"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5 text-black" />
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Current Plan Card */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden mb-6">
        <div className="p-6 border-b border-black/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Current Plan</h2>
            {subscription?.status && (
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  STATUS_CONFIG[subscription.status]?.bg || 'bg-gray-100'
                } ${STATUS_CONFIG[subscription.status]?.color || 'text-gray-600'}`}
              >
                {STATUS_CONFIG[subscription.status]?.label || subscription.status}
              </span>
            )}
          </div>

          {subscription ? (
            <div className="space-y-4">
              {/* Plan Info */}
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-black">
                  {subscription.plan_name || 'Free'}
                </span>
                <span className="text-black text-lg">
                  {formatCurrency(subscription.amount)}/
                  {subscription.billing_cycle === 'yearly' ? 'year' : 'month'}
                </span>
              </div>

              {/* Key Dates */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-black/[0.06]">
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-black mt-0.5" />
                  <div>
                    <p className="text-xs text-black mb-1">Start Date</p>
                    <p className="font-medium">{formatDate(subscription.start_date)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-black mt-0.5" />
                  <div>
                    <p className="text-xs text-black mb-1">
                      {subscription.status === 'cancelled' ? 'Cancelled On' : 'Next Billing'}
                    </p>
                    <p className="font-medium">
                      {subscription.cancelled_at
                        ? formatDate(subscription.cancelled_at)
                        : subscription.next_billing_date
                        ? formatDate(subscription.next_billing_date)
                        : '—'}
                    </p>
                    {subscription.days_until_expiry !== null &&
                      subscription.days_until_expiry > 0 &&
                      subscription.status !== 'cancelled' && (
                        <p className="text-xs text-black mt-1">
                          {subscription.days_until_expiry} days remaining
                        </p>
                      )}
                  </div>
                </div>
              </div>

              {/* Seats */}
              <div className="flex items-center gap-3 pt-4 border-t border-black/[0.06]">
                <Users className="w-5 h-5 text-black" />
                <div>
                  <p className="text-sm text-black">Seats included: {subscription.seats_included}</p>
                </div>
              </div>

              {/* Cancel Button */}
              {isAdmin && subscription.status === 'active' && (
                <div className="pt-4 border-t border-black/[0.06]">
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Cancel subscription
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Free Plan</h3>
              <p className="text-sm text-black mb-4 max-w-sm mx-auto">
                You're on the free plan with basic features. Upgrade to unlock powerful tools for your business.
              </p>
              <Link
                to="/upgrade"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-xl hover:shadow-lg transition"
              >
                <ArrowUpCircle className="w-5 h-5" />
                Upgrade Now
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Upgrade Plans */}
      {(!subscription || subscription.plan === 'free') && availablePlans.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden mb-6">
          <div className="p-6 border-b border-black/[0.06]">
            <h2 className="font-semibold text-lg mb-4">Available Plans</h2>

            {/* Billing Toggle */}
            <div className="flex items-center gap-3 mb-6 p-1 bg-black/[0.04] rounded-xl max-w-md">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  billingCycle === 'monthly' ? 'bg-white shadow-sm' : ''
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  billingCycle === 'yearly' ? 'bg-white shadow-sm' : ''
                }`}
              >
                Yearly <span className="text-green-600 text-xs">Save ~17%</span>
              </button>
            </div>

            {/* Plans Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availablePlans.map((plan) => (
                <div
                  key={plan.code}
                  className="border border-black/[0.08] rounded-xl p-4 hover:border-indigo-200 transition"
                >
                  <h3 className="font-semibold text-lg mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-2xl font-bold">
                      {formatCurrency(
                        billingCycle === 'monthly' ? plan.monthly_price : plan.yearly_monthly_equivalent
                      )}
                    </span>
                    <span className="text-black">/mo</span>
                  </div>
                  {billingCycle === 'yearly' && (
                    <p className="text-xs text-black mb-3">
                      Billed as {formatCurrency(plan.yearly_price)}/year (Save {plan.savings_percent}%)
                    </p>
                  )}
                  <button
                    onClick={() => handleUpgrade(plan.code)}
                    disabled={processingPlan === plan.code}
                    className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                  >
                    {processingPlan === plan.code ? (
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    ) : (
                      'Subscribe'
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Payment History */}
      {payments.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden mb-6">
          <div className="p-6 border-b border-black/[0.06]">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Payment History</h2>
              <span className="text-sm text-black">{payments.length} transactions</span>
            </div>
          </div>
          <div className="divide-y divide-black/[0.06]">
            {payments.slice(0, 5).map((payment) => (
              <div key={payment.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      payment.status === 'successful'
                        ? 'bg-green-100'
                        : payment.status === 'pending'
                        ? 'bg-amber-100'
                        : 'bg-red-100'
                    }`}
                  >
                    {payment.status === 'successful' ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : payment.status === 'pending' ? (
                      <Clock className="w-5 h-5 text-amber-600" />
                    ) : (
                      <X className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{payment.description}</p>
                    <p className="text-sm text-black">
                      {formatDate(payment.paid_at)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">
                    {formatCurrency(payment.amount, payment.currency)}
                  </p>
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      STATUS_CONFIG[payment.status]?.bg || 'bg-gray-100'
                    } ${STATUS_CONFIG[payment.status]?.color || 'text-gray-600'}`}
                  >
                    {STATUS_CONFIG[payment.status]?.label || payment.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {payments.length > 5 && (
            <div className="p-4 text-center border-t border-black/[0.06]">
              <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                View all {payments.length} payments
              </button>
            </div>
          )}
        </div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden mb-6">
          <div className="p-6 border-b border-black/[0.06]">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Invoices</h2>
              <span className="text-sm text-black">{invoices.length} invoices</span>
            </div>
          </div>
          <div className="divide-y divide-black/[0.06]">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-medium">{invoice.invoice_number}</p>
                    <p className="text-sm text-black">
                      Due: {formatDate(invoice.due_date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-medium">
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </p>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        STATUS_CONFIG[invoice.status]?.bg || 'bg-gray-100'
                      } ${STATUS_CONFIG[invoice.status]?.color || 'text-gray-600'}`}
                    >
                      {STATUS_CONFIG[invoice.status]?.label || invoice.status}
                    </span>
                  </div>
                  {invoice.pdf_url && (
                    <a
                      href={invoice.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-black/10 rounded-lg transition"
                      title="Download Invoice"
                    >
                      <Download className="w-5 h-5 text-black" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manage Payment Methods Link */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
        <Link
          to="/app/payments"
          className="flex items-center justify-between p-2 hover:bg-black/[0.02] rounded-lg transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium">Payment Methods</p>
              <p className="text-sm text-black">Manage your saved cards and bank accounts</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-black" />
        </Link>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="text-lg font-bold">Cancel Subscription</h2>
            </div>
            <div className="p-6">
              {cancelMessage ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-lg font-medium">{cancelMessage}</p>
                </div>
              ) : (
                <>
                  <p className="text-black mb-6">
                    Are you sure you want to cancel your subscription? You'll lose access to premium
                    features at the end of your billing period.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCancelModal(false)}
                      className="flex-1 px-4 py-3 border border-black/10 rounded-xl font-medium hover:bg-black/[0.02] transition"
                    >
                      Keep Subscription
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition disabled:opacity-50"
                    >
                      {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
