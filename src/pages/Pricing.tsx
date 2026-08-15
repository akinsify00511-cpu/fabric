// Pricing — redesigned for the new direction.
//
// Clean, honest, consistent with the landing page. Four tiers (not six —
// simpler). No fabricated "founding rate" urgency tricks. No dead paystackLink
// fields. Routes to tracked in-app checkout for authenticated users.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { Check, ArrowRight, ChevronDown, Shield, Clock } from 'lucide-react'

const BRAND = {
  primary: 'var(--av-primary)',
  primarySoft: 'rgba(66, 133, 244, 0.08)',
  gradient: 'linear-gradient(135deg, var(--av-primary) 0%, var(--av-primary) 50%, var(--av-success) 100%)',
  surface: '#F8F9FA',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
  success: 'var(--av-success)',
}

// Five tiers mirror the plans defined in the subscription-management edge
// function (starter / team / business / pro / scale). "Free" is the 7-day
// trial entry point, not a paid tier. Each card answers the buyer's three
// questions — Who is this for? What does it solve? When do I move up?
const PLANS = [
  {
    name: 'Starter',
    price: '₦15,000',
    period: '/month',
    desc: 'One person running a simple operation',
    features: ['Core CRM & deals', 'Invoicing with VAT & WHT', 'Tasks & basic approvals', 'Up to 5 team members'],
    cta: 'Start 7-day trial',
    popular: false,
  },
  {
    name: 'Team',
    price: '₦48,000',
    period: '/month',
    desc: 'A small team working together',
    features: ['Everything in Starter', 'AI-assisted capture', 'Department groups', 'Up to 15 seats'],
    cta: 'Start 7-day trial',
    popular: false,
  },
  {
    name: 'Business',
    price: '₦112,000',
    period: '/month',
    desc: 'Multiple teams and departments',
    features: ['Everything in Team', 'Multi-location inventory', 'Approval workflows', 'Up to 30 seats'],
    cta: 'Start 7-day trial',
    popular: true,
  },
  {
    name: 'Pro',
    price: '₦186,000',
    period: '/month',
    desc: 'A growing, complex organization',
    features: ['Everything in Business', 'Committees & OKRs', 'Advanced intelligence & risk', 'Up to 60 seats'],
    cta: 'Start 7-day trial',
    popular: false,
  },
  {
    name: 'Scale',
    price: '₦380,000',
    period: '/month',
    desc: 'Large or multi-subsidiary operations',
    features: ['Everything in Pro', 'SSO & custom roles', 'Multi-subsidiary & audit trail', 'Dedicated support'],
    cta: 'Contact sales',
    popular: false,
  },
]

const FAQS = [
  { q: 'Do I need an IT person to set this up?', a: 'No. Setup is a short conversational flow — tell us what you do, how many staff, what you sell, and it is ready. No consultants, no three-month ERP implementation.' },
  { q: 'What if my field staff have bad internet?', a: 'Job updates and photos are captured offline and sync automatically once signal returns. Critical alerts can fall back to SMS. It is built for the network you actually have.' },
  { q: 'Does this replace my accountant?', a: 'No. Avenize tracks invoicing, payments, VAT and WHT, and exports cleanly to your accounting software. Your accountant still files; we make sure they work from real numbers.' },
  { q: 'What payment methods do you accept?', a: 'All Nigerian payment methods: debit/credit card, bank transfer, USSD, and mobile money through Paystack. All payments are processed securely.' },
  { q: 'Can I change plans later?', a: 'Yes. Upgrade or downgrade anytime. Changes take effect at the next billing cycle. No penalties, no lock-in.' },
]

function PricingCard({ plan }: { plan: typeof PLANS[0] }) {
  const navigate = useNavigate()
  const { session } = useAuth()

  const handleSelect = () => {
    if (plan.cta === 'Contact sales') {
      navigate('/contact')
    } else if (session) {
      navigate('/app/subscription')
    } else {
      navigate('/signup')
    }
  }

  return (
    <div
      className="rounded-2xl p-6 relative bg-white transition"
      style={{
        boxShadow: plan.popular ? 'var(--av-shadow-lg)' : 'var(--av-shadow-sm)',
        border: plan.popular ? `2px solid ${BRAND.primary}` : `1px solid ${BRAND.border}`,
      }}
    >
      {plan.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: BRAND.primary }}>
          Most popular
        </span>
      )}
      <h3 className="font-bold text-lg mb-1" style={{ color: BRAND.text }}>{plan.name}</h3>
      <p className="text-xs mb-4" style={{ color: BRAND.textMuted }}>{plan.desc}</p>
      <div className="mb-4">
        <span className="text-3xl font-bold" style={{ color: BRAND.text }}>{plan.price}</span>
        <span className="text-sm" style={{ color: BRAND.textSecondary }}>{plan.period}</span>
      </div>
      <ul className="space-y-2 mb-6">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
            <Check size={14} className="mt-0.5 shrink-0" style={{ color: BRAND.success }} />
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={handleSelect}
        className="block w-full py-2.5 rounded-lg text-sm font-medium transition"
        style={{
          backgroundColor: plan.popular ? BRAND.primary : BRAND.surface,
          color: plan.popular ? 'white' : BRAND.text,
          border: plan.popular ? 'none' : `1px solid ${BRAND.border}`,
        }}
      >
        {plan.cta}
      </button>
    </div>
  )
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return (
    <section className="py-20 px-4 sm:px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: BRAND.text }}>Questions</h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div key={i} className="rounded-xl p-5" style={{ backgroundColor: BRAND.surface }}>
              <button onClick={() => setOpenIndex(openIndex === i ? null : i)} className="w-full flex items-center justify-between text-left">
                <span className="font-medium pr-4" style={{ color: BRAND.text }}>{faq.q}</span>
                <ChevronDown size={20} className={`flex-shrink-0 transition-transform ${openIndex === i ? 'rotate-180' : ''}`} style={{ color: BRAND.textSecondary }} />
              </button>
              {openIndex === i && (
                <p className="mt-4 text-sm leading-relaxed" style={{ color: BRAND.textSecondary }}>{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function Pricing() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="pt-24 pb-16 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: BRAND.gradient }}>
                <span className="text-white font-bold">A</span>
              </div>
              <span className="text-2xl font-semibold" style={{ color: BRAND.text }}>Avenize</span>
            </Link>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: BRAND.text }}>
            Simple, honest pricing
          </h1>
          <p className="text-lg mb-8" style={{ color: BRAND.textSecondary }}>
            Pay per month. Cancel anytime. No hidden fees. No sales calls needed.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-white font-medium text-lg transition hover:shadow-lg" style={{ backgroundColor: BRAND.primary }}>
              Start free trial <ArrowRight size={20} />
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full font-medium text-lg transition hover:bg-gray-100" style={{ color: BRAND.text, border: `1px solid ${BRAND.border}` }}>
              Talk to us
            </Link>
          </div>
          <p className="text-sm mt-4" style={{ color: BRAND.textMuted }}>7-day free trial · No credit card required</p>
        </div>
      </section>

      {/* Plans */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {PLANS.map(p => <PricingCard key={p.name} plan={p} />)}
          </div>
          <p className="text-center text-sm mt-8" style={{ color: BRAND.textMuted }}>
            All plans include CRM, finance, HR, projects, chat, and intelligence.
            <br />
            Need something custom? <Link to="/contact" className="font-medium" style={{ color: BRAND.primary }}>Talk to us</Link>
          </p>
        </div>
      </section>

      {/* Trust bar */}
      <section className="py-12 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
        <div className="max-w-3xl mx-auto flex flex-wrap justify-center gap-8">
          <span className="flex items-center gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
            <Shield size={16} style={{ color: BRAND.primary }} /> Row-level security enforced at DB level
          </span>
          <span className="flex items-center gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
            <Clock size={16} style={{ color: BRAND.primary }} /> 7-day free trial, no credit card
          </span>
        </div>
      </section>

      <FAQSection />

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6" style={{ backgroundColor: BRAND.text }}>
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4 text-white">Your business, one system.</h2>
          <p className="text-lg mb-8" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Define your organization. Avenize adapts. Your people get WhatsApp-simple.
          </p>
          <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-lg transition hover:shadow-xl" style={{ backgroundColor: BRAND.primary, color: 'white' }}>
            Start your free trial <ArrowRight size={20} />
          </Link>
        </div>
      </section>
    </div>
  )
}
