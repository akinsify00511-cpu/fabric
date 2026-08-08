import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Check, Lock, Zap, Crown, Star, Shield, BarChart3, Users, Bell, Globe, Palette, 
  Clock, FileText, CreditCard, ChevronRight, ArrowLeft, Loader2, Users2, 
  Package, Headphones, FileCheck, PieChart, Building, Sparkles
} from 'lucide-react'

// All available plans with correct pricing
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    seats: '1–5 seats',
    description: 'Perfect for getting started',
    monthlyPrice: 15000,
    yearlyMonthly: 12500,
    yearlyTotal: 150000,
    color: 'blue',
    features: [
      'Core job & project tracking',
      'Invoicing with VAT & WHT',
      'Basic inventory (single location)',
      'CRM basics',
      '5 team members',
      'Email support'
    ],
    notIncluded: [
      'Advanced analytics',
      'API access',
      'Custom branding'
    ]
  },
  {
    id: 'team',
    name: 'Team',
    seats: '6–15 seats',
    description: 'For growing teams',
    monthlyPrice: 48000,
    yearlyMonthly: 40000,
    yearlyTotal: 480000,
    color: 'indigo',
    popular: false,
    features: [
      'Everything in Starter',
      'Advanced CRM with AI insights',
      'Department groups & tasks',
      'Offline field sync',
      'Priority support'
    ],
    notIncluded: [
      'Custom branding',
      'API access'
    ]
  },
  {
    id: 'business',
    name: 'Business',
    seats: '16–30 seats',
    description: 'For scaling businesses',
    monthlyPrice: 112000,
    yearlyMonthly: 93333,
    yearlyTotal: 1120000,
    color: 'purple',
    popular: false,
    features: [
      'Everything in Team',
      'Multi-location inventory',
      'Client communication log',
      'Advanced reporting',
      'Custom integrations'
    ],
    notIncluded: [
      'Custom branding',
      'White-label'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    seats: '31–75 seats',
    description: '50-staff sweet spot',
    monthlyPrice: 186000,
    yearlyMonthly: 155000,
    yearlyTotal: 1860000,
    color: 'violet',
    popular: true,
    features: [
      'Everything in Business',
      'Full API access',
      'Approval workflows',
      'Dedicated account manager',
      'Custom onboarding'
    ],
    notIncluded: []
  },
  {
    id: 'scale',
    name: 'Scale',
    seats: '76+ seats',
    description: 'For enterprises',
    monthlyPrice: 380000,
    yearlyMonthly: 316667,
    yearlyTotal: 3800000,
    color: 'amber',
    popular: false,
    features: [
      'Everything in Pro',
      'SSO & data residency',
      'Priority support',
      'Custom SLA',
      'White-label options'
    ],
    notIncluded: []
  }
]

const PLAN_ICONS: Record<string, any> = {
  starter: Package,
  team: Users2,
  business: Building,
  pro: Sparkles,
  scale: Crown
}

export default function Premium() {
  const navigate = useNavigate()
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [selectedPlan, setSelectedPlan] = useState<typeof PLANS[0] | null>(null)
  const [processing, setProcessing] = useState(false)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const handleSelectPlan = (plan: typeof PLANS[0]) => {
    setSelectedPlan(plan)
  }

  const handleBackToPlans = () => {
    setSelectedPlan(null)
  }

  const handleCheckout = async () => {
    if (!selectedPlan) return
    setProcessing(true)
    
    // Navigate to subscription page for checkout
    navigate(`/app/subscription?plan=${selectedPlan.id}&billing=${billingCycle}`)
    
    // In production, this would call the checkout API
    setTimeout(() => {
      setProcessing(false)
    }, 1000)
  }

  // Show plan selection view
  if (!selectedPlan) {
    return (
      <div className="max-w-6xl mx-auto pb-20">
        {/* Hero */}
        <div className="text-center py-12 px-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 text-sm font-medium mb-6">
            <Crown size={16} />
            <span>Unlock Your Business Potential</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-black mb-4">
            Choose Your <span className="text-transparent bg-clip-text bg-gradient-to-r to-[#4285F4] to-[#8B5CF6]">Plan</span>
          </h1>
          <p className="text-xl text-black/60 max-w-2xl mx-auto mb-8">
            Select the perfect plan for your team. All plans include a 7-day free trial.
          </p>
          
          {/* Billing Toggle */}
          <div className="inline-flex bg-white rounded-xl p-1 shadow-sm border border-black/5">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                billingCycle === 'monthly' 
                  ? 'bg-[#4285F4] text-white shadow-sm' 
                  : 'text-black/60 hover:text-black'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                billingCycle === 'yearly' 
                  ? 'bg-[#4285F4] text-white shadow-sm' 
                  : 'text-black/60 hover:text-black'
              }`}
            >
              Yearly <span className="text-emerald-400 ml-1">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 px-4 mb-12">
          {PLANS.map((plan) => {
            const PlanIcon = PLAN_ICONS[plan.id]
            const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyMonthly
            const isYearly = billingCycle === 'yearly'
            
            return (
              <div
                key={plan.id}
                onClick={() => handleSelectPlan(plan)}
                className={`bg-white rounded-2xl border-2 p-5 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 ${
                  plan.popular 
                    ? 'border-[#4285F4] shadow-[#4285F4]/10 relative' 
                    : 'border-black/5 hover:border-[#4285F4]/20'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-gradient-to-r to-[#4285F4] to-[#8B5CF6] text-white text-xs font-semibold rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                  plan.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                  plan.color === 'indigo' ? 'bg-[#4285F4]/10 text-[#4285F4]' :
                  plan.color === 'purple' ? 'bg-purple-100 text-purple-600' :
                  plan.color === 'violet' ? 'bg-violet-100 text-violet-600' :
                  'bg-amber-100 text-amber-600'
                }`}>
                  <PlanIcon size={24} />
                </div>
                
                <h3 className="text-lg font-bold text-black mb-1">{plan.name}</h3>
                <p className="text-xs text-black mb-3">{plan.seats}</p>
                
                <div className="mb-4">
                  <span className="text-2xl font-bold text-black">{formatCurrency(price)}</span>
                  <span className="text-black text-sm">/mo</span>
                </div>
                
                {isYearly && (
                  <p className="text-xs text-black mb-4">
                    {formatCurrency(plan.yearlyTotal)}/year
                  </p>
                )}
                
                <button className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
                  plan.popular
                    ? 'bg-gradient-to-r to-[#4285F4] to-[#8B5CF6] text-white hover:shadow-lg'
                    : 'bg-black/5 text-black hover:bg-black/10'
                }`}>
                  Select Plan
                </button>
              </div>
            )
          })}
        </div>

        {/* All Plans Comparison */}
        <div className="bg-white rounded-2xl border border-black/5 overflow-hidden mx-4">
          <div className="p-6 border-b border-black/5">
            <h2 className="text-xl font-bold text-black">Compare All Plans</h2>
            <p className="text-sm text-black mt-1">See what's included in each plan</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-black/[0.02]">
                <tr>
                  <th className="text-left p-4 font-medium text-black">Feature</th>
                  {PLANS.map(plan => (
                    <th key={plan.id} className={`p-4 text-center font-medium ${
                      plan.popular ? 'bg-[#4285F4]/5 text-[#4285F4]' : 'text-black'
                    }`}>
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                <tr className="bg-black/[0.02]">
                  <td className="p-4 font-medium text-black">Price</td>
                  {PLANS.map(plan => {
                    const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyMonthly
                    return (
                      <td key={plan.id} className={`p-4 text-center font-bold ${
                        plan.popular ? 'bg-[#4285F4]/5' : ''
                      }`}>
                        {formatCurrency(price)}<span className="text-sm font-normal text-black">/mo</span>
                      </td>
                    )
                  })}
                </tr>
                <tr>
                  <td className="p-4 text-black">Team Members</td>
                  <td className="p-4 text-center bg-[#4285F4]/5">5</td>
                  <td className="p-4 text-center">15</td>
                  <td className="p-4 text-center">30</td>
                  <td className="p-4 text-center bg-[#4285F4]/5">75</td>
                  <td className="p-4 text-center">Unlimited</td>
                </tr>
                <tr className="bg-black/[0.02]">
                  <td className="p-4 text-black">Job & Project Tracking</td>
                  <td className="p-4 text-center bg-[#4285F4]/5"><Check size={18} className="mx-auto text-green-500" /></td>
                  <td className="p-4 text-center"><Check size={18} className="mx-auto text-green-500" /></td>
                  <td className="p-4 text-center"><Check size={18} className="mx-auto text-green-500" /></td>
                  <td className="p-4 text-center bg-[#4285F4]/5"><Check size={18} className="mx-auto text-green-500" /></td>
                  <td className="p-4 text-center"><Check size={18} className="mx-auto text-green-500" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-black">Invoicing & VAT/WHT</td>
                  <td className="p-4 text-center bg-[#4285F4]/5"><Check size={18} className="mx-auto text-green-500" /></td>
                  <td className="p-4 text-center"><Check size={18} className="mx-auto text-green-500" /></td>
                  <td className="p-4 text-center"><Check size={18} className="mx-auto text-green-500" /></td>
                  <td className="p-4 text-center bg-[#4285F4]/5"><Check size={18} className="mx-auto text-green-500" /></td>
                  <td className="p-4 text-center"><Check size={18} className="mx-auto text-green-500" /></td>
                </tr>
                <tr className="bg-black/[0.02]">
                  <td className="p-4 text-black">Inventory Management</td>
                  <td className="p-4 text-center bg-[#4285F4]/5">Single</td>
                  <td className="p-4 text-center">Single</td>
                  <td className="p-4 text-center">Multi</td>
                  <td className="p-4 text-center bg-[#4285F4]/5">Multi</td>
                  <td className="p-4 text-center">Multi</td>
                </tr>
                <tr>
                  <td className="p-4 text-black">Advanced Analytics</td>
                  <td className="p-4 text-center bg-[#4285F4]/5">❌</td>
                  <td className="p-4 text-center"><Check size={18} className="mx-auto text-green-500" /></td>
                  <td className="p-4 text-center"><Check size={18} className="mx-auto text-green-500" /></td>
                  <td className="p-4 text-center bg-[#4285F4]/5"><Check size={18} className="mx-auto text-green-500" /></td>
                  <td className="p-4 text-center"><Check size={18} className="mx-auto text-green-500" /></td>
                </tr>
                <tr className="bg-black/[0.02]">
                  <td className="p-4 text-black">API Access</td>
                  <td className="p-4 text-center bg-[#4285F4]/5">❌</td>
                  <td className="p-4 text-center">❌</td>
                  <td className="p-4 text-center">❌</td>
                  <td className="p-4 text-center bg-[#4285F4]/5"><Check size={18} className="mx-auto text-green-500" /></td>
                  <td className="p-4 text-center"><Check size={18} className="mx-auto text-green-500" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-black">Custom Branding</td>
                  <td className="p-4 text-center bg-[#4285F4]/5">❌</td>
                  <td className="p-4 text-center">❌</td>
                  <td className="p-4 text-center">❌</td>
                  <td className="p-4 text-center bg-[#4285F4]/5">❌</td>
                  <td className="p-4 text-center"><Check size={18} className="mx-auto text-green-500" /></td>
                </tr>
                <tr className="bg-black/[0.02]">
                  <td className="p-4 text-black">Support</td>
                  <td className="p-4 text-center bg-[#4285F4]/5">Email</td>
                  <td className="p-4 text-center">Priority</td>
                  <td className="p-4 text-center">Priority</td>
                  <td className="p-4 text-center bg-[#4285F4]/5">Dedicated</td>
                  <td className="p-4 text-center">Custom SLA</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 px-4">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="max-w-2xl mx-auto space-y-4">
            {[
              {
                q: "Can I change plans later?",
                a: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle."
              },
              {
                q: "What payment methods do you accept?",
                a: "We accept all Nigerian payment methods: Debit/Credit Card, Bank Transfer, USSD, and Mobile Money through Paystack."
              },
              {
                q: "Is there a free trial?",
                a: "Yes! All paid plans come with a 7-day free trial. No credit card required to start."
              },
              {
                q: "What happens if I cancel?",
                a: "You can cancel anytime. You'll retain access to your current plan features until the end of your billing period."
              }
            ].map((faq, i) => (
              <details key={i} className="bg-white rounded-xl border border-black/5 group">
                <summary className="p-4 cursor-pointer font-medium text-black flex items-center justify-between">
                  {faq.q}
                  <ChevronRight size={18} className="text-black transition-transform group-open:rotate-90" />
                </summary>
                <div className="px-4 pb-4 text-black">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Show plan breakdown view
  return (
    <div className="max-w-2xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={handleBackToPlans}
          className="p-2 hover:bg-black/10 rounded-xl transition"
        >
          <ArrowLeft size={20} className="text-black" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-black">Review Your Plan</h1>
          <p className="text-black">Complete your subscription details</p>
        </div>
      </div>

      {/* Plan Summary Card */}
      <div className="bg-white rounded-2xl border border-black/5 overflow-hidden mb-6">
        <div className="p-6 border-b border-black/5 bg-gradient-to-r to-[#4285F4]/5 to-violet-50">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              selectedPlan.color === 'indigo' ? 'bg-[#4285F4]/10 text-[#4285F4]' :
              selectedPlan.color === 'violet' ? 'bg-violet-100 text-violet-600' :
              selectedPlan.color === 'purple' ? 'bg-purple-100 text-purple-600' :
              selectedPlan.color === 'amber' ? 'bg-amber-100 text-amber-600' :
              'bg-blue-100 text-blue-600'
            }`}>
              {(() => {
                const Icon = PLAN_ICONS[selectedPlan.id]
                return <Icon size={28} />
              })()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-black">{selectedPlan.name} Plan</h2>
              <p className="text-black">{selectedPlan.seats}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Billing Cycle */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-black mb-3">Billing Cycle</label>
            <div className="flex gap-3">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                  billingCycle === 'monthly'
                    ? 'border-[#4285F4] bg-[#4285F4]/5'
                    : 'border-black/5 hover:border-black/10'
                }`}
              >
                <p className="font-bold text-black">{formatCurrency(selectedPlan.monthlyPrice)}<span className="text-sm font-normal">/mo</span></p>
                <p className="text-xs text-black mt-1">Billed monthly</p>
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                  billingCycle === 'yearly'
                    ? 'border-[#4285F4] bg-[#4285F4]/5'
                    : 'border-black/5 hover:border-black/10'
                }`}
              >
                <p className="font-bold text-black">{formatCurrency(selectedPlan.yearlyMonthly)}<span className="text-sm font-normal">/mo</span></p>
                <p className="text-xs text-black mt-1">
                  {formatCurrency(selectedPlan.yearlyTotal)}/year (Save 17%)
                </p>
              </button>
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="bg-black/[0.02] rounded-xl p-4 mb-6">
            <h3 className="font-medium text-black mb-4">Price Breakdown</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-black">{selectedPlan.name} Plan ({billingCycle})</span>
                <span className="text-black font-medium">
                  {formatCurrency(billingCycle === 'monthly' ? selectedPlan.monthlyPrice : selectedPlan.yearlyMonthly)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-black">VAT (7.5%)</span>
                <span className="text-black font-medium">
                  {formatCurrency((billingCycle === 'monthly' ? selectedPlan.monthlyPrice : selectedPlan.yearlyMonthly) * 0.075)}
                </span>
              </div>
              <div className="border-t border-black/10 pt-3 flex justify-between font-bold">
                <span className="text-black">Total per month</span>
                <span className="text-black">
                  {formatCurrency((billingCycle === 'monthly' ? selectedPlan.monthlyPrice : selectedPlan.yearlyMonthly) * 1.075)}
                </span>
              </div>
              {billingCycle === 'yearly' && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Annual savings</span>
                  <span className="font-medium">
                    {formatCurrency((selectedPlan.monthlyPrice * 12 - selectedPlan.yearlyTotal) * 1.075)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Features Included */}
          <div className="mb-6">
            <h3 className="font-medium text-black mb-3">What's Included</h3>
            <div className="space-y-2">
              {selectedPlan.features.map((feature, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <Check size={16} className="text-green-500 shrink-0" />
                  <span className="text-black">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={processing}
            className="w-full py-4 rounded-xl bg-gradient-to-r to-[#4285F4] to-[#8B5CF6] text-white font-semibold text-lg hover:shadow-lg hover:shadow-[#4285F4]/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Start 7-Day Free Trial
                <ChevronRight size={20} />
              </>
            )}
          </button>
          
          <p className="text-center text-xs text-black mt-4">
            No credit card required • Cancel anytime
          </p>
        </div>
      </div>

      {/* Money Back Guarantee */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
        <Shield size={20} className="text-green-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-green-800">30-Day Money Back Guarantee</p>
          <p className="text-xs text-green-700 mt-1">
            If you're not satisfied within the first 30 days, we'll refund your payment in full. No questions asked.
          </p>
        </div>
      </div>
    </div>
  )
}
