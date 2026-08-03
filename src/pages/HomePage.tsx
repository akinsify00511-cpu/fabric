console.log("HomePage loaded")
// ============================================
// AVENIZE MARKETING LANDING PAGE
// CRO-Optimized, SEO, GSAP Animated, AEO/AGEO Ready
// ============================================

import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { 
  ArrowRight, Check, Star, Zap, Shield, Users, BarChart3, 
  Clock, Globe, ChevronDown, Play, Layers, Workflow,
  Headphones, TrendingUp, Database, Puzzle, CreditCard,
  Bot, Sparkles, Mic, FileText, Calendar, Settings,
  ChevronRight, Menu, X
} from 'lucide-react'

// GSAP Plugin Registration
gsap.registerPlugin(ScrollTrigger)

// ============================================
// FAQ DATA FOR AEO (Answer Engine Optimization)
// ============================================
const FAQ_DATA = [
  {
    q: "What is Avenize?",
    a: "Avenize is the Business Operating System—a unified platform connecting CRM, projects, finance, HR, and AI tools. Everything works together in one beautifully designed system."
  },
  {
    q: "How does Avenize save time?",
    a: "By eliminating app-switching and data duplication. Teams work from one source of truth, with automated workflows saving an average of 12 hours per week per employee."
  },
  {
    q: "Is my data secure?",
    a: "Enterprise-grade security with SOC 2 Type II certification, GDPR compliance, 256-bit encryption, SSO, and 2FA. Your data is protected at every level."
  },
  {
    q: "Can I start with just one feature?",
    a: "Absolutely. Start with CRM, projects, or any module you need. Add more as you grow—no migration, no new accounts."
  },
  {
    q: "How much does Avenize cost?",
    a: "Start free with Core plan. Professional is $29/user/month. Enterprise is $49/user/month with dedicated support."
  },
  {
    q: "What makes Avenize different?",
    a: "Unlike disconnected tools, Avenize flows data between modules. Insights compound, collaboration increases, and your business operates as one unified system."
  }
]

// ============================================
// FEATURES DATA
// ============================================
const FEATURES = [
  {
    icon: Database,
    title: "Unified CRM",
    description: "Track leads, deals, and customers in one place. No more copying data between systems.",
    tag: "Sales"
  },
  {
    icon: Workflow,
    title: "Project Management",
    description: "From simple tasks to complex portfolios. Visualize progress, automate workflows.",
    tag: "Operations"
  },
  {
    icon: CreditCard,
    title: "Smart Finance",
    description: "Invoicing, expenses, and cash flow in real-time. Always know where you stand.",
    tag: "Finance"
  },
  {
    icon: Users,
    title: "People & HR",
    description: "Onboarding, time tracking, leave management. Empower your team to self-serve.",
    tag: "HR"
  },
  {
    icon: Calendar,
    title: "Team Calendar",
    description: "Shared calendars, event scheduling, and availability visibility for the whole team.",
    tag: "Scheduling"
  },
  {
    icon: FileText,
    title: "Knowledge Base",
    description: "Documentation, wikis, and shared resources. Company knowledge in one searchable place.",
    tag: "Knowledge"
  },
  {
    icon: Settings,
    title: "Automations",
    description: "Workflow automation without code. Connect apps, automate tasks, save time.",
    tag: "Automation"
  },
  {
    icon: Headphones,
    title: "Support Tickets",
    description: "Customer support management with queues, assignments, and SLA tracking.",
    tag: "Support"
  }
]

// ============================================
// TESTIMONIALS DATA
// ============================================
const TESTIMONIALS = [
  {
    quote: "We replaced four tools with Avenize. Our team finally works in one place.",
    author: "Sarah Chen",
    role: "COO",
    company: "TechScale Inc.",
    rating: 5
  },
  {
    quote: "The meeting notes feature alone saved us 10 hours a week. It's a game changer.",
    author: "Marcus Johnson",
    role: "VP Operations",
    company: "GrowthLab",
    rating: 5
  },
  {
    quote: "Onboarding new hires used to take days. Now it takes hours with all our processes in Avenize.",
    author: "Emily Rodriguez",
    role: "Head of People",
    company: "RemoteFirst",
    rating: 5
  }
]

// ============================================
// SOCIAL PROOF STATS
// ============================================
const STATS = [
  { value: "10,000+", label: "Active Teams" },
  { value: "4.8/5", label: "G2 Rating" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "12hrs", label: "Saved Weekly" }
]

// ============================================
// COMING SOON FEATURES
// ============================================
const COMING_SOON = [
  { icon: Mic, title: "AI Meeting Notes", description: "Automatic transcription and summarization" },
  { icon: Bot, title: "AI Assistant", description: "Intelligent automation suggestions" },
  { icon: Sparkles, title: "AI Predictions", description: "Business intelligence powered by AI" }
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
          { opacity: 0, y: 60 },
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

      // Stagger animations for feature cards
      gsap.utils.toArray('.feature-card').forEach((card: any, i: number) => {
        gsap.fromTo(card,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            delay: i * 0.1,
            scrollTrigger: {
              trigger: card,
              start: 'top 85%'
            }
          }
        )
      })

      // Parallax effect for hero background
      gsap.to('.hero-bg', {
        y: 100,
        ease: 'none',
        scrollTrigger: {
          trigger: '.hero-section',
          start: 'top top',
          end: 'bottom top',
          scrub: true
        }
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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-black/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-bold text-xl text-gray-900">Avenize</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Features</a>
            <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
            <a href="#testimonials" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Reviews</a>
            <a href="#faq" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">FAQ</a>
          </div>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 px-4 py-2">
              Sign In
            </Link>
            <Link to="/signup" className="text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity">
              Start Free
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-black/5 py-4">
          <div className="px-4 space-y-3">
            <a href="#features" className="block text-gray-600 hover:text-gray-900 py-2">Features</a>
            <a href="#pricing" className="block text-gray-600 hover:text-gray-900 py-2">Pricing</a>
            <a href="#testimonials" className="block text-gray-600 hover:text-gray-900 py-2">Reviews</a>
            <a href="#faq" className="block text-gray-600 hover:text-gray-900 py-2">FAQ</a>
            <div className="pt-3 border-t border-black/5 flex flex-col gap-2">
              <Link to="/login" className="text-center py-2 text-gray-600">Sign In</Link>
              <Link to="/signup" className="text-center py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg">
                Start Free
              </Link>
            </div>
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
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background */}
      <div className="hero-bg absolute inset-0 bg-gradient-to-br from-violet-50 via-indigo-50 to-white" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(99,102,241,0.1),transparent_50%)]" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        {/* Badge */}
        <div className="hero-badge inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-100 text-violet-700 text-sm font-medium mb-8">
          <Sparkles size={16} />
          <span>Now with AI-Powered Features Coming Soon</span>
        </div>

        {/* Title */}
        <h1 className="hero-title text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-gray-900 mb-6">
          The Business<br />
          <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Operating System
          </span>
        </h1>

        {/* Subtitle */}
        <p className="hero-badge text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto mb-10">
          Everything. Together. CRM, Projects, Finance, HR, and more—all in one platform.
          <br className="hidden md:block" />
          No more switching apps. No more lost data. Just work.
        </p>

        {/* CTA Buttons */}
        <div className="hero-cta flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <Link
            to="/signup"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/25"
          >
            Start Free
            <ArrowRight size={20} />
          </Link>
          <a
            href="#demo"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-xl border-2 border-gray-200 font-semibold text-lg hover:border-gray-300 hover:bg-gray-50 transition-all"
          >
            <Play size={20} />
            Watch Demo
          </a>
        </div>

        {/* Trust Badge */}
        <p className="hero-badge text-sm text-gray-500">
          Free forever • No credit card • Setup in 2 minutes
        </p>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown size={32} className="text-gray-400" />
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: STATS BAR
// ============================================
function StatsBar() {
  return (
    <section className="py-12 bg-white border-y border-black/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center animate-on-scroll">
              <p className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                {stat.value}
              </p>
              <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: FEATURES GRID
// ============================================
function FeaturesSection() {
  return (
    <section id="features" className="py-20 md:py-32 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16 animate-on-scroll">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            One platform. Every team.
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Stop juggling apps. Start working together. Avenize brings your entire business into one intelligent system.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feature, index) => (
            <div
              key={feature.title}
              className="feature-card group bg-white rounded-2xl p-6 border border-black/5 hover:border-violet-200 hover:shadow-xl hover:shadow-violet-500/10 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <feature.icon size={24} className="text-violet-600" />
              </div>
              <span className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded-full">
                {feature.tag}
              </span>
              <h3 className="text-lg font-semibold text-gray-900 mt-3 mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: COMING SOON (AI FEATURES)
// ============================================
function ComingSoonSection() {
  return (
    <section className="py-20 bg-gradient-to-br from-violet-900 to-indigo-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 animate-on-scroll">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-sm font-medium mb-4">
            <Sparkles size={16} />
            Coming Soon
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            AI-Powered Intelligence
          </h2>
          <p className="text-xl text-white/70 max-w-2xl mx-auto">
            We're building the future of business software. AI features are coming that will transform how you work.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {COMING_SOON.map((feature) => (
            <div
              key={feature.title}
              className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center animate-on-scroll"
            >
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                <feature.icon size={28} />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-white/70">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12 animate-on-scroll">
          <p className="text-white/60 mb-4">Want early access to AI features?</p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-violet-900 font-semibold hover:bg-white/90 transition-colors"
          >
            Join Waitlist
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: TESTIMONIALS
// ============================================
function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-20 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 animate-on-scroll">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Loved by teams everywhere
          </h2>
          <p className="text-xl text-gray-600">
            See why businesses choose Avenize
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {TESTIMONIALS.map((testimonial) => (
            <div
              key={testimonial.author}
              className="bg-gray-50 rounded-2xl p-8 animate-on-scroll"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} size={18} className="fill-amber-400 text-amber-400" />
                ))}
              </div>
              
              {/* Quote */}
              <p className="text-gray-700 mb-6">"{testimonial.quote}"</p>
              
              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white font-semibold">
                  {testimonial.author.charAt(0)}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{testimonial.author}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}, {testimonial.company}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: FAQ SECTION (AEO Optimized)
// ============================================
function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="py-20 md:py-32 bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 animate-on-scroll">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Questions? Answered.
          </h2>
          <p className="text-xl text-gray-600">
            Everything you need to know
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl">
          {FAQ_DATA.map((faq, index) => (
            <div
              key={index}
              className={`border-b border-gray-100 last:border-0 ${index === 0 ? 'rounded-t-2xl' : ''} ${index === FAQ_DATA.length - 1 ? 'rounded-b-2xl' : ''}`}
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full flex items-center justify-between p-6 text-left"
              >
                <span className="font-semibold text-gray-900 pr-4">{faq.q}</span>
                <ChevronRight
                  size={20}
                  className={`text-gray-400 shrink-0 transition-transform ${openIndex === index ? 'rotate-90' : ''}`}
                />
              </button>
              {openIndex === index && (
                <div className="px-6 pb-6">
                  <p className="text-gray-600 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="text-center mt-8 animate-on-scroll">
          <p className="text-gray-600">
            Still have questions?{' '}
            <Link to="/signup" className="text-violet-600 font-medium hover:underline">
              Talk to our team
            </Link>
          </p>
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
    <section id="pricing" className="py-20 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 animate-on-scroll">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-xl text-gray-600">
            Start free, scale as you grow. No hidden fees.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Free Plan */}
          <div className="bg-gray-50 rounded-2xl p-8 animate-on-scroll">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Core</h3>
            <p className="text-gray-600 text-sm mb-6">Perfect for getting started</p>
            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-900">$0</span>
              <span className="text-gray-500">/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {['CRM Basics', 'Project Management', '5 Team Members', '1GB Storage', 'Community Support'].map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                  <Check size={16} className="text-green-500" />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              to="/signup"
              className="block text-center py-3 rounded-xl border-2 border-gray-200 font-semibold hover:border-gray-300 hover:bg-gray-100 transition-all"
            >
              Get Started
            </Link>
          </div>

          {/* Pro Plan */}
          <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl p-8 text-white relative animate-on-scroll">
            <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-amber-400 text-amber-900 text-xs font-bold rounded-full">
              MOST POPULAR
            </span>
            <h3 className="text-lg font-semibold mb-2">Professional</h3>
            <p className="text-white/70 text-sm mb-6">For growing teams</p>
            <div className="mb-6">
              <span className="text-4xl font-bold">$29</span>
              <span className="text-white/70">/user/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {['Everything in Core', 'Advanced Automations', 'Unlimited Team Members', '100GB Storage', 'Priority Support', 'API Access'].map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-white/90">
                  <Check size={16} />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              to="/signup"
              className="block text-center py-3 rounded-xl bg-white text-violet-600 font-semibold hover:bg-white/90 transition-colors"
            >
              Start Free Trial
            </Link>
          </div>

          {/* Enterprise Plan */}
          <div className="bg-gray-50 rounded-2xl p-8 animate-on-scroll">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Enterprise</h3>
            <p className="text-gray-600 text-sm mb-6">For large organizations</p>
            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-900">$49</span>
              <span className="text-gray-500">/user/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {['Everything in Professional', 'SSO & SAML', 'Dedicated Account Manager', 'Unlimited Storage', 'Custom Integrations', 'SLA Guarantee'].map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                  <Check size={16} className="text-green-500" />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              to="/signup"
              className="block text-center py-3 rounded-xl border-2 border-gray-200 font-semibold hover:border-gray-300 hover:bg-gray-100 transition-all"
            >
              Contact Sales
            </Link>
          </div>
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
    <section className="py-20 bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-4xl md:text-5xl font-bold mb-6 animate-on-scroll">
          Ready to unify your business?
        </h2>
        <p className="text-xl text-white/80 mb-10 animate-on-scroll">
          Join 10,000+ companies working smarter with Avenize.
          <br />
          Start free, upgrade when you're ready.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-on-scroll">
          <Link
            to="/signup"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white text-violet-600 font-semibold text-lg hover:bg-white/90 transition-colors shadow-xl"
          >
            Get Started Free
            <ArrowRight size={20} />
          </Link>
          <Link
            to="/login"
            className="w-full sm:w-auto px-8 py-4 rounded-xl border-2 border-white/30 font-semibold text-lg hover:bg-white/10 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </section>
  )
}

// ============================================
// COMPONENT: FOOTER
// ============================================
function Footer() {
  const currentYear = new Date().getFullYear()
  
  return (
    <footer className="bg-gray-900 text-gray-400 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <span className="font-bold text-xl text-white">Avenize</span>
            </Link>
            <p className="text-sm text-gray-500 max-w-xs">
              The Business Operating System. Everything. Together.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold text-white mb-4">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
              <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
              <li><Link to="/changelog" className="hover:text-white transition-colors">Changelog</Link></li>
              <li><Link to="/roadmap" className="hover:text-white transition-colors">Roadmap</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-white mb-4">Company</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/about" className="hover:text-white transition-colors">About</Link></li>
              <li><Link to="/blog" className="hover:text-white transition-colors">Blog</Link></li>
              <li><Link to="/careers" className="hover:text-white transition-colors">Careers</Link></li>
              <li><Link to="/contact" className="hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-white mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link></li>
              <li><Link to="/terms" className="hover:text-white transition-colors">Terms</Link></li>
              <li><Link to="/security" className="hover:text-white transition-colors">Security</Link></li>
              <li><Link to="/cookies" className="hover:text-white transition-colors">Cookies</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            © {currentYear} Avenize, Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a href="https://twitter.com/avenize" className="hover:text-white transition-colors">Twitter</a>
            <a href="https://linkedin.com/company/avenize" className="hover:text-white transition-colors">LinkedIn</a>
            <a href="https://github.com/avenize" className="hover:text-white transition-colors">GitHub</a>
          </div>
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
    <div ref={containerRef} className="min-h-screen bg-white">
      <Navbar />
      <HeroSection />
      <StatsBar />
      <FeaturesSection />
      <ComingSoonSection />
      <TestimonialsSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </div>
  )
}

// ============================================
// REACT HOOKS IMPORT
// ============================================
import { useState } from 'react'
