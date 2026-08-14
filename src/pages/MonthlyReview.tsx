// Monthly Performance Review — §26 of the Master Directive.
// A board-ready executive snapshot that rolls up Business Health + OKRs + Risks
// + Recommendations + governed metrics for a month. Every number is FACT-level
// and traceable. Read-only — it interprets; it never mutates business data.

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { ClaimTag, ClaimNote, EvidencePanel } from '../components/Evidence'
import {
  Calendar, Loader2, Printer, TrendingDown, TrendingUp, Minus,
  HeartPulse, Target, ShieldAlert, Lightbulb, BarChart3, ShieldCheck, HelpCircle,
} from 'lucide-react'

interface MPR {
  period_start: string
  period_end: string
  generated_at: string
  health: { overall_score: number | null; dimension_scores: any; data_quality_penalty: number; insufficient_dimensions: string[]; computed_at: string } | null
  objectives: { id: string; title: string; scope: string; status: string; progress: number | null; key_result_count: number; period_end: string | null }[]
  risks: { id: string; title: string; category: string; risk_score: number; status: string; mitigation_status: string; due_date: string | null }[]
  recommendations: { id: string; rule_id: string; statement: string; severity: string; status: string; evidence: any; expected_impact: any }[]
  metrics: { metric_key: string; name: string; category: string; current_value: number; previous_value: number; change_percent: number; confidence: string; sample_size: number; target_value: number; period_end: string }[]
  data_quality: { open_critical: number; open_warning: number; resolved_total: number }
  summary: { open_risks: number; high_risks: number; open_recommendations: number; critical_recommendations: number; objective_count: number; metric_count: number }
}

const MONTHS = (() => {
  const arr: { label: string; start: string; end: string }[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = d.toISOString().slice(0, 10)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
    arr.push({ label: d.toLocaleDateString('en', { month: 'long', year: 'numeric' }), start, end })
  }
  return arr
})()

function scoreTone(s: number) {
  if (s >= 80) return 'var(--av-success)'
  if (s >= 60) return 'var(--av-warning)'
  return 'var(--av-danger)'
}
function sevTone(s: string) {
  return s === 'critical' ? 'var(--av-danger)' : s === 'high' ? 'var(--av-warning)' : 'var(--av-text-secondary)'
}
function moverTone(p: number | null) {
  if (p == null) return 'var(--av-text-muted)'
  return p > 0 ? 'var(--av-success)' : p < 0 ? 'var(--av-danger)' : 'var(--av-text-muted)'
}

export default function MPRPage() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const [review, setReview] = useState<MPR | null>(null)
  const [loading, setLoading] = useState(true)
  const [monthIdx, setMonthIdx] = useState(0)
  const [expandedRec, setExpandedRec] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!bid) return
    setLoading(true)
    try {
      const m = MONTHS[monthIdx]
      const { data, error } = await supabase.rpc('monthly_review', {
        p_business_id: bid,
        p_period_start: m.start,
        p_period_end: m.end,
      })
      if (error) throw error
      setReview(data as MPR)
    } catch (e) {
      console.error('monthly_review failed (non-blocking):', e)
    } finally {
      setLoading(false)
    }
  }, [bid, monthIdx])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
  }
  if (!review) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="rounded-2xl bg-white p-10 text-center shadow-[var(--av-shadow-sm)]">
          <Calendar size={32} className="mx-auto text-[var(--av-text-muted)] mb-3" />
          <p className="text-sm text-[var(--av-text-secondary)]">
            Monthly review unavailable — the MPR migration may not be applied to your database yet.
          </p>
        </div>
      </div>
    )
  }

  const health = review.health
  const hasHealth = health && health.overall_score != null
  const dims = health ? Object.entries(health.dimension_scores || {}).filter(([k]) => k !== '_meta') : []
  const s = review.summary

  return (
    <div className="p-6 max-w-4xl mx-auto print:p-0">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
            <Calendar size={24} className="text-[var(--av-primary)]" /> Monthly Performance Review
          </h1>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">
            {MONTHS[monthIdx].label} — a board-ready snapshot of your business. <ClaimTag type="FACT" />
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={monthIdx} onChange={e => setMonthIdx(+e.target.value)}
            className="px-3 py-2 rounded-xl border border-[var(--av-border)] text-sm bg-white outline-none focus:border-[var(--av-primary)]">
            {MONTHS.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
          </select>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--av-surface-3)] text-sm hover:bg-[var(--av-border)]">
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-xl font-bold">Monthly Performance Review — {MONTHS[monthIdx].label}</h1>
        <p className="text-sm text-gray-500">Generated {new Date(review.generated_at).toLocaleString()}</p>
      </div>

      {/* Summary header */}
      <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] mb-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryStat label="Business Health" value={hasHealth ? `${health!.overall_score}/100` : '—'}
            tone={hasHealth ? scoreTone(health!.overall_score!) : 'var(--av-text-muted)'} icon={HeartPulse} />
          <SummaryStat label="Objectives" value={s.objective_count} tone="var(--av-text)" icon={Target} />
          <SummaryStat label="Open Risks" value={s.open_risks} sub={`${s.high_risks} high`} tone={s.open_risks > 0 ? 'var(--av-warning)' : 'var(--av-success)'} icon={ShieldAlert} />
          <SummaryStat label="Recommendations" value={s.open_recommendations} sub={`${s.critical_recommendations} critical`} tone={s.critical_recommendations > 0 ? 'var(--av-danger)' : 'var(--av-text)'} icon={Lightbulb} />
          <SummaryStat label="Metrics Tracked" value={s.metric_count} tone="var(--av-text)" icon={BarChart3} />
        </div>
      </div>

      {/* Business Health breakdown */}
      <Section title="Business Health" icon={HeartPulse} collapsible>
        {!hasHealth ? (
          <ClaimNote tone="warn">No Business Health score computed for this period. Set targets on your key metrics to enable the score.</ClaimNote>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {dims.map(([key, dim]: [string, any]) => (
              <div key={key} className="rounded-xl bg-[var(--av-surface-3)] p-2.5">
                <div className="text-[10px] text-[var(--av-text-muted)] uppercase">{key}</div>
                <div className="text-lg font-semibold" style={{ color: dim.score == null ? 'var(--av-text-muted)' : scoreTone(dim.score) }}>
                  {dim.score ?? '—'}
                </div>
                <div className="text-[9px] text-[var(--av-text-muted)]">{dim.status === 'insufficient_data' ? 'no targets' : `${dim.metrics?.length || 0} metric(s)`}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Objectives */}
      <Section title="Objectives & Key Results" icon={Target} collapsible>
        {review.objectives.length === 0 ? (
          <Empty msg="No objectives tracked in this period." />
        ) : (
          <div className="space-y-2">
            {review.objectives.map(o => (
              <div key={o.id} className="flex items-center gap-3 py-2 border-b border-[var(--av-border)] last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--av-text)]">{o.title}</p>
                  <p className="text-[10px] text-[var(--av-text-muted)] capitalize">{o.scope} · {o.key_result_count} key result(s) · {o.status}</p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold" style={{ color: o.progress == null ? 'var(--av-text-muted)' : scoreTone(o.progress) }}>
                    {o.progress != null ? `${Math.round(o.progress)}%` : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Risks */}
      <Section title="Open Risks" icon={ShieldAlert} collapsible>
        {review.risks.length === 0 ? (
          <Empty msg="No open risks recorded." />
        ) : (
          <div className="space-y-2">
            {review.risks.slice(0, 8).map(r => (
              <div key={r.id} className="flex items-center gap-3 py-2 border-b border-[var(--av-border)] last:border-0">
                <span className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                  style={{ background: `${scoreTone(r.risk_score)}15`, color: scoreTone(r.risk_score) }}>
                  {r.risk_score}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--av-text)]">{r.title}</p>
                  <p className="text-[10px] text-[var(--av-text-muted)] capitalize">{r.category} · {r.mitigation_status.replace('_', ' ')}{r.due_date && ` · due ${r.due_date}`}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Recommendations */}
      <Section title="Open Recommendations" icon={Lightbulb} collapsible>
        {review.recommendations.length === 0 ? (
          <Empty msg="No open recommendations for this period." />
        ) : (
          <div className="space-y-2">
            {review.recommendations.slice(0, 8).map(r => (
              <div key={r.id} className="py-2 border-b border-[var(--av-border)] last:border-0">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase shrink-0"
                    style={{ background: `${sevTone(r.severity)}15`, color: sevTone(r.severity) }}>
                    {r.severity}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-[var(--av-text)]">{r.statement}</p>
                    <button
                      onClick={() => setExpandedRec(expandedRec === r.id ? null : r.id)}
                      className="text-[11px] text-[var(--av-primary)] hover:underline mt-1 flex items-center gap-1"
                    >
                      <HelpCircle size={11} />
                      {expandedRec === r.id ? 'Hide evidence' : 'Why?'}
                    </button>
                    {expandedRec === r.id && (
                      <EvidencePanel evidence={r.evidence} ruleId={r.rule_id} />
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-[var(--av-text-muted)] mt-0.5 ml-[38px]">{r.rule_id}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Metric movers */}
      <Section title="Metric Movers" icon={BarChart3} collapsible>
        {review.metrics.length === 0 ? (
          <Empty msg="No governed metrics recorded in this period." />
        ) : (
          <div className="space-y-1.5">
            {review.metrics.slice(0, 10).map((m, i) => {
              const Mover = m.change_percent > 0 ? TrendingUp : m.change_percent < 0 ? TrendingDown : Minus
              return (
                <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-[var(--av-surface-2)]">
                  <Mover size={14} style={{ color: moverTone(m.change_percent) }} />
                  <span className="text-sm text-[var(--av-text)] flex-1">{m.name || m.metric_key}</span>
                  <span className="text-xs text-[var(--av-text-muted)]">
                    {m.previous_value != null && `${m.previous_value} → `}{m.current_value}
                  </span>
                  <span className="text-xs font-medium w-16 text-right" style={{ color: moverTone(m.change_percent) }}>
                    {m.change_percent != null ? `${m.change_percent > 0 ? '+' : ''}${m.change_percent.toFixed(1)}%` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Data quality */}
      <Section title="Data Quality" icon={ShieldCheck}>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-[var(--av-danger)]"><strong>{review.data_quality.open_critical}</strong> critical</span>
          <span className="text-[var(--av-warning)]"><strong>{review.data_quality.open_warning}</strong> warning</span>
          <span className="text-[var(--av-success)]"><strong>{review.data_quality.resolved_total}</strong> resolved</span>
        </div>
      </Section>

      <p className="text-[10px] text-[var(--av-text-muted)] text-center mt-4 print:text-[9px]">
        Generated {new Date(review.generated_at).toLocaleString()} · Every number is traceable to live business data (§9/§19). This review interprets; it does not modify your data.
      </p>
    </div>
  )
}

function Section({ title, icon: Icon, collapsible, children }: {
  title: string; icon: any; collapsible?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] mb-4 print:shadow-none print:border print:border-gray-200">
      <button onClick={() => collapsible && setOpen(!open)} className="w-full flex items-center gap-1.5 mb-3 print:pointer-events-none">
        <Icon size={16} className="text-[var(--av-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--av-text)] flex-1 text-left">{title}</h3>
      </button>
      {open && children}
    </div>
  )
}

function SummaryStat({ label, value, sub, tone, icon: Icon }: {
  label: string; value: any; sub?: string; tone: string; icon: any
}) {
  return (
    <div className="text-center">
      <Icon size={16} className="mx-auto mb-1" style={{ color: tone }} />
      <div className="text-xl font-bold" style={{ color: tone }}>{value}</div>
      <div className="text-[10px] text-[var(--av-text-muted)] uppercase">{label}</div>
      {sub && <div className="text-[10px]" style={{ color: tone }}>{sub}</div>}
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-xs text-[var(--av-text-muted)] py-2">{msg}</p>
}
