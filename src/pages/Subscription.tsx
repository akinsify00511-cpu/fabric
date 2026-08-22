/**
 * Subscription / Billing Page
 * Shows current plan, subscription details, payment history, invoices
 */

import { useState, useEffect } from 'react'
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
  Sparkles,
} from 'lucide-react'
import { useSubscriptionData } from '../lib/useSubscriptionData'
import { useAuth } from '../lib/AuthContext'
import { fetchPlanRecommendation, type PlanRecommendation } from '../lib/businessOS'

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  active: { color: 'text-[var(--av-success)]', bg: 'bg-[var(--av-success-soft)]', label: 'Active' },
  trialing: { color: 'text-[var(--av-primary)]', bg: 'bg-[var(--av-primary-soft)]', label: 'Trial' },
  cancelled: { color: 'text-[var(--av-danger)]', bg: 'bg-[var(--av-danger-soft)]', label: 'Cancelled' },
  expired: { color: 'text-[var(--av-danger)]', bg: 'bg-[var(--av-danger-soft)]', label: 'Expired' },
  past_due: { color: 'text-[var(--av-warning)]', bg: 'bg-amber-100', label: 'Past Due' },
  paused: { color: 'text-[var(--av-text-muted)]', bg: 'bg-[var(--av-surface-2)]', label: 'Paused' },
  successful: { color: 'text-[var(--av-success)]', bg: 'bg-[var(--av-success-soft)]', label: 'Paid' },
  pending: { color: 'text-[var(--av-warning)]', bg: 'bg-amber-100', label: 'Pending' },
  failed: { color: 'text-[var(--av-danger)]', bg: 'bg-[var(--av-danger-soft)]', label: 'Failed' },
  refunded: { color: 'text-purple-600', bg: 'bg-purple-100', label: 'Refunded' },
  paid: { color: 'text-[var(--av-success)]', bg: 'bg-[var(--av-success-soft)]', label: 'Paid' },
  void: { color: 'text-[var(--av-text-muted)]', bg: 'bg-[var(--av-surface-2)]', label: 'Void' },
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
  } = useSubscriptionData()

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelMessage, setCancelMessage] = useState('')
  const [processingPlan, setProcessingPlan] = useState<string | null>(null)
  const [recommendation, setRecommendation] = useState<PlanRecommendation | null>(null)

  // P0 #15: AI plan recommendation — deterministic, evidence-based. Only shown
  // to free/trial users (paid users already chose a plan). Best-effort: stays
  // null if the RPC isn't deployed (degrades gracefully, §24).
  useEffect(() => {
    if (!staff?.business_id) return
    if (subscription && subscription.plan && subscription.plan !== 'free') return
    fetchPlanRecommendation(staff.business_id).then(setRecommendation)
  }, [staff?.business_id, subscription?.plan])

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
    window.location.href = `/upgrade?plan=${encodeURIComponent(planCode)}&billing=${billingCycle}`
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
        <Loader2 className="w-8 h-8 animate-spin text-[#4285F4]" />
      </div>
    )
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br to-[#4285F4] to-[#8B5CF6] flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--av-text)]">Subscription & Billing</h1>
            <p className="text-sm text-[var(--av-text)]">Manage your plan and payment history</p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="p-2 hover:bg-[var(--av-surface-3)] rounded-lg transition"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5 text-[var(--av-text)]" />
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-[var(--av-danger-soft)] border border-[var(--av-danger-soft)] rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--av-danger)] shrink-0" />
          <p className="text-sm text-[var(--av-danger)]">{error}</p>
        </div>
      )}

      {/* Current Plan Card */}
      <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] overflow-hidden mb-6">
        <div className="p-6 border-b border-[var(--av-border-strong)]/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Current Plan</h2>
            {subscription?.status && (
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  STATUS_CONFIG[subscription.status]?.bg || 'bg-[var(--av-surface-2)]'
                } ${STATUS_CONFIG[subscription.status]?.color || 'text-[var(--av-text-muted)]'}`}
              >
                {STATUS_CONFIG[subscription.status]?.label || subscription.status}
              </span>
            )}
          </div>

          {subscription ? (
            <div className="space-y-4">
              {/* Plan Info */}
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-[var(--av-text)]">
                  {subscription.plan_name || 'Free'}
                </span>
                <span className="text-[var(--av-text)] text-lg">
                  {formatCurrency(subscription.amount)}/
                  {subscription.billing_cycle === 'yearly' ? 'year' : 'month'}
                </span>
              </div>

              {/* Key Dates */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--av-border-strong)]/[0.06]">
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-[var(--av-text)] mt-0.5" />
                  <div>
                    <p className="text-xs text-[var(--av-text)] mb-1">Start Date</p>
                    <p className="font-medium">{formatDate(subscription.start_date)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-[var(--av-text)] mt-0.5" />
                  <div>
                    <p className="text-xs text-[var(--av-text)] mb-1">
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
                        <p className="text-xs text-[var(--av-text)] mt-1">
                          {subscription.days_until_expiry} days remaining
                        </p>
                      )}
                  </div>
                </div>
              </div>

              {/* Seats */}
              <div className="flex items-center gap-3 pt-4 border-t border-[var(--av-border-strong)]/[0.06]">
                <Users className="w-5 h-5 text-[var(--av-text)]" />
                <div>
                  <p className="text-sm text-[var(--av-text)]">Seats included: {subscription.seats_included}</p>
                </div>
              </div>

              {/* Cancel Button */}
              {isAdmin && subscription.status === 'active' && (
                <div className="pt-4 border-t border-[var(--av-border-strong)]/[0.06]">
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="text-sm text-[var(--av-danger)] hover:text-[var(--av-danger)]"
                  >
                    Cancel subscription
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-[#4285F4]/10 flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-[#4285F4]" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Free Plan</h3>
              <p className="text-sm text-[var(--av-text)] mb-4 max-w-sm mx-auto">
                You're on the free plan with basic features. Upgrade to unlock powerful tools for your business.
              </p>
              <Link
                to="/upgrade"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r to-[#4285F4] to-[#8B5CF6] text-white font-medium rounded-xl hover:shadow-lg transition"
              >
                <ArrowUpCircle className="w-5 h-5" />
                Upgrade Now
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* P0 #15: AI plan recommendation — evidence-based, never a bare "Upgrade now". */}
      {recommendation?.authorized && recommendation.recommended_plan_name && (
        <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] overflow-hidden mb-6">
          <div className="p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#155BB4]/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-[#155BB4]" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">
                  {recommendation.should_upgrade
                    ? `Based on how you use Avenize, we recommend ${recommendation.recommended_plan_name}`
                    : `Your usage fits the ${recommendation.recommended_plan_name} plan`}
                </h2>
                <p className="text-sm text-[var(--av-text)]/60 mt-1">
                  {recommendation.modules_used_count ?? 0} tools used
                  {recommendation.modules_requiring_higher_count
                    ? ` • ${recommendation.modules_requiring_higher_count} need a higher plan`
                    : ''}
                  {recommendation.recommended_price && recommendation.should_upgrade
                    ? ` • ${recommendation.recommended_price}`
                    : ''}
                </p>
              </div>
            </div>

            {recommendation.evidence && recommendation.evidence.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--av-text)]/50 mb-2">What you've used</h3>
                <ul className="space-y-1.5">
                  {recommendation.evidence.slice(0, 5).map((e, i) => (
                    <li key={i} className="text-sm text-[var(--av-text)]/80 flex items-start gap-2">
                      <Check className="w-4 h-4 text-[var(--av-success)] mt-0.5 shrink-0" />
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recommendation.reasons && recommendation.reasons.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--av-text)]/50 mb-2">Why this plan fits</h3>
                <ul className="space-y-1.5">
                  {recommendation.reasons.map((r, i) => (
                    <li key={i} className="text-sm text-[var(--av-text)]/80 flex items-start gap-2">
                      <Zap className="w-4 h-4 text-[#155BB4] mt-0.5 shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recommendation.should_upgrade && recommendation.additional_value_unlocks &&
              recommendation.additional_value_unlocks.length > 0 && (
              <div className="mb-4 p-3 bg-[#155BB4]/5 rounded-xl">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--av-text)]/50 mb-1.5">
                  What else this unlocks
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {recommendation.additional_value_unlocks.slice(0, 6).map((m) => (
                    <span key={m} className="px-2 py-0.5 text-xs bg-[var(--av-surface)] border border-[var(--av-border)] rounded-full text-[var(--av-text)]/70">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {recommendation.should_upgrade ? (
              <button
                onClick={() => handleUpgrade(recommendation.recommended_plan!)}
                disabled={processingPlan !== null}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#155BB4] text-white font-medium rounded-xl hover:bg-[#1247A0] transition disabled:opacity-50"
              >
                {processingPlan === recommendation.recommended_plan ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowUpCircle className="w-4 h-4" />
                )}
                Get {recommendation.recommended_plan_name}
              </button>
            ) : (
              <p className="text-sm text-[var(--av-text)]/60">
                Keep exploring — as you use more tools, we'll recommend the plan that fits how you actually work.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Upgrade Plans */}
      {(!subscription || subscription.plan === 'free') && availablePlans.length > 0 && (
        <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] overflow-hidden mb-6">
          <div className="p-6 border-b border-[var(--av-border-strong)]/[0.06]">
            <h2 className="font-semibold text-lg mb-4">Available Plans</h2>

            {/* Billing Toggle */}
            <div className="flex items-center gap-3 mb-6 p-1 bg-black/[0.04] rounded-xl max-w-md">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  billingCycle === 'monthly' ? 'bg-[var(--av-surface)] shadow-sm' : ''
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  billingCycle === 'yearly' ? 'bg-[var(--av-surface)] shadow-sm' : ''
                }`}
              >
                Yearly <span className="text-[var(--av-success)] text-xs">Save ~17%</span>
              </button>
            </div>

            {/* Plans Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availablePlans.map((plan) => (
                <div
                  key={plan.code}
                  className="border border-[var(--av-border-strong)]/[0.08] rounded-xl p-4 hover:border-[#4285F4]/20 transition"
                >
                  <h3 className="font-semibold text-lg mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-2xl font-bold">
                      {formatCurrency(
                        billingCycle === 'monthly' ? plan.monthly_price : plan.yearly_monthly_equivalent
                      )}
                    </span>
                    <span className="text-[var(--av-text)]">/mo</span>
                  </div>
                  {billingCycle === 'yearly' && (
                    <p className="text-xs text-[var(--av-text)] mb-3">
                      Billed as {formatCurrency(plan.yearly_price)}/year (Save {plan.savings_percent}%)
                    </p>
                  )}
                  <button
                    onClick={() => handleUpgrade(plan.code)}
                    disabled={processingPlan === plan.code}
                    className="w-full py-2.5 bg-[#4285F4] text-white text-sm font-medium rounded-lg hover:bg-[#3367D6] transition disabled:opacity-50"
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
        <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] overflow-hidden mb-6">
          <div className="p-6 border-b border-[var(--av-border-strong)]/[0.06]">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Payment History</h2>
              <span className="text-sm text-[var(--av-text)]">{payments.length} transactions</span>
            </div>
          </div>
          <div className="divide-y divide-black/[0.06]">
            {payments.slice(0, 5).map((payment) => (
              <div key={payment.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      payment.status === 'successful'
                        ? 'bg-[var(--av-success-soft)]'
                        : payment.status === 'pending'
                        ? 'bg-amber-100'
                        : 'bg-[var(--av-danger-soft)]'
                    }`}
                  >
                    {payment.status === 'successful' ? (
                      <Check className="w-5 h-5 text-[var(--av-success)]" />
                    ) : payment.status === 'pending' ? (
                      <Clock className="w-5 h-5 text-[var(--av-warning)]" />
                    ) : (
                      <X className="w-5 h-5 text-[var(--av-danger)]" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{payment.description}</p>
                    <p className="text-sm text-[var(--av-text)]">
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
                      STATUS_CONFIG[payment.status]?.bg || 'bg-[var(--av-surface-2)]'
                    } ${STATUS_CONFIG[payment.status]?.color || 'text-[var(--av-text-muted)]'}`}
                  >
                    {STATUS_CONFIG[payment.status]?.label || payment.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {payments.length > 5 && (
            <div className="p-4 text-center border-t border-[var(--av-border-strong)]/[0.06]">
              <button className="text-sm text-[#4285F4] hover:text-[#4285F4] font-medium">
                View all {payments.length} payments
              </button>
            </div>
          )}
        </div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] overflow-hidden mb-6">
          <div className="p-6 border-b border-[var(--av-border-strong)]/[0.06]">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Invoices</h2>
              <span className="text-sm text-[var(--av-text)]">{invoices.length} invoices</span>
            </div>
          </div>
          <div className="divide-y divide-black/[0.06]">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#4285F4]/10 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-[#4285F4]" />
                  </div>
                  <div>
                    <p className="font-medium">{invoice.invoice_number}</p>
                    <p className="text-sm text-[var(--av-text)]">
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
                        STATUS_CONFIG[invoice.status]?.bg || 'bg-[var(--av-surface-2)]'
                      } ${STATUS_CONFIG[invoice.status]?.color || 'text-[var(--av-text-muted)]'}`}
                    >
                      {STATUS_CONFIG[invoice.status]?.label || invoice.status}
                    </span>
                  </div>
                  {invoice.pdf_url && (
                    <a
                      href={invoice.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-[var(--av-surface-3)] rounded-lg transition"
                      title="Download Invoice"
                    >
                      <Download className="w-5 h-5 text-[var(--av-text)]" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manage Payment Methods Link */}
      <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-4">
        <Link
          to="/app/payments"
          className="flex items-center justify-between p-2 hover:bg-black/[0.02] rounded-lg transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--av-success-soft)] flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-[var(--av-success)]" />
            </div>
            <div>
              <p className="font-medium">Payment Methods</p>
              <p className="text-sm text-[var(--av-text)]">Manage your saved cards and bank accounts</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--av-text)]" />
        </Link>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-[var(--av-border-strong)]/[0.06]">
              <h2 className="text-lg font-bold">Cancel Subscription</h2>
            </div>
            <div className="p-6">
              {cancelMessage ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-[var(--av-success-soft)] flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-[var(--av-success)]" />
                  </div>
                  <p className="text-lg font-medium">{cancelMessage}</p>
                </div>
              ) : (
                <>
                  <p className="text-[var(--av-text)] mb-6">
                    Are you sure you want to cancel your subscription? You'll lose access to premium
                    features at the end of your billing period.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCancelModal(false)}
                      className="flex-1 px-4 py-3 border border-[var(--av-border)] rounded-xl font-medium hover:bg-black/[0.02] transition"
                    >
                      Keep Subscription
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="flex-1 px-4 py-3 bg-[var(--av-danger)] text-white rounded-xl font-medium hover:bg-[var(--av-danger)] transition disabled:opacity-50"
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
