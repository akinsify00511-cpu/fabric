// ============================================
// PRICING PAGE - AVENIZE
// Updated Design with Paystack Payment Links
// ============================================

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  Check, ArrowRight, Sparkles, Users, Zap, Shield,
  CreditCard, Building2, Phone, MessageSquare
} from 'lucide-react'

// ============================================
// PLAN DATA WITH PAYSTACK LINKS
// ============================================
const MONTHLY_PLANS = [
  {
    id: 'free',
    name: 'Free',
    tier: '— Get Started',
    description: 'Perfect for getting started',
    price: 0,
    priceLabel: '₦0',
    period: 'flat / month',
    seats: '1–5 seats',
    features: [
      'Core job tracking',
      'Basic CRM'
    ],
    notIncluded: [],
    paystackLink: null,
    popular: false
  },
  {
    id: 'starter-monthly',
    name: 'Starter',
    tier: 'Founding Rate',
    description: 'Perfect for getting started',
    price: 15000,
    priceLabel: '₦15,000',
    period: '/month flat',
    seats: '1–5 seats',
    features: [
      'Core job & project tracking',
      'Invoicing with VAT & WHT',
      'Basic inventory (single location)',
      'CRM basics',
      '5 team members'
    ],
    notIncluded: [],
    paystackLink: 'https://paystack.shop/pay/starter-avenize',
    popular: false
  },
  {
    id: 'team-monthly',
    name: 'Team',
    tier: 'Founding Rate',
    description: 'For growing teams',
    price: 48000,
    priceLabel: '₦48,000',
    period: '/month',
    seats: '6–15 seats',
    features: [
      'Everything in Starter',
      'Advanced CRM with AI insights',
      'Department groups & tasks',
      'Offline field sync',
      'Priority support'
    ],
    notIncluded: [],
    paystackLink: 'https://paystack.shop/pay/team-avenize',
    popular: false
  },
  {
    id: 'business-monthly',
    name: 'Business',
    tier: 'Founding Rate',
    description: 'For scaling businesses',
    price: 112000,
    priceLabel: '₦112,000',
    period: '/month',
    seats: '16–30 seats',
    features: [
      'Everything in Team',
      'Multi-location inventory',
      'Client communication log',
      'Advanced reporting',
      'Custom integrations'
    ],
    notIncluded: [],
    paystackLink: 'https://paystack.shop/pay/business-avenize',
    popular: false
  },
  {
    id: 'pro-monthly',
    name: 'Pro',
    tier: 'Founding Rate',
    description: '50-staff sweet spot',
    price: 186000,
    priceLabel: '₦186,000',
    period: '/month',
    seats: '31–75 seats',
    features: [
      'Everything in Business',
      'Full API access',
      'Approval workflows',
      'Dedicated account manager',
      'Custom onboarding'
    ],
    notIncluded: [],
    paystackLink: 'https://paystack.shop/pay/pro-avenize',
    popular: true
  },
  {
    id: 'scale-monthly',
    name: 'Scale',
    tier: 'Founding Rate',
    description: 'For enterprises',
    price: 380000,
    priceLabel: '₦380,000',
    period: '/month',
    seats: '76+ seats',
    features: [
      'Everything in Pro',
      'SSO & data residency',
      'Priority support',
      'Custom SLA',
      'White-label options'
    ],
    notIncluded: [],
    paystackLink: 'https://paystack.shop/pay/scale-avenize',
    popular: false
  }
]

const YEARLY_PLANS = [
  {
    id: 'free-yearly',
    name: 'Free',
    priceLabel: '₦0',
    period: '/year',
    seats: '1–5 seats',
    paystackLink: null
  },
  {
    id: 'starter-yearly',
    name: 'Starter',
    priceLabel: '₦150,000',
    period: '/year — 2 months free',
    seats: '1–5 seats',
    paystackLink: 'https://paystack.shop/pay/starteryearly'
  },
  {
    id: 'team-yearly',
    name: 'Team',
    priceLabel: '₦480,000',
    period: '/year — 2 months free',
    seats: '6–15 seats',
    paystackLink: 'https://paystack.shop/pay/teamyearly'
  },
  {
    id: 'business-yearly',
    name: 'Business',
    priceLabel: '₦1,120,000',
    period: '/year — 2 months free',
    seats: '16–30 seats',
    paystackLink: 'https://paystack.shop/pay/business-yearly'
  },
  {
    id: 'pro-yearly',
    name: 'Pro',
    priceLabel: '₦1,860,000',
    period: '/year — 2 months free',
    seats: '31–75 seats',
    paystackLink: 'https://paystack.shop/pay/pro-yearly'
  },
  {
    id: 'scale-yearly',
    name: 'Scale',
    priceLabel: '₦3,800,000',
    period: '/year — 2 months free',
    seats: '76+ seats',
    paystackLink: 'https://paystack.shop/pay/scale-yearly'
  }
]

// ============================================
// FAQ DATA
// ============================================
const FAQ_DATA = [
  {
    q: "Do I need an IT person to set this up?",
    a: "No. Setup is a 30-minute conversational flow — tell us what you do, how many staff, what you sell, and it's ready. No configuration, no consultants, unlike the ERPs that need three months to stand up."
  },
  {
    q: "What if my field staff have bad internet on site?",
    a: "Job updates and photos are captured offline and sync automatically once signal returns. Critical alerts can fall back to SMS. It's built for the network you actually have, not the one a demo assumes."
  },
  {
    q: "Does this replace my accountant?",
    a: "No — and it won't pretend to. We track invoicing, payments, VAT and WHT, and export cleanly to your accounting software. Your accountant still files; we just make sure they're working from real numbers."
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all Nigerian payment methods: Debit/Credit Card, Bank Transfer, USSD, and Mobile Money through Paystack. All payments are processed securely."
  },
  {
    q: "What happens to my price after the first year?",
    a: "Nothing, if you stay subscribed. Founding-rate customers keep their rate for as long as they remain active — list price only applies to new signups after the founding period ends."
  }
]

// ============================================
// WHY PRICING WORKS DATA
// ============================================
const WHY_PRICING = [
  {
    value: '₦150k–300k',
    label: 'Monthly cost of one admin/operations hire. Avenize is priced to replace 1–2 of those roles and makes the rest of your team more effective.'
  },
  {
    value: '₦1M+',
    label: 'Typical upfront cost of a comparable local ERP quote, plus 20% annual maintenance. We\'re cheaper, and live in 30 minutes, not 3 months.'
  },
  {
    value: '21 → 14 days',
    label: 'Our target reduction in "days to cash" — from job completion to money in the bank. That alone pays for the subscription.'
  }
]

// ============================================
// COMPONENT: PRICING TICKET CARD
// ============================================
function PricingTicket({ plan, isYearly = false }: { plan: typeof MONTHLY_PLANS[0] | typeof YEARLY_PLANS[0]; isYearly?: boolean }) {
  const monthlyPlan = plan as typeof MONTHLY_PLANS[0]
  const yearlyPlan = plan as typeof YEARLY_PLANS[0]
  const paystackLink = isYearly ? yearlyPlan.paystackLink : monthlyPlan.paystackLink
  const isMonthly = !isYearly && 'features' in plan

  return (
    <div className={`relative bg-white border-2 rounded-2xl overflow-hidden transition-all hover:shadow-xl ${
      isMonthly && monthlyPlan.popular 
        ? 'border-[var(--av-primary)] shadow-[var(--av-primary)]/10' 
        : 'border-[#E8E8E8]'
    }`}>
      {/* Popular Badge */}
      {isMonthly && monthlyPlan.popular && (
        <div className="absolute -top-0 left-1/2 -translate-x-1/2">
          <span className="inline-block px-4 py-1.5 rounded-b-lg bg-gradient-to-r to-[var(--av-primary)] to-[var(--av-accent)] text-white text-xs font-semibold">
            50-Staff Sweet Spot
          </span>
        </div>
      )}

      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          {/* Founding Tag */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--av-primary)]/10 text-[var(--av-primary)] text-xs font-mono uppercase tracking-wider mb-3">
            <span className="w-1.5 h-1.5 bg-[var(--av-primary)] rounded-full" />
            Founding rate
          </div>

          {/* Plan Code */}
          {isMonthly && (
            <div className="text-xs font-mono text-[#9B9B9B] uppercase tracking-wider mb-2">
              Tier / {monthlyPlan.tier}
            </div>
          )}

          {/* Plan Name */}
          <h3 className={`text-2xl font-bold mb-2 ${isMonthly ? 'text-[#111111]' : 'text-[#111111]'}`}>
            {isMonthly ? monthlyPlan.name : yearlyPlan.name}
          </h3>

          {/* Price */}
          <div className="mb-2">
            <span className={`text-3xl font-bold font-mono ${isMonthly && monthlyPlan.popular ? 'text-[var(--av-primary)]' : 'text-[#111111]'}`}>
              {isMonthly ? monthlyPlan.priceLabel : yearlyPlan.priceLabel}
            </span>
            <small className="block text-sm text-[#6B6B6B] mt-1">
              {isMonthly ? monthlyPlan.period : yearlyPlan.period}
            </small>
          </div>
        </div>

        {/* Features */}
        {isMonthly && (
          <ul className="space-y-3 mb-6">
            {monthlyPlan.features.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#4A4A4A]">
                <Check size={16} className="text-[var(--av-primary)] mt-0.5 flex-shrink-0" />
                {feature}
              </li>
            ))}
            {monthlyPlan.notIncluded.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#BBBBBB]">
                <span className="w-4 h-4 rounded-full border border-[#DDDDDD] mt-0.5 flex-shrink-0 flex items-center justify-center text-[10px]">–</span>
                {feature}
              </li>
            ))}
          </ul>
        )}

        {/* Seats Info */}
        <div className="text-xs font-mono text-[#9B9B9B] mb-4">
          {isMonthly ? monthlyPlan.seats : yearlyPlan.seats}
        </div>

        {/* CTA Button */}
        {paystackLink ? (
          <a
            href={paystackLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`block w-full py-3 rounded-xl text-center font-semibold transition-all ${
              isMonthly && monthlyPlan.popular
                ? 'bg-gradient-to-r to-[var(--av-primary)] to-[var(--av-accent)] text-white hover:opacity-90 shadow-lg shadow-[var(--av-primary)]/25'
                : 'bg-[#111111] text-white hover:bg-[#222222]'
            }`}
          >
            {monthlyPlan.price === 0 ? 'Get Started Free' : 'Start Free Trial'}
          </a>
        ) : (
          <button
            className={`block w-full py-3 rounded-xl text-center font-semibold transition-all ${
              isMonthly && monthlyPlan.popular
                ? 'bg-gradient-to-r to-[var(--av-primary)] to-[var(--av-accent)] text-white hover:opacity-90 shadow-lg shadow-[var(--av-primary)]/25'
                : 'bg-[#111111] text-white hover:bg-[#222222]'
            }`}
          >
            {monthlyPlan.price === 0 ? 'Get Started Free' : 'Start Free Trial'}
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================
// COMPONENT: SAMPLE INVOICE
// ============================================
function SampleInvoice() {
  return (
    <div className="mt-10 bg-[#111111] rounded-2xl p-6 text-white">
      <div className="text-xs font-mono text-[var(--av-primary)] uppercase tracking-wider mb-4">
        Sample invoice — 100-seat company on Scale (founding rate)
      </div>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between py-2 border-b border-white/10">
          <span className="text-white/60">80 office seats × ₦5,000 + 20 field seats × ₦2,500</span>
          <span className="font-mono">₦450,000</span>
        </div>
        <div className="flex justify-between py-2 border-b border-white/10">
          <span className="text-white/60">Billing cycle</span>
          <span>Monthly</span>
        </div>
        <div className="flex justify-between py-2 border-b border-white/10">
          <span className="text-white/60">Paid annually instead (2 months free)</span>
          <span className="font-mono">₦4,500,000/yr</span>
        </div>
        <div className="flex justify-between py-2 border-b border-white/10">
          <span className="text-white/60">Rate locked</span>
          <span className="text-[var(--av-primary)]">12 months, then grandfathered</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-white/60">Setup required to start</span>
          <span className="text-emerald-400">None — self-serve checkout</span>
        </div>
      </div>
    </div>
  )
}

// ============================================
// COMPONENT: WHY PRICING SECTION
// ============================================
function WhyPricingSection() {
  return (
    <section className="py-16 bg-[#F7F7F5] border-t border-[#E8E8E8]">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-violet-600 mb-4">
            <span>§</span> Why this price works
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-[#111111] mb-4">
            Compared to what you're already paying for chaos.
          </h2>
          <p className="text-[#6B6B6B] max-w-lg">
            Spreadsheets, chat apps, and memory aren't free — they cost you in errors, missed payments, and material waste.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {WHY_PRICING.map((item, i) => (
            <div key={i} className="border-t-2 border-violet-600 pt-6">
              <span className="block text-3xl font-bold font-mono text-violet-600 mb-3">{item.value}</span>
              <p className="text-sm text-[#6B6B6B] leading-relaxed">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: FAQ SECTION
// ============================================
function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="py-16 bg-white border-t border-[#E8E8E8]">
      <div className="max-w-3xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-violet-600 mb-4">
            <span>§</span> Before You Ask
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-[#111111]">
            The questions every operator asks first.
          </h2>
        </div>

        {/* FAQ List */}
        <div className="space-y-0">
          {FAQ_DATA.map((item, i) => (
            <div key={i} className="border-t border-[#E8E8E8]">
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between py-5 text-left"
              >
                <span className="font-semibold text-[#111111] pr-4">{item.q}</span>
                <span className={`text-violet-600 text-xl font-mono flex-shrink-0 transition-transform ${openIndex === i ? 'rotate-45' : ''}`}>+</span>
              </button>
              {openIndex === i && (
                <div className="pb-5 text-[#6B6B6B] leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          ))}
          <div className="border-b border-[#E8E8E8]" />
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: CTA SECTION
// ============================================
function CTASection() {
  return (
    <section className="relative py-20 bg-[#111111] text-white text-center overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 opacity-20" style={{
        background: 'radial-gradient(ellipse at 50% 100%, var(--av-primary) 0%, transparent 60%)'
      }} />

      <div className="relative max-w-3xl mx-auto px-6">
        <blockquote className="text-xl md:text-2xl font-bold leading-tight mb-8">
          Your crews are on sites you can't visit daily. Your factory runs out of resin without warning.{' '}
          <span className="bg-clip-text text-transparent bg-gradient-to-r to-[var(--av-primary)] to-violet-400">
            Find out before it's an emergency.
          </span>
        </blockquote>

        <a
          href="https://app.avenize.com/signup"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[var(--av-primary)] via-[var(--av-primary)] to-[#7C3AED] text-white font-semibold text-lg hover:opacity-90 transition-opacity shadow-xl shadow-[var(--av-primary)]/25"
        >
          Start free setup
        </a>

        <p className="mt-6 text-sm text-white/80 font-mono uppercase tracking-wider">
          Setup: 30 minutes · Works on low-end Android · Naira, VAT & WHT built in
        </p>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: FOOTER
// ============================================
function Footer() {
  return (
    <footer className="bg-[#0a0a0a] text-white/80 py-8 border-t border-white/10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br to-[var(--av-primary)] to-violet-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">A</span>
            </div>
            <span className="font-semibold text-white">Avenize</span>
          </div>
          <p className="text-sm font-mono uppercase tracking-wider">
            The Business Operating System — Lagos, Nigeria
          </p>
        </div>
      </div>
    </footer>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

  return (
    <div className="min-h-screen bg-[#F7F7F5]">
      {/* Hero Section */}
      <section className="bg-[#111111] text-white pt-24 pb-16 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--av-primary)]/40 text-[var(--av-primary)] text-xs font-mono uppercase tracking-wider mb-6">
            <span className="w-1.5 h-1.5 bg-[var(--av-primary)] rounded-full animate-pulse" />
            Pricing — Job Ticket AV-2026
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Stop running your business from memory.
          </h1>

          {/* Subheadline */}
          <p className="text-lg text-white/60 max-w-2xl mb-8">
            One system for your jobs, your inventory, and your money — priced the way your business already thinks: per seat, per month, no IT department required.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex bg-white rounded-lg p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-white text-[#111111]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
                billingCycle === 'yearly'
                  ? 'bg-white text-[#111111]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Yearly <span className="text-emerald-400 ml-1">Save 2 months</span>
            </button>
          </div>
        </div>
      </section>

      {/* Plans Section */}
      <section id="plans" className="py-16 bg-[#F7F7F5]">
        <div className="max-w-6xl mx-auto px-6">
          {/* Section Header */}
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-violet-600 mb-4">
              <span>§</span> Rate Card
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#111111] mb-4">
              Five tiers. No sales calls, at any size.
            </h2>
            <p className="text-[#6B6B6B] max-w-xl mb-6">
              Every tier tracks jobs, inventory, and invoicing in Naira, with VAT and WHT handled automatically. Pick your seat count, pay, start working — even at 100 seats.
            </p>

            {/* Founding Banner */}
            <div className="inline-block bg-[var(--av-primary)]/10 border border-[var(--av-primary)]/20 rounded-lg p-4 text-sm">
              <strong className="text-[var(--av-primary)]">Founding rate:</strong>{' '}
              <span className="text-[var(--av-primary)]">
                every price below is locked for your first 12 months — and stays locked for as long as you keep your subscription active, even after list price rises for new signups.
              </span>
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {billingCycle === 'monthly' ? (
              MONTHLY_PLANS.map((plan) => (
                <PricingTicket key={plan.id} plan={plan} isYearly={false} />
              ))
            ) : (
              YEARLY_PLANS.map((plan) => (
                <PricingTicket key={plan.id} plan={plan} isYearly={true} />
              ))
            )}
          </div>

          {/* Sample Invoice */}
          <SampleInvoice />
        </div>
      </section>

      {/* Why Pricing Section */}
      <WhyPricingSection />

      {/* FAQ Section */}
      <FAQSection />

      {/* CTA Section */}
      <CTASection />

      {/* Footer */}
      <Footer />
    </div>
  )
}
