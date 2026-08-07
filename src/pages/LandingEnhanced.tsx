import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  ArrowRight, Check, Menu, X, Star, Users, BarChart3, Briefcase, Zap, Target, UserCheck, 
  BriefcaseBusiness, Clock, TrendingUp, Sparkles, ListTodo, Calendar, MessageSquare, Video,
  Bell, Search, Filter, Folder, FileText, Send, Phone, Mail, UsersRound, LayoutGrid,
  CheckSquare, Clock3, AlertCircle, Repeat, Flag, MessageCircle, Share2, FilterIcon
} from 'lucide-react'
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

// Comprehensive productivity tools feature set
const PRODUCTIVITY_TOOLS = [
  {
    category: 'Task Management',
    icon: ListTodo,
    color: '#4F46E5',
    features: ['Kanban & List views', 'Subtasks & checklists', 'Due dates & reminders', 'Priority levels', 'Task assignments', 'Recurring tasks']
  },
  {
    category: 'Team Chat',
    icon: MessageSquare,
    color: '#10B981',
    features: ['Direct messages', 'Group channels', 'File sharing', '@mentions', 'Message reactions', 'Read receipts']
  },
  {
    category: 'Video Meetings',
    icon: Video,
    color: '#8B5CF6',
    features: ['HD video calls', 'Screen sharing', 'Meeting recording', 'Calendar integration', 'Join links', 'Participant list']
  },
  {
    category: 'Calendar',
    icon: Calendar,
    color: '#F59E0B',
    features: ['Team calendar', 'Event scheduling', 'Availability check', 'Reminders', 'Google sync', 'Recurring events']
  },
  {
    category: 'Notifications',
    icon: Bell,
    color: '#EF4444',
    features: ['Real-time alerts', 'Push notifications', 'Email digests', 'In-app center', 'Customizable rules', 'Do not disturb']
  },
  {
    category: 'Documents',
    icon: FileText,
    color: '#06B6D4',
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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left side - Logo */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <span className="font-semibold text-black">Avenize</span>
            </Link>
            <div className="hidden lg:flex items-center gap-1">
              <a href="#modules" className="px-3 py-1.5 text-sm text-black hover:text-black hover:bg-white rounded-md transition">Features</a>
              <Link to="/pricing" className="px-3 py-1.5 text-sm text-black hover:text-black hover:bg-white rounded-md transition">Pricing</Link>
              <a href="#testimonials" className="px-3 py-1.5 text-sm text-black hover:text-black hover:bg-white rounded-md transition">Stories</a>
            </div>
          </div>
          
          {/* Right side - Actions */}
          <div className="flex items-center gap-3">
            <Link to="/signup" className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm text-black hover:text-black hover:bg-white rounded-md transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search
            </Link>
            <Link to="/login" className="hidden sm:block px-3 py-1.5 text-sm text-black hover:text-black hover:bg-white rounded-md transition">Sign in</Link>
            <Link to="/signup" className="px-4 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-md hover:bg-blue-600 transition shadow-sm">Get started</Link>
            <button className="lg:hidden p-2 text-black hover:bg-white rounded-md" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>
      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-white px-4 py-3 space-y-1">
          <a href="#modules" className="block px-3 py-2 text-sm text-black hover:bg-white rounded-md">Features</a>
          <a href="#pricing" className="block px-3 py-2 text-sm text-black hover:bg-white rounded-md">Pricing</a>
          <a href="#testimonials" className="block px-3 py-2 text-sm text-black hover:bg-white rounded-md">Stories</a>
          <a href="#faq" className="block px-3 py-2 text-sm text-black hover:bg-white rounded-md">FAQ</a>
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
    <section className="pt-28 pb-16 px-4 sm:px-6 bg-white">
      <div className="max-w-4xl mx-auto text-center">
        {/* Google-style logo with live badge */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-xl">A</span>
            </div>
            {/* Live indicator */}
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          <div className="text-left">
            <span className="text-3xl font-semibold text-black">Avenize</span>
            <div className="flex items-center gap-2 text-xs text-black">
              <Clock size={12} />
              <span>Lagos • </span>
              <span className="font-mono font-bold">{formatTime(currentTime)}</span>
            </div>
          </div>
        </div>
        
        {/* AI Feature Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-full text-sm text-indigo-700 mb-8">
          <Sparkles size={16} className="text-amber-500" />
          <span className="font-medium">AI-Powered Insights included</span>
        </div>
        
        {/* Google-style search bar - THE ICONIC ELEMENT */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative bg-white rounded-full shadow-md hover:shadow-lg transition-shadow border border-black overflow-hidden">
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
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-black mb-6 leading-tight">
          Run Your Entire<br />
          <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent">Business in One Place</span>
        </h1>
        <p className="text-lg sm:text-xl text-black mb-10 max-w-2xl mx-auto">
          CRM, Finance, HR, Projects — all connected. No more switching between apps.
        </p>
        
        {/* CTA buttons - Google style */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link to="/signup" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-blue-500 text-white font-medium text-lg hover:bg-blue-600 hover:shadow-lg transition-all">
            Get Started Free
          </Link>
          <Link to="/login" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full border border-black text-black font-medium text-lg hover:bg-white transition-all">
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
    <section className="py-16 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-black mb-4">Built for Every Team</h2>
          <p className="text-black max-w-2xl mx-auto">Whether you're closing deals, tracking projects, or running payroll — Avenize has you covered.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {WHO_IT_FOR.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="text-center p-5 bg-white rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group">
                <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: item.color + '15' }}>
                  <Icon size={28} style={{ color: item.color }} />
                </div>
                <h3 className="font-semibold text-black mb-1 text-sm">{item.role}</h3>
                <p className="text-xs text-black">{item.benefit}</p>
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
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 rounded-full text-sm mb-6">
            <LayoutGrid size={16} className="text-blue-600" />
            <span className="text-blue-700 font-medium">Productivity Suite</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-black">Everything Your Team Needs to Ship Faster</h2>
          <p className="text-black max-w-2xl mx-auto">All-in-one workspace with tasks, chat, video calls, and more. No more app switching.</p>
        </div>
        
        {/* Task Features Mini Showcase */}
        <div className="bg-white rounded-2xl p-8 mb-12 shadow-sm border border-black">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1">
              <h3 className="text-2xl font-bold mb-4 flex items-center gap-3">
                <ListTodo size={28} className="text-blue-600" />
                Powerful Task Management
              </h3>
              <p className="text-black mb-6">Manage tasks with kanban boards, subtasks, priorities, and deadlines - all integrated with your business data.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {TASK_FEATURES.map((feat, i) => {
                  const Icon = feat.icon
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg">
                      <Icon size={20} className="text-blue-400 shrink-0" />
                      <div>
                        <div className="font-medium text-sm">{feat.label}</div>
                        <div className="text-xs text-black">{feat.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            
            {/* Mini Kanban Preview */}
            <div className="flex-1">
              <div className="bg-white rounded-xl p-4 border border-black">
                <div className="text-xs text-black mb-3 font-mono">PROJECT: Website Redesign</div>
                <div className="space-y-3">
                  {[
                    { title: 'Design mockups', status: 'Todo', color: 'bg-black' },
                    { title: 'API integration', status: 'In Progress', color: 'bg-blue-500' },
                    { title: 'Deploy to staging', status: 'Done', color: 'bg-green-500' },
                  ].map((task, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 bg-white rounded-lg">
                      <div className={`w-2 h-2 rounded-full ${task.color}`}></div>
                      <span className="text-sm flex-1">{task.title}</span>
                      <span className="text-xs text-black">{task.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Tool Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PRODUCTIVITY_TOOLS.map((tool, i) => {
            const Icon = tool.icon
            return (
              <div key={i} className="bg-white backdrop-blur-sm rounded-xl p-6 border border-black hover:bg-white transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: tool.color + '20' }}>
                    <Icon size={22} style={{ color: tool.color }} />
                  </div>
                  <h3 className="font-semibold text-lg">{tool.category}</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {tool.features.map((feat, j) => (
                    <div key={j} className="flex items-center gap-2 text-sm text-black">
                      <Check size={14} className="text-green-400 shrink-0" />
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
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-white rounded-full border border-black">
            <span className="text-sm text-black">Also includes:</span>
            <span className="text-sm font-medium">File Storage</span>
            <span className="text-black">•</span>
            <span className="text-sm font-medium">Time Tracking</span>
            <span className="text-black">•</span>
            <span className="text-sm font-medium">Reporting</span>
            <span className="text-black">•</span>
            <span className="text-sm font-medium">Approval Flows</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function ModulesSection() {
  return (
    <section id="modules" className="py-16 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-black mb-4">Everything Your Business Needs</h2>
          <p className="text-black max-w-2xl mx-auto">55+ modules, each built for Nigerian businesses. Start with what you need, unlock more as you grow.</p>
        </div>
        <div className="bg-white rounded-2xl p-8 mb-6 shadow-lg border border-black">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm mb-3">⭐ Most Popular</div>
              <h3 className="text-2xl font-bold mb-2">CRM — Customer Relationship Management</h3>
              <p className="text-black mb-4">Close deals faster with AI-powered insights. Track every lead, every conversation, every opportunity.</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm">Lead Tracking</span>
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm">Deal Pipeline</span>
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm">AI Insights</span>
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm">Follow-up Reminders</span>
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
                    <h3 className="font-bold text-black mb-1">{module.title}</h3>
                    <p className="text-sm text-blue-600 font-medium mb-2">{module.tagline}</p>
                    <p className="text-sm text-black mb-3">{module.desc}</p>
                    <p className="text-xs text-black">{module.stats}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-center text-sm text-black mt-8">+ 40 more modules: Tasks, Chat, Calendar, Approvals, Reports, Knowledge, Campaigns, and more...</p>
      </div>
    </section>
  )
}

function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-16 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-black mb-4">Real Businesses. Real Results.</h2>
          <p className="text-black">See how Nigerian companies use Avenize</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
              <div className="flex gap-1 mb-4">{[...Array(t.rating)].map((_, j) => <Star key={j} size={16} className="text-amber-400 fill-amber-400" />)}</div>
              <div className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full mb-4">{t.highlight}</div>
              <p className="text-black mb-4 leading-relaxed">"{t.quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 via-indigo-400 to-purple-400 flex items-center justify-center text-white font-bold text-lg shadow-md">{t.name.charAt(0)}</div>
                <div>
                  <div className="font-semibold text-black">{t.name}</div>
                  <div className="text-sm text-black">{t.role}</div>
                  <div className="text-xs text-black">{t.business}</div>
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
    <section id="pricing" className="py-16 px-4 sm:px-6 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-black mb-4">Simple, Honest Pricing</h2>
          <p className="text-black">Pay per team size. No hidden fees. No per-feature pricing.</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 max-w-2xl mx-auto text-center">
          <p className="text-amber-800 text-sm"><strong>Founding Rate:</strong> Prices locked for 12 months, even when list price changes.</p>
        </div>
        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
          {PRICING.map((plan, i) => (
            <div key={i} className={`relative p-5 rounded-xl ${plan.popular ? 'bg-white shadow-lg ring-2 ring-blue-500' : 'bg-white shadow-sm'}`}>
              {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-500 text-white text-xs font-bold">Most Popular</div>}
              {plan.founding && <div className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded mb-2 inline-block">Founding Rate</div>}
              <h3 className="text-xl font-bold text-black mb-1">{plan.name}</h3>
              <p className="text-sm text-black mb-3">{plan.desc}</p>
              <div className="mb-4"><span className="text-3xl font-bold text-black">{plan.price}</span><span className="text-black text-sm">{plan.period}</span></div>
              <ul className="space-y-2 mb-4">
                {plan.features.map((feat, j) => (<li key={j} className="flex items-start gap-2 text-xs text-black"><Check size={14} className="text-green-500 mt-0.5 flex-shrink-0" />{feat}</li>))}
              </ul>
              <Link to="/signup" className={`block text-center py-2.5 rounded-lg font-semibold text-sm transition ${plan.popular ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-md' : 'bg-white text-black hover:bg-white'}`}>{plan.cta}</Link>
              <p className="text-xs text-black mt-3 text-center">{plan.seats}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-black mt-8">All plans include 7-day free trial • No credit card required</p>
      </div>
    </section>
  )
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return (
    <section id="faq" className="py-16 px-4 sm:px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12"><h2 className="text-3xl sm:text-4xl font-bold text-black mb-4">Frequently Asked Questions</h2></div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-white rounded-xl p-4 hover:shadow-sm transition-shadow">
              <button onClick={() => setOpenIndex(openIndex === i ? null : i)} className="w-full flex items-center justify-between text-left">
                <span className="font-medium text-black pr-4">{faq.q}</span>
                <span className={`text-2xl text-black flex-shrink-0 transition-transform ${openIndex === i ? 'rotate-45' : ''}`}>+</span>
              </button>
              {openIndex === i && <p className="mt-3 text-black text-sm leading-relaxed">{faq.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="py-20 px-4 sm:px-6 bg-white border-t border-black">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-black">Ready to Run Your Business Better?</h2>
        <p className="text-lg text-black mb-8">Join 2,500+ Nigerian businesses already using Avenize.</p>
        <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-blue-500 font-semibold text-lg hover:shadow-xl transition hover:-translate-y-0.5">
          Start Your Free 7-Day Trial <ArrowRight size={20} />
        </Link>
        <p className="text-sm text-black mt-4">No credit card required • 5-minute setup</p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="py-12 px-4 sm:px-6 bg-white text-black border-t border-black">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center shadow-md"><span className="text-white font-bold text-sm">A</span></div>
            <span className="font-semibold text-black">Avenize</span>
          </div>
          <div className="text-center md:text-right text-sm">
            <p>© 2024 Avenize. Built for Nigerian businesses.</p>
            <p className="text-black mt-1">Running from Lagos 🇳🇬</p>
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
