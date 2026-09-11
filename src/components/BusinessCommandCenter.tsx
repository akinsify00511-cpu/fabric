import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ArrowRight, Brain, CheckCircle2, CircleDot, Clock3, Compass, Sparkles } from 'lucide-react'
import type { BusinessBrain, BusinessHealth, Recommendation, ValueLedger } from '../lib/businessOS'
import type { BusinessFunction, FunctionHomeConfig, Seniority } from '../lib/functionHome'

interface ActionItem { id: string; title: string; to: string; tone: 'red' | 'amber' | 'blue'; detail?: string }
interface Props {
  brain: BusinessBrain | null
  health: BusinessHealth | null
  recommendations: Recommendation[]
  ledger: ValueLedger | null
  actions: ActionItem[]
  functionLabel: string
  seniorityLabel: string
  businessFunction: BusinessFunction
  seniority: Seniority
  homeConfig: FunctionHomeConfig
}

type Context = { label: string; summary: string; to: string }

const CONTEXTS: Record<BusinessFunction, Context[]> = {
  general: [
    { label: 'Business', summary: 'Whole-business operating view', to: '/app' },
    { label: 'Revenue', summary: 'Revenue and pipeline decisions', to: '/app/crm' },
    { label: 'Cash', summary: 'Cash, collections and profitability', to: '/app/finance' },
    { label: 'Operations', summary: 'Execution, workload and delivery', to: '/app/operations' },
    { label: 'People', summary: 'People, ownership and follow-through', to: '/app/people' },
    { label: 'Customer', summary: 'Customer, demand and relationship flow', to: '/app/crm' },
  ],
  marketing: [
    { label: 'Campaigns', summary: 'Campaign reach, response and momentum', to: '/app/campaigns' },
    { label: 'Leads', summary: 'Lead quality and conversion', to: '/app/crm' },
    { label: 'Pipeline', summary: 'Marketing contribution to revenue', to: '/app/crm' },
    { label: 'Customers', summary: 'Demand, relationships and retention', to: '/app/crm' },
  ],
  sales: [
    { label: 'Pipeline', summary: 'Deals, stages and conversion', to: '/app/crm' },
    { label: 'Revenue', summary: 'Revenue performance and velocity', to: '/app/crm' },
    { label: 'Customers', summary: 'Customer relationships and follow-up', to: '/app/crm' },
    { label: 'Quotes', summary: 'Quotes, acceptance and order flow', to: '/app/quotes' },
  ],
  finance: [
    { label: 'Cash', summary: 'Cash position and movement', to: '/app/finance' },
    { label: 'Receivables', summary: 'Collections and overdue value', to: '/app/finance' },
    { label: 'Profit', summary: 'Profitability and leakage', to: '/app/finance' },
    { label: 'Payments', summary: 'Payments, invoices and exceptions', to: '/app/finance' },
  ],
  hr: [
    { label: 'People', summary: 'Team health and capacity', to: '/app/people' },
    { label: 'Attendance', summary: 'Attendance and availability', to: '/app/people' },
    { label: 'Leave', summary: 'Leave requests and upcoming absence', to: '/app/people' },
    { label: 'Workload', summary: 'People ownership and follow-through', to: '/app/tasks' },
  ],
  operations: [
    { label: 'Operations', summary: 'Execution, capacity and bottlenecks', to: '/app/operations' },
    { label: 'Inventory', summary: 'Stock, suppliers and orders', to: '/app/inventory' },
    { label: 'Workload', summary: 'Open work and delivery pressure', to: '/app/tasks' },
    { label: 'Cost', summary: 'Operational cost and leakage', to: '/app/finance' },
  ],
  projects: [
    { label: 'Projects', summary: 'Delivery, milestones and deadlines', to: '/app/projects' },
    { label: 'Workload', summary: 'Team capacity and open work', to: '/app/tasks' },
    { label: 'Blocked', summary: 'Bottlenecks and dependencies', to: '/app/projects' },
    { label: 'Margin', summary: 'Delivery economics and value', to: '/app/finance' },
  ],
}

export default function BusinessCommandCenter({ brain, health, recommendations, ledger, actions, functionLabel, seniorityLabel, businessFunction, seniority, homeConfig }: Props) {
  const contexts = CONTEXTS[businessFunction] ?? CONTEXTS.general
  const [context, setContext] = useState(contexts[0])
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contexts.some(item => item.label === context.label)) setContext(contexts[0])
  }, [businessFunction])

  const work = useMemo(() => {
    const items: Array<{ id: string; title: string; detail: string; state: 'needs' | 'ready' | 'watch'; to: string }> = []
    actions.slice(0, 4).forEach(action => items.push({ id: `action:${action.id}`, title: action.title, detail: action.detail ?? 'Requires your attention', state: action.tone === 'red' ? 'needs' : 'watch', to: action.to }))
    recommendations.slice(0, Math.max(0, 4 - items.length)).forEach((item, index) => items.push({
      id: `recommendation:${item.id || index}`,
      title: item.statement,
      detail: item.expected_impact?.description || 'Verified recommendation from your business data',
      state: item.severity === 'critical' ? 'needs' : 'ready',
      to: '/app/intelligence',
    }))
    return items
  }, [actions, recommendations])

  useEffect(() => {
    if (!root.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo(root.current.querySelectorAll('[data-command-item]'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.34, stagger: 0.045, ease: 'power2.out' })
  }, [context.label, work.length])

  const stateLabel = health?.overall_score == null ? 'building the picture' : health.overall_score >= 80 ? 'healthy' : health.overall_score >= 60 ? 'needs attention' : 'at risk'
  const objectiveText = brain
    ? `${functionLabel} intelligence is connected to the next decision.`
    : `${functionLabel} intelligence is being assembled from your business data.`

  return (
    <section ref={root} className="mb-8" aria-label={`${functionLabel} command center`}>
      <div className="rounded-[28px] border border-[var(--av-glass-border)] bg-[var(--av-glass-bg-strong)] overflow-hidden shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <div className="px-5 sm:px-7 pt-6 pb-5 border-b border-[var(--av-glass-border)]">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--av-text-muted)' }}><Compass size={14} aria-hidden="true" />{functionLabel} command center</div>
              <h2 className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight" style={{ color: 'var(--av-text)' }}>What matters now</h2>
              <p className="mt-1 text-sm max-w-2xl" style={{ color: 'var(--av-text-secondary)' }}>{functionLabel}{seniorityLabel ? ` · ${seniorityLabel}` : ''}. {objectiveText}</p>
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--av-text-muted)' }}><span className="inline-flex items-center gap-1.5"><CircleDot size={13} /> Your live state</span><span className="font-medium capitalize" style={{ color: 'var(--av-text)' }}>{stateLabel}</span></div>
          </div>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={`${functionLabel} context`}>
            {contexts.map(item => { const selected = item.label === context.label; return <button key={item.label} type="button" role="tab" aria-selected={selected} onClick={() => setContext(item)} className="shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--av-primary)]" style={{ background: selected ? 'var(--av-text)' : 'transparent', color: selected ? 'white' : 'var(--av-text-secondary)', border: selected ? '1px solid var(--av-text)' : '1px solid var(--av-glass-border)' }}>{item.label}</button> })}
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--av-text-muted)' }}>{context.summary}</p>
        </div>
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] divide-y lg:divide-y-0 lg:divide-x" style={{ borderColor: 'var(--av-glass-border)' }}>
          <div className="p-5 sm:p-7">
            <div className="flex items-center justify-between gap-4 mb-4"><div className="flex items-center gap-2"><Brain size={17} aria-hidden="true" style={{ color: 'var(--av-primary)' }} /><h3 className="font-semibold" style={{ color: 'var(--av-text)' }}>Your Avenize work</h3></div><Link to="/app/ask" className="text-xs font-medium inline-flex items-center gap-1" style={{ color: 'var(--av-primary)' }}>Ask Sarah <ArrowRight size={12} /></Link></div>
            {work.length === 0 ? <div className="rounded-2xl border border-dashed p-5" style={{ borderColor: 'var(--av-glass-border)' }}><div className="flex items-start gap-3"><Sparkles size={17} style={{ color: 'var(--av-primary)' }} aria-hidden="true" /><div><p className="text-sm font-medium" style={{ color: 'var(--av-text)' }}>No active work is being claimed.</p><p className="text-sm mt-1" style={{ color: 'var(--av-text-muted)' }}>When Avenize has verified work or an item needing your attention, it will appear here.</p></div></div></div> : <div className="space-y-2">{work.map(item => <Link key={item.id} data-command-item to={item.to} className="group flex items-center gap-3 rounded-2xl px-3.5 py-3 border transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--av-primary)]" style={{ borderColor: 'var(--av-glass-border)' }}><span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: item.state === 'needs' ? 'rgba(239,68,68,0.09)' : 'rgba(59,130,246,0.09)' }}>{item.state === 'ready' ? <CheckCircle2 size={15} /> : item.state === 'needs' ? <Sparkles size={14} /> : <Clock3 size={14} />}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate" style={{ color: 'var(--av-text)' }}>{item.title}</span><span className="block text-xs truncate mt-0.5" style={{ color: 'var(--av-text-muted)' }}>{item.detail}</span></span><span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition" style={{ color: 'var(--av-primary)' }}>Open</span></Link>)}</div>}
          </div>
          <div className="p-5 sm:p-7">
            <div className="flex items-center justify-between gap-4 mb-4"><div className="flex items-center gap-2"><Compass size={17} aria-hidden="true" style={{ color: 'var(--av-primary)' }} /><h3 className="font-semibold" style={{ color: 'var(--av-text)' }}>Decision path</h3></div><Link to={homeConfig.primaryCta.to} className="text-xs font-medium inline-flex items-center gap-1" style={{ color: 'var(--av-primary)' }}>{homeConfig.primaryCta.label}<ArrowRight size={12} /></Link></div>
            <div className="space-y-0">{[
              ['Current state', stateLabel],
              ['Your evidence', recommendations.length ? `${recommendations.length} live recommendation${recommendations.length === 1 ? '' : 's'}` : 'No recommendation recorded'],
              ['Next move', actions[0]?.title || recommendations[0]?.statement || homeConfig.primaryCta.label],
            ].map(([label, value], index) => <div key={label} data-command-item className="relative flex gap-3 pb-5 last:pb-0">{index < 2 && <span className="absolute left-[7px] top-5 h-full w-px" style={{ background: 'var(--av-glass-border)' }} aria-hidden="true" />}<span className="relative z-10 mt-1 w-3.5 h-3.5 rounded-full border-2 bg-[var(--av-glass-bg-strong)]" style={{ borderColor: index === 2 ? 'var(--av-primary)' : 'var(--av-border)' }} aria-hidden="true" /><div className="min-w-0"><p className="text-xs" style={{ color: 'var(--av-text-muted)' }}>{label}</p><p className="text-sm font-medium mt-0.5 capitalize" style={{ color: 'var(--av-text)' }}>{value}</p></div></div>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
