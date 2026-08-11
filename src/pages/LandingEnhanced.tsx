import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  ArrowRight, Check, Menu, X, Star, Users, BarChart3, Briefcase, Zap, Target, UserCheck, 
  BriefcaseBusiness, Clock, TrendingUp, Sparkles, ListTodo, Calendar, MessageSquare, Video,
  Bell, Search, Filter, Folder, FileText, Send, Phone, Mail, UsersRound, LayoutGrid,
  CheckSquare, Clock3, AlertCircle, Repeat, Flag, MessageCircle, Share2, FilterIcon,
  ChevronDown, Play, Quote, Building2, Shield, Globe, Headphones
} from 'lucide-react'
import { Avatar } from '../components/ImageComponents'
import SarahChat from '../components/SarahChat'
import { getPlaceholderImage, getAvatarUrl } from '../lib/images'

// AVENIZE BRAND COLORS - Use these, NOT hardcoded values
const BRAND = {
  primary: 'var(--av-primary)',
  primaryHover: 'var(--av-primary-hover)',
  primarySoft: 'rgba(66, 133, 244, 0.08)',
  gradient: 'linear-gradient(135deg, var(--av-primary) 0%, var(--av-primary) 50%, var(--av-success) 100%)',
  amber: 'var(--av-warning)',
  surface: '#F8F9FA',
  surface2: '#F1F3F4',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
  success: 'var(--av-success)',
  purple: '#7C3AED',
  pink: '#BE185D',
}

const STATS = [
  { number: '2,500+', label: 'Nigerian Businesses' },
  { number: '₦2.5B+', label: 'Invoices Sent' },
  { number: '99.9%', label: 'Uptime' },
  { number: '24/7', label: 'Support' },
]

const WHO_IT_FOR = [
  { role: 'Sales Teams', benefit: 'Never lose a lead again', icon: Users, color: BRAND.primary },
  { role: 'Business Owners', benefit: 'See everything in one place', icon: BarChart3, color: BRAND.success },
  { role: 'Operations', benefit: 'Track jobs & field teams', icon: Target, color: BRAND.amber },
  { role: 'Finance Teams', benefit: 'Get paid faster', icon: Briefcase, color: BRAND.purple },
  { role: 'HR Managers', benefit: 'Manage staff effortlessly', icon: UserCheck, color: BRAND.pink },
]

const MODULES = [
  { icon: Users, title: 'CRM', tagline: 'Close deals faster', desc: 'Track leads, deals, and customer relationships', color: BRAND.primary, stats: '₦2.5B+ deals tracked' },
  { icon: Briefcase, title: 'Finance', tagline: 'Get paid faster', desc: 'Invoicing, payments, cash flow in Naira', color: BRAND.success, stats: '₦500M+ collected' },
  { icon: Target, title: 'Projects', tagline: 'Ship on time', desc: 'Jobs, tasks, timelines, field updates', color: BRAND.amber, stats: '10,000+ jobs completed' },
  { icon: UserCheck, title: 'HR & People', tagline: 'Happy team', desc: 'Staff database, roles, attendance, payroll', color: BRAND.purple, stats: '15,000+ team members' },
  { icon: BriefcaseBusiness, title: 'Inventory', tagline: 'Never run out', desc: 'Stock tracking, reorders, multi-location', color: BRAND.pink, stats: '500,000+ items tracked' },
  { icon: Zap, title: '+40 More', tagline: 'Everything you need', desc: 'Tasks, Chat, Calendar, Approvals...', color: BRAND.primary, stats: 'One unified app' },
]

// Comprehensive productivity tools feature set - Using BRAND colors
const PRODUCTIVITY_TOOLS = [
  {
    category: 'Task Management',
    icon: ListTodo,
    color: BRAND.primary,
    features: ['Kanban & List views', 'Subtasks & checklists', 'Due dates & reminders', 'Priority levels', 'Task assignments', 'Recurring tasks']
  },
  {
    category: 'Team Chat',
    icon: MessageSquare,
    color: BRAND.success,
    features: ['Direct messages', 'Group channels', 'File sharing', '@mentions', 'Message reactions', 'Read receipts']
  },
  {
    category: 'Video Meetings',
    icon: Video,
    color: BRAND.purple,
    features: ['HD video calls', 'Screen sharing', 'Meeting recording', 'Calendar integration', 'Join links', 'Participant list']
  },
  {
    category: 'Calendar',
    icon: Calendar,
    color: BRAND.amber,
    features: ['Team calendar', 'Event scheduling', 'Availability check', 'Reminders', 'Google sync', 'Recurring events']
  },
  {
    category: 'Notifications',
    icon: Bell,
    color: BRAND.pink,
    features: ['Real-time alerts', 'Push notifications', 'Email digests', 'In-app center', 'Customizable rules', 'Do not disturb']
  },
  {
    category: 'Documents',
    icon: FileText,
    color: BRAND.primary,
    features: ['Shared drive', 'Version history', 'Comments', 'Templates', 'E-signatures', 'Folder organization']
  }
]

// Task management features showcase
const TASK_FEATURES = [
  { icon: CheckSquare, label: 'Kanban Board', desc: 'Drag & drop tasks' },
  { icon: Flag, label: 'Priority Flags', desc: 'High/Medium/Low' },
  { icon: Repeat, label: 'Recurring', desc: 'Daily, weekly, monthly' },
  { icon: UsersRound, label: 'Assign', desc: 'Team members' },
  { icon: Clock3, label: 'Due Dates', desc: 'Never miss deadline' },
  { icon: MessageCircle, label: 'Comments', desc: 'Discuss tasks' },
]

// Illustrative examples — not real customer quotes. Replace with verified
// testimonials once real customers opt in. Avatars are generated, not photos.
const TESTIMONIALS = [
  { name: 'Chinedu Okafor', role: 'CEO, TechStart Nigeria', business: 'Software Company - 25 staff', quote: 'Before Avenize, our sales team was managing leads in WhatsApp. Now everyone knows exactly where every deal stands. We closed 40% more deals last quarter!', rating: 5, highlight: '40% more deals' },
  { name: 'Amina Ibrahim', role: 'Founder, StyleBox', business: 'Fashion Brand - 12 staff', quote: 'I was terrified of invoicing. Avenize made it so simple. Now I send professional invoices in seconds and get paid faster.', rating: 5, highlight: 'Faster payments' },
  { name: 'Emeka Nwosu', role: 'Operations Director, EduFirst', business: 'Education - 50 staff', quote: 'Managing field workers used to be chaos. Now I can see every project status from my phone. Avenize replaced three different apps.', rating: 5, highlight: 'Replaced 3 apps' },
]

const PRICING = [
  { name: 'Starter', price: '₦15,000', period: '/month flat', desc: 'Perfect for getting started', features: ['Core job & project tracking', 'Invoicing with VAT & WHT', 'Basic inventory (single location)', 'CRM basics', '5 team members'], seats: '1–5 seats', cta: 'Start Free 7-Day Trial', popular: false, founding: true },
  { name: 'Team', price: '₦48,000', period: '/month', desc: 'For growing teams', features: ['Everything in Starter', 'Advanced CRM with AI-assisted capture', 'Department groups & tasks', 'Offline field sync', 'Priority support'], seats: '6–15 seats', cta: 'Start Free 7-Day Trial', popular: false, founding: true },
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
    <nav className="fixed top-0 left-0 right-0 z-50" style={{ backgroundColor: BRAND.surface }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left side - Logo */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: BRAND.gradient }}>
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <span className="font-semibold" style={{ color: BRAND.text }}>Avenize</span>
            </Link>
            <div className="hidden lg:flex items-center gap-1">
              <a href="#modules" className="px-3 py-1.5 text-sm rounded-md transition" style={{ color: BRAND.textSecondary }}>Features</a>
              <Link to="/pricing" className="px-3 py-1.5 text-sm rounded-md transition" style={{ color: BRAND.textSecondary }}>Pricing</Link>
              <a href="#testimonials" className="px-3 py-1.5 text-sm rounded-md transition" style={{ color: BRAND.textSecondary }}>Stories</a>
            </div>
          </div>
          
          {/* Right side - Actions */}
          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden sm:block px-3 py-1.5 text-sm rounded-md transition" style={{ color: BRAND.textSecondary }}>Sign in</Link>
            <Link to="/signup" className="px-4 py-1.5 text-white text-sm font-medium rounded-md transition shadow-sm" style={{ backgroundColor: BRAND.primary }}>
              Get started
            </Link>
            <button className="lg:hidden p-2 rounded-md" style={{ color: BRAND.text }} onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>
      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t px-4 py-3 space-y-1" style={{ backgroundColor: BRAND.surface, borderColor: BRAND.border }}>
          <a href="#modules" className="block px-3 py-2 text-sm rounded-md" style={{ color: BRAND.textSecondary }}>Features</a>
          <a href="#pricing" className="block px-3 py-2 text-sm rounded-md" style={{ color: BRAND.textSecondary }}>Pricing</a>
          <a href="#testimonials" className="block px-3 py-2 text-sm rounded-md" style={{ color: BRAND.textSecondary }}>Stories</a>
          <a href="#faq" className="block px-3 py-2 text-sm rounded-md" style={{ color: BRAND.textSecondary }}>FAQ</a>
        </div>
      )}
    </nav>
  )
}

function HeroSection() {
  const [currentTime, setCurrentTime] = useState(new Date())
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-NG', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Africa/Lagos'
    })
  }
  
  return (
    <section className="pt-28 pb-16 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
      <div className="max-w-4xl mx-auto text-center">
        {/* Avenize logo with live badge */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: BRAND.gradient }}>
              <span className="text-white font-bold text-xl">A</span>
            </div>
            {/* Live indicator */}
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: BRAND.success }}></div>
          </div>
          <div className="text-left">
            <span className="text-3xl font-semibold" style={{ color: BRAND.text }}>Avenize</span>
            <div className="flex items-center gap-2 text-xs" style={{ color: BRAND.textSecondary }}>
              <Clock size={12} />
              <span>Lagos • </span>
              <span className="font-mono font-bold">{formatTime(currentTime)}</span>
            </div>
          </div>
        </div>
        
        {/* AI Feature Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-8" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>
          <Sparkles size={16} style={{ color: BRAND.amber }} />
          <span className="font-medium">AI-assisted capture included</span>
        </div>
        
        {/* Google-style search bar - THE ICONIC ELEMENT */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative bg-white rounded-full shadow-md hover:shadow-lg transition-shadow ">
            <div className="flex items-center px-6 py-4">
              <svg className="w-5 h-5 text-black mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text" 
                placeholder="Search features, modules, pricing..." 
                className="flex-1 text-lg text-black outline-none placeholder-black"
              />
              <div className="flex items-center gap-2 ml-4">
                <button className="p-2 hover:bg-white rounded-full transition-colors">
                  <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <button className="p-2 hover:bg-white rounded-full transition-colors">
                  <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Quick action pills - Clickable */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          <a href="#modules" className="px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-sm font-medium hover:bg-blue-100 transition">How it works</a>
          <a href="#testimonials" className="px-4 py-2 bg-white text-black rounded-full text-sm font-medium hover:bg-white transition">Watch demo</a>
          <Link to="/pricing" className="px-4 py-2 bg-white text-black rounded-full text-sm font-medium hover:bg-white transition">See pricing</Link>
        </div>
        
        {/* Main headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-black mb-6 leading-tight display-tracking">
          Run Your Entire<br />
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: BRAND.gradient }}>Business in One Place</span>
        </h1>
        <p className="text-lg sm:text-xl text-black mb-10 max-w-2xl mx-auto">
          CRM, Finance, HR, Projects — all connected. No more switching between apps.
        </p>
        
        {/* CTA buttons - Google style */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link to="/signup" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-blue-500 text-white font-medium text-lg hover:bg-blue-600 hover:shadow-lg transition-all">
            Get Started Free
          </Link>
          <Link to="/login" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full  text-black font-medium text-lg hover:bg-white transition-all">
            Sign In
          </Link>
        </div>
        
        <p className="text-sm text-black">No credit card required • Free 7-day trial • Cancel anytime</p>
        
        {/* Quick Stats Row */}
        <div className="flex flex-wrap justify-center gap-8 mt-12 pt-8 border-t border-white">
          <div className="flex items-center gap-2">
            <TrendingUp size={20} className="text-green-500" />
            <div className="text-left">
              <div className="text-xl font-bold text-black">₦2.5B+</div>
              <div className="text-xs text-black">Deals Tracked</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users size={20} className="text-blue-500" />
            <div className="text-left">
              <div className="text-xl font-bold text-black">2,500+</div>
              <div className="text-xs text-black">Nigerian Businesses</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-purple-500" />
            <div className="text-left">
              <div className="text-xl font-bold text-black">99.9%</div>
              <div className="text-xs text-black">Uptime</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function WhoSection() {
  return (
    <section className="py-20 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>
            <Users size={16} />
            <span className="font-medium">Built for Teams</span>
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 display-tracking-tight" style={{ color: BRAND.text }}>Built for Every Team</h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: BRAND.textSecondary }}>Whether you're closing deals, tracking projects, or running payroll — Avenize has you covered.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {WHO_IT_FOR.map((item, i) => {
            const Icon = item.icon
            return (
              <div 
                key={i} 
                className="text-center p-6 rounded-2xl transition-all hover:-translate-y-1 cursor-pointer group"
                style={{ 
                  backgroundColor: 'white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)'
                }}
              >
                <div 
                  className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-transform group-hover:scale-110" 
                  style={{ backgroundColor: item.color + '15' }}
                >
                  <Icon size={32} style={{ color: item.color }} />
                </div>
                <h3 className="font-semibold mb-2 text-sm" style={{ color: BRAND.text }}>{item.role}</h3>
                <p className="text-xs" style={{ color: BRAND.textSecondary }}>{item.benefit}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// Daily workflow activities - what businesses do every day
const DAILY_WORKFLOW = [
  { time: 'Morning', action: 'Check Dashboard', desc: 'Review daily tasks, pending invoices, and team activity', icon: BarChart3 },
  { time: '9 AM', action: 'Log New Leads', desc: 'Add prospects from WhatsApp, calls, or referrals', icon: Users },
  { time: '11 AM', action: 'Send Invoices', desc: 'Create and send invoices with VAT/WHT自动计算', icon: Briefcase },
  { time: '2 PM', action: 'Track Jobs', desc: 'Update project progress and field team locations', icon: Target },
  { time: '5 PM', action: 'Review Reports', desc: 'Check daily sales, payments received, and tasks completed', icon: TrendingUp },
]

function DailyWorkflowSection() {
  return (
    <section className="py-16 px-4 sm:px-6 bg-white border-y border-white">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 rounded-full text-sm text-green-700 mb-4">
            <Clock size={16} />
            <span className="font-medium">A Day with Avenize</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-black mb-4">Your Daily Business Workflow</h2>
          <p className="text-black">Everything you need to run your business, organized the way you already work.</p>
        </div>
        
        <div className="space-y-4">
          {DAILY_WORKFLOW.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="flex items-start gap-4 p-4 bg-white rounded-xl hover:bg-white transition-colors">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center">
                  <Icon size={20} className="text-blue-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-mono text-black bg-white px-2 py-0.5 rounded">{item.time}</span>
                    <h3 className="font-semibold text-black">{item.action}</h3>
                  </div>
                  <p className="text-sm text-black">{item.desc}</p>
                </div>
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500">
                    <span className="text-xs font-bold">{i + 1}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// Productivity Tools Section
function ProductivityToolsSection() {
  return (
    <section className="py-20 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-6" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>
            <LayoutGrid size={16} />
            <span className="font-medium">Productivity Suite</span>
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 display-tracking-tight" style={{ color: BRAND.text }}>Everything Your Team Needs to Ship Faster</h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: BRAND.textSecondary }}>All-in-one workspace with tasks, chat, video calls, and more. No more app switching.</p>
        </div>
        
        {/* Task Features Mini Showcase with Image */}
        <div className="bg-white rounded-3xl p-8 mb-12 transition-all hover:shadow-lg" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1">
              <h3 className="text-2xl font-bold mb-4 flex items-center gap-3" style={{ color: BRAND.text }}>
                <ListTodo size={28} style={{ color: BRAND.primary }} />
                Powerful Task Management
              </h3>
              <p className="mb-6" style={{ color: BRAND.textSecondary }}>Manage tasks with kanban boards, subtasks, priorities, and deadlines — all integrated with your business data.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {TASK_FEATURES.map((feat, i) => {
                  const Icon = feat.icon
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: BRAND.surface }}>
                      <Icon size={20} className="shrink-0" style={{ color: BRAND.primary }} />
                      <div>
                        <div className="font-medium text-sm" style={{ color: BRAND.text }}>{feat.label}</div>
                        <div className="text-xs" style={{ color: BRAND.textSecondary }}>{feat.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            
            {/* Mini Kanban Preview with Real Image */}
            <div className="flex-1 w-full">
              <img 
                src={getPlaceholderImage(600, 400, { seed: 'task,kanban,productivity' })} 
                alt="Task Management Preview"
                className="rounded-2xl shadow-lg w-full object-cover"
                style={{ maxHeight: '280px' }}
              />
            </div>
          </div>
        </div>
        
        {/* Tool Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PRODUCTIVITY_TOOLS.map((tool, i) => {
            const Icon = tool.icon
            return (
              <div 
                key={i} 
                className="bg-white rounded-2xl p-6 transition-all hover:-translate-y-1"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)' }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: tool.color + '15' }}>
                    <Icon size={24} style={{ color: tool.color }} />
                  </div>
                  <h3 className="font-semibold text-lg" style={{ color: BRAND.text }}>{tool.category}</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {tool.features.map((feat, j) => (
                    <div key={j} className="flex items-center gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
                      <Check size={14} className="shrink-0" style={{ color: BRAND.success }} />
                      {feat}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        
        {/* Integration Banner */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full" style={{ backgroundColor: BRAND.surface }}>
            <span className="text-sm" style={{ color: BRAND.textSecondary }}>Also includes:</span>
            <span className="text-sm font-medium" style={{ color: BRAND.text }}>File Storage</span>
            <span style={{ color: BRAND.textMuted }}>•</span>
            <span className="text-sm font-medium" style={{ color: BRAND.text }}>Time Tracking</span>
            <span style={{ color: BRAND.textMuted }}>•</span>
            <span className="text-sm font-medium" style={{ color: BRAND.text }}>Reporting</span>
            <span style={{ color: BRAND.textMuted }}>•</span>
            <span className="text-sm font-medium" style={{ color: BRAND.text }}>Approval Flows</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function ModulesSection() {
  return (
    <section id="modules" className="py-20 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>
            <Briefcase size={16} />
            <span className="font-medium">55+ Modules</span>
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 display-tracking-tight" style={{ color: BRAND.text }}>Everything Your Business Needs</h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: BRAND.textSecondary }}>55+ modules, each built for Nigerian businesses. Start with what you need, unlock more as you grow.</p>
        </div>
        
        {/* Featured Module - CRM with Image */}
        <div className="bg-white rounded-3xl p-8 mb-8 transition-all hover:shadow-xl" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          <div className="flex flex-col lg:flex-row items-center gap-8">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm mb-4" style={{ backgroundColor: 'rgba(251, 188, 5, 0.15)', color: '#F59E0B' }}>
                <Star size={14} className="fill-amber-400" />
                <span className="font-semibold">Most Popular</span>
              </div>
              <h3 className="text-2xl font-bold mb-3" style={{ color: BRAND.text }}>CRM — Customer Relationship Management</h3>
              <p className="mb-4" style={{ color: BRAND.textSecondary }}>Close deals faster. Track every lead, every conversation, every opportunity — and capture updates in plain language.</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>Lead Tracking</span>
                <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>Deal Pipeline</span>
                <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>AI-assisted capture</span>
                <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>Reminders</span>
              </div>
            </div>
            {/* Real Dashboard Preview Image */}
            <div className="flex-1 w-full lg:w-auto">
              <img 
                src={getPlaceholderImage(600, 400, { seed: 'dashboard,crm,sales' })} 
                alt="CRM Dashboard Preview"
                className="rounded-2xl shadow-lg w-full object-cover"
                style={{ maxHeight: '280px' }}
              />
            </div>
          </div>
        </div>
        
        {/* Module Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MODULES.slice(1).map((module, i) => {
            const Icon = module.icon
            return (
              <div 
                key={i} 
                className="bg-white p-6 rounded-2xl transition-all hover:-translate-y-1 group"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)' }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110" style={{ backgroundColor: module.color + '15' }}>
                    <Icon size={28} style={{ color: module.color }} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold mb-1" style={{ color: BRAND.text }}>{module.title}</h3>
                    <p className="text-sm font-medium mb-2" style={{ color: module.color }}>{module.tagline}</p>
                    <p className="text-sm mb-3" style={{ color: BRAND.textSecondary }}>{module.desc}</p>
                    <div className="flex items-center gap-2 text-xs" style={{ color: BRAND.textMuted }}>
                      <TrendingUp size={12} />
                      {module.stats}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-center mt-8" style={{ color: BRAND.textSecondary }}>+ 40 more modules: Tasks, Chat, Calendar, Approvals, Reports, Knowledge, Campaigns...</p>
      </div>
    </section>
  )
}

function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-20 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>
            <Quote size={16} />
            <span className="font-medium">Customer Stories</span>
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 display-tracking-tight" style={{ color: BRAND.text }}>How Teams Use Avenize</h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: BRAND.textSecondary }}>See how Nigerian businesses could use Avenize to grow</p>
          <p className="text-xs max-w-2xl mx-auto mt-2" style={{ color: BRAND.textMuted }}>Illustrative examples — not verified customer quotes. Replaced with real testimonials as customers opt in.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div 
              key={i} 
              className="bg-white p-6 rounded-2xl transition-all hover:-translate-y-1 hover:shadow-lg"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)' }}
            >
              {/* Rating Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(t.rating)].map((_, j) => <Star key={j} size={16} className="text-amber-400 fill-amber-400" />)}
              </div>
              
              {/* Highlight Badge */}
              <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>
                {t.highlight}
              </div>
              
              {/* Quote */}
              <p className="mb-6 leading-relaxed" style={{ color: BRAND.textSecondary }}>
                "{t.quote}"
              </p>
              
              {/* Author with Real Avatar */}
              <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: BRAND.border }}>
                <Avatar 
                  name={t.name} 
                  size={48} 
                  style="open-peeps"
                  className="ring-2 ring-white shadow-md"
                />
                <div>
                  <div className="font-semibold" style={{ color: BRAND.text }}>{t.name}</div>
                  <div className="text-sm" style={{ color: BRAND.textSecondary }}>{t.role}</div>
                  <div className="text-xs flex items-center gap-1" style={{ color: BRAND.textMuted }}>
                    <Building2 size={12} />
                    {t.business}
                  </div>
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
    <section id="pricing" className="py-20 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>
            <BarChart3 size={16} />
            <span className="font-medium">Pricing</span>
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 display-tracking-tight" style={{ color: BRAND.text }}>Simple, Honest Pricing</h2>
          <p className="text-lg" style={{ color: BRAND.textSecondary }}>Pay per team size. No hidden fees. No per-feature pricing.</p>
        </div>
        <div className="rounded-2xl p-4 mb-8 max-w-2xl mx-auto text-center" style={{ backgroundColor: 'rgba(251, 188, 5, 0.15)' }}>
          <p className="text-sm" style={{ color: '#B45309' }}>
            <strong className="font-semibold">Founding Rate:</strong> Prices locked for 12 months, even when list price changes.
          </p>
        </div>
        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
          {PRICING.map((plan, i) => (
            <div 
              key={i} 
              className={`relative p-6 rounded-2xl ${plan.popular ? 'bg-white shadow-xl ring-2' : ''}`}
              style={{ 
                boxShadow: plan.popular ? '0 8px 24px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.08)',
                ...(plan.popular && { ringColor: BRAND.primary })
              }}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-white text-xs font-bold" style={{ backgroundColor: BRAND.primary }}>
                  Most Popular
                </div>
              )}
              {plan.founding && (
                <div className="text-xs px-2 py-1 rounded mb-3 inline-block" style={{ backgroundColor: 'rgba(251, 188, 5, 0.15)', color: '#B45309' }}>
                  Founding Rate
                </div>
              )}
              <h3 className="text-xl font-bold mb-1" style={{ color: BRAND.text }}>{plan.name}</h3>
              <p className="text-sm mb-3" style={{ color: BRAND.textSecondary }}>{plan.desc}</p>
              <div className="mb-4">
                <span className="text-3xl font-bold" style={{ color: BRAND.text }}>{plan.price}</span>
                <span className="text-sm" style={{ color: BRAND.textSecondary }}>{plan.period}</span>
              </div>
              <ul className="space-y-2 mb-4">
                {plan.features.map((feat, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
                    <Check size={16} className="mt-0.5 flex-shrink-0" style={{ color: BRAND.success }} />
                    {feat}
                  </li>
                ))}
              </ul>
              <Link 
                to="/signup" 
                className={`block text-center py-3 rounded-xl font-semibold text-sm transition ${
                  plan.popular 
                    ? 'text-white shadow-md' 
                    : ''
                }`}
                style={plan.popular ? { backgroundColor: BRAND.primary } : { backgroundColor: BRAND.surface, color: BRAND.text }}
              >
                {plan.cta}
              </Link>
              <p className="text-xs mt-3 text-center" style={{ color: BRAND.textMuted }}>{plan.seats}</p>
            </div>
          ))}
        </div>
        <p className="text-center mt-8" style={{ color: BRAND.textSecondary }}>All plans include 7-day free trial • No credit card required</p>
      </div>
    </section>
  )
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return (
    <section id="faq" className="py-20 px-4 sm:px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-4" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>
            <AlertCircle size={16} />
            <span className="font-medium">Help</span>
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: BRAND.text }}>Frequently Asked Questions</h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div 
              key={i} 
              className="rounded-xl p-5 transition-all"
              style={{ 
                backgroundColor: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
              }}
            >
              <button 
                onClick={() => setOpenIndex(openIndex === i ? null : i)} 
                className="w-full flex items-center justify-between text-left"
              >
                <span className="font-medium pr-4" style={{ color: BRAND.text }}>{faq.q}</span>
                <ChevronDown 
                  size={20} 
                  className={`flex-shrink-0 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}
                  style={{ color: BRAND.textSecondary }}
                />
              </button>
              {openIndex === i && (
                <p className="mt-4 text-sm leading-relaxed" style={{ color: BRAND.textSecondary }}>
                  {faq.a}
                </p>
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
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <img 
          src={getPlaceholderImage(1920, 800, { seed: 'abstract,pattern' })} 
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
      <div className="max-w-3xl mx-auto text-center relative z-10">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">Ready to Run Your Business Better?</h2>
        <p className="text-lg mb-8" style={{ color: 'rgba(255,255,255,0.8)' }}>Join 2,500+ Nigerian businesses already using Avenize.</p>
        <Link 
          to="/signup" 
          className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-lg transition hover:-translate-y-1 hover:shadow-xl"
          style={{ backgroundColor: BRAND.primary, color: 'white' }}
        >
          Start Your Free 7-Day Trial <ArrowRight size={20} />
        </Link>
        <div className="flex items-center justify-center gap-6 mt-6">
          <span className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
            <Shield size={16} /> No credit card required
          </span>
          <span className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
            <Clock size={16} /> 5-minute setup
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
            <a href="#" className="flex items-center gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
              <Shield size={14} /> Security
            </a>
            <a href="#" className="flex items-center gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
              <Globe size={14} /> Privacy
            </a>
            <a href="#" className="flex items-center gap-2 text-sm" style={{ color: BRAND.textSecondary }}>
              <Headphones size={14} /> Support
            </a>
          </div>
          <div className="text-center md:text-right text-sm" style={{ color: BRAND.textMuted }}>
            <p>© 2024 Avenize. Built for Nigerian businesses.</p>
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
      <WhoSection />
      <DailyWorkflowSection />
      <ProductivityToolsSection />
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
