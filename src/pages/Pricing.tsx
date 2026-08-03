// ============================================
// PRICING PAGE - AVENIZE
// Online payment with Paystack/Flutterwave
// ============================================

import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { SUBSCRIPTION_PAGES } from '../lib/paystack'
import {
  Check, CreditCard, Building2, Zap, Users, TrendingUp,
  Phone, Mail, MessageSquare, Package, BarChart3, Bell,
  Shield, Clock, ArrowRight, Sparkles, Gift
} from 'lucide-react'

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for solo operators and small teams getting started',
    price: 15000,
    priceLabel: '₦15,000',
    period: 'month',
    maxUsers: 5,
    features: [
      'Job & Project Tracking',
      'Basic Invoicing',
      'Simple Inventory',
      'Payment Tracking',
      'Email Support',
    ],
    notIncluded: [
      'AI Alerts',
      'Team Chat',
      'Advanced Reporting',
      'API Access',
    ],
    color: 'gray',
  },
  {
    id: 'business',
    name: 'Business',
    description: 'For growing teams that need full operational control',
    price: 8000,
    priceLabel: '₦8,000',
    period: 'user/month',
    maxUsers: 25,
    popular: true,
    features: [
      'Everything in Starter',
      'AI Operational Alerts',
      'Team Chat & Tasks',
      'Advanced Reporting',
      'Multiple Bank Accounts',
      'VAT & WHT Tracking',
      'Priority Support',
    ],
    notIncluded: [
      'API Access',
      'Custom Integrations',
    ],
    color: 'primary',
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For established businesses with complex operations',
    price: 6500,
    priceLabel: '₦6,500',
    period: 'user/month',
    maxUsers: 75,
    features: [
      'Everything in Business',
      'API Access',
      'Multi-location Support',
      'Approval Workflows',
      'Custom Reports',
      'Dedicated Support',
    ],
    notIncluded: [],
    color: 'accent',
  },
]

const PAYMENT_METHODS = [
  { id: 'card', name: 'Debit/Credit Card', icon: CreditCard, partner: 'Paystack' },
  { id: 'bank', name: 'Bank Transfer', icon: Building2, partner: 'Instant confirmation' },
  { id: 'ussd', name: 'USSD', icon: Phone, partner: 'All Nigerian banks' },
  { id: 'mobile', name: 'Mobile Money', icon: MessageSquare, partner: 'MTN, Airtel, 9mobile' },
]

interface Subscription {
  id: string
  plan_id: string
  status: 'active' | 'trial' | 'past_due' | 'cancelled'
  current_period_end: string
  seats: number
}

export default function Pricing() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [seats, setSeats] = useState(5)
  const [showCheckout, setShowCheckout] = useState(false)
  const [subscription, setSubscription] = useState<Subscription | null>(null)

  useEffect(() => {
    loadSubscription()
  }, [staff])

  const loadSubscription = async () => {
    if (!staff?.business_id) return
    
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('business_id', staff.business_id)
      .maybeSingle()
    
    if (data) {
      setSubscription(data as Subscription)
    }
  }

  const handleSubscribe = async (planId: string) => {
    if (!staff) {
      navigate('/signup')
      return
    }
    
    setSelectedPlan(planId)
    setShowCheckout(true)
  }

  const handlePayment = async (method: string) => {
    if (!selectedPlan || !staff) return
    
    setLoading(true)
    
    try {
      const plan = PLANS.find(p => p.id === selectedPlan)
      if (!plan) throw new Error('Plan not found')
      
      // Get Paystack subscription page URL
      const pageUrl = SUBSCRIPTION_PAGES[selectedPlan as keyof typeof SUBSCRIPTION_PAGES]
      
      if (!pageUrl || pageUrl.includes('xxx')) {
        throw new Error('Payment page not configured. Please contact support.')
      }
      
      // Open Paystack subscription page in new tab
      showToast('Redirecting to payment...', 'info')
      window.open(pageUrl, '_blank')
      
      // Simulate payment success for demo (remove in production)
      setTimeout(() => {
        handlePaymentSuccess('', plan.id)
      }, 3000)
      
    } catch (err: any) {
      console.error('Payment error:', err)
      showToast(err.message || 'Payment failed. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentSuccess = async (paymentId: string, planId: string) => {
    try {
      // Update payment status
      await supabase
        .from('payments')
        .update({ reference: `PAY-${Date.now()}` })
        .eq('id', paymentId)
      
      // Create or update subscription
      const plan = PLANS.find(p => p.id === planId)
      if (!plan) return
      
      const periodEnd = new Date()
      periodEnd.setMonth(periodEnd.getMonth() + 1)
      
      if (subscription) {
        await supabase
          .from('subscriptions')
          .update({
            plan_id: planId,
            status: 'active',
            current_period_end: periodEnd.toISOString(),
            seats,
          })
          .eq('id', subscription.id)
      } else {
        await supabase
          .from('subscriptions')
          .insert({
            plan_id: planId,
            status: 'active',
            current_period_end: periodEnd.toISOString(),
            seats,
            business_id: staff?.business_id,
          })
      }
      
      showToast('Payment successful! Welcome to ' + plan.name, 'success')
      setShowCheckout(false)
      loadSubscription()
      
    } catch (err) {
      console.error('Subscription error:', err)
      showToast('Payment received but subscription setup failed', 'error')
    }
  }

  const currentPlan = subscription ? PLANS.find(p => p.id === subscription.plan_id) : null

  return (
    <div className="min-h-screen bg-[var(--avenize-offwhite)]">
      {/* Header */}
      <div className="bg-white border-b border-black/5">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Pricing</h1>
              <p className="text-black/60 mt-1">Choose the plan that fits your business</p>
            </div>
            {currentPlan && (
              <div className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-medium">
                Current: {currentPlan.name} Plan
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const isCurrentPlan = subscription?.plan_id === plan.id
            const isPopular = plan.popular
            
            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl border-2 transition-all ${
                  isPopular 
                    ? 'border-[var(--avenize-primary)] shadow-xl shadow-[var(--avenize-primary)]/10' 
                    : 'border-black/5'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[var(--avenize-primary)] text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                
                <div className="p-6">
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <p className="text-sm text-black/60 mt-1">{plan.description}</p>
                  
                  <div className="mt-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">{plan.priceLabel}</span>
                      <span className="text-black/50 text-sm">/{plan.period}</span>
                    </div>
                    {plan.id !== 'starter' && (
                      <p className="text-xs text-black/40 mt-1">
                        Billed per user • Min {plan.maxUsers} seats
                      </p>
                    )}
                  </div>

                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                    {plan.notIncluded.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-black/30">
                        <span className="w-4 h-4 rounded-full border border-black/20 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={isCurrentPlan}
                    className={`w-full mt-6 py-3 rounded-xl font-medium transition-all ${
                      isCurrentPlan
                        ? 'bg-green-100 text-green-700 cursor-default'
                        : isPopular
                        ? 'avenize-gradient text-white hover:opacity-90'
                        : 'bg-black/5 hover:bg-black/10'
                    }`}
                  >
                    {isCurrentPlan ? 'Current Plan' : plan.id === 'starter' ? 'Get Started' : 'Subscribe'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* FAQ */}
        <div className="mt-16 text-center">
          <h2 className="text-xl font-bold mb-4">Frequently Asked Questions</h2>
          <div className="grid md:grid-cols-3 gap-6 text-left mt-8">
            <div className="bg-white rounded-xl p-5">
              <h3 className="font-semibold mb-2">Can I change plans?</h3>
              <p className="text-sm text-black/60">Yes, you can upgrade or downgrade at any time. Changes take effect on your next billing cycle.</p>
            </div>
            <div className="bg-white rounded-xl p-5">
              <h3 className="font-semibold mb-2">What payment methods?</h3>
              <p className="text-sm text-black/60">We accept all Nigerian payment methods: Card, Bank Transfer, USSD, and Mobile Money.</p>
            </div>
            <div className="bg-white rounded-xl p-5">
              <h3 className="font-semibold mb-2">Is there a free trial?</h3>
              <p className="text-sm text-black/60">Starter plan is free forever for up to 5 users. No credit card required.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Modal */}
      {showCheckout && selectedPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-black/5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Complete Your Purchase</h2>
                <button 
                  onClick={() => setShowCheckout(false)}
                  className="p-2 hover:bg-black/5 rounded-lg"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Order Summary */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{PLANS.find(p => p.id === selectedPlan)?.name} Plan</span>
                  <span className="font-semibold">{PLANS.find(p => p.id === selectedPlan)?.priceLabel}/user</span>
                </div>
                
                {selectedPlan !== 'starter' && (
                  <div className="flex items-center gap-3 mt-4">
                    <label className="text-sm">Number of users:</label>
                    <select
                      value={seats}
                      onChange={(e) => setSeats(Number(e.target.value))}
                      className="px-3 py-1.5 rounded-lg border border-black/10 text-sm"
                    >
                      {[...Array(25)].map((_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n} users</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div className="border-t border-black/10 mt-4 pt-4 flex justify-between">
                  <span className="font-semibold">Total per month</span>
                  <span className="font-bold text-xl">
                    ₦{((PLANS.find(p => p.id === selectedPlan)?.price || 0) * seats).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Payment Methods */}
              <div>
                <h3 className="font-semibold mb-3">Select Payment Method</h3>
                <div className="space-y-2">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => handlePayment(method.id)}
                      disabled={loading}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border border-black/10 hover:border-[var(--avenize-primary)] hover:bg-[var(--avenize-primary)]/5 transition-all text-left"
                    >
                      <div className="w-12 h-12 rounded-xl bg-[var(--avenize-primary)]/10 flex items-center justify-center">
                        <method.icon size={24} className="text-[var(--avenize-primary)]" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{method.name}</p>
                        <p className="text-xs text-black/50">{method.partner}</p>
                      </div>
                      <ArrowRight size={20} className="text-black/30" />
                    </button>
                  ))}
                </div>
              </div>

              {loading && (
                <div className="text-center py-4">
                  <div className="w-8 h-8 border-2 border-[var(--avenize-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-black/60 mt-2">Processing payment...</p>
                </div>
              )}

              <p className="text-xs text-center text-black/40">
                By subscribing, you agree to our Terms of Service. Cancel anytime.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
