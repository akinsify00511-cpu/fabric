// ============================================
// AVENIZE MARKETING LANDING PAGE v2
// New Design with GSAP Animations
// ============================================

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { 
  ArrowRight, Check, Menu, X
} from 'lucide-react'

// GSAP Plugin Registration
gsap.registerPlugin(ScrollTrigger)

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
    q: "My team will say this is one more app to check. They'll ignore it.",
    a: "Fair. But Avenize isn't another app to check — it's where work already happens. Site updates, stock requests, payment alerts. Same speed as WhatsApp, but the message disappears into a job that actually gets tracked, not a group chat nobody can search."
  },
  {
    q: "What if my business grows past the plan or shrinks during a slow season?",
    a: "You add seats when you hire. You remove them when you don't. No contracts locking you in. And your founding rate? It stays yours — even when list price goes up for new signups next year."
  }
]

// ============================================
// DASHBOARDS DATA
// ============================================
const DASHBOARDS = [
  {
    role: "Business Owner",
    icon: "👑",
    color: "from-orange-500 to-pink-500",
    tagline: "See everything. Control everything.",
    features: [
      "Real-time view of all operations across locations",
      "Cash flow dashboard: money in, money out, money owed",
      "Profit margins per job, per product, per team",
      "Alert system: problems reach you before clients do",
      "Performance scorecards for every team and person",
      "Quick decisions with one-click reports"
    ],
    metrics: ["Revenue", "Profit", "Cash Flow", "Team Performance"]
  },
  {
    role: "Team Lead / Supervisor",
    icon: "🎯",
    color: "from-blue-500 to-cyan-500",
    tagline: "Manage your team without chasing them.",
    features: [
      "Track field staff location and job status in real-time",
      "Assign tasks and jobs with one tap",
      "Monitor individual and team productivity scores",
      "Approve requests: purchases, expenses, leaves",
      "Get instant alerts when jobs complete or delay",
      "Send updates to team without group chat chaos"
    ],
    metrics: ["Jobs Completed", "On-Time Rate", "Team Utilization", "Pending Tasks"]
  },
  {
    role: "Accounting / Finance",
    icon: "💰",
    color: "from-emerald-500 to-teal-500",
    tagline: "Numbers you can trust. Every time.",
    features: [
      "Automated invoicing linked to completed jobs",
      "Track payments: received, pending, overdue",
      "VAT and WHT calculations done automatically",
      "Expense tracking with receipts and approvals",
      "Bank reconciliation: GTBank, Access, UBA integration",
      "Generate P&L, balance sheet, cash flow reports"
    ],
    metrics: ["Receivables", "Payables", "Cash Position", "Invoice Status"]
  },
  {
    role: "Admin / Operations",
    icon: "⚙️",
    color: "from-purple-500 to-violet-500",
    tagline: "Keep everything running. Smoothly.",
    features: [
      "Inventory management: stock levels, reorder points",
      "Vendor management and purchase approvals",
      "Document management: contracts, certificates",
      "Leave tracking and staff scheduling",
      "Asset tracking: equipment, vehicles, tools",
      "System settings and user permissions"
    ],
    metrics: ["Stock Levels", "Open Purchases", "Pending Approvals", "Staff on Leave"]
  },
  {
    role: "HR / People",
    icon: "👥",
    color: "from-pink-500 to-rose-500",
    tagline: "Your people, organized. Your culture, protected.",
    features: [
      "Staff database: contacts, roles, departments",
      "Attendance and time tracking",
      "Leave management with approval workflows",
      "Performance reviews and goal setting",
      "Payroll-ready timesheets",
      "Training records and certifications"
    ],
    metrics: ["Headcount", "Attendance", "Leave Balance", "Performance Scores"]
  },
  {
    role: "Sales Head",
    icon: "📈",
    color: "from-red-500 to-orange-500",
    tagline: "Never lose a deal. Never miss a follow-up.",
    features: [
      "Pipeline view: enquiry → quote → won/lost",
      "Track every enquiry across all agents",
      "Automated follow-up reminders",
      "Win/loss analysis by agent, product, period",
      "Commission calculation linked to payments",
      "Territory and agent performance reports"
    ],
    metrics: ["Conversion Rate", "Pipeline Value", "Win Rate", "Avg Deal Size"]
  },
  {
    role: "Business Development",
    icon: "🚀",
    color: "from-yellow-500 to-amber-500",
    tagline: "Find opportunities. Close them faster.",
    features: [
      "Lead capture from multiple sources",
      "Qualify and score leads automatically",
      "Proposal and quote generation",
      "Track competitor mentions in conversations",
      "Market analysis and trend reports",
      "Partnership and referral tracking"
    ],
    metrics: ["Lead Sources", "Qualified Leads", "Proposal Sent", "Close Rate"]
  },
  {
    role: "Marketing",
    icon: "📣",
    color: "from-indigo-500 to-blue-500",
    tagline: "Know what's working. Double down on it.",
    features: [
      "Campaign tracking: leads generated, deals closed",
      "Source analysis: which channel brings revenue",
      "Content performance metrics",
      "Customer acquisition cost tracking",
      "Brand mention monitoring",
      "ROI calculation per marketing activity"
    ],
    metrics: ["Leads by Source", "Campaign ROI", "CAC", "Brand Mentions"]
  }
]

// ============================================
// PROBLEMS DATA
// ============================================
const PROBLEMS = [
  {
    num: "01",
    problem: "Your operations just stopped.",
    story: "Materials didn't arrive. Or they did, but nobody told the team. You're paying workers to wait, losing hours, and your delivery date is now at risk.",
    cost: "Lost time. Delayed deliveries. Unhappy clients."
  },
  {
    num: "02",
    problem: "The client knows before you do.",
    story: "The job finished yesterday. But you found out from the person paying you — not from your own team. You're always the last to know.",
    cost: "No control. No visibility. Lost trust."
  },
  {
    num: "03",
    problem: "Your team quoted the same job twice.",
    story: "Two agents chased the same enquiry. Different prices. The client noticed. They know your team isn't coordinated. That deal? Probably gone.",
    cost: "Lost deals. Damaged reputation. Wasted effort."
  },
  {
    num: "04",
    problem: "You think you made profit. You're not sure.",
    story: "Invoice sent. Follow-up became awkward. Payment... somewhere in transit? You won't know until reconciliation — which is never when you need it.",
    cost: "Cash flow gaps. Surprise losses. No warning."
  },
  {
    num: "05",
    problem: "Your team lives on scattered messaging apps.",
    story: "Updates get lost in chat. Photos disappear. Nobody knows the real status. You spend half your day asking 'what's happening?'",
    cost: "Miscommunication. Duplicated effort. Late nights."
  },
  {
    num: "06",
    problem: "Stock ran out. Again.",
    story: "You didn't know supplies were low. Now operations are paused while you wait for emergency delivery — at emergency prices. This keeps happening.",
    cost: "Emergency orders. Premium costs. Missed deadlines."
  },
  {
    num: "07",
    problem: "Three apps. Zero clarity.",
    story: "Your work is in one place. Your inventory in another. Your money somewhere else. You spend hours stitching together reports that should take seconds.",
    cost: "Hours wasted. Decisions delayed. Burnout incoming."
  },
  {
    num: "08",
    problem: "You built this. But you can't leave it.",
    story: "You started this business for freedom. Now you're working long days and can't step away without everything falling apart.",
    cost: "Your energy. Your family time. Your sanity."
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
            Get started free
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
                Get started free
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
    <section className="relative min-h-screen bg-slate-900 text-white pt-16 md:pt-20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950" />
      
      <div className="relative max-w-7xl mx-auto px-6 py-12 md:py-20 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          {/* Left Content */}
          <div>
            {/* Eyebrow */}
            <div className="hero-badge inline-flex items-center gap-3 px-4 py-2 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              Built for Nigerian Businesses
            </div>

            {/* Headline */}
            <h1 className="hero-title text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              <span className="text-white">Stop running your business.</span>
              <br />
              <span className="text-indigo-400">
                Start leading it.
              </span>
            </h1>

            {/* Subheadline */}
            <p className="hero-cta text-lg md:text-xl text-slate-300 mb-6 max-w-xl leading-relaxed">
              Get alerts before supplies run out, invoices go unpaid, and clients complain. Know first — always.
            </p>
            
            <p className="text-base text-slate-400 mb-8 max-w-xl">
              Avenize monitors your business 24/7 and notifies you the moment something needs attention.
            </p>

            {/* CTAs */}
            <div className="hero-cta flex flex-wrap gap-3 mb-8">
              <Link
                to="/signup"
                className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
              >
                Stop the chaos
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#product"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-600 text-white font-medium hover:bg-slate-800 transition-colors"
              >
                See how it works
              </a>
            </div>

            {/* Trust Bar */}
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <span className="flex items-center gap-2 text-emerald-400">
                <Check size={16} />
                <span className="text-slate-300">Naira, VAT, WHT built in</span>
              </span>
              <span className="flex items-center gap-2 text-emerald-400">
                <Check size={16} />
                <span className="text-slate-300">Works on low-end Android</span>
              </span>
              <span className="flex items-center gap-2 text-emerald-400">
                <Check size={16} />
                <span className="text-slate-300">Live in 30 minutes</span>
              </span>
            </div>
          </div>

          {/* Right Content - Dashboard Preview */}
          <div className="relative mt-8 lg:mt-0">
            <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-4 md:p-5 shadow-2xl">
              {/* Device Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-700 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                </div>
                <span className="text-xs text-slate-500 uppercase tracking-wider">6:45 AM</span>
              </div>

              {/* Alert Cards */}
              <div className="space-y-3">
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-bold text-orange-400 uppercase">Stock Alert</span>
                    <span className="text-xs text-red-400 font-mono">Now</span>
                  </div>
                  <p className="text-white text-sm mb-2">Supplies at 180L. Last order N4,200/L. Order needed today.</p>
                  <button className="w-full py-2 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 transition-colors">
                    Create Order
                  </button>
                </div>
                
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-bold text-red-400 uppercase">7 Days Overdue</span>
                    <span className="text-xs text-red-400 font-mono font-bold">N680,000</span>
                  </div>
                  <p className="text-white text-sm mb-2">Client: ABC Company. Called twice. No answer.</p>
                  <button className="w-full py-2 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors">
                    Send Reminder
                  </button>
                </div>
                
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-bold text-emerald-400 uppercase">Job Complete</span>
                    <span className="text-xs text-slate-400 font-mono">Now</span>
                  </div>
                  <p className="text-white text-sm mb-2">Project finished. Awaiting your approval.</p>
                  <button className="w-full py-2 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors">
                    Review & Approve
                  </button>
                </div>
              </div>
              
              {/* Bottom Status */}
              <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
                <span className="text-xs text-slate-500">3 alerts need attention</span>
                <span className="flex items-center gap-2 text-xs text-emerald-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Live
                </span>
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
  const items = [
    "Manufacturing",
    "Logistics",
    "Retail & E-Commerce",
    "Professional Services",
    "Healthcare",
    "Education",
    "Media & Advertising",
    "Technology",
    "Agriculture",
    "Food & Beverage",
    "Fashion & Textiles",
    "Automotive"
  ]
  
  return (
    <div className="bg-slate-900 py-4 overflow-hidden border-y border-slate-800">
      <div className="flex whitespace-nowrap animate-marquee">
        {[...items, ...items, ...items].map((item, i) => (
          <span key={i} className="mx-8 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-8">
            {item}
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
    <section className="py-16 md:py-24 bg-white relative">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-12 md:mb-16 animate-on-scroll text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider mb-6">
            The Problem
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 mb-6 leading-tight">
            Running a business is hard.<br className="hidden md:block" />
            <span className="text-slate-500"> Managing it shouldn't be this chaotic.</span>
          </h2>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Every day, these silent problems drain your time, money, and energy. You know them. You're probably living with them right now.
          </p>
        </div>

        {/* Problem Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {PROBLEMS.map((problem, i) => (
            <div 
              key={i} 
              className="problem-card group bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-400 hover:shadow-lg transition-all duration-300 opacity-0 translate-y-4"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {/* Number Badge */}
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-4">
                <span className="text-lg font-bold text-slate-400">{problem.num}</span>
              </div>
              
              {/* Problem Title */}
              <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors">
                {problem.problem}
              </h3>
              
              {/* Story */}
              <p className="text-sm text-slate-500 leading-relaxed mb-4">
                {problem.story}
              </p>
              
              {/* Cost Tag */}
              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs font-medium text-rose-600">
                  {problem.cost}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Transformation CTA */}
        <div className="mt-12 md:mt-16 text-center animate-on-scroll">
          <div className="inline-block bg-indigo-600 rounded-2xl px-8 py-6">
            <p className="text-xl md:text-2xl font-bold text-white mb-2">
              It doesn't have to be this way.
            </p>
            <p className="text-indigo-200">
              Avenize was built for exactly these moments. See how below.
            </p>
          </div>
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
      problem: "You're constantly chasing updates.",
      solution: "See everything in one place.",
      description: "Stop asking 'what's happening?' Every job, every item, every payment — linked together. You see the whole picture without calling anyone.",
      items: [
        "Job pipeline: enquiry, quote, materials, work, invoice, payment",
        "Stock linked to jobs. Reorder point hit? You know immediately.",
        "Multi-location: all your operations in one view"
      ],
      visual: "pipeline"
    },
    {
      num: "02",
      problem: "You find out about problems too late.",
      solution: "Get alerts before it becomes urgent.",
      description: "Avenize watches your business 24/7. When supplies drop low, you get the alert. When invoices go overdue, you know. Before it becomes a crisis.",
      items: [
        "Stock alerts: reorder before you run out",
        "Payment alerts: flag overdue invoices early",
        "Update alerts: team finishes, you know first"
      ],
      visual: "alerts"
    },
    {
      num: "03",
      problem: "Your team uses scattered messaging apps. Work gets lost.",
      solution: "Same speed. Better tracking.",
      description: "Messaging apps are fine for chat. But updates, requests, and confirmations should link to real work. Avenize is fast with proper business tracking.",
      items: [
        "Photo updates from anywhere, syncs when signal returns",
        "Requests go straight to the right person",
        "Your daily digest: what finished, what's waiting"
      ],
      visual: "chat"
    }
  ]

  return (
    <section id="product" className="py-16 md:py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-12 md:mb-16 animate-on-scroll text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-semibold uppercase tracking-wider mb-6">
            The Solution
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 mb-6">
            Three things that fix everything.
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            No complicated dashboards. No features nobody uses. Just the essentials — connected.
          </p>
        </div>

        {/* Feature Rows */}
        {features.map((feature, i) => (
          <div
            key={i}
            className={`feature-row grid lg:grid-cols-2 gap-8 lg:gap-16 py-12 md:py-16 border-t border-slate-200 ${i % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}
          >
            {/* Copy */}
            <div className="feature-copy">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-bold uppercase tracking-wider mb-4">
                {feature.num === "01" ? "01 The View" : feature.num === "02" ? "02 The Alert" : "03 The Channel"}
              </div>
              
              {/* Problem */}
              <div className="mb-4 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                <p className="text-sm text-rose-700 font-medium">{feature.problem}</p>
              </div>
              
              {/* Solution */}
              <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 leading-tight">
                {feature.solution}
              </h3>
              
              <p className="text-base text-slate-600 mb-6 leading-relaxed">
                {feature.description}
              </p>
              
              <ul className="space-y-3">
                {feature.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm md:text-base text-slate-700">
                    <span className="text-emerald-500 text-lg mt-0.5 flex-shrink-0">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Visual */}
            <div className="feature-visual">
              <div className="relative">
                <div className="absolute -inset-4 bg-indigo-500/5 rounded-3xl blur-xl" />
                <div className="relative bg-white border border-slate-200 rounded-2xl p-4 md:p-6 shadow-lg">
                  {feature.visual === 'pipeline' && <PipelineMockup />}
                  {feature.visual === 'alerts' && <AlertsMockup />}
                  {feature.visual === 'chat' && <ChatMockup />}
                </div>
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
    { name: "Enquiry", done: true, badge: "Lekki Villa inquiry" },
    { name: "Quote Sent", done: true, badge: "₦1.2M sent" },
    { name: "Materials Ordered", done: true, badge: "Chimic Plus" },
    { name: "On Site", active: true, badge: "Day 2 of 5" },
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
        <span className="block text-xs font-mono text-indigo-400 uppercase tracking-wider mb-2">Stock Alert</span>
        <p className="text-sm text-white/80 mb-3">Resin at 180L. Last order: Chemical Plus, ₦4,200/L. Reorder now or production stops Tuesday.</p>
        <span className="inline-block px-3 py-1.5 rounded text-xs font-mono bg-indigo-500 text-white">Create PO →</span>
      </div>
      <div className="bg-[#222] border border-white/10 rounded-lg p-4">
        <span className="block text-xs font-mono text-indigo-400 uppercase tracking-wider mb-2">Payment: 7 days overdue</span>
        <p className="text-sm text-white/80 mb-3">Alhaji Saka — ₦680,000 for Lekki Villa job. Called twice. No answer.</p>
        <span className="inline-block px-3 py-1.5 rounded text-xs font-mono bg-indigo-500 text-white">Send reminder →</span>
      </div>
    </div>
  )
}

// ============================================
// COMPONENT: CHAT MOCKUP
// ============================================
function ChatMockup() {
  const messages = [
    { initials: "SC", name: "Site Crew", role: "IKM Project", message: "Roofing 90% done. Inspector photo attached. Awaiting your sign-off to invoice Alhaji.", color: "#4F46E5" },
    { initials: "WH", name: "Warehouse", role: "", message: "Chimic Plus delivered 500L resin. Stock updated. Factory notified.", color: "#EC4899" },
    { initials: "FN", name: "Finance", role: "", message: "GTBank alert: ₦450,000 received from ABC Holdings. Matches Invoice #147.", color: "#10B981" }
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
// COMPONENT: DASHBOARDS SECTION
// ============================================
function DashboardsSection() {
  const [activeTab, setActiveTab] = useState(0)
  
  return (
    <section className="py-20 md:py-28 bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-12 animate-on-scroll text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/20 to-pink-500/20 border border-orange-500/30 text-orange-400 text-sm font-bold uppercase tracking-wider mb-6">
            <span>🎛️</span> Command Centers for Every Role
          </div>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6">
            Every role. Every dashboard.<br />
            <span className="bg-gradient-to-r from-orange-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">One system.</span>
          </h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            From the owner who needs the big picture to the team lead managing daily operations — everyone gets their own command center.
          </p>
        </div>

        {/* Dashboard Tabs */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex gap-3 min-w-max pb-4">
            {DASHBOARDS.map((dashboard, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  activeTab === i
                    ? `bg-gradient-to-r ${dashboard.color} text-white shadow-lg`
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <span className="text-xl">{dashboard.icon}</span>
                <span>{dashboard.role}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Active Dashboard Display */}
        <div className="animate-on-scroll">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-3xl p-8 md:p-12">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-r ${DASHBOARDS[activeTab].color} flex items-center justify-center text-3xl shadow-lg`}>
                  {DASHBOARDS[activeTab].icon}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">{DASHBOARDS[activeTab].role}</h3>
                  <p className="text-slate-400">"{DASHBOARDS[activeTab].tagline}"</p>
                </div>
              </div>
              
              {/* Key Metrics */}
              <div className="flex flex-wrap gap-3">
                {DASHBOARDS[activeTab].metrics.map((metric, i) => (
                  <div key={i} className="px-4 py-2 bg-slate-700/50 rounded-lg border border-slate-600">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">{metric}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {DASHBOARDS[activeTab].features.map((feature, i) => (
                <div 
                  key={i} 
                  className="flex items-start gap-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors"
                >
                  <span className="text-emerald-400 text-xl mt-0.5">✓</span>
                  <span className="text-slate-300">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Role Navigation Dots */}
        <div className="flex justify-center gap-2 mt-8">
          {DASHBOARDS.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`w-3 h-3 rounded-full transition-all ${
                activeTab === i ? 'bg-orange-500 w-8' : 'bg-slate-600 hover:bg-slate-500'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: PRICING SECTION
// ============================================
function PricingSection() {
  return (
    <section id="pricing" className="py-16 md:py-24 bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-12 animate-on-scroll text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-6">
            Founding Rate - Locked In
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
            Less than your data bundle.<br />
            <span className="text-indigo-400">Runs your whole business.</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
            Five tiers, no sales calls, no consultants — from one person to 100 seats.
          </p>
          <div className="inline-block bg-indigo-600 rounded-2xl px-8 py-5">
            <p className="text-lg font-bold text-white mb-1">
              Founding rate locked for 12 months.
            </p>
            <p className="text-indigo-200">
              Your price stays yours — even when list price goes up. Pay annually, get 2 months free.
            </p>
          </div>
        </div>

        {/* Pricing Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          {PRICING_SNAPSHOT.map((plan, i) => (
            <div
              key={i}
              className={`snap-card rounded-xl p-4 md:p-5 border opacity-0 translate-y-6 transition-all hover:border-indigo-500/50 ${
                plan.featured
                  ? 'bg-indigo-500/10 border-indigo-500'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              <div className="text-xs font-mono text-indigo-400 uppercase tracking-wider mb-3 min-h-[20px]">
                {plan.plan}
              </div>
              <div className="text-xl md:text-2xl font-bold font-mono mb-1">
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
        <div className="mt-8 text-center">
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
    <section id="faq" className="py-16 md:py-24 bg-slate-50">
      <div className="max-w-3xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-12 animate-on-scroll text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-200 border border-slate-300 text-slate-600 text-xs font-semibold uppercase tracking-wider mb-6">
            Real Questions
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            What operators always ask before they start.
          </h2>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            Honest answers. No sales talk.
          </p>
        </div>

        {/* FAQ List */}
        <div className="space-y-0">
          {FAQ_DATA.map((item, i) => (
            <div key={i} className="border-t border-slate-200">
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between py-5 text-left"
              >
                <span className="font-semibold text-slate-900 pr-4">{item.q}</span>
                <span className={`text-indigo-600 text-xl font-mono flex-shrink-0 transition-transform ${openIndex === i ? 'rotate-45' : ''}`}>+</span>
              </button>
              {openIndex === i && (
                <div className="pb-5 text-slate-600 leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          ))}
          <div className="border-b border-slate-200" />
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
    { 
      value: "N2.4M/yr", 
      label: "What one admin on N200k/month costs you annually. Avenize automates the tracking - you redeploy that person to execution.",
    },
    { 
      value: "30 mins", 
      label: "Time to get live. No consultants, no lengthy implementations. Just sign up and start.",
    },
    { 
      value: "24/7", 
      label: "Automated monitoring. Flags issues early - so your follow-up isn't 'if' but 'when.'",
    }
  ]

  return (
    <section className="py-12 md:py-16 bg-slate-100">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="text-center animate-on-scroll">
              <span className="block text-3xl md:text-4xl font-bold text-indigo-600 mb-2">{stat.value}</span>
              <p className="text-slate-600 text-sm md:text-base leading-relaxed max-w-xs mx-auto">{stat.label}</p>
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
    <section className="relative py-16 md:py-24 bg-slate-900 text-white text-center">
      <div className="relative max-w-4xl mx-auto px-6">
        <div className="mb-8">
          <p className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight mb-6">
            <span className="text-white">Your operations stopped at 9am.</span>
            <br />
            <span className="text-slate-500">Your team only told you now.</span>
          </p>
          
          <p className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight">
            <span className="text-indigo-400">
              Tomorrow doesn't have to be like today.
            </span>
          </p>
        </div>

        {/* Emotional Hook */}
        <div className="mb-8 p-6 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl">
          <p className="text-base md:text-lg text-slate-300">
            <span className="text-white font-semibold">Avenize was built for exactly this moment.</span><br />
            The moment before it becomes urgent. The moment you wish you'd known sooner.
          </p>
        </div>

        <Link
          to="/signup"
          className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-indigo-600 text-white font-semibold text-lg hover:bg-indigo-700 transition-colors"
        >
          Stop the chaos. Start Avenize.
          <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
        </Link>

        <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-slate-400">
          <span className="flex items-center gap-2">
            <span className="text-emerald-400">✓</span> Setup in 30 minutes
          </span>
          <span className="flex items-center gap-2">
            <span className="text-emerald-400">✓</span> Works on low-end Android
          </span>
          <span className="flex items-center gap-2">
            <span className="text-emerald-400">✓</span> No credit card required
          </span>
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
    <footer className="bg-slate-950 text-white/50 py-12 border-t border-slate-800">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 via-pink-500 to-purple-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <div>
              <span className="font-bold text-white text-lg">Avenize</span>
              <p className="text-xs text-slate-500">The Business Operating System</p>
            </div>
          </div>
          <div className="text-center md:text-right">
            <p className="text-sm text-slate-400">
              Built for Nigerian businesses. Running from Lagos.
            </p>
            <p className="text-xs text-slate-600 mt-1">
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
export default function Landing() {
  const containerRef = useScrollAnimations()

  return (
    <div ref={containerRef} className="min-h-screen bg-[#F7F7F5]">
      <Navbar />
      <HeroSection />
      <MarqueeStrip />
      <ProblemsSection />
      <FeaturesSection />
      <DashboardsSection />
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
