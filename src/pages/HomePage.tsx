console.log("HomePage loaded")
// ============================================
// AVENIZE MARKETING LANDING PAGE v2
// New Design with GSAP Animations
// ============================================

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { 
  ArrowRight, Check, ChevronDown, Menu, X,
  AlertCircle, Package, TrendingUp, Users,
  MessageSquare, CreditCard, Bell, Zap, Building2,
  BarChart3, Shield, Clock
} from 'lucide-react'

// GSAP Plugin Registration
gsap.registerPlugin(ScrollTrigger)

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
    q: "My team lives on WhatsApp. Won't they just ignore this?",
    a: "Department groups, photo sharing, and one-tap task creation are designed to feel as fast as WhatsApp — but every message links back to a real job, invoice, or stock item instead of disappearing into a chat history nobody can search."
  },
  {
    q: "What happens to my price after the first year?",
    a: "Nothing, if you stay subscribed. Founding-rate customers keep their rate for as long as they remain active — list price only applies to new signups after the founding period ends."
  }
]

// ============================================
// PROBLEMS DATA
// ============================================
const PROBLEMS = [
  {
    num: "01",
    text: "\"I don't know what's happening on my sites.\" Crews finish jobs, reporting is late or lost, and clients call before your supervisor does."
  },
  {
    num: "02",
    text: "\"We ran out of raw materials again.\" Production stops because resin or pigment wasn't reordered — or cash sits tied up in over-ordered stock."
  },
  {
    num: "03",
    text: "\"My sales team is chasing the same lead twice.\" Enquiries land in different WhatsApp groups. Deals die quietly in DMs."
  },
  {
    num: "04",
    text: "\"I don't know if we made money on that job.\" Invoicing is manual, follow-ups are awkward, and some balances just don't get paid."
  }
]

// ============================================
// PRICING SNAPSHOT DATA
// ============================================
const PRICING_SNAPSHOT = [
  { plan: "Starter", price: "₦15,000", sub: "flat / month", features: ["Core job tracking", "Basic inventory", "1–5 seats"] },
  { plan: "Team", price: "₦48,000", sub: "starting / month", features: ["Multi-location", "Office ₦8k · Field ₦4k", "6–15 seats"] },
  { plan: "Business", price: "₦112,000", sub: "starting / month", features: ["AI alerts", "Approvals", "16–30 seats"] },
  { plan: "Pro", price: "₦186,000", sub: "starting / month", features: ["Full API", "Advanced reports", "31–75 seats"], featured: true },
  { plan: "Scale", price: "₦380,000", sub: "starting / month", features: ["SSO", "Priority support", "76+ seats"] }
]

// ============================================
// SCROLL ANIMATION HOOK
// ============================================
function useScrollAnimations() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const ctx = gsap.context(() => {
      // Hero animations
      gsap.fromTo('.hero-badge', 
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.1 }
      )
      
      gsap.fromTo('.hero-title',
        { opacity: 0, y: 50 },
        { opacity: 1, y: 0, duration: 1, delay: 0.2 }
      )
      
      gsap.fromTo('.hero-cta',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, delay: 0.4 }
      )

      // Scroll-triggered animations
      gsap.utils.toArray('.animate-on-scroll').forEach((element: any) => {
        gsap.fromTo(element,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            scrollTrigger: {
              trigger: element,
              start: 'top 85%',
              toggleActions: 'play none none reverse'
            }
          }
        )
      })

      // Problem cards
      gsap.to(".problem-card", {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.12,
        ease: "power2.out",
        scrollTrigger: { trigger: ".problem-grid", start: "top 82%" }
      })

      // Pricing cards
      gsap.to(".snap-card", {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: { trigger: ".snapshot-grid", start: "top 85%" }
      })

      // Feature rows
      document.querySelectorAll(".feature-row").forEach((row) => {
        const fromLeft = !row.classList.contains("reverse")
        gsap.from(row.querySelector(".feature-copy"), {
          opacity: 0,
          x: fromLeft ? -30 : 30,
          duration: 0.7,
          ease: "power2.out",
          scrollTrigger: { trigger: row, start: "top 75%" }
        })
        gsap.from(row.querySelector(".feature-visual"), {
          opacity: 0,
          x: fromLeft ? 30 : -30,
          duration: 0.7,
          ease: "power2.out",
          delay: 0.1,
          scrollTrigger: { trigger: row, start: "top 75%" }
        })
      })

    }, containerRef)

    return () => ctx.revert()
  }, [])

  return containerRef
}

// ============================================
// COMPONENT: NAVBAR
// ============================================
function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#111111]/90 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#8B5CF6] flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-semibold text-white text-lg">Avenize</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#product" className="text-white/70 hover:text-white text-sm font-medium transition-colors">Product</a>
            <a href="#pricing" className="text-white/70 hover:text-white text-sm font-medium transition-colors">Pricing</a>
            <a href="#faq" className="text-white/70 hover:text-white text-sm font-medium transition-colors">FAQ</a>
          </div>

          {/* CTA */}
          <Link
            to="/signup"
            className="hidden md:inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-[#111111] text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            Start free setup
          </Link>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-white/10">
            <div className="flex flex-col gap-4">
              <a href="#product" className="text-white/70 hover:text-white text-sm font-medium">Product</a>
              <a href="#pricing" className="text-white/70 hover:text-white text-sm font-medium">Pricing</a>
              <a href="#faq" className="text-white/70 hover:text-white text-sm font-medium">FAQ</a>
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-white text-[#111111] text-sm font-semibold"
              >
                Start free setup
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}

// ============================================
// COMPONENT: HERO SECTION
// ============================================
function HeroSection() {
  return (
    <section className="relative min-h-screen bg-[#111111] text-white pt-20 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `repeating-linear-gradient(135deg, rgba(255,255,255,0.1) 0 1px, transparent 1px 20px)`
      }} />
      
      {/* Gradient Accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-10" style={{
        background: 'radial-gradient(circle, #4F46E5 0%, transparent 70%)'
      }} />

      <div className="relative max-w-6xl mx-auto px-6 py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Content */}
          <div>
            {/* Eyebrow */}
            <div className="hero-badge inline-flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/40 text-indigo-400 text-xs font-mono uppercase tracking-wider mb-6">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
              Built for Nigerian job sites, factories & agents
            </div>

            {/* Headline */}
            <h1 className="hero-title text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight mb-6">
              Stop running your business{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400">from memory.</span>
            </h1>

            {/* Subheadline */}
            <p className="hero-cta text-lg text-white/60 mb-8 max-w-lg leading-relaxed">
              One system for your jobs, your inventory, and your money — that tells you what needs attention before it becomes a fire.
            </p>

            {/* CTAs */}
            <div className="hero-cta flex flex-wrap gap-4 mb-10">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#8B5CF6] text-white font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-indigo-500/25"
              >
                Start free setup
                <ArrowRight size={18} />
              </Link>
              <a
                href="#product"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-white/20 text-white font-medium hover:bg-white/5 transition-colors"
              >
                See how it works
              </a>
            </div>

            {/* Trust Bar */}
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/50 font-mono">
              <span className="flex items-center gap-2">
                <Check size={14} className="text-emerald-400" />
                Naira, VAT & WHT built in
              </span>
              <span className="flex items-center gap-2">
                <Check size={14} className="text-emerald-400" />
                Works on low-end Android
              </span>
              <span className="flex items-center gap-2">
                <Check size={14} className="text-emerald-400" />
                Setup in 30 minutes
              </span>
            </div>
          </div>

          {/* Right Content - Dashboard Preview */}
          <div className="relative">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-5 shadow-2xl shadow-black/50">
              {/* Device Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                <span className="text-xs text-white/50 font-mono uppercase tracking-wider">Morning Digest — Today</span>
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  Live
                </span>
              </div>

              {/* Alert Cards */}
              <div className="space-y-3">
                <AlertCard
                  tag="Materials"
                  message="Job #124 needs 50 sheets. Only 30 in stock. Order 20 now or the crew sits idle Tuesday."
                  action="Create purchase order"
                />
                <AlertCard
                  tag="Overdue"
                  message="Client ABC owes ₦450,000 for Job #118 — 7 days overdue, 2nd occurrence."
                  action="Draft follow-up"
                />
                <AlertCard
                  tag="Leads"
                  message="3 enquiries came in this week for Lekki listings. Agent A hasn't followed up."
                  action="Reassign lead"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: ALERT CARD
// ============================================
function AlertCard({ tag, message, action }: { tag: string; message: string; action: string }) {
  return (
    <div className="bg-[#222] border border-white/10 rounded-lg p-4">
      <span className="block text-xs font-mono text-indigo-400 uppercase tracking-wider mb-2">{tag}</span>
      <p className="text-sm text-white/80 leading-relaxed mb-3">{message}</p>
      <span className="inline-block px-3 py-1.5 rounded text-xs font-mono bg-indigo-500 text-white">
        {action}
      </span>
    </div>
  )
}

// ============================================
// COMPONENT: MARQUEE STRIP
// ============================================
function MarqueeStrip() {
  const items = ["Paint & Coatings", "Real Estate Agencies", "Construction", "Logistics & Haulage", "Field Services", "Manufacturing"]
  
  return (
    <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 py-3 overflow-hidden border-y border-white/10">
      <div className="flex whitespace-nowrap animate-marquee">
        {[...items, ...items, ...items].map((item, i) => (
          <span key={i} className="mx-8 text-sm font-mono text-white/90 uppercase tracking-widest flex items-center gap-8">
            {item}
            <span className="text-white/40">◆</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ============================================
// COMPONENT: PROBLEMS SECTION
// ============================================
function ProblemsSection() {
  return (
    <section className="py-20 md:py-28 bg-[#F7F7F5]">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-12 animate-on-scroll">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-violet-600 mb-4">
            <span>§</span> The 2am List
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#111111] mb-4">Sound familiar?</h2>
          <p className="text-[#6B6B6B] max-w-lg text-lg">
            Every one of these is a business you can already run — the problem is you can't see it while it's happening.
          </p>
        </div>

        {/* Problem Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PROBLEMS.map((problem, i) => (
            <div key={i} className="problem-card bg-white border border-[#E8E8E8] rounded-xl p-6 opacity-0 translate-y-6">
              <div className="text-4xl font-bold text-[#E8E8E8] mb-4">{problem.num}</div>
              <p className="text-sm text-[#4A4A4A] leading-relaxed">{problem.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: PRODUCT FEATURES SECTION
// ============================================
function FeaturesSection() {
  const features = [
    {
      num: "01",
      title: "Where is my money and my materials?",
      description: "Every paint batch and property deal moves through one pipeline — linked to the inventory it consumes and the payment it's waiting on.",
      items: [
        "Job pipeline from enquiry to paid, with materials linked to inventory",
        "Bill-of-materials for production: resin + pigment → finished paint",
        "Market-run and partial-delivery tracking, the Nigerian way"
      ],
      visual: "pipeline"
    },
    {
      num: "02",
      title: "Tell me what I need to know before I ask.",
      description: "One AI use case, done properly: a rules engine that reads the data you already have and posts alerts before small problems become emergencies.",
      items: [
        "Stock, jobs and finance cross-checked continuously",
        "Every alert is one tap from becoming a purchase order, message, or task",
        "Mute any alert type — it's tuned to your business, not generic"
      ],
      visual: "alerts"
    },
    {
      num: "03",
      title: "Your team actually talks to each other.",
      description: "Mobile-first, works on bad internet, built to replace WhatsApp chaos without killing the familiarity your field staff already have with it.",
      items: [
        "Field crews post photo updates from site — offline, syncs later",
        "Warehouse sees stock requests from every department in one queue",
        "Owners get a morning digest instead of ten separate phone calls"
      ],
      visual: "chat"
    }
  ]

  return (
    <section id="product" className="py-20 md:py-28 bg-white border-t border-[#E8E8E8]">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-16 animate-on-scroll">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-violet-600 mb-4">
            <span>§</span> The Three-Thing Philosophy
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#111111] mb-4">
            Not an all-in-one platform. Three things that actually get used daily.
          </h2>
          <p className="text-[#6B6B6B] max-w-lg text-lg">
            Everything else — the extra modules, the integrations, the dashboards nobody opens — is deliberately Phase 2.
          </p>
        </div>

        {/* Feature Rows */}
        {features.map((feature, i) => (
          <div
            key={i}
            className={`feature-row grid lg:grid-cols-2 gap-12 lg:gap-16 py-16 border-t border-[#E8E8E8] ${i % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}
          >
            {/* Copy */}
            <div className="feature-copy">
              <div className="text-xs font-mono text-violet-600 uppercase tracking-wider mb-4">
                Thing {feature.num}
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-[#111111] mb-4 leading-tight">
                {feature.title}
              </h3>
              <p className="text-[#6B6B6B] mb-6 leading-relaxed">
                {feature.description}
              </p>
              <ul className="space-y-3">
                {feature.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm text-[#4A4A4A]">
                    <span className="text-violet-600 font-mono mt-0.5">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Visual */}
            <div className="feature-visual">
              <div className="bg-[#F7F7F5] border border-[#E8E8E8] rounded-xl p-6">
                {feature.visual === 'pipeline' && <PipelineMockup />}
                {feature.visual === 'alerts' && <AlertsMockup />}
                {feature.visual === 'chat' && <ChatMockup />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: PIPELINE MOCKUP
// ============================================
function PipelineMockup() {
  const stages = [
    { name: "Enquiry", done: true, badge: "✓ Aug 1" },
    { name: "Quoted", done: true, badge: "✓ Aug 2" },
    { name: "Materials Allocated", done: true, badge: "✓ Aug 4" },
    { name: "In Progress", active: true, badge: "crew on site" },
    { name: "Inspection", done: false },
    { name: "Invoiced", done: false },
    { name: "Paid", done: false }
  ]

  return (
    <div className="space-y-2">
      {stages.map((stage, i) => (
        <div
          key={i}
          className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-mono ${
            stage.active
              ? 'bg-[#4F46E5] text-white'
              : stage.done
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-[#E8E8E8] text-[#6B6B6B]'
          }`}
        >
          <span>{stage.name}</span>
          {stage.badge && <span className="text-xs opacity-70">{stage.badge}</span>}
        </div>
      ))}
    </div>
  )
}

// ============================================
// COMPONENT: ALERTS MOCKUP
// ============================================
function AlertsMockup() {
  return (
    <div className="space-y-3">
      <div className="bg-[#222] border border-white/10 rounded-lg p-4">
        <span className="block text-xs font-mono text-indigo-400 uppercase tracking-wider mb-2">Stock</span>
        <p className="text-sm text-white/80 mb-3">Resin running low. Last order was Supplier X at ₦4,200/liter. Reorder now?</p>
        <span className="inline-block px-3 py-1.5 rounded text-xs font-mono bg-indigo-500 text-white">Create purchase order</span>
      </div>
      <div className="bg-[#222] border border-white/10 rounded-lg p-4">
        <span className="block text-xs font-mono text-indigo-400 uppercase tracking-wider mb-2">Milestone</span>
        <p className="text-sm text-white/80 mb-3">Job #120 inspection was due yesterday. No update from site.</p>
        <span className="inline-block px-3 py-1.5 rounded text-xs font-mono bg-indigo-500 text-white">Notify supervisor</span>
      </div>
    </div>
  )
}

// ============================================
// COMPONENT: CHAT MOCKUP
// ============================================
function ChatMockup() {
  const messages = [
    { initials: "SC", name: "Site Crew", role: "Paint Production", message: "Batch #89 ready, quality check passed. Awaiting your approval to move to warehouse.", color: "#4F46E5" },
    { initials: "WH", name: "Warehouse", role: "", message: "2 stock requests pending — Factory (resin) and Production (pigment).", color: "#EC4899" },
    { initials: "FN", name: "Finance", role: "", message: "₦300,000 received from Client XYZ. Matches Invoice #204 — balance ₦150,000.", color: "#10B981" }
  ]

  return (
    <div className="space-y-4">
      {messages.map((msg, i) => (
        <div key={i} className="flex gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: msg.color }}
          >
            {msg.initials}
          </div>
          <div className="bg-[#E8E8E8] rounded-xl rounded-tl-none p-3 flex-1">
            {msg.name && <span className="block text-xs text-[#6B6B6B] mb-1">{msg.name}{msg.role && ` · ${msg.role}`}</span>}
            <p className="text-sm text-[#4A4A4A] leading-relaxed">{msg.message}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// COMPONENT: PRICING SECTION
// ============================================
function PricingSection() {
  return (
    <section id="pricing" className="py-20 md:py-28 bg-[#111111] text-white">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-12 animate-on-scroll">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-indigo-400 mb-4">
            <span>§</span> Founding Rate
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Priced for how your business actually grows.
          </h2>
          <p className="text-white/60 max-w-lg text-lg mb-6">
            Five self-serve tiers, no sales calls at any size — from a solo operator to a 100-seat crew.
          </p>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-sm font-mono text-white/60 max-w-2xl">
            <strong className="text-indigo-400">Founding rate:</strong> every price below is locked for your first 12 months — and stays locked for as long as you keep your subscription active, even after list price rises for new signups. Pay annually and get 2 months free.
          </div>
        </div>

        {/* Pricing Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {PRICING_SNAPSHOT.map((plan, i) => (
            <div
              key={i}
              className={`snap-card rounded-xl p-5 border opacity-0 translate-y-6 transition-all hover:border-indigo-500/50 ${
                plan.featured
                  ? 'bg-indigo-500/10 border-indigo-500'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              <div className="text-xs font-mono text-indigo-400 uppercase tracking-wider mb-3 min-h-[24px]">
                {plan.plan}
              </div>
              <div className="text-2xl font-bold font-mono mb-1">
                {plan.price}
                <small className="block text-xs font-normal text-white/50 mt-1">{plan.sub}</small>
              </div>
              <ul className="mt-4 space-y-2">
                {plan.features.map((feature, j) => (
                  <li key={j} className="text-xs text-white/70">{feature}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* View All Plans Link */}
        <div className="mt-10 text-center">
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-medium"
          >
            View all plans and pricing details
            <ArrowRight size={16} />
          </Link>
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
    <section id="faq" className="py-20 md:py-28 bg-[#F7F7F5]">
      <div className="max-w-3xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-12 animate-on-scroll">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-violet-600 mb-4">
            <span>§</span> Before You Ask
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#111111]">
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
// COMPONENT: STATS SECTION
// ============================================
function StatsSection() {
  const stats = [
    { value: "₦150k–300k", label: "Monthly cost of one admin hire — Avenize is priced to replace 1–2 of those roles, not add another one." },
    { value: "₦1M+", label: "Typical upfront cost of a local ERP quote, plus 20% annual maintenance. Avenize is self-serve from day one." },
    { value: "21 → 14", label: "Target reduction in \"days to cash\" — from job completion to money in the bank. The number that actually pays for the subscription." }
  ]

  return (
    <section className="py-16 bg-white border-t border-[#E8E8E8]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="border-t-2 border-violet-600 pt-6 animate-on-scroll">
              <span className="block text-3xl font-bold font-mono text-violet-600 mb-3">{stat.value}</span>
              <p className="text-sm text-[#6B6B6B] leading-relaxed">{stat.label}</p>
            </div>
          ))}
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
    <section className="relative py-24 md:py-32 bg-[#111111] text-white text-center overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 opacity-20" style={{
        background: 'radial-gradient(ellipse at 50% 100%, #4F46E5 0%, transparent 60%)'
      }} />

      <div className="relative max-w-3xl mx-auto px-6">
        <blockquote className="text-2xl md:text-4xl font-bold leading-tight mb-8">
          Your crews are on sites you can't visit daily. Your factory runs out of resin without warning.{' '}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400">
            Find out before it's an emergency.
          </span>
        </blockquote>

        <Link
          to="/signup"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#8B5CF6] text-white font-semibold text-lg hover:opacity-90 transition-opacity shadow-xl shadow-indigo-500/25"
        >
          Start free setup
        </Link>

        <p className="mt-6 text-sm text-white/50 font-mono uppercase tracking-wider">
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
    <footer className="bg-[#0a0a0a] text-white/50 py-10 border-t border-white/10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
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
export default function HomePage() {
  const containerRef = useScrollAnimations()

  return (
    <div ref={containerRef} className="min-h-screen bg-[#F7F7F5]">
      <Navbar />
      <HeroSection />
      <MarqueeStrip />
      <ProblemsSection />
      <FeaturesSection />
      <PricingSection />
      <FAQSection />
      <StatsSection />
      <CTASection />
      <Footer />

      {/* Marquee Animation Style */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  )
}
