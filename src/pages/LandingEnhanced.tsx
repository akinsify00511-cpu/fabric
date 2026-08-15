// LandingEnhanced — the marketing homepage, redesigned for the new direction.
//
// The promise: "More capable than an ERP. Easier than WhatsApp."
// Avenize runs your entire business as one connected system. Your organization
// defines itself. Your people see only what they need to act on.
//
// Design rules: honest (no fabricated stats), differentiated (explainable
// permissions, flexible org, one-organ architecture), Google Workspace
// aesthetic (brand tokens, elevation shadows, warm monochrome).

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Check, Menu, X, Users, BarChart3, Briefcase, Target, UserCheck,
  Clock, ListTodo, Calendar, MessageSquare, Shield, ChevronDown, Globe,
  Headphones, Brain, Network, HelpCircle, DollarSign, AlertCircle, Eye,
} from 'lucide-react'
import SarahChat from '../components/SarahChat'

const BRAND = {
  primary: 'var(--av-primary)',
  primarySoft: 'rgba(66, 133, 244, 0.08)',
  gradient: 'linear-gradient(135deg, var(--av-primary) 0%, var(--av-primary) 50%, var(--av-success) 100%)',
  amber: 'var(--av-warning)',
  surface: '#F8F9FA',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
  success: 'var(--av-success)',
  purple: '#7C3AED',
}

const PILLARS = [
  {
    icon: Brain,
    title: 'One organ',
    promise: 'Your business works as one body',
    desc: 'Every module — CRM, Finance, HR, Projects, Inventory — is wired to a central nervous system. When you close a deal, the invoice creates itself. When you pay an invoice, the cash flow updates. The brain coordinates the body.',
    color: BRAND.primary,
  },
  {
    icon: MessageSquare,
    title: 'Simple like WhatsApp',
    promise: 'The employee sees none of the complexity',
    desc: 'Good morning, David. Three things need you: approve ₦1.2M, review the Eko project, respond to Sarah. That is the whole interface. No training, no 40-tab ERP maze. Just what needs your attention.',
    color: BRAND.success,
  },
  {
    icon: Network,
    title: 'Your shape, not ours',
    promise: 'Define your organization — we adapt',
    desc: 'Five subsidiaries, twelve departments, a procurement committee that crosses three divisions? Configure it visually. Avenize absorbs your organizational complexity so your people do not have to navigate it.',
    color: BRAND.purple,
  },
]

const CAPABILITIES = [
  { icon: ListTodo, label: 'Tasks & approvals', desc: 'What needs your attention, in one list' },
  { icon: Users, label: 'CRM & sales', desc: 'Leads, deals, pipeline — in Naira' },
  { icon: DollarSign, label: 'Finance & invoicing', desc: 'VAT, WHT, e-invoicing, payments' },
  { icon: Briefcase, label: 'Projects & operations', desc: 'Jobs, timelines, field teams' },
  { icon: UserCheck, label: 'HR & people', desc: 'Staff, roles, attendance, payroll' },
  { icon: BarChart3, label: 'Intelligence', desc: 'Health scores, recommendations, forecasts' },
  { icon: Calendar, label: 'Calendar & meetings', desc: 'Team scheduling, reminders' },
  { icon: MessageSquare, label: 'Chat & comms', desc: 'Team channels, direct messages' },
  { icon: Shield, label: 'Audit & controls', desc: 'Every action tracked, explainable' },
]

const EXPLAINABLE = [
  {
    question: 'Why can I approve this?',
    answer: 'You are a Finance Manager for Roofing. Your approval authority is ₦5M. This request is ₦1.2M — within your limit.',
    icon: Check,
  },
  {
    question: 'Why can I not approve this?',
    answer: 'This request is ₦18M. Your approval limit is ₦5M. It has been routed to the Procurement Committee for review.',
    icon: AlertCircle,
  },
  {
    question: 'Why can John not see this?',
    answer: 'John belongs to Operations → Commercial Projects. This record belongs to Finance → Treasury. John does not have Finance access.',
    icon: Eye,
  },
]

const PRICING = [
  { name: 'Starter', price: '₦15,000', period: '/month', desc: 'For getting started', features: ['Core CRM & deals', 'Invoicing with VAT & WHT', 'Tasks & basic approvals', '5 team members'], cta: 'Start 7-day trial', popular: false },
  { name: 'Team', price: '₦48,000', period: '/month', desc: 'For growing teams', features: ['Everything in Starter', 'AI-assisted capture', 'Department groups', 'Up to 15 seats'], cta: 'Start 7-day trial', popular: false },
  { name: 'Business', price: '₦112,000', period: '/month', desc: 'For scaling', features: ['Everything in Team', 'Multi-location inventory', 'Approval workflows', 'Up to 30 seats'], cta: 'Start 7-day trial', popular: true },
  { name: 'Scale', price: '₦380,000', period: '/month', desc: 'For enterprises', features: ['Everything in Business', 'SSO & custom roles', 'Committees & multi-subsidiary', 'Dedicated support'], cta: 'Contact sales', popular: false },
]

const FAQS = [
  { q: 'How is this different from a regular ERP?', a: 'A regular ERP forces you into its organizational model and requires training. Avenize adapts to your organization and is designed so a new employee can request leave without anyone explaining the navigation. The complexity lives in the system, not in your team heads.' },
  { q: 'We have five subsidiaries and committees. Can it handle that?', a: 'Yes. You define your organizational structure — subsidiaries, departments, teams, committees, reporting lines — and Avenize enforces it. A procurement committee can include people from three different subsidiaries without changing their primary positions.' },
  { q: 'Is it actually simple? Show me.', a: 'When an employee opens the app, they see: "Good morning, David. Three things need you." That is it. Approvals, tasks, and messages that need their attention — in plain language. They tap to act. No menus, no training.' },
  { q: 'Can people choose how they see data?', a: 'Yes. Every metric can be displayed as a number, a trend sparkline, a progress bar, a breakdown, or a table. The system recommends the best view based on the data, but each person can choose what makes sense to them.' },
  { q: 'Is my data safe?', a: 'Row-level security is enforced at the database level — not just in the UI. Every important action is audited. Your data is encrypted and hosted on Supabase infrastructure with daily backups.' },
]

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b" style={{ backgroundColor: 'rgba(248,249,250,0.92)', borderColor: BRAND.border, backdropFilter: 'blur(8px)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: BRAND.gradient }}>
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <span className="font-semibold" style={{ color: BRAND.text }}>Avenize</span>
            </Link>
            <div className="hidden lg:flex items-center gap-1">
              <a href="#pillars" className="px-3 py-1.5 text-sm rounded-md transition hover:bg-white" style={{ color: BRAND.textSecondary }}>Why Avenize</a>
              <a href="#capabilities" className="px-3 py-1.5 text-sm rounded-md transition hover:bg-white" style={{ color: BRAND.textSecondary }}>What is included</a>
              <Link to="/pricing" className="px-3 py-1.5 text-sm rounded-md transition hover:bg-white" style={{ color: BRAND.textSecondary }}>Pricing</Link>
              <a href="#explainable" className="px-3 py-1.5 text-sm rounded-md transition hover:bg-white" style={{ color: BRAND.textSecondary }}>Explainable</a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden sm:block px-3 py-1.5 text-sm rounded-md transition hover:bg-white" style={{ color: BRAND.textSecondary }}>Sign in</Link>
            <Link to="/signup" className="px-4 py-1.5 text-white text-sm font-medium rounded-md transition shadow-sm" style={{ backgroundColor: BRAND.primary }}>
              Get started
            </Link>
            <button className="lg:hidden p-2 rounded-md" style={{ color: BRAND.text }} onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>
      {mobileOpen && (
        <div className="lg:hidden border-t px-4 py-3 space-y-1" style={{ backgroundColor: BRAND.surface, borderColor: BRAND.border }}>
          <a href="#pillars" className="block px-3 py-2 text-sm rounded-md" style={{ color: BRAND.textSecondary }}>Why Avenize</a>
          <a href="#capabilities" className="block px-3 py-2 text-sm rounded-md" style={{ color: BRAND.textSecondary }}>What is included</a>
          <a href="#pricing" className="block px-3 py-2 text-sm rounded-md" style={{ color: BRAND.textSecondary }}>Pricing</a>
          <a href="#explainable" className="block px-3 py-2 text-sm rounded-md" style={{ color: BRAND.textSecondary }}>Explainable</a>
        </div>
      )}
    </nav>
  )
}

function HeroSection() {
  return (
    <section className="pt-28 pb-20 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
      <div className="max-w-4xl mx-auto text-center">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: BRAND.gradient }}>
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <span className="text-3xl font-semibold" style={{ color: BRAND.text }}>Avenize</span>
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-8" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>
          <Brain size={16} />
          <span className="font-medium">One organ coordinating your business</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 leading-tight" style={{ color: BRAND.text }}>
          More capable than an ERP.<br />
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: BRAND.gradient }}>Easier than WhatsApp.</span>
        </h1>

        <p className="text-lg sm:text-xl mb-10 max-w-2xl mx-auto" style={{ color: BRAND.textSecondary }}>
          Avenize runs your entire business as one connected system — CRM, finance, HR,
          projects, inventory, intelligence. Your organization defines itself. Your people
          see only what they need to act on.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
          <Link to="/signup" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-white font-medium text-lg transition hover:shadow-lg" style={{ backgroundColor: BRAND.primary }}>
            Start free trial <ArrowRight size={20} />
          </Link>
          <Link to="/login" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full font-medium text-lg transition hover:bg-white" style={{ color: BRAND.text, border: `1px solid ${BRAND.border}` }}>
            Sign in
          </Link>
        </div>
        <p className="text-sm mb-12" style={{ color: BRAND.textMuted }}>
          7-day free trial · No credit card · Built for Nigerian businesses
        </p>

        {/* The "My Work" preview — show the actual product concept */}
        <div className="max-w-md mx-auto rounded-2xl shadow-lg p-6 text-left bg-white">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: BRAND.gradient }}>
              D
            </div>
            <div>
              <p className="font-medium text-sm" style={{ color: BRAND.text }}>Good morning, David</p>
              <p className="text-xs" style={{ color: BRAND.textMuted }}>3 things need you</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: BRAND.surface }}>
              <span className="text-sm" style={{ color: BRAND.text }}>Approve ₦1.2M invoice</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(234,67,53,0.1)', color: '#EA4335' }}>Action needed</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: BRAND.surface }}>
              <span className="text-sm" style={{ color: BRAND.text }}>Review Eko project status</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>Review</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: BRAND.surface }}>
              <span className="text-sm" style={{ color: BRAND.text }}>Respond to Sarah</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(251,188,5,0.1)', color: '#FBBC05' }}>Message</span>
            </div>
          </div>
          <p className="text-xs mt-4 text-center" style={{ color: BRAND.textMuted }}>
            This is what your team sees every morning. That is it.
          </p>
        </div>
      </div>
    </section>
  )
}

function PillarsSection() {
  return (
    <section id="pillars" className="py-24 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: BRAND.text }}>
            A fundamentally different approach
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: BRAND.textSecondary }}>
            Most business software is either powerful but unusable, or simple but limited.
            Avenize is both — because the complexity lives in the system, not in your team heads.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PILLARS.map((p, i) => {
            const Icon = p.icon
            return (
              <div key={i} className="rounded-2xl p-6" style={{ backgroundColor: BRAND.surface, boxShadow: 'var(--av-shadow-md)' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: p.color + '15' }}>
                  <Icon size={24} style={{ color: p.color }} />
                </div>
                <h3 className="text-xl font-bold mb-1" style={{ color: BRAND.text }}>{p.title}</h3>
                <p className="text-sm font-medium mb-3" style={{ color: p.color }}>{p.promise}</p>
                <p className="text-sm leading-relaxed" style={{ color: BRAND.textSecondary }}>{p.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function CapabilitiesSection() {
  return (
    <section id="capabilities" className="py-24 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: BRAND.text }}>
            Everything your business needs
          </h2>
          <p className="text-lg" style={{ color: BRAND.textSecondary }}>
            One system. No integrations to maintain. No data to sync.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CAPABILITIES.map((c, i) => {
            const Icon = c.icon
            return (
              <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-white" style={{ boxShadow: 'var(--av-shadow-sm)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: BRAND.primarySoft }}>
                  <Icon size={18} style={{ color: BRAND.primary }} />
                </div>
                <div>
                  <p className="font-medium text-sm" style={{ color: BRAND.text }}>{c.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: BRAND.textMuted }}>{c.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function ExplainableSection() {
  return (
    <section id="explainable" className="py-24 px-4 sm:px-6 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>
            <HelpCircle size={16} />
            <span className="font-medium">Explainable permissions</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: BRAND.text }}>
            Why can I do this?
          </h2>
          <p className="text-lg" style={{ color: BRAND.textSecondary }}>
            Enterprise permissions should not be mysterious. Every decision is explainable —
            for users and administrators.
          </p>
        </div>
        <div className="space-y-4">
          {EXPLAINABLE.map((e, i) => {
            const Icon = e.icon
            return (
              <div key={i} className="flex gap-4 p-5 rounded-xl" style={{ backgroundColor: BRAND.surface, boxShadow: 'var(--av-shadow-sm)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: BRAND.primarySoft }}>
                  <Icon size={18} style={{ color: BRAND.primary }} />
                </div>
                <div>
                  <p className="font-medium text-sm mb-1" style={{ color: BRAND.text }}>{e.question}</p>
                  <p className="text-sm leading-relaxed" style={{ color: BRAND.textSecondary }}>{e.answer}</p>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-center text-sm mt-8" style={{ color: BRAND.textMuted }}>
          This dramatically reduces the support burden for large deployments.
        </p>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: BRAND.text }}>
            Simple, honest pricing
          </h2>
          <p className="text-lg" style={{ color: BRAND.textSecondary }}>
            Pay per month. Cancel anytime. No hidden fees.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PRICING.map((p, i) => (
            <div key={i} className="rounded-2xl p-6 relative bg-white" style={{
              boxShadow: p.popular ? 'var(--av-shadow-lg)' : 'var(--av-shadow-sm)',
              border: p.popular ? `2px solid ${BRAND.primary}` : `1px solid ${BRAND.border}`,
            }}>
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: BRAND.primary }}>
                  Most popular
                </span>
              )}
              <h3 className="font-bold text-lg mb-1" style={{ color: BRAND.text }}>{p.name}</h3>
              <p className="text-xs mb-4" style={{ color: BRAND.textMuted }}>{p.desc}</p>
              <div className="mb-4">
                <span className="text-2xl font-bold" style={{ color: BRAND.text }}>{p.price}</span>
                <span className="text-sm" style={{ color: BRAND.textSecondary }}>{p.period}</span>
              </div>
              <ul className="space-y-2 mb-6">
                {p.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
                    <Check size={14} className="mt-0.5 shrink-0" style={{ color: BRAND.success }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/signup" className="block text-center py-2.5 rounded-lg text-sm font-medium transition" style={{
                backgroundColor: p.popular ? BRAND.primary : BRAND.surface,
                color: p.popular ? 'white' : BRAND.text,
                border: p.popular ? 'none' : `1px solid ${BRAND.border}`,
              }}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-sm mt-8" style={{ color: BRAND.textMuted }}>
          Need something custom? <Link to="/contact" className="font-medium" style={{ color: BRAND.primary }}>Talk to us</Link>
        </p>
      </div>
    </section>
  )
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return (
    <section id="faq" className="py-24 px-4 sm:px-6 bg-white">
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

function FinalCTA() {
  return (
    <section className="py-24 px-4 sm:px-6 relative overflow-hidden" style={{ backgroundColor: BRAND.text }}>
      <div className="max-w-3xl mx-auto text-center relative z-10">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">
          Your business, one system.
        </h2>
        <p className="text-lg mb-8" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Define your organization. Avenize adapts. Your people get WhatsApp-simple.
        </p>
        <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-lg transition hover:-translate-y-1 hover:shadow-xl" style={{ backgroundColor: BRAND.primary, color: 'white' }}>
          Start your free trial <ArrowRight size={20} />
        </Link>
        <div className="flex items-center justify-center gap-6 mt-6">
          <span className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <Shield size={16} /> No credit card required
          </span>
          <span className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <Clock size={16} /> 7-day trial
          </span>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="py-12 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: BRAND.gradient }}>
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-semibold" style={{ color: BRAND.text }}>Avenize</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="flex items-center gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
              <Shield size={14} /> Privacy
            </Link>
            <Link to="/terms" className="flex items-center gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
              <Globe size={14} /> Terms
            </Link>
            <Link to="/contact" className="flex items-center gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
              <Headphones size={14} /> Contact
            </Link>
          </div>
          <div className="text-center md:text-right text-sm" style={{ color: BRAND.textMuted }}>
            <p>&copy; 2026 Avenize. Built for Nigerian businesses.</p>
            <p className="mt-1">Running from Lagos, Nigeria</p>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default function LandingEnhanced() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <HeroSection />
      <PillarsSection />
      <CapabilitiesSection />
      <ExplainableSection />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
      <Footer />
      <SarahChat />
    </div>
  )
}
