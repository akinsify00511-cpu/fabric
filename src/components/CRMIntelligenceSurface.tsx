import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, Brain, CalendarClock, CheckCircle2, ChevronRight, Clock3, Flame, Phone, ShieldAlert, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useBusiness } from '../lib/BusinessContext'

type CallItem = {
  deal_id: string
  deal_title: string
  contact_name?: string | null
  stage?: string | null
  value?: number | null
  days_since_activity?: number | null
  cold_flag?: boolean | null
  cold_reason?: string | null
  next_action_date?: string | null
  call_score?: number | null
}

type Briefing = {
  contact_id: string
  contact_name: string
  company?: string | null
  last_activity_summary?: string | null
  last_activity_at?: string | null
  open_deal_count?: number | null
  open_pipeline_value?: number | null
  has_risk?: boolean | null
  has_cold_deal?: boolean | null
  invoice_count?: number | null
  invoiced_value?: number | null
  paid_invoice_value?: number | null
  next_due_date?: string | null
}

const money = (value: number | null | undefined) => {
  const n = Number(value || 0)
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`
  return `₦${n.toLocaleString()}`
}

const daysAgo = (value?: string | null) => {
  if (!value) return 'No activity recorded'
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000))
  return days === 0 ? 'Today' : `${days}d ago`
}

export default function CRMIntelligenceSurface({ compact = false }: { compact?: boolean }) {
  const { activeBusinessId } = useBusiness()
  const [calls, setCalls] = useState<CallItem[]>([])
  const [briefings, setBriefings] = useState<Briefing[]>([])
  const [forecastIssues, setForecastIssues] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(true)

  const load = useCallback(async () => {
    if (!activeBusinessId) return
    setLoading(true)
    const [callResult, briefingResult, forecastResult] = await Promise.all([
      supabase.from('smart_call_list').select('*').eq('business_id', activeBusinessId).order('call_score', { ascending: false }).limit(compact ? 3 : 6),
      supabase.from('pre_call_briefing').select('*').eq('business_id', activeBusinessId).order('last_activity_at', { ascending: false, nullsFirst: true }).limit(compact ? 3 : 6),
      supabase.from('forecast_integrity').select('*').eq('business_id', activeBusinessId).not('discrepancy_type', 'is', null).limit(compact ? 3 : 6),
    ])
    setCalls((callResult.data ?? []) as CallItem[])
    setBriefings((briefingResult.data ?? []) as Briefing[])
    setForecastIssues(forecastResult.data ?? [])
    setLoading(false)
  }, [activeBusinessId, compact])

  useEffect(() => { void load() }, [load])

  if (!open) return <button onClick={() => setOpen(true)} className="mb-5 inline-flex items-center gap-2 rounded-xl border border-[var(--av-border)] bg-[var(--av-surface)] px-4 py-2 text-sm font-medium text-[var(--av-text)]"><Brain size={16} /> Show Avenize Intelligence</button>

  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-[var(--av-border)] bg-[var(--av-surface)] shadow-[var(--av-elevation-1)]">
      <div className="flex items-center justify-between border-b border-[var(--av-border)] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--av-primary-soft)] text-[var(--av-primary)]"><Brain size={20} /></div>
          <div><div className="flex items-center gap-2 font-semibold text-[var(--av-text)]"><span>Avenize Intelligence</span><Sparkles size={14} className="text-[var(--av-primary)]" /></div><p className="text-xs text-[var(--av-text-secondary)]">What needs attention, why, and what to do next.</p></div>
        </div>
        <button onClick={() => setOpen(false)} className="text-xs text-[var(--av-text-secondary)] hover:text-[var(--av-text)]">Collapse</button>
      </div>

      {loading ? <div className="grid gap-3 p-5 md:grid-cols-3"><div className="h-28 animate-pulse rounded-2xl bg-[var(--av-surface-2)]" /><div className="h-28 animate-pulse rounded-2xl bg-[var(--av-surface-2)]" /><div className="h-28 animate-pulse rounded-2xl bg-[var(--av-surface-2)]" /></div> : (
        <>
          <div className="grid gap-3 p-5 md:grid-cols-3">
            <SignalCard icon={<Flame size={18} />} title="Call now" value={calls.length} detail={calls[0] ? `${calls[0].contact_name || 'Priority account'} · ${money(calls[0].value)}` : 'No priority calls detected'} tone="danger" />
            <SignalCard icon={<ShieldAlert size={18} />} title="Deal attention" value={forecastIssues.length} detail={forecastIssues[0]?.discrepancy_reason || 'No forecast discrepancies detected'} tone="warning" />
            <SignalCard icon={<CalendarClock size={18} />} title="Relationship memory" value={briefings.length} detail={briefings[0] ? `${briefings[0].contact_name} · ${daysAgo(briefings[0].last_activity_at)}` : 'No briefing data yet'} tone="info" />
          </div>

          <div className="grid gap-4 border-t border-[var(--av-border)] p-5 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-[var(--av-text)]">Who should I call next?</h3><span className="text-xs text-[var(--av-text-secondary)]">Priority ranked</span></div>
              <div className="space-y-2">{calls.length === 0 ? <EmptyState text="Avenize needs deal/activity data before it can rank calls." /> : calls.map(item => <CallRow key={item.deal_id} item={item} />)}</div>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-[var(--av-text)]">Pre-call context</h3><span className="text-xs text-[var(--av-text-secondary)]">Evidence first</span></div>
              <div className="space-y-2">{briefings.length === 0 ? <EmptyState text="No relationship history is available yet." /> : briefings.map(b => <BriefingRow key={b.contact_id} briefing={b} />)}</div>
            </div>
          </div>

          {forecastIssues.length > 0 && <div className="border-t border-[var(--av-border)] bg-[var(--av-warning-soft)]/30 px-5 py-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--av-text)]"><AlertTriangle size={16} /> Forecast integrity needs review</div><div className="grid gap-2 md:grid-cols-3">{forecastIssues.map((issue, i) => <div key={issue.deal_id || i} className="rounded-xl bg-[var(--av-surface)] p-3"><div className="text-xs font-medium text-[var(--av-text)]">{issue.deal_title || 'Deal'}</div><div className="mt-1 text-xs text-[var(--av-text-secondary)]">{issue.discrepancy_reason}</div></div>)}</div></div>}
        </>
      )}
    </section>
  )
}

function SignalCard({ icon, title, value, detail, tone }: { icon: React.ReactNode; title: string; value: number; detail: string; tone: 'danger' | 'warning' | 'info' }) {
  const styles = tone === 'danger' ? 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]' : tone === 'warning' ? 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]' : 'bg-[var(--av-info-soft)] text-[var(--av-info)]'
  return <div className="rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)] p-4"><div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-xl ${styles}`}>{icon}</div><div className="text-xs text-[var(--av-text-secondary)]">{title}</div><div className="mt-1 flex items-end gap-2"><span className="text-2xl font-bold text-[var(--av-text)]">{value}</span><span className="pb-1 text-xs text-[var(--av-text-secondary)]">signals</span></div><p className="mt-1 line-clamp-2 text-xs text-[var(--av-text-secondary)]">{detail}</p></div>
}

function CallRow({ item }: { item: CallItem }) {
  return <div className="group flex items-center gap-3 rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)] p-3 transition hover:border-[var(--av-primary)]/30"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--av-danger-soft)] text-[var(--av-danger)]"><Phone size={16} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-[var(--av-text)]">{item.contact_name || 'Unknown contact'}</div><div className="truncate text-xs text-[var(--av-text-secondary)]">{item.deal_title} · {item.stage || 'Open'} · {daysAgo(item.last_activity_at)}</div>{item.cold_reason && <div className="mt-1 truncate text-[11px] text-[var(--av-warning)]">{item.cold_reason}</div>}</div><div className="text-right"><div className="text-sm font-bold text-[var(--av-text)]">{item.call_score ?? 0}</div><div className="text-[10px] text-[var(--av-text-secondary)]">priority</div></div><ChevronRight size={16} className="text-[var(--av-text-tertiary)] transition group-hover:translate-x-0.5" /></div>
}

function BriefingRow({ briefing }: { briefing: Briefing }) {
  const attention = briefing.has_risk || briefing.has_cold_deal
  return <div className="rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)] p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-[var(--av-text)]">{briefing.contact_name}</div><div className="text-xs text-[var(--av-text-secondary)]">{briefing.company || 'No company'} · {briefing.open_deal_count || 0} open deal(s)</div></div>{attention ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--av-warning-soft)] px-2 py-1 text-[10px] font-medium text-[var(--av-warning)]"><ShieldAlert size={11} /> Attention</span> : <span className="inline-flex items-center gap-1 rounded-full bg-[var(--av-success-soft)] px-2 py-1 text-[10px] font-medium text-[var(--av-success)]"><CheckCircle2 size={11} /> Clear</span>}</div>{briefing.last_activity_summary && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--av-text-secondary)]">{briefing.last_activity_summary}</p>}<div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[var(--av-text-secondary)]"><span className="rounded-full bg-[var(--av-surface-2)] px-2 py-1">Pipeline {money(briefing.open_pipeline_value)}</span><span className="rounded-full bg-[var(--av-surface-2)] px-2 py-1">Invoiced {money(briefing.invoiced_value)}</span>{briefing.next_due_date && <span className="rounded-full bg-[var(--av-warning-soft)] px-2 py-1">Due {new Date(briefing.next_due_date).toLocaleDateString()}</span>}</div></div>
}

function EmptyState({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-[var(--av-border)] p-5 text-center text-xs text-[var(--av-text-secondary)]"><Clock3 size={18} className="mx-auto mb-2 opacity-50" />{text}</div> }
