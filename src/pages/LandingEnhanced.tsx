import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { captureAttribution } from '../lib/attribution'
import { trackPageView } from '../lib/metaPixel'
import {
  ArrowRight, Check, Menu, X, Users, BarChart3, Briefcase, UserCheck,
  Clock, ListTodo, Calendar, MessageSquare, Shield, ChevronDown, Globe,
  Headphones, Brain, Network, HelpCircle, DollarSign, Eye, Heart,
  Building2, WalletCards, Target, Sparkles, Layers3,
} from 'lucide-react'
import SarahChat from '../components/SarahChat'

const BRAND = {
  primary: '#155BB4',
  primarySoft: 'rgba(21, 91, 180, 0.08)',
  gradient: 'linear-gradient(135deg, #155BB4 0%, #4285F4 52%, #34A853 100%)',
  surface: '#F7F9FC',
  text: '#202124',
  textSecondary: '#5F6368',
  border: '#E4E8EF',
  success: '#157342',
  purple: '#6D4AFF',
  warm: '#A85A18',
}

const ROLE_STORIES = [
  {
    icon: Building2,
    role: 'For the person who built the business',
    title: '“I should not have to be the person holding everything together.”',
    body: 'You started the business to build something bigger than yourself. But customers, approvals, people, money and unfinished work still find their way back to you.',
    answer: 'Avenize gives you one clear picture of what is happening — without making you chase every department for an update.',
    color: BRAND.primary,
  },
  {
    icon: Target,
    role: 'For the person leading a team',
    title: '“I need to know what needs my attention — not read through everything.”',
    body: 'Your team is busy. Messages are moving. Projects are progressing. Approvals are waiting. The problem is not activity. It is knowing what matters now.',
    answer: 'Avenize brings the next important actions to you, with the context you need to make the decision.',
    color: BRAND.success,
  },
  {
    icon: UserCheck,
    role: 'For the person doing the work',
    title: '“Just tell me what I need to do.”',
    body: 'You should not need a training session to find a task, request leave, submit an expense or understand why something is waiting for you.',
    answer: 'Your Avenize experience is shaped around your role. See what matters. Tap. Act. Move on.',
    color: BRAND.purple,
  },
  {
    icon: WalletCards,
    role: 'For finance and control',
    title: '“I need the numbers and the reason behind them.”',
    body: 'Financial activity should not live separately from the work that created it. Approvals, invoices, expenses, budgets and payments should tell one connected story.',
    answer: 'Avenize connects the financial record to the people, work and decisions behind it.',
    color: BRAND.warm,
  },
]

const CAPABILITIES = [
  { icon: ListTodo, label: 'Work & approvals', desc: 'Know what needs attention and what happens next.' },
  { icon: Users, label: 'People & teams', desc: 'Give every person a clear place in the organization.' },
  { icon: Briefcase, label: 'Customers & sales', desc: 'Turn relationships and opportunities into visible work.' },
  { icon: DollarSign, label: 'Money & finance', desc: 'Connect invoices, expenses, approvals and cash movement.' },
  { icon: Layers3, label: 'Projects & operations', desc: 'Keep jobs, milestones and field activity moving.' },
  { icon: Calendar, label: 'Meetings & time', desc: 'Bring schedules, meetings and follow-ups together.' },
  { icon: MessageSquare, label: 'Communication', desc: 'Keep conversations connected to the work.' },
  { icon: BarChart3, label: 'Business intelligence', desc: 'Turn activity into understandable signals and decisions.' },
  { icon: Shield, label: 'Controls & accountability', desc: 'Make permissions, approvals and activity explainable.' },
]

const VIEWS = [
  { title: 'Cards', desc: 'See the important pieces at a glance.', icon: Layers3 },
  { title: 'Lists', desc: 'Work through clear, focused actions.', icon: ListTodo },
  { title: 'Charts', desc: 'Understand movement and trends visually.', icon: BarChart3 },
  { title: 'Timelines', desc: 'See what happened and what comes next.', icon: Calendar },
]

// Mirrors the canonical tiers on /pricing (Pricing.tsx). Update both together.
const PRICING = [
  { name: 'Starter', price: '₦15,000', desc: 'For getting your business organized.', features: ['Core workspace', 'CRM & contacts', 'Tasks & basic approvals', 'Up to 5 seats'], cta: 'Get started' },
  { name: 'Team', price: '₦48,000', desc: 'For teams ready to work together.', features: ['Everything in Starter', 'Team collaboration', 'Projects & meetings', 'Up to 15 seats'], cta: 'Get started' },
  { name: 'Business', price: '₦112,000', desc: 'For departments that need one system.', features: ['Everything in Team', 'Finance workflows', 'Approval workflows', 'Up to 30 seats'], cta: 'Get started', popular: true },
  { name: 'Pro', price: '₦186,000', desc: 'For a growing, complex organization.', features: ['Everything in Business', 'Committees & OKRs', 'Advanced intelligence & risk', 'Up to 60 seats'], cta: 'Get started' },
  { name: 'Scale', price: '₦380,000', desc: 'For large or multi-subsidiary operations.', features: ['Everything in Pro', 'SSO & custom roles', 'Multi-subsidiary & audit trail', 'Dedicated support'], cta: 'Talk to us' },
]

const FAQS = [
  { q: 'Will Avenize force our organization into a fixed structure?', a: 'No. Your organization can define its own hierarchy, departments, teams, branches, committees, reporting lines and approval paths. The system should reflect how your organization actually works.' },
  { q: 'Can different people see the same information differently?', a: 'Yes. Avenize is designed around flexible representations. Depending on the data and role, people can use cards, lists, charts, timelines and other focused views. The goal is understanding, not visual complexity.' },
  { q: 'Will employees have to learn a complicated system?', a: 'The experience is designed around the person and their work. Instead of exposing every module to everyone, Avenize can bring forward the actions, conversations and information that matter to that person.' },
  { q: 'Can committees work across departments or entities?', a: 'Yes. Committees can be represented as part of the organization without forcing members to abandon their normal department or reporting relationship.' },
  { q: 'Can I start small and grow?', a: 'Yes. The pricing structure is designed to let a business begin with the essentials and move into deeper collaboration, intelligence, controls and organizational complexity as it grows.' },
]

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b" style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderColor: BRAND.border, backdropFilter: 'blur(14px)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm" style={{ background: BRAND.gradient }}>
              <span className="text-white font-bold">A</span>
            </div>
            <span className="font-semibold text-lg" style={{ color: BRAND.text }}>Avenize</span>
          </Link>
          <div className="hidden lg:flex items-center gap-1">
            <a href="#stories" className="px-3 py-2 text-sm rounded-lg hover:bg-slate-50" style={{ color: BRAND.textSecondary }}>See yourself</a>
            <a href="#experience" className="px-3 py-2 text-sm rounded-lg hover:bg-slate-50" style={{ color: BRAND.textSecondary }}>How it works</a>
            <a href="#capabilities" className="px-3 py-2 text-sm rounded-lg hover:bg-slate-50" style={{ color: BRAND.textSecondary }}>What you can run</a>
            <a href="#pricing" className="px-3 py-2 text-sm rounded-lg hover:bg-slate-50" style={{ color: BRAND.textSecondary }}>Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden sm:block px-3 py-2 text-sm" style={{ color: BRAND.textSecondary }}>Sign in</Link>
            <Link to="/signup" className="px-5 py-2.5 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-md transition" style={{ backgroundColor: BRAND.primary }}>Get started</Link>
            <button className="lg:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation" aria-expanded={mobileOpen}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
          </div>
        </div>
      </div>
      {mobileOpen && (
        <div className="lg:hidden border-t px-4 py-3 space-y-1 bg-white" style={{ borderColor: BRAND.border }}>
          {[
            ['#stories', 'See yourself'], ['#experience', 'How it works'], ['#capabilities', 'What you can run'], ['#pricing', 'Pricing'],
          ].map(([href, label]) => <a key={href} href={href} onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm" style={{ color: BRAND.textSecondary }}>{label}</a>)}
        </div>
      )}
    </nav>
  )
}

function HeroSection() {
  return (
    <section className="pt-32 pb-20 px-4 sm:px-6 overflow-hidden" style={{ backgroundColor: '#FBFCFE' }}>
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-[1.05fr_.95fr] gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-7" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>
              <Heart size={16} />
              <span className="font-semibold">Built around the people who run your business</span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-[4.5rem] font-bold tracking-tight leading-[1.02] mb-7" style={{ color: BRAND.text }}>
              You built the business.<br />
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: BRAND.gradient }}>Avenize helps you run it.</span>
            </h1>
            <p className="text-xl leading-relaxed max-w-2xl mb-9" style={{ color: BRAND.textSecondary }}>
              Your people, customers, money, projects and decisions should not feel like separate parts of the same business. Avenize brings them together and shows each person what matters to them.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <Link to="/signup" className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl text-white font-semibold text-lg shadow-sm hover:shadow-lg transition" style={{ backgroundColor: BRAND.primary }}>
                Get started <ArrowRight size={20} />
              </Link>
              <a href="#stories" className="inline-flex items-center justify-center px-7 py-4 rounded-xl font-semibold text-lg bg-white border hover:bg-slate-50 transition" style={{ color: BRAND.text, borderColor: BRAND.border }}>
                See how it feels
              </a>
            </div>
            <p className="text-sm" style={{ color: BRAND.textSecondary }}>Paid plans from ₦15,000/month · Cancel anytime · Start with what you need</p>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 rounded-[3rem] opacity-60 blur-3xl" style={{ background: 'linear-gradient(135deg, rgba(21,91,180,.14), rgba(52,168,83,.10))' }} />
            <div className="relative rounded-[2rem] border bg-white p-5 sm:p-7 shadow-2xl" style={{ borderColor: BRAND.border }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: BRAND.textSecondary }}>Your work</p>
                  <p className="text-2xl font-semibold mt-1" style={{ color: BRAND.text }}>Good morning, David.</p>
                </div>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: BRAND.gradient }}>D</div>
              </div>
              <div className="rounded-2xl p-4 mb-3" style={{ backgroundColor: '#F8FAFD' }}>
                <div className="flex items-center justify-between mb-3"><span className="font-semibold text-sm">3 things need you</span><span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#E9F0FB', color: BRAND.primary }}>Today</span></div>
                {['Approve ₦1.2M request', 'Review project update', 'Reply to Sarah'].map((item, i) => (
                  <div key={item} className="flex items-center gap-3 py-3 border-t" style={{ borderColor: BRAND.border }}>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: [BRAND.primary, BRAND.warm, BRAND.success][i] }} />
                    <span className="text-sm flex-1" style={{ color: BRAND.text }}>{item}</span>
                    <ArrowRight size={15} style={{ color: BRAND.textSecondary }} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl p-4" style={{ backgroundColor: '#EEF5FF' }}><p className="text-xs" style={{ color: BRAND.textSecondary }}>Team progress</p><p className="text-2xl font-semibold mt-1">78%</p><div className="h-1.5 rounded-full bg-white mt-3 overflow-hidden"><div className="h-full rounded-full w-[78%]" style={{ background: BRAND.gradient }} /></div></div>
                <div className="rounded-2xl p-4" style={{ backgroundColor: '#F0F8F3' }}><p className="text-xs" style={{ color: BRAND.textSecondary }}>Waiting on you</p><p className="text-2xl font-semibold mt-1">3</p><p className="text-xs mt-2" style={{ color: BRAND.success }}>Clear next actions</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function StoriesSection() {
  return (
    <section id="stories" className="py-24 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-3xl mb-14">
          <p className="font-semibold text-sm uppercase tracking-wider mb-3" style={{ color: BRAND.primary }}>See yourself in Avenize</p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5" style={{ color: BRAND.text }}>The business looks different from every seat.</h2>
          <p className="text-lg leading-relaxed" style={{ color: BRAND.textSecondary }}>A founder does not need the same screen as a finance officer. A team lead does not need the same information as a field worker. Avenize starts with the person — then gives them the business context they need.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {ROLE_STORIES.map((story) => {
            const Icon = story.icon
            return (
              <article key={story.role} className="rounded-3xl p-7 sm:p-8 border hover:-translate-y-1 transition" style={{ borderColor: BRAND.border, backgroundColor: '#FCFDFE' }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-6" style={{ backgroundColor: `${story.color}12` }}><Icon size={22} style={{ color: story.color }} /></div>
                <p className="text-sm font-semibold mb-3" style={{ color: story.color }}>{story.role}</p>
                <h3 className="text-2xl font-bold leading-tight mb-4" style={{ color: BRAND.text }}>{story.title}</h3>
                <p className="leading-relaxed mb-5" style={{ color: BRAND.textSecondary }}>{story.body}</p>
                <div className="pt-5 border-t" style={{ borderColor: BRAND.border }}><p className="font-medium leading-relaxed" style={{ color: BRAND.text }}>{story.answer}</p></div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function ExperienceSection() {
  return (
    <section id="experience" className="py-24 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <p className="font-semibold text-sm uppercase tracking-wider mb-3" style={{ color: BRAND.primary }}>The experience</p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5" style={{ color: BRAND.text }}>The system can be powerful without making people feel lost.</h2>
            <p className="text-lg leading-relaxed mb-7" style={{ color: BRAND.textSecondary }}>The complexity of your business belongs inside the system. People should experience clarity.</p>
            <div className="space-y-4">
              {['What matters to me?', 'What do I need to do?', 'Why is this waiting?', 'What happens next?'].map((q, i) => <div key={q} className="flex items-center gap-4 p-4 rounded-2xl bg-white border" style={{ borderColor: BRAND.border }}><div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>{i + 1}</div><span className="font-medium" style={{ color: BRAND.text }}>{q}</span></div>)}
            </div>
          </div>
          <div className="rounded-[2rem] bg-white border p-6 sm:p-8 shadow-xl" style={{ borderColor: BRAND.border }}>
            <div className="flex items-center justify-between mb-7"><div><p className="text-xs uppercase tracking-wider" style={{ color: BRAND.textSecondary }}>Your organization</p><p className="text-xl font-semibold mt-1">Operations</p></div><Network size={22} style={{ color: BRAND.primary }} /></div>
            <div className="space-y-3">
              {['Today · 4 actions need you', 'This week · 2 approvals waiting', 'Projects · 3 milestones approaching', 'People · 1 request needs review'].map((row, i) => <div key={row} className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: i === 0 ? '#EEF5FF' : '#F8FAFC' }}><span className="text-sm font-medium">{row}</span><ArrowRight size={16} style={{ color: BRAND.textSecondary }} /></div>)}
            </div>
            <div className="mt-6 p-4 rounded-xl border" style={{ borderColor: BRAND.border }}><div className="flex items-center gap-2 mb-2"><Sparkles size={16} style={{ color: BRAND.primary }} /><span className="text-sm font-semibold">Avenize explains</span></div><p className="text-sm leading-relaxed" style={{ color: BRAND.textSecondary }}>This approval is waiting because it is above your team's delegated limit and has been routed to the next authority.</p></div>
          </div>
        </div>
      </div>
    </section>
  )
}

function OrganizationSection() {
  return (
    <section className="py-24 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-[.8fr_1.2fr] gap-14 items-center">
          <div className="rounded-[2rem] p-6 bg-slate-950 text-white shadow-xl">
            <p className="text-xs uppercase tracking-wider text-white/50 mb-6">Your organization</p>
            <div className="flex justify-center"><div className="px-5 py-3 rounded-xl bg-white/10 border border-white/10 text-sm font-semibold">Board / Leadership</div></div>
            <div className="h-8 w-px bg-white/15 mx-auto" />
            <div className="grid grid-cols-2 gap-3"><div className="p-4 rounded-xl bg-white/10 border border-white/10 text-sm">Operations</div><div className="p-4 rounded-xl bg-white/10 border border-white/10 text-sm">Finance</div></div>
            <div className="h-8 w-px bg-white/15 mx-auto" />
            <div className="p-4 rounded-xl bg-[var(--av-primary-soft)]0/20 border border-blue-400/20 text-sm">Procurement Committee · cross-functional</div>
          </div>
          <div>
            <p className="font-semibold text-sm uppercase tracking-wider mb-3" style={{ color: BRAND.primary }}>Your shape. Your rules.</p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5" style={{ color: BRAND.text }}>Your organization is not a template.</h2>
            <p className="text-lg leading-relaxed mb-7" style={{ color: BRAND.textSecondary }}>Different businesses organize responsibility differently. Build your own hierarchy, departments, branches, teams and committees. Keep a person's real reporting relationship while giving them the additional responsibilities they need.</p>
            <div className="grid sm:grid-cols-2 gap-3">{['Custom hierarchy', 'Departments & teams', 'Branches & entities', 'Committees', 'Reporting lines', 'Approval authority'].map(x => <div key={x} className="flex items-center gap-2 text-sm font-medium"><Check size={17} style={{ color: BRAND.success }} />{x}</div>)}</div>
          </div>
        </div>
      </div>
    </section>
  )
}

function RepresentationSection() {
  const [selected, setSelected] = useState(0)
  const SelectedIcon = VIEWS[selected].icon
  return (
    <section className="py-24 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <p className="font-semibold text-sm uppercase tracking-wider mb-3" style={{ color: BRAND.primary }}>Flexible understanding</p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5" style={{ color: BRAND.text }}>Your data should make sense to you.</h2>
          <p className="text-lg leading-relaxed" style={{ color: BRAND.textSecondary }}>Not everyone thinks in charts. Not everyone wants a table. Choose the representation that helps you understand the information and act on it.</p>
        </div>
        <div className="grid lg:grid-cols-[.8fr_1.2fr] gap-6 max-w-5xl mx-auto">
          <div className="rounded-3xl bg-white border p-3" style={{ borderColor: BRAND.border }}>{VIEWS.map((view, i) => { const Icon = view.icon; return <button key={view.title} onClick={() => setSelected(i)} className="w-full text-left p-4 rounded-2xl mb-1 last:mb-0 transition" style={{ backgroundColor: selected === i ? BRAND.primarySoft : 'transparent' }}><div className="flex gap-3 items-center"><Icon size={19} style={{ color: selected === i ? BRAND.primary : BRAND.textSecondary }} /><div><p className="font-semibold text-sm">{view.title}</p><p className="text-xs mt-0.5" style={{ color: BRAND.textSecondary }}>{view.desc}</p></div></div></button> })}</div>
          <div className="rounded-3xl bg-white border p-6 sm:p-8 min-h-[280px]" style={{ borderColor: BRAND.border }}>
            <div className="flex items-center justify-between mb-7"><div><p className="text-xs uppercase tracking-wider" style={{ color: BRAND.textSecondary }}>Business performance</p><p className="text-2xl font-semibold mt-1">{VIEWS[selected].title} view</p></div><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: BRAND.primarySoft }}><SelectedIcon size={20} style={{ color: BRAND.primary }} /></div></div>
            <div className="grid grid-cols-3 gap-3 mb-5"><div className="p-4 rounded-2xl bg-slate-50"><p className="text-xs">Open work</p><p className="text-2xl font-semibold mt-2">24</p></div><div className="p-4 rounded-2xl bg-slate-50"><p className="text-xs">On track</p><p className="text-2xl font-semibold mt-2">18</p></div><div className="p-4 rounded-2xl bg-slate-50"><p className="text-xs">Needs you</p><p className="text-2xl font-semibold mt-2">3</p></div></div>
            <div className="h-20 rounded-2xl flex items-end gap-2 p-4 bg-slate-50">{[35, 58, 46, 72, 61, 82, 70, 91, 76].map((h, i) => <div key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%`, background: BRAND.gradient }} />)}</div>
          </div>
        </div>
      </div>
    </section>
  )
}

function CapabilitiesSection() {
  return (
    <section id="capabilities" className="py-24 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-3xl mb-12"><p className="font-semibold text-sm uppercase tracking-wider mb-3" style={{ color: BRAND.primary }}>One connected business</p><h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5" style={{ color: BRAND.text }}>Everything has a place. Nothing has to feel separate.</h2><p className="text-lg" style={{ color: BRAND.textSecondary }}>Run the parts of your business that matter today, while keeping the connections that matter tomorrow.</p></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{CAPABILITIES.map(c => { const Icon = c.icon; return <div key={c.label} className="p-5 rounded-2xl border hover:shadow-md transition" style={{ borderColor: BRAND.border, backgroundColor: '#FCFDFE' }}><div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: BRAND.primarySoft }}><Icon size={19} style={{ color: BRAND.primary }} /></div><p className="font-semibold mb-1">{c.label}</p><p className="text-sm leading-relaxed" style={{ color: BRAND.textSecondary }}>{c.desc}</p></div> })}</div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-12"><p className="font-semibold text-sm uppercase tracking-wider mb-3" style={{ color: BRAND.primary }}>Choose your starting point</p><h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5" style={{ color: BRAND.text }}>Start where you are. Grow when you are ready.</h2><p className="text-lg" style={{ color: BRAND.textSecondary }}>Six paths for six stages of organizational complexity. The right plan should feel like a natural next step, not a forced jump.</p></div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{PRICING.map((p) => <div key={p.name} className="relative rounded-3xl bg-white p-6 border flex flex-col" style={{ borderColor: p.popular ? BRAND.primary : BRAND.border, borderWidth: p.popular ? 2 : 1, boxShadow: p.popular ? '0 20px 50px rgba(21,91,180,.12)' : 'var(--av-shadow-sm)' }}>{p.popular && <span className="absolute -top-3 left-6 px-3 py-1 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: BRAND.primary }}>Most chosen</span>}<p className="text-sm font-semibold" style={{ color: BRAND.primary }}>{p.name}</p><p className="text-3xl font-bold mt-3" style={{ color: BRAND.text }}>{p.price}{p.price !== 'Custom' && <span className="text-sm font-normal" style={{ color: BRAND.textSecondary }}>/month</span>}</p><p className="text-sm leading-relaxed mt-3 min-h-[42px]" style={{ color: BRAND.textSecondary }}>{p.desc}</p><div className="h-px my-5" style={{ backgroundColor: BRAND.border }} /> <ul className="space-y-3 flex-1 mb-7">{p.features.map(f => <li key={f} className="flex gap-2 text-sm"><Check size={16} className="shrink-0 mt-0.5" style={{ color: BRAND.success }} />{f}</li>)}</ul><Link to={p.cta === 'Talk to us' ? '/contact' : '/signup'} className="w-full text-center py-3 rounded-xl font-semibold text-sm transition" style={{ backgroundColor: p.popular ? BRAND.primary : '#F3F6FA', color: p.popular ? 'white' : BRAND.text }}>{p.cta}</Link></div>)}</div>
        <p className="text-center text-sm mt-8" style={{ color: BRAND.textSecondary }}>Need a different shape? <Link to="/contact" className="font-semibold" style={{ color: BRAND.primary }}>Tell us how your organization works.</Link></p>
      </div>
    </section>
  )
}

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null)
  return <section className="py-24 px-4 sm:px-6 bg-white"><div className="max-w-3xl mx-auto"><div className="text-center mb-12"><p className="font-semibold text-sm uppercase tracking-wider mb-3" style={{ color: BRAND.primary }}>Before you start</p><h2 className="text-4xl font-bold" style={{ color: BRAND.text }}>Questions you may be asking.</h2></div><div className="space-y-3">{FAQS.map((faq, i) => <div key={faq.q} className="rounded-2xl border p-5" style={{ borderColor: BRAND.border }}><button className="w-full flex items-center justify-between text-left gap-4" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}><span className="font-semibold">{faq.q}</span><ChevronDown size={19} className={`shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} /></button>{open === i && <p className="mt-4 text-sm leading-relaxed pr-8" style={{ color: BRAND.textSecondary }}>{faq.a}</p>}</div>)}</div></div></section>
}

function FinalCTA() {
  return <section className="py-24 px-4 sm:px-6 overflow-hidden" style={{ backgroundColor: '#101827' }}><div className="max-w-4xl mx-auto text-center"><div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-7" style={{ background: BRAND.gradient }}><span className="text-white font-bold text-xl">A</span></div><h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-5">You should be able to see your business clearly.</h2><p className="text-lg leading-relaxed max-w-2xl mx-auto mb-9" style={{ color: 'rgba(255,255,255,.72)' }}>Not because your business became simpler. Because the system finally became good at carrying the complexity for you.</p><Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-semibold text-lg shadow-lg hover:-translate-y-0.5 transition" style={{ backgroundColor: BRAND.primary }}>Get started <ArrowRight size={20} /></Link><div className="flex flex-wrap items-center justify-center gap-6 mt-7 text-sm" style={{ color: 'rgba(255,255,255,.58)' }}><span className="flex items-center gap-2"><Shield size={15} />Secure by design</span><span className="flex items-center gap-2"><Clock size={15} />Set up in minutes</span><span className="flex items-center gap-2"><Headphones size={15} />Human support</span></div></div></section>
}

function Footer() {
  return <footer className="py-12 px-4 sm:px-6" style={{ backgroundColor: BRAND.surface }}><div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6 items-center justify-between"><div className="flex items-center gap-2"><div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: BRAND.gradient }}><span className="text-white font-bold">A</span></div><span className="font-semibold">Avenize</span></div><div className="flex flex-wrap justify-center gap-5 text-sm" style={{ color: BRAND.textSecondary }}><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/contact">Contact</Link></div><div className="text-sm text-center md:text-right" style={{ color: BRAND.textSecondary }}><p>© 2026 Avenize.</p><p className="mt-1">Built for businesses that are ready to run with clarity.</p></div></div></footer>
}

export default function LandingEnhanced() {
  // Public marketing surface: page view for the ads funnel.
  useEffect(() => { trackPageView() }, [])

  // B14 attribution: capture UTM/referrer provenance on the public surface so
  // a later signup can be connected back to its discovery source.
  captureAttribution()
  return <div className="min-h-screen bg-white"><Navbar /><main><HeroSection /><StoriesSection /><ExperienceSection /><OrganizationSection /><RepresentationSection /><CapabilitiesSection /><PricingSection /><FAQSection /><FinalCTA /></main><Footer /><SarahChat /></div>
}
