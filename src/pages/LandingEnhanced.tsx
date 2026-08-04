import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Menu, X, Star, Users, BarChart3, Briefcase, Zap, Shield, Clock, TrendingUp, Sparkles } from 'lucide-react'
import SarahChat from '../components/SarahChat'

const TESTIMONIALS = [
  { name: 'Chinedu Okafor', role: 'CEO, TechStart Nigeria', quote: 'Avenize transformed how we manage our team. The analytics alone saved us 20 hours per week!', rating: 5 },
  { name: 'Amina Ibrahim', role: 'Founder, StyleBox', quote: 'Finally, an all-in-one platform that actually works. Worth every kobo!', rating: 5 },
  { name: 'Emeka Nwosu', role: 'Director, EduFirst', quote: 'The invoicing feature alone paid for the subscription in the first month.', rating: 5 },
]

const FEATURES = [
  { icon: BarChart3, title: 'Sales & CRM', desc: 'Track deals, manage contacts, and close faster with AI insights', color: '#4F46E5' },
  { icon: Briefcase, title: 'Finance & Invoicing', desc: 'Send invoices, accept payments, track cash flow', color: '#10B981' },
  { icon: Users, title: 'HR & People', desc: 'Staff database, roles, permissions, and performance tracking', color: '#F59E0B' },
  { icon: Zap, title: 'Tasks & Projects', desc: 'Visual task boards, timelines, and team collaboration', color: '#EF4444' },
  { icon: Clock, title: 'Time Tracking', desc: 'Automatic time logs, productivity reports, billable hours', color: '#8B5CF6' },
  { icon: TrendingUp, title: 'Analytics & Reports', desc: 'Real-time dashboards, trends, and business insights', color: '#06B6D4' },
]

const PRICING = [
  {
    name: 'Free', price: '₦0', period: '/month', desc: 'Perfect for getting started',
    features: ['Up to 5 team members', 'Basic CRM', 'Task management', '50MB storage', 'Email support'],
    cta: 'Start Free', popular: false,
  },
  {
    name: 'Pro', price: '₦39', period: '/month', desc: 'Best for growing businesses',
    features: ['Unlimited team members', 'Advanced CRM & Analytics', 'Invoicing & Payments', '100GB storage', 'Priority support', 'Custom branding', 'API access'],
    cta: 'Start 14-Day Trial', popular: true,
  },
  {
    name: 'Enterprise', price: 'Custom', period: '', desc: 'For large organizations',
    features: ['Everything in Pro', 'SSO & Advanced Security', 'Dedicated account manager', 'Custom integrations', 'SLA guarantee'],
    cta: 'Contact Sales', popular: false,
  },
]

const FAQS = [
  { q: 'How long does it take to set up?', a: 'You can be up and running in under 5 minutes. Just sign up, add your business name, and invite your team. No IT consultant needed.' },
  { q: 'Can I use this on my phone?', a: 'Yes! Avenize works perfectly on mobile, tablet, and desktop. Your team can access it from anywhere.' },
  { q: 'What happens after my free trial?', a: 'After 14 days, you can choose to continue with Pro or switch to Free. No credit card required to start.' },
  { q: 'Is my data secure?', a: 'Absolutely. We use bank-level encryption, regular backups, and 99.9% uptime guarantee. Your data is safe with us.' },
]

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-black/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-bold text-lg">Avenize</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-600 hover:text-gray-900">Features</a>
            <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900">Pricing</a>
            <a href="#testimonials" className="text-sm text-gray-600 hover:text-gray-900">Reviews</a>
            <a href="#faq" className="text-sm text-gray-600 hover:text-gray-900">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden sm:block text-sm font-medium text-gray-700 hover:text-gray-900">Sign In</Link>
            <Link to="/signup" className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium hover:shadow-lg transition">Start Free Trial</Link>
            <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-black/5 p-4 space-y-3">
          <a href="#features" className="block text-sm text-gray-600">Features</a>
          <a href="#pricing" className="block text-sm text-gray-600">Pricing</a>
          <a href="#testimonials" className="block text-sm text-gray-600">Reviews</a>
          <a href="#faq" className="block text-sm text-gray-600">FAQ</a>
        </div>
      )}
    </nav>
  )
}

function HeroSection() {
  return (
    <section className="pt-32 pb-16 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-600 text-sm font-medium mb-6">
          <Sparkles size={16} /><span>Trusted by 2,500+ Nigerian businesses</span>
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
          The All-in-One Business<br />
          <span className="bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">Management Platform</span>
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          CRM, Finance, HR, Projects, and more — all in one place. Run your entire business from Lagos to Abuja without switching apps.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Link to="/signup" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-lg hover:shadow-xl transition hover:-translate-y-0.5">
            Start Free 14-Day Trial <ArrowRight size={20} />
          </Link>
          <Link to="/login" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl border-2 border-gray-200 text-gray-700 font-semibold text-lg hover:border-gray-300 transition">
            Sign In
          </Link>
        </div>
        <p className="text-sm text-gray-500 mb-12">No credit card required • Set up in 5 minutes • Cancel anytime</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
          {[{number: '2,500+', label: 'Businesses'}, {number: '99.9%', label: 'Uptime'}, {number: '4.9/5', label: 'Rating'}, {number: '24/7', label: 'Support'}].map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stat.number}</div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  return (
    <section id="features" className="py-16 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Everything You Need to Run Your Business</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">From sales to HR to finance — all the tools your business needs in one platform.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon
            return (
              <div key={i} className="p-6 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-lg transition">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: feature.color + '15' }}>
                  <Icon size={24} style={{ color: feature.color }} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-16 px-4 sm:px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Loved by Nigerian Businesses</h2>
          <p className="text-gray-600">See what business owners are saying about Avenize</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl shadow-sm">
              <div className="flex gap-1 mb-4">{[...Array(t.rating)].map((_, j) => <Star key={j} size={16} className="text-amber-400 fill-amber-400" />)}</div>
              <p className="text-gray-700 mb-4">"{t.quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white font-bold">{t.name.charAt(0)}</div>
                <div><div className="font-semibold text-gray-900">{t.name}</div><div className="text-sm text-gray-500">{t.role}</div></div>
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
    <section id="pricing" className="py-16 px-4 sm:px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h2>
          <p className="text-gray-600">Start free. Upgrade when you're ready.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PRICING.map((plan, i) => (
            <div key={i} className={`relative p-6 rounded-2xl border-2 ${plan.popular ? 'border-indigo-500 shadow-xl shadow-indigo-100' : 'border-gray-100'}`}>
              {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-indigo-500 text-white text-xs font-bold">Most Popular</div>}
              <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
              <p className="text-sm text-gray-500 mb-4">{plan.desc}</p>
              <div className="mb-6"><span className="text-4xl font-bold text-gray-900">{plan.price}</span>{plan.period && <span className="text-gray-500">{plan.period}</span>}</div>
              <ul className="space-y-3 mb-6">
                {plan.features.map((feat, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-gray-700"><Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" />{feat}</li>
                ))}
              </ul>
              <Link to="/signup" className={`block text-center py-3 rounded-xl font-semibold transition ${plan.popular ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:shadow-lg' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-gray-500 mt-8">All plans include 14-day free trial. No credit card required.</p>
      </div>
    </section>
  )
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return (
    <section id="faq" className="py-16 px-4 sm:px-6 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12"><h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2></div>
        <div className="space-y-4">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-white rounded-xl p-4">
              <button onClick={() => setOpenIndex(openIndex === i ? null : i)} className="w-full flex items-center justify-between text-left">
                <span className="font-semibold text-gray-900">{faq.q}</span>
                <span className={`text-2xl text-gray-400 transition-transform ${openIndex === i ? 'rotate-45' : ''}`}>+</span>
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
    <section className="py-20 px-4 sm:px-6 bg-gradient-to-br from-indigo-600 to-purple-600">
      <div className="max-w-3xl mx-auto text-center text-white">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Run Your Business Better?</h2>
        <p className="text-lg text-white/80 mb-8">Join 2,500+ Nigerian businesses already using Avenize.</p>
        <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-indigo-600 font-bold text-lg hover:shadow-xl transition hover:-translate-y-0.5">
          Start Your Free Trial <ArrowRight size={20} />
        </Link>
        <p className="text-sm text-white/60 mt-4">No credit card required • 14-day free trial</p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="py-12 px-4 sm:px-6 bg-gray-900 text-gray-400">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"><span className="text-white font-bold text-sm">A</span></div>
            <span className="font-bold text-white">Avenize</span>
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
      <FeaturesSection />
      <TestimonialsSection />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
      <Footer />
      <SarahChat />
    </div>
  )
}
