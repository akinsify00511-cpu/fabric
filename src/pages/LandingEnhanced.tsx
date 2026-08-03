// ============================================
// AVENIZE ENHANCED LANDING PAGE v3
// Bento Grid + Glassmorphism Design
// ============================================

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Menu, X, Sparkles, Zap, Shield, Users, BarChart3, Briefcase, Truck, FileText, Bell, Settings, ChevronDown } from 'lucide-react'

// ============================================
// DESIGN TOKENS (CSS Variables)
// ============================================
const colors = {
  midnight: '#0a0a0f',
  void: '#12121a',
  surface: '#1a1a24',
  elevated: '#22222e',
  pearl: '#f7fafc',
  frost: '#f0f4f8',
  mist: '#e2e8f0',
  silver: '#a0aec0',
  
  coral: '#ff6b6b',
  amber: '#ffa94d',
  lemon: '#ffd43b',
  mint: '#69db7c',
  teal: '#38d9a9',
  cyan: '#22b8cf',
  sky: '#4dabf7',
  indigo: '#748ffc',
  violet: '#da77f2',
  rose: '#f783ac',
  orange: '#ff922b',
  purple: '#9775fa',
}

// ============================================
// FAQ DATA
// ============================================
const FAQ_DATA = [
  {
    q: "Do I need an IT person to set this up?",
    a: "No. You tell us your business name, what you sell or service, and how many staff — we set up your workspace in 30 minutes. No consultants. No configuration. No waiting three months while you pay for 'implementation.'"
  },
  {
    q: "What if my field crew is on site in Lekki but network is rubbish?",
    a: "They snap a photo, submit their update, and it syncs when signal returns. No 'please wait for wifi.' If it's urgent, we fall back to SMS. Built for the network in your area, not the one in the demo video."
  },
  {
    q: "My accountant already does my books. Why do I need this?",
    a: "We don't replace your accountant — we make sure they work from real data. Invoices get sent. Payments get recorded. VAT and WHT get tracked. By month-end, your accountant isn't chasing receipts in WhatsApp — the numbers are already there."
  },
  {
    q: "What if my business grows past the plan or shrinks during a slow season?",
    a: "You add seats when you hire. You remove them when you don't. No contracts locking you in. And your founding rate? It stays yours — even when list price goes up for new signups next year."
  }
]

// ============================================
// FEATURE MODULES
// ============================================
const MODULES = [
  { icon: BarChart3, name: 'Sales', color: '#ff6b6b', desc: 'Close deals faster with AI pipeline insights' },
  { icon: Briefcase, name: 'Finance', color: '#69db7c', desc: 'Real-time cash flow and automated invoicing' },
  { icon: Truck, name: 'Projects', color: '#ffa94d', desc: 'Ship faster with visual task management' },
  { icon: Users, name: 'HR', color: '#da77f2', desc: 'Staff database and performance tracking' },
  { icon: Zap, name: 'Automation', color: '#748ffc', desc: 'Eliminate repetitive tasks forever' },
  { icon: Sparkles, name: 'AI', color: '#22b8cf', desc: 'Your intelligent business companion' },
]

// ============================================
// NOTIFICATION DATA
// ============================================
const NOTIFICATIONS = [
  {
    type: 'deal',
    icon: '💼',
    title: 'New Deal Closed!',
    message: 'Riverside Construction signed the ₦2.5M contract',
    time: '2 min ago',
    color: 'indigo',
    status: 'new'
  },
  {
    type: 'task',
    icon: '✅',
    title: 'Task Completed',
    message: 'Q4 Report finalized by Chinedu',
    time: '15 min ago',
    color: 'mint',
    status: ''
  },
  {
    type: 'alert',
    icon: '⚠️',
    title: 'Invoice Overdue',
    message: 'Invoice #INV-2024-089 is 5 days past due',
    time: '1 hour ago',
    color: 'coral',
    status: ''
  },
]

// ============================================
// COMPONENT: NAVBAR
// ============================================
function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav 
      className="fixed top-0 left-0 right-0 z-50 px-5 py-3"
      style={{ backdropFilter: 'blur(20px) saturate(180%)' }}
    >
      <div 
        className="max-w-7xl mx-auto rounded-2xl flex items-center justify-between px-6 py-3"
        style={{ 
          background: 'rgba(247, 250, 252, 0.8)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)'
        }}
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <span className="font-bold text-lg" style={{ letterSpacing: '-0.02em' }}>Avenize</span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          <Link to="#features" className="text-sm font-semibold opacity-60 hover:opacity-100 transition-opacity">Features</Link>
          <Link to="#notifications" className="text-sm font-semibold opacity-60 hover:opacity-100 transition-opacity">Notifications</Link>
          <Link to="#pricing" className="text-sm font-semibold opacity-60 hover:opacity-100 transition-opacity">Pricing</Link>
          <Link to="/login" className="text-sm font-semibold opacity-60 hover:opacity-100 transition-opacity">Sign In</Link>
          <Link 
            to="/signup" 
            className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:-translate-y-0.5"
            style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              boxShadow: '0 4px 20px rgba(102, 126, 234, 0.3)'
            }}
          >
            Get Started
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button 
          className="md:hidden p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div 
          className="md:hidden mt-2 p-4 rounded-2xl"
          style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}
        >
          <div className="flex flex-col gap-4">
            <Link to="#features" className="text-sm font-semibold py-2">Features</Link>
            <Link to="#notifications" className="text-sm font-semibold py-2">Notifications</Link>
            <Link to="#pricing" className="text-sm font-semibold py-2">Pricing</Link>
            <Link to="/login" className="text-sm font-semibold py-2">Sign In</Link>
            <Link to="/signup" className="px-5 py-3 rounded-xl text-white text-sm font-semibold text-center" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              Get Started
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}

// ============================================
// COMPONENT: HERO SECTION
// ============================================
function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center text-center px-5 pt-24 pb-16 overflow-hidden">
      {/* Aurora Background */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 30% 20%, rgba(102, 126, 234, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 30%, rgba(218, 119, 242, 0.12) 0%, transparent 45%),
            radial-gradient(ellipse at 50% 80%, rgba(255, 107, 107, 0.08) 0%, transparent 40%)
          `
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Badge */}
        <div 
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-8 animate-fade-in"
          style={{ 
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.9)',
            boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)'
          }}
        >
          <span 
            className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #ff6b6b 0%, #ffa94d 50%, #ffd43b 100%)' }}
          >
            New
          </span>
          AI-Powered Automation is here
        </div>

        {/* Headline */}
        <h1 
          className="text-5xl md:text-7xl lg:text-8xl font-extrabold mb-6 leading-none"
          style={{ letterSpacing: '-0.04em', lineHeight: 1 }}
        >
          <span className="block" style={{ color: colors.midnight }}>The Business</span>
          <span 
            className="block"
            style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}
          >
            Operating System
          </span>
        </h1>

        {/* Subheadline */}
        <p 
          className="text-lg md:text-xl max-w-2xl mx-auto mb-10"
          style={{ color: colors.silver, lineHeight: 1.7 }}
        >
          Stop juggling disconnected tools. Avenize unifies your entire business — 
          from sales to projects, finance to AI — into one intelligent platform.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            to="/signup"
            className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-white font-bold text-lg transition-all hover:-translate-y-1"
            style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              boxShadow: '0 8px 30px rgba(102, 126, 234, 0.4)'
            }}
          >
            Start Free Trial
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link 
            to="/demo"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-semibold text-lg transition-all hover:-translate-y-1"
            style={{ 
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.9)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              color: colors.midnight
            }}
          >
            Watch Demo
          </Link>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <ChevronDown size={24} style={{ color: colors.silver }} />
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: GLASSMORPHISM NOTIFICATIONS
// ============================================
function NotificationsSection() {
  const sectionRef = useRef<HTMLDivElement>(null)

  return (
    <section id="notifications" ref={sectionRef} className="py-20 px-5 relative">
      {/* Background Glow */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 20% 30%, rgba(102, 126, 234, 0.1) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 70%, rgba(218, 119, 242, 0.08) 0%, transparent 40%)
          `
        }}
      />

      <div className="relative z-10 max-w-3xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <div 
            className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
            style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}
          >
            Spatial UI
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4" style={{ letterSpacing: '-0.03em' }}>
            Glassmorphism<br />Notification Layers
          </h2>
        </div>

        {/* Notifications Container */}
        <div className="flex flex-col gap-4">
          {NOTIFICATIONS.map((notif, i) => (
            <div
              key={i}
              className="group relative flex items-start gap-4 p-5 rounded-2xl cursor-pointer transition-all hover:-translate-x-2"
              style={{
                background: notif.color === 'mint' 
                  ? 'rgba(105, 219, 124, 0.12)'
                  : notif.color === 'coral'
                  ? 'rgba(255, 107, 107, 0.12)'
                  : 'rgba(116, 143, 252, 0.12)',
                backdropFilter: 'blur(20px)',
                border: `1px solid rgba(${notif.color === 'mint' ? '105, 219, 124' : notif.color === 'coral' ? '255, 107, 107' : '116, 143, 252'}, 0.25)`,
                animation: `slideIn 0.5s ease-out ${i * 0.1}s both`
              }}
            >
              {/* Icon */}
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{
                  background: `rgba(${notif.color === 'mint' ? '105, 219, 124' : notif.color === 'coral' ? '255, 107, 107' : '116, 143, 252'}, 0.3)`,
                }}
              >
                {notif.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold" style={{ fontSize: '15px' }}>{notif.title}</span>
                  {notif.status === 'new' && (
                    <span 
                      className="w-2.5 h-2.5 rounded-full animate-pulse"
                      style={{ background: colors.indigo, boxShadow: `0 0 8px ${colors.indigo}` }}
                    />
                  )}
                </div>
                <p className="text-sm opacity-60 mb-2">{notif.message}</p>
                <span className="text-xs opacity-40">{notif.time}</span>
              </div>

              {/* Action Button */}
              <button 
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0 transition-all hover:scale-105"
                style={{ background: colors.indigo }}
              >
                View
              </button>
            </div>
          ))}

          {/* Grouped Notifications */}
          <div 
            className="p-5 rounded-2xl"
            style={{
              background: 'rgba(255, 255, 255, 0.5)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.8)',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)'
            }}
          >
            <div className="flex items-center justify-between mb-4 pb-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🔔</span>
                <span className="font-bold">Team Updates</span>
              </div>
              <span 
                className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
                style={{ background: colors.indigo }}
              >
                3 new
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { initial: 'S', name: 'Sarah joined Marketing', time: '5 min ago', color: colors.coral },
                { initial: 'M', name: 'Mike completed 3 tasks', time: '12 min ago', color: colors.amber },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ background: `linear-gradient(135deg, ${item.color} 0%, ${item.color}aa 100%)` }}
                  >
                    {item.initial}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs opacity-40">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </section>
  )
}

// ============================================
// COMPONENT: BENTO GRID FEATURES
// ============================================
function BentoFeatures() {
  return (
    <section id="features" className="py-20 px-5">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div 
            className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
            style={{ color: colors.indigo }}
          >
            <span className="w-6 h-0.5 rounded" style={{ background: colors.indigo, opacity: 0.4 }} />
            Core Modules
            <span className="w-6 h-0.5 rounded" style={{ background: colors.indigo, opacity: 0.4 }} />
          </div>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-4" style={{ letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Everything your business needs,<br />finally together
          </h2>
          <p className="text-lg opacity-60 max-w-md mx-auto">
            One platform. Zero complexity. Infinite possibilities.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-12 gap-5 auto-rows-[minmax(180px,auto)]">
          {/* Mission Card - Dark Glass */}
          <div 
            className="col-span-12 lg:col-span-8 row-span-2 p-8 rounded-3xl relative overflow-hidden"
            style={{
              background: colors.midnight,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)'
            }}
          >
            {/* Glow Effect */}
            <div 
              className="absolute -top-1/2 right-0 w-3/4 h-full pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse, rgba(102, 126, 234, 0.3) 0%, transparent 60%)'
              }}
            />
            
            <span 
              className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-4"
              style={{ background: 'rgba(255,255,255,0.1)', color: colors.indigo }}
            >
              Our Mission
            </span>
            
            <h3 className="text-3xl font-bold text-white mb-4 relative z-10" style={{ letterSpacing: '-0.02em' }}>
              Unify the碎片化的<br />business experience.
            </h3>
            
            <p className="text-white/70 relative z-10 leading-relaxed">
              We believe businesses shouldn't need 15 different tools to run their company. 
              Avenize brings CRM, Projects, Finance, HR, and AI into one seamless operating system — 
              so you can focus on building, not balancing.
            </p>
          </div>

          {/* Stats Card */}
          <div 
            className="col-span-6 lg:col-span-4 p-8 rounded-3xl flex flex-col justify-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            }}
          >
            {/* Shine Effect */}
            <div 
              className="absolute -top-1/2 -right-1/2 w-full h-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 60%)'
              }}
            />
            
            <div className="relative z-10 space-y-6">
              <div>
                <div className="text-5xl font-extrabold text-white" style={{ letterSpacing: '-0.03em', fontFamily: 'Syne, sans-serif' }}>10x</div>
                <div className="text-sm text-white/80 mt-1">Faster decisions with AI</div>
              </div>
              <div>
                <div className="text-5xl font-extrabold text-white" style={{ letterSpacing: '-0.03em', fontFamily: 'Syne, sans-serif' }}>67%</div>
                <div className="text-sm text-white/80 mt-1">Less tool switching</div>
              </div>
            </div>
          </div>

          {/* Module Cards */}
          {MODULES.map((mod, i) => (
            <div 
              key={i}
              className="col-span-6 lg:col-span-4 p-6 rounded-2xl bg-white border border-black/5 transition-all hover:-translate-y-1 hover:shadow-xl"
              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}
            >
              <div 
                className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${mod.color}20` }}
              >
                <mod.icon size={24} style={{ color: mod.color }} />
              </div>
              <h4 className="font-bold text-lg mb-2" style={{ letterSpacing: '-0.02em' }}>{mod.name}</h4>
              <p className="text-sm opacity-60 leading-relaxed">{mod.desc}</p>
            </div>
          ))}

          {/* CTA Card */}
          <div 
            className="col-span-12 p-8 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6"
            style={{
              background: 'linear-gradient(135deg, #fafbfc 0%, #f0f4f8 100%)',
              border: '1px solid rgba(0,0,0,0.06)'
            }}
          >
            <div>
              <h4 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.02em' }}>
                Ready to transform your business?
              </h4>
              <p className="opacity-60">Start your 14-day free trial. No credit card required.</p>
            </div>
            <Link 
              to="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold whitespace-nowrap transition-all hover:-translate-y-1"
              style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                boxShadow: '0 4px 20px rgba(102, 126, 234, 0.3)'
              }}
            >
              Get Started Free
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: PRICING SECTION
// ============================================
function PricingSection() {
  const plans = [
    {
      name: 'Starter',
      price: '₦15,000',
      period: '/month',
      desc: 'Perfect for small teams getting started',
      features: ['Up to 5 users', 'Basic CRM', 'Project tracking', 'Email support'],
      popular: false
    },
    {
      name: 'Professional',
      price: '₦35,000',
      period: '/month',
      desc: 'For growing businesses with more needs',
      features: ['Up to 20 users', 'Advanced CRM', 'Finance & Invoicing', 'AI Assistant', 'Priority support'],
      popular: true
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      desc: 'For organizations at scale',
      features: ['Unlimited users', 'All modules', 'Custom integrations', 'Dedicated account manager', 'SLA guarantee'],
      popular: false
    },
  ]

  return (
    <section id="pricing" className="py-20 px-5" style={{ background: colors.frost }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4" style={{ letterSpacing: '-0.03em' }}>
            Simple, transparent pricing
          </h2>
          <p className="text-lg opacity-60">No hidden fees. No surprises. Cancel anytime.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan, i) => (
            <div 
              key={i}
              className={`relative p-8 rounded-3xl transition-all hover:-translate-y-2 ${plan.popular ? 'ring-2' : 'bg-white'}`}
              style={{ 
                ...(plan.popular ? { 
                  ringColor: colors.indigo,
                  boxShadow: `0 20px 60px rgba(102, 126, 234, 0.2)`
                } : {
                  border: '1px solid rgba(0,0,0,0.06)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
                }),
                background: plan.popular ? 'white' : 'white'
              }}
            >
              {plan.popular && (
                <div 
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
                >
                  Most Popular
                </div>
              )}
              
              <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
              <p className="text-sm opacity-60 mb-6">{plan.desc}</p>
              
              <div className="mb-6">
                <span className="text-4xl font-extrabold" style={{ letterSpacing: '-0.03em' }}>{plan.price}</span>
                {plan.period && <span className="text-sm opacity-60">{plan.period}</span>}
              </div>
              
              <ul className="space-y-3 mb-8">
                {plan.features.map((feat, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm">
                    <Check size={16} className="text-emerald-500 flex-shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>
              
              <Link 
                to="/signup"
                className={`block text-center py-3 rounded-xl font-semibold transition-all hover:-translate-y-0.5 ${
                  plan.popular 
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                    : 'bg-black/5 hover:bg-black/10'
                }`}
              >
                {plan.price === 'Custom' ? 'Contact Sales' : 'Start Free Trial'}
              </Link>
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
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="py-20 px-5">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-extrabold mb-4" style={{ letterSpacing: '-0.03em' }}>
            Frequently asked questions
          </h2>
          <p className="opacity-60">Real questions. Honest answers.</p>
        </div>

        <div className="space-y-0">
          {FAQ_DATA.map((item, i) => (
            <div key={i} style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between py-5 text-left"
              >
                <span className="font-semibold pr-4">{item.q}</span>
                <span 
                  className="text-2xl font-light flex-shrink-0 transition-transform"
                  style={{ transform: openIndex === i ? 'rotate(45deg)' : 'none' }}
                >
                  +
                </span>
              </button>
              {openIndex === i && (
                <div className="pb-5 text-sm opacity-70 leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          ))}
          <div style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }} />
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
    <section className="py-20 px-5">
      <div 
        className="max-w-4xl mx-auto p-10 md:p-16 rounded-3xl text-center relative overflow-hidden"
        style={{ background: colors.midnight }}
      >
        {/* Glow Effects */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse at 30% 30%, rgba(102, 126, 234, 0.4) 0%, transparent 50%),
              radial-gradient(ellipse at 70% 70%, rgba(218, 119, 242, 0.3) 0%, transparent 50%)
            `
          }}
        />

        <div className="relative z-10">
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4" style={{ letterSpacing: '-0.03em' }}>
            Ready to unify your business?
          </h2>
          <p className="text-lg opacity-60 mb-8 max-w-lg mx-auto">
            Join thousands of companies running their business on Avenize.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              to="/signup"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-white font-bold text-lg transition-all hover:-translate-y-1"
              style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                boxShadow: '0 8px 30px rgba(102, 126, 234, 0.4)'
              }}
            >
              Get Started Free
              <ArrowRight size={20} />
            </Link>
            <Link 
              to="/demo"
              className="inline-flex items-center justify-center px-8 py-4 rounded-2xl font-semibold text-lg text-white transition-all hover:-translate-y-1"
              style={{ 
                background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.2)'
              }}
            >
              Talk to Sales
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: FOOTER
// ============================================
function Footer() {
  return (
    <footer className="py-12 px-5" style={{ background: colors.midnight }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            >
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <div>
              <span className="font-bold text-white text-lg">Avenize</span>
              <p className="text-xs opacity-40">The Business Operating System</p>
            </div>
          </div>
          <div className="text-center md:text-right">
            <p className="text-sm opacity-40">
              Built for Nigerian businesses. Running from Lagos.
            </p>
            <p className="text-xs opacity-30 mt-1">
              © 2024 Avenize. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function LandingEnhanced() {
  return (
    <div className="min-h-screen" style={{ background: colors.pearl }}>
      <Navbar />
      <HeroSection />
      <NotificationsSection />
      <BentoFeatures />
      <PricingSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </div>
  )
}
