// Intelligence Hub — surfaces the domain intelligences (items 13-19):
// capacity, process/bottleneck, risk/anomaly, forecast, early-warning,
// opportunity, strategic alignment, market benchmarks. Each panel shows
// its claim_type (FACT/INFERENCE/ESTIMATE) per the platform-wide principle.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Brain, Loader2, AlertTriangle, TrendingUp, Activity, Users,
  Workflow, ShieldAlert, LineChart, Lightbulb, Target, Globe, Info
} from 'lucide-react'

interface Panel {
  key: string
  title: string
  icon: any
  data: any | null
}

export default function IntelligenceHub() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const [panels, setPanels] = useState<Panel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      const calls: { key: string; title: string; icon: any; rpc: string }[] = [
        { key: 'capacity', title: 'Capacity & Resources', icon: Users, rpc: 'capacity_intelligence' },
        { key: 'process', title: 'Process & Bottlenecks', icon: Workflow, rpc: 'process_bottleneck_intelligence' },
        { key: 'risk', title: 'Risk & Anomalies', icon: ShieldAlert, rpc: 'risk_anomaly_intelligence' },
        { key: 'forecast', title: 'Revenue Forecast', icon: LineChart, rpc: 'revenue_forecast' },
        { key: 'early', title: 'Early Warnings', icon: AlertTriangle, rpc: 'early_warnings' },
        { key: 'opportunity', title: 'Opportunities', icon: Lightbulb, rpc: 'opportunity_intelligence' },
        { key: 'strategy', title: 'Strategic Alignment', icon: Target, rpc: 'strategic_alignment' },
      ]
      const results = await Promise.allSettled(
        calls.map(async c => {
          const { data, error } = await supabase.rpc(c.rpc, { p_business_id: bid })
          if (error) throw error
          return { key: c.key, title: c.title, icon: c.icon, data }
        })
      )
      if (active) {
        setPanels(results.map((r, i) => ({
          key: calls[i].key, title: calls[i].title, icon: calls[i].icon,
          data: r.status === 'fulfilled' ? r.value.data : null,
        })))
        setLoading(false)
      }
    })()
    return () => { active = false }
  }, [bid])

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
          <Brain size={24} className="text-[var(--av-primary)]" /> Intelligence Hub
        </h1>
        <p className="text-sm text-[var(--av-text-secondary)] mt-1">
          Evidence-based analysis across the business. Every panel is labelled by what it is — fact, inference, estimate — never presented as certainty.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {panels.map(p => <PanelCard key={p.key} panel={p} />)}
        <MarketPanel />
      </div>

      <div className="mt-6 rounded-xl bg-[var(--av-surface)] p-4 flex items-start gap-3 text-sm text-[var(--av-text-secondary)]">
        <Info size={18} className="text-[var(--av-info)] mt-0.5 shrink-0" />
        <span>
          Avenize separates <b>FACT</b> (recorded), <b>INFERENCE</b> (evidence suggests), <b>ESTIMATE</b> (calculated approximation) and <b>RECOMMENDATION</b> (option to consider). High-impact decisions always require authorized human review.
        </span>
      </div>
    </div>
  )
}

function PanelCard({ panel }: { panel: Panel }) {
  const Icon = panel.icon
  const d = panel.data
  const type = d?.type || 'INFERENCE'
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--av-elevation-1)]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2"><Icon size={18} className="text-[var(--av-primary)]" />{panel.title}</h2>
        <ClaimTag type={type} />
      </div>
      {!d ? (
        <p className="text-sm text-[var(--av-text-tertiary)]">No data available.</p>
      ) : panel.key === 'capacity' ? (
        <Signals signals={d.signals} recommendation={d.recommendation} />
      ) : panel.key === 'process' ? (
        <div className="space-y-1.5">
          {Object.entries(d.stage_avg_days || {}).map(([k, v]: any) => (
            <div key={k} className="flex justify-between text-sm">
              <span className="text-[var(--av-text-secondary)]">{k}</span>
              <span className="font-medium text-[var(--av-text)]">{v}d avg</span>
            </div>
          ))}
          {d.bottleneck_stage && <Note tone="warn">Bottleneck: {d.bottleneck_stage} ({d.bottleneck_days}d). {d.recommendation}</Note>}
        </div>
      ) : panel.key === 'risk' ? (
        <div className="space-y-2">
          {d.anomalies?.length === 0 ? <p className="text-sm text-[var(--av-success)]">No anomalies detected.</p>
            : d.anomalies?.map((a: any, i: number) => (
              <div key={i} className="text-sm">
                <div className="font-medium text-[var(--av-warning)]">{a.type.replace(/_/g, ' ')}</div>
                <div className="text-xs text-[var(--av-text-secondary)]">{a.note || JSON.stringify(a.detail).slice(0, 80)}</div>
              </div>
            ))}
          <Note tone="muted">{d.note}</Note>
        </div>
      ) : panel.key === 'forecast' ? (
        <div className="space-y-1.5">
          <Big label="Projected (next period)" value={d.projected_next_months} />
          <Signals signals={{ monthly_avg: d.monthly_avg_collected, receivables_in_flight: d.receivables_in_flight, horizon_months: d.horizon_months, confidence: d.confidence }} />
          {d.assumptions && <Note tone="muted">Assumes: {(d.assumptions as string[]).join(', ')}</Note>}
        </div>
      ) : panel.key === 'early' ? (
        <div className="space-y-2">
          {d.warnings?.length === 0 ? <p className="text-sm text-[var(--av-success)]">No early warnings.</p>
            : d.warnings?.map((w: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-[var(--av-warning)]">{w.signal.replace(/_/g,' ')}</span>
                <span className="text-[var(--av-text)]">{String(w.value)}</span>
              </div>
            ))}
        </div>
      ) : panel.key === 'opportunity' ? (
        <div className="space-y-2">
          {d.opportunities?.length === 0 ? <p className="text-sm text-[var(--av-text-tertiary)]">No detected opportunities.</p>
            : d.opportunities?.map((o: any, i: number) => (
              <div key={i} className="text-sm"><b className="text-[var(--av-text)]">{o.type.replace(/_/g,' ')}</b> ({o.count}) — <span className="text-[var(--av-primary)]">{o.action}</span></div>
            ))}
        </div>
      ) : panel.key === 'strategy' ? (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--av-text-secondary)]">Active objectives</span>
            <span className="font-medium text-[var(--av-text)]">{d.objectives_total}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--av-text-secondary)]">Underfunded</span>
            <span className="font-medium" style={{ color: d.underfunded > 0 ? 'var(--av-error)' : 'var(--av-text)' }}>{d.underfunded}</span>
          </div>
          {d.misalignment_detected && <Note tone="warn">{d.note}</Note>}
        </div>
      ) : (
        <pre className="text-xs text-[var(--av-text-tertiary)] overflow-auto">{JSON.stringify(d, null, 2)}</pre>
      )}
    </div>
  )
}

function MarketPanel() {
  const [metric, setMetric] = useState('salary_software_engineer_ng')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function search() {
    setLoading(true)
    try {
      const { data } = await supabase.rpc('market_intelligence', { p_metric: metric })
      setData(data)
    } catch { setData(null) } finally { setLoading(false) }
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--av-elevation-1)]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2"><Globe size={18} className="text-[var(--av-primary)]" />Market Benchmarks</h2>
        <ClaimTag type="FACT" />
      </div>
      <div className="flex gap-2 mb-3">
        <input value={metric} onChange={e => setMetric(e.target.value)} placeholder="metric e.g. salary_engineer_ng"
          className="flex-1 rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:border-[var(--av-primary)] focus:outline-none" />
        <button onClick={search} className="px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm font-medium">{loading ? '…' : 'Look up'}</button>
      </div>
      {data?.benchmarks?.length ? (
        <div className="space-y-2">
          {data.benchmarks.map((b: any, i: number) => (
            <div key={i} className="rounded-lg bg-[var(--av-surface)] p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-[var(--av-text)]">{b.value} {b.currency}</span>
                <FreshTag tier={b.freshness} />
              </div>
              <div className="text-xs text-[var(--av-text-tertiary)] mt-1">{b.source} · {b.source_date}{b.geography && ` · ${b.geography}`}{b.role_seniority && ` · ${b.role_seniority}`}</div>
              {b.methodology && <div className="text-xs text-[var(--av-text-secondary)]">Method: {b.methodology}</div>}
            </div>
          ))}
        </div>
      ) : data ? (
        <p className="text-sm text-[var(--av-text-tertiary)]">No benchmarks for that metric yet.</p>
      ) : (
        <p className="text-sm text-[var(--av-text-tertiary)]">Look up external benchmarks (salary, pricing, demand). All entries carry source, date and methodology.</p>
      )}
    </div>
  )
}

function Signals({ signals, recommendation }: { signals: Record<string, any>; recommendation?: string }) {
  return (
    <div className="space-y-1.5">
      {Object.entries(signals || {}).map(([k, v]) => (
        <div key={k} className="flex justify-between text-sm">
          <span className="text-[var(--av-text-secondary)]">{k.replace(/_/g, ' ')}</span>
          <span className="font-medium text-[var(--av-text)]">{String(v)}</span>
        </div>
      ))}
      {recommendation && <Note tone="info">{recommendation}</Note>}
    </div>
  )
}

function Big({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-sm text-[var(--av-text-secondary)]">{label}</span>
      <span className="text-xl font-semibold text-[var(--av-primary)]">{Number(value || 0).toLocaleString()}</span>
    </div>
  )
}

function Note({ tone, children }: { tone: 'info' | 'warn' | 'muted'; children: React.ReactNode }) {
  const c = tone === 'warn' ? 'var(--av-warning)' : tone === 'info' ? 'var(--av-info)' : 'var(--av-text-tertiary)'
  return <p className="text-xs mt-2" style={{ color: c }}>{children}</p>
}

function ClaimTag({ type }: { type: string }) {
  const map: Record<string, string> = { FACT: 'var(--av-success)', INFERENCE: 'var(--av-info)', ESTIMATE: 'var(--av-warning)', RECOMMENDATION: 'var(--av-primary)', DECISION: 'var(--av-accent-hr)' }
  const c = map[type] || 'var(--av-text-tertiary)'
  return <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ backgroundColor: c + '20', color: c }}>{type}</span>
}

function FreshTag({ tier }: { tier: string }) {
  const c = tier === 'fresh' ? 'var(--av-success)' : tier === 'aging' ? 'var(--av-warning)' : 'var(--av-error)'
  return <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-medium" style={{ backgroundColor: c + '20', color: c }}>{tier}</span>
}
