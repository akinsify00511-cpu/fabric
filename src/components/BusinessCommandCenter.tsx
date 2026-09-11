import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ArrowRight, Brain, CheckCircle2, CircleDot, Clock3, Compass, Sparkles } from 'lucide-react'
import type { BusinessBrain, BusinessHealth, Recommendation, ValueLedger } from '../lib/businessOS'

interface ActionItem {
  id: string
  title: string
  to: string
  tone: 'red' | 'amber' | 'blue'
  detail?: string
}

interface Props {
  brain: BusinessBrain | null
  health: BusinessHealth | null
  recommendations: Recommendation[]
  ledger: ValueLedger | null
  actions: ActionItem[]
  functionLabel: string
  seniorityLabel: string
}

const contexts = ['Business', 'Revenue', 'Cash', 'Operations', 'People', 'Customer'] as const

type Context = (typeof contexts)[number]

function toneFor(index: number) {
  return ['red', 'amber', 'blue'][index % 3] as ActionItem['tone']
}

function contextSummary(context: Context, brain: BusinessBrain | null, health: BusinessHealth | null, ledger: ValueLedger | null) {
  if (context === 'Cash') return ledger ? 'Value and leakage signals' : 'Cash picture is still forming'
  if (context === 'Business') return health?.state ? `Business state: ${String(health.state).replaceAll('_', ' ')}` : 'Whole-business operating view'
  if (context === 'Revenue') return brain?.state ? 'Pipeline and revenue decisions' : 'Revenue picture is still forming'
  if (context === 'Operations') return 'Execution, workload and delivery'
  if (context === 'People') return 'People, ownership and follow-through'
  return 'Customer, demand and relationship flow'
}

export default function BusinessCommandCenter({ brain, health, recommendations, ledger, actions, functionLabel, seniorityLabel }: Props) {
  const [context, setContext] = useState<Context>('Business')
  const root = useRef<HTMLDivElement>(null)

  const work = useMemo(() => {
    const items: Array<{ id: string; title: string; detail: string; state: 'needs' | 'ready' | 'watch'; to: string }> = []
    actions.slice(0, 4).forEach(action => items.push({
      id: `action:${action.id}`,
      title: action.title,
      detail: action.detail ?? 'Requires your attention',
      state: action.tone === 'red' ? 'needs' : 'watch',
      to: action.to,
    }))
    recommendations.slice(0, Math.max(0, 4 - items.length)).forEach((item, index) => items.push({
      id: `recommendation:${item.id ?? index}`,
      title: item.title || 'Recommended business action',
      detail: item.reason || 'Avenize identified a decision worth reviewing',
      state: item.severity === 'critical' ? 'needs' : 'ready',
      to: '/app/intelligence',
    }))
    return items
  }, [actions, recommendations])

  useEffect(() => {
    if (!root.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo(root.current.querySelectorAll('[data-command-item]'),
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.34, stagger: 0.045, ease: 'power2.out' },
    )
  }, [context, work.length])

  const stateLabel = health?.state ? String(health.state).replaceAll('_', ' ') : 'building the picture'
  const objectiveText = brain?.state?.summary || brain?.state?.reason || 'Avenize is assembling the clearest next decision from your business data.'

  return (
    <section ref={root} className="mb-8" aria-label="Business command center">
      <div className="rounded-[28px] border border-[var(--av-glass-border)] bg-[var(--av-glass-bg-strong)] overflow-hidden shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <div className="px-5 sm:px-7 pt-6 pb-5 border-b border-[var(--av-glass-border)]">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--av-text-muted)' }}>
                <Compass size={14} aria-hidden="true" />
                Business command center
              </div>
              <h2 className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight" style={{ color: 'var(--av-text)' }}>
                What matters now
              </h2>
              <p className="mt-1 text-sm max-w-2xl" style={{ color: 'var(--av-text-secondary)' }}>
                {functionLabel}{seniorityLabel ? ` · ${seniorityLabel}` : ''}. {objectiveText}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--av-text-muted)' }}>
              <span className="inline-flex items-center gap-1.5"><CircleDot size={13} /> Live business state</span>
              <span className="font-medium capitalize" style={{ color: 'var(--av-text)' }}>{stateLabel}</span>
            </div>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Business context">
            {contexts.map(item => {
              const selected = item === context
              return (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setContext(item)}
                  className="shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--av-primary)]"
                  style={{
                    background: selected ? 'var(--av-text)' : 'transparent',
                    color: selected ? 'white' : 'var(--av-text-secondary)',
                    border: selected ? '1px solid var(--av-text)' : '1px solid var(--av-glass-border)',
                  }}
                >
                  {item}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--av-text-muted)' }}>{contextSummary(context, brain, health, ledger)}</p>
        </div>

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] divide-y lg:divide-y-0 lg:divide-x" style={{ borderColor: 'var(--av-glass-border)' }}>
          <div className="p-5 sm:p-7">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Brain size={17} aria-hidden="true" style={{ color: 'var(--av-primary)' }} />
                <h3 className="font-semibold" style={{ color: 'var(--av-text)' }}>Avenize work</h3>
              </div>
              <Link to="/app/ask" className="text-xs font-medium inline-flex items-center gap-1" style={{ color: 'var(--av-primary)' }}>
                Ask Sarah <ArrowRight size={12} />
              </Link>
            </div>

            {work.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-5" style={{ borderColor: 'var(--av-glass-border)' }}>
                <div className="flex items-start gap-3">
                  <Sparkles size={17} style={{ color: 'var(--av-primary)' }} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--av-text)' }}>No active work is being claimed.</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--av-text-muted)' }}>When Avenize has a verified recommendation or an item needing attention, it will appear here.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {work.map((item, index) => (
                  <Link
                    key={item.id}
                    data-command-item
                    to={item.to}
                    className="group flex items-center gap-3 rounded-2xl px-3.5 py-3 border transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--av-primary)]"
                    style={{ borderColor: 'var(--av-glass-border)' }}
                  >
                    <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: item.state === 'needs' ? 'rgba(239,68,68,0.09)' : 'rgba(59,130,246,0.09)' }}>
                      {item.state === 'ready' ? <CheckCircle2 size={15} /> : item.state === 'needs' ? <Sparkles size={14} /> : <Clock3 size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate" style={{ color: 'var(--av-text)' }}>{item.title}</span>
                      <span className="block text-xs truncate mt-0.5" style={{ color: 'var(--av-text-muted)' }}>{item.detail}</span>
                    </span>
                    <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition" style={{ color: 'var(--av-primary)' }}>Open</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-2 mb-4">
              <Compass size={17} aria-hidden="true" style={{ color: 'var(--av-primary)' }} />
              <h3 className="font-semibold" style={{ color: 'var(--av-text)' }}>Decision path</h3>
            </div>
            <div className="space-y-0">
              {[
                ['Current state', stateLabel],
                ['Evidence', recommendations.length ? `${recommendations.length} live recommendation${recommendations.length === 1 ? '' : 's'}` : 'No recommendation recorded'],
                ['Next move', actions[0]?.title || recommendations[0]?.title || 'Review the business picture'],
              ].map(([label, value], index) => (
                <div key={label} data-command-item className="relative flex gap-3 pb-5 last:pb-0">
                  {index < 2 && <span className="absolute left-[7px] top-5 h-full w-px" style={{ background: 'var(--av-glass-border)' }} aria-hidden="true" />}
                  <span className="relative z-10 mt-1 w-3.5 h-3.5 rounded-full border-2 bg-[var(--av-glass-bg-strong)]" style={{ borderColor: index === 2 ? 'var(--av-primary)' : 'var(--av-border)' }} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs" style={{ color: 'var(--av-text-muted)' }}>{label}</p>
                    <p className="text-sm font-medium mt-0.5 capitalize" style={{ color: 'var(--av-text)' }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
