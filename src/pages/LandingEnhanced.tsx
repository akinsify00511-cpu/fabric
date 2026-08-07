import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Menu, X, Star, Users, BarChart3, Briefcase, Zap, Clock, TrendingUp, Sparkles, Target, UserCheck, BriefcaseBusiness } from 'lucide-react'
import SarahChat from '../components/SarahChat'

const STATS = [
  { number: '2,500+', label: 'Nigerian Businesses' },
  { number: '₦2.5B+', label: 'Invoices Sent' },
  { number: '99.9%', label: 'Uptime' },
  { number: '24/7', label: 'Support' },
]

const WHO_IT_FOR = [
  { role: 'Sales Teams', benefit: 'Never lose a lead again', icon: Users, color: '#4F46E5' },
  { role: 'Business Owners', benefit: 'See everything in one place', icon: BarChart3, color: '#10B981' },
  { role: 'Operations', benefit: 'Track jobs & field teams', icon: Target, color: '#F59E0B' },
  { role: 'Finance Teams', benefit: 'Get paid faster', icon: Briefcase, color: '#8B5CF6' },
  { role: 'HR Managers', benefit: 'Manage staff effortlessly', icon: UserCheck, color: '#EF4444' },
]

const MODULES = [
  { icon: Users, title: 'CRM', tagline: 'Close deals faster', desc: 'Track leads, deals, and customer relationships', color: '#4F46E5', stats: '₦2.5B+ deals tracked' },
  { icon: Briefcase, title: 'Finance', tagline: 'Get paid faster', desc: 'Invoicing, payments, cash flow in Naira', color: '#10B981', stats: '₦500M+ collected' },
  { icon: Target, title: 'Projects', tagline: 'Ship on time', desc: 'Jobs, tasks, timelines, field updates', color: '#F59E0B', stats: '10,000+ jobs completed' },
  { icon: UserCheck, title: 'HR & People', tagline: 'Happy team', desc: 'Staff database, roles, attendance, payroll', color: '#8B5CF6', stats: '15,000+ team members' },
  { icon: BriefcaseBusiness, title: 'Inventory', tagline: 'Never run out', desc: 'Stock tracking, reorders, multi-location', color: '#EF4444', stats: '500,000+ items tracked' },
  { icon: Zap, title: '+40 More', tagline: 'Everything you need', desc: 'Tasks, Chat, Calendar, Approvals...', color: '#06B6D4', stats: 'One unified app' },
]

const TESTIMONIALS = [
  { name: 'Chinedu Okafor', role: 'CEO, TechStart Nigeria', business: 'Software Company - 25 staff', quote: 'Before Avenize, our sales team was managing leads in WhatsApp. Now everyone knows exactly where every deal stands. We closed 40% more deals last quarter!', rating: 5, highlight: '40% more deals' },
  { name: 'Amina Ibrahim', role: 'Founder, StyleBox', business: 'Fashion Brand - 12 staff', quote: 'I was terrified of invoicing. Avenize made it so simple. Now I send professional invoices in seconds and get paid faster.', rating: 5, highlight: 'Faster payments' },
  { name: 'Emeka Nwosu', role: 'Operations Director, EduFirst', business: 'Education - 50 staff', quote: 'Managing field workers used to be chaos. Now I can see every project status from my phone. Avenize replaced three different apps.', rating: 5, highlight: 'Replaced 3 apps' },
]

const PRICING = [
  { name: 'Starter', price: '₦15,000', period: '/month flat', desc: 'Perfect for getting started', features: ['Core job & project tracking', 'Invoicing with VAT & WHT', 'Basic inventory (single location)', 'CRM basics', '5 team members'], seats: '1–5 seats', cta: 'Start Free 7-Day Trial', popular: false, founding: true },
  { name: 'Team', price: '₦48,000', period: '/month', desc: 'For growing teams', features: ['Everything in Starter', 'Advanced CRM with AI insights', 'Department groups & tasks', 'Offline field sync', 'Priority support'], seats: '6–15 seats', cta: 'Start Free 7-Day Trial', popular: false, founding: true },
  { name: 'Business', price: '₦112,000', period: '/month', desc: 'For scaling businesses', features: ['Everything in Team', 'Multi-location inventory', 'Client communication log', 'Advanced reporting', 'Custom integrations'], seats: '16–30 seats', cta: 'Start Free 7-Day Trial', popular: false, founding: true },
  { name: 'Pro', price: '₦186,000', period: '/month', desc: '50-staff sweet spot', features: ['Everything in Business', 'Full API access', 'Approval workflows', 'Dedicated account manager', 'Custom onboarding'], seats: '31–75 seats', cta: 'Start Free 7-Day Trial', popular: true, founding: true },
  { name: 'Scale', price: '₦380,000', period: '/month', desc: 'For enterprises', features: ['Everything in Pro', 'SSO & data residency', 'Priority support', 'Custom SLA', 'White-label options'], seats: '76+ seats', cta: 'Contact Sales', popular: false, founding: true },
]

const FAQS = [
  { q: 'Why would my sales team use this instead of WhatsApp?', a: 'WhatsApp loses information. Avenize CRM tracks every lead, every conversation, and reminds you to follow up. Your team sees the same deal status - no more "I thought you handled that."' },
  { q: 'We already use three different apps. Why add another?', a: 'Avenize replaces those three apps with one integrated system. Your data talks to each other - no more manual copy-pasting. Most businesses save ₦50,000+/month on app subscriptions.' },
  { q: 'How long does it take to set up?', a: 'You can be sending your first invoice in 5 minutes. No IT consultant needed. Our AI assistant Sarah helps you every step of the way.' },
  { q: 'Is my data safe?', a: 'Bank-level encryption, daily backups, and 99.9% uptime. Your data stays in Nigeria and complies with NDPR regulations.' },
]

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left side - Logo */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <span className="font-semibold text-gray-900">Avenize</span>
            </Link>
            <div className="hidden lg:flex items-center gap-1">
              <a href="#modules" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition">Features</a>
              <a href="#pricing" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition">Pricing</a>
              <a href="#testimonials" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition">Stories</a>
            </div>
          </div>
          
          {/* Right side - Actions */}
          <div className="flex items-center gap-3">
            <button className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search
            </button>
            <Link to="/login" className="hidden sm:block px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition">Sign in</Link>
            <Link to="/signup" className="px-4 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-md hover:bg-blue-600 transition shadow-sm">Get started</Link>
            <button className="lg:hidden p-2 text-gray-500 hover:bg-gray-50 rounded-md" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>
      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100 px-4 py-3 space-y-1">
          <a href="#modules" className="block px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md">Features</a>
          <a href="#pricing" className="block px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md">Pricing</a>
          <a href="#testimonials" className="block px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md">Stories</a>
          <a href="#faq" className="block px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md">FAQ</a>
        </div>
      )}
    </nav>
  )
}

function HeroSection() {
  return (
    <section className="pt-28 pb-16 px-4 sm:px-6 bg-white">
      <div className="max-w-4xl mx-auto text-center">
        {/* Google-style logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <span className="text-3xl font-semibold text-gray-800">Avenize</span>
        </div>
        
        {/* Google-style search bar - THE ICONIC ELEMENT */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative bg-white rounded-full shadow-md hover:shadow-lg transition-shadow border border-gray-200 overflow-hidden">
            <div className="flex items-center px-6 py-4">
              <svg className="w-5 h-5 text-gray-400 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text" 
                placeholder="Search features, modules, pricing..." 
                className="flex-1 text-lg text-gray-700 outline-none placeholder-gray-400"
              />
              <div className="flex items-center gap-2 ml-4">
                <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Quick action pills - Google style */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          <span className="px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-sm font-medium">How it works</span>
          <span className="px-4 py-2 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">Watch demo</span>
          <span className="px-4 py-2 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">See pricing</span>
        </div>
        
        {/* Main headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
          Run Your Entire<br />
          <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent">Business in One Place</span>
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          CRM, Finance, HR, Projects — all connected. No more switching between apps.
        </p>
        
        {/* CTA buttons - Google style */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link to="/signup" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-blue-500 text-white font-medium text-lg hover:bg-blue-600 hover:shadow-lg transition-all">
            Get Started Free
          </Link>
          <Link to="/login" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full border border-gray-300 text-gray-700 font-medium text-lg hover:bg-gray-50 transition-all">
            Sign In
          </Link>
        </div>
        
        <p className="text-sm text-gray-500">No credit card required • Free 7-day trial • Cancel anytime</p>
      </div>
    </section>
  )
}

function WhoSection() {
  return (
    <section className="py-16 px-4 sm:px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Built for Every Team</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">Whether you're closing deals, tracking projects, or running payroll — Avenize has you covered.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {WHO_IT_FOR.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="text-center p-5 bg-white rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group">
                <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: item.color + '15' }}>
                  <Icon size={28} style={{ color: item.color }} />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1 text-sm">{item.role}</h3>
                <p className="text-xs text-gray-500">{item.benefit}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function ModulesSection() {
  return (
    <section id="modules" className="py-16 px-4 sm:px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Everything Your Business Needs</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">55+ modules, each built for Nigerian businesses. Start with what you need, unlock more as you grow.</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 rounded-2xl p-8 mb-6 text-white shadow-lg">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-sm mb-3">⭐ Most Popular</div>
              <h3 className="text-2xl font-bold mb-2">CRM — Customer Relationship Management</h3>
              <p className="text-white/80 mb-4">Close deals faster with AI-powered insights. Track every lead, every conversation, every opportunity.</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-white/20 text-sm">Lead Tracking</span>
                <span className="px-3 py-1 rounded-full bg-white/20 text-sm">Deal Pipeline</span>
                <span className="px-3 py-1 rounded-full bg-white/20 text-sm">AI Insights</span>
                <span className="px-3 py-1 rounded-full bg-white/20 text-sm">Follow-up Reminders</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold mb-1">₦2.5B+</div>
              <div className="text-white/70 text-sm">Deals tracked</div>
            </div>
          </div>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.slice(1).map((module, i) => {
            const Icon = module.icon
            return (
              <div key={i} className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: module.color + '15' }}>
                    <Icon size={24} style={{ color: module.color }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">{module.title}</h3>
                    <p className="text-sm text-blue-600 font-medium mb-2">{module.tagline}</p>
                    <p className="text-sm text-gray-600 mb-3">{module.desc}</p>
                    <p className="text-xs text-gray-400">{module.stats}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-center text-sm text-gray-500 mt-8">+ 40 more modules: Tasks, Chat, Calendar, Approvals, Reports, Knowledge, Campaigns, and more...</p>
      </div>
    </section>
  )
}

function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-16 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Real Businesses. Real Results.</h2>
          <p className="text-gray-600">See how Nigerian companies use Avenize</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
              <div className="flex gap-1 mb-4">{[...Array(t.rating)].map((_, j) => <Star key={j} size={16} className="text-amber-400 fill-amber-400" />)}</div>
              <div className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full mb-4">{t.highlight}</div>
              <p className="text-gray-700 mb-4 leading-relaxed">"{t.quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 via-indigo-400 to-purple-400 flex items-center justify-center text-white font-bold text-lg">{t.name.charAt(0)}</div>
                <div>
                  <div className="font-semibold text-gray-900">{t.name}</div>
                  <div className="text-sm text-gray-500">{t.role}</div>
                  <div className="text-xs text-gray-400">{t.business}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section id="pricing" className="py-16 px-4 sm:px-6 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Simple, Honest Pricing</h2>
          <p className="text-gray-600">Pay per team size. No hidden fees. No per-feature pricing.</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 max-w-2xl mx-auto text-center">
          <p className="text-amber-800 text-sm"><strong>Founding Rate:</strong> Prices locked for 12 months, even when list price changes.</p>
        </div>
        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
          {PRICING.map((plan, i) => (
            <div key={i} className={`relative p-5 rounded-xl ${plan.popular ? 'bg-white shadow-lg ring-2 ring-blue-500' : 'bg-white shadow-sm'}`}>
              {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-500 text-white text-xs font-bold">Most Popular</div>}
              {plan.founding && <div className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded mb-2 inline-block">Founding Rate</div>}
              <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
              <p className="text-sm text-gray-500 mb-3">{plan.desc}</p>
              <div className="mb-4"><span className="text-3xl font-bold text-gray-900">{plan.price}</span><span className="text-gray-500 text-sm">{plan.period}</span></div>
              <ul className="space-y-2 mb-4">
                {plan.features.map((feat, j) => (<li key={j} className="flex items-start gap-2 text-xs text-gray-700"><Check size={14} className="text-green-500 mt-0.5 flex-shrink-0" />{feat}</li>))}
              </ul>
              <Link to="/signup" className={`block text-center py-2.5 rounded-lg font-semibold text-sm transition ${plan.popular ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-md' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}>{plan.cta}</Link>
              <p className="text-xs text-gray-500 mt-3 text-center">{plan.seats}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-gray-500 mt-8">All plans include 7-day free trial • No credit card required</p>
      </div>
    </section>
  )
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return (
    <section id="faq" className="py-16 px-4 sm:px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12"><h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2></div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-4 hover:shadow-sm transition-shadow">
              <button onClick={() => setOpenIndex(openIndex === i ? null : i)} className="w-full flex items-center justify-between text-left">
                <span className="font-medium text-gray-900 pr-4">{faq.q}</span>
                <span className={`text-2xl text-gray-400 flex-shrink-0 transition-transform ${openIndex === i ? 'rotate-45' : ''}`}>+</span>
              </button>
              {openIndex === i && <p className="mt-3 text-gray-600 text-sm leading-relaxed">{faq.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="py-20 px-4 sm:px-6 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500">
      <div className="max-w-3xl mx-auto text-center text-white">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Run Your Business Better?</h2>
        <p className="text-lg text-white/80 mb-8">Join 2,500+ Nigerian businesses already using Avenize.</p>
        <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-blue-500 font-semibold text-lg hover:shadow-xl transition hover:-translate-y-0.5">
          Start Your Free 7-Day Trial <ArrowRight size={20} />
        </Link>
        <p className="text-sm text-white/60 mt-4">No credit card required • 5-minute setup</p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="py-12 px-4 sm:px-6 bg-gray-900 text-gray-400">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center shadow-md"><span className="text-white font-bold text-sm">A</span></div>
            <span className="font-semibold text-white">Avenize</span>
          </div>
          <div className="text-center md:text-right text-sm">
            <p>© 2024 Avenize. Built for Nigerian businesses.</p>
            <p className="text-gray-500 mt-1">Running from Lagos 🇳🇬</p>
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
      <WhoSection />
      <ModulesSection />
      <TestimonialsSection />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
      <Footer />
      <SarahChat />
    </div>
  )
}
