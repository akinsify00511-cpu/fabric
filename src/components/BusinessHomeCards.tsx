/**
 * BusinessHomeCards — reusable intelligent card primitives for the role-aware
 * BusinessHome. Each card is a self-contained "intelligent object" backed by
 * a real intelligence RPC: it renders a Title, current state, a dominant
 * metric, a trend, a confidence tag (FACT/INFERENCE/UNKNOWN), an
 * explanation, and an action link. No fabricated metrics (§22).
 *
 * Visual language: glass surfaces (var(--av-glass-bg) + blur), atmospheric
 * semantic gradients (var(--av-grad-*)), soft float shadows, large rounded
 * containers, generous whitespace, dominant large numbers. Premium SaaS —
 * not corporate ERP. Subtle motion communicates life, not decoration.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { ClaimTag } from './Evidence'
import type {
  BusinessState, NextBestAction, ValueLedger, BusinessHealth, HealthDimension,
  GovernedMetric, DiagnosisResult,
} from '../lib/businessOS'

// ── Shared shell ────────────────────────────────────────────────────────

interface CardShellProps {
  title: string
  /** The semantic atmospheric gradient (var(--av-grad-*)). */
  gradient?: string
  /** Optional right-side accent (badge / freshness). */
  accent?: ReactNode
  /** The dominant content. */
  children?: ReactNode
  /** Action link rendered bottom-right. */
  action?: { label: string; to: string }
  /** When true, render a degraded banner instead of children. */
  degraded?: boolean
  className?: string
}

export function GlassCard({ title, gradient, accent, children, action, degraded, className = '' }: CardShellProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl p-6 transition-transform duration-300 hover:-translate-y-0.5 ${className}`}
      style={{
        background: 'var(--av-glass-bg)',
        backdropFilter: `blur(var(--av-glass-blur))`,
        WebkitBackdropFilter: `blur(var(--av-glass-blur))`,
        border: '1px solid var(--av-glass-border)',
        boxShadow: 'var(--av-shadow-float)',
      }}
    >
      {/* atmospheric gradient wash — sits behind content, clipped to the card */}
      {gradient && (
        <div className="pointer-events-none absolute inset-0 opacity-90" style={{ background: gradient }} />
      )}
      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--av-text-muted)' }}>
            {title}
          </h3>
          {accent}
        </div>
        {degraded ? <DegradedNote /> : children}
        {action && (
          <Link
            to={action.to}
            className="mt-5 inline-flex items-center gap-1 text-xs font-medium transition-colors"
            style={{ color: 'var(--av-primary)' }}
          >
            {action.label} <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </div>
  )
}

function DegradedNote() {
  return (
    <div className="rounded-xl px-4 py-3 text-xs" style={{ background: 'var(--av-warning-soft)', color: 'var(--av-warning)' }}>
      Temporarily unavailable — the rest of your business is unaffected. This refreshes automatically.
    </div>
  )
}

// ── Confidence / freshness accents ─────────────────────────────────────

export function ConfidenceBadge({ confidence }: { confidence: string | undefined | null }) {
  if (!confidence) return null
  const map: Record<string, { tag: 'FACT' | 'INFERENCE' | 'UNKNOWN'; color: string }> = {
    high: { tag: 'FACT', color: 'var(--av-success)' },
    medium: { tag: 'INFERENCE', color: 'var(--av-warning)' },
    low: { tag: 'INFERENCE', color: 'var(--av-warning)' },
    insufficient: { tag: 'UNKNOWN', color: 'var(--av-text-muted)' },
  }
  const entry = map[confidence] ?? { tag: 'UNKNOWN' as const, color: 'var(--av-text-muted)' }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: 'var(--av-glass-bg-strong)', color: entry.color }}>
      {entry.tag}
    </span>
  )
}

function TrendArrow({ change }: { change: number | null | undefined }) {
  if (change == null || isNaN(change)) return null
  if (change === 0) return <span className="inline-flex items-center gap-0.5 text-xs" style={{ color: 'var(--av-text-muted)' }}><Minus size={12} /> 0%</span>
  const up = change > 0
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium" style={{ color: up ? 'var(--av-success)' : 'var(--av-danger)' }}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {Math.abs(change).toFixed(1)}%
    </span>
  )
}

function BigNumber({ value, sub }: { value: ReactNode; sub?: string }) {
  return (
    <div>
      <div className="text-4xl font-semibold tracking-tight" style={{ color: 'var(--av-text)' }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--av-text-muted)' }}>{sub}</div>}
    </div>
  )
}
export { BigNumber }

// ── The intelligent cards ───────────────────────────────────────────────

const STATE_TONE: Record<string, { color: string; label: string }> = {
  growing: { color: 'var(--av-success)', label: 'Growing' },
  stable: { color: 'var(--av-primary)', label: 'Stable' },
  scaling: { color: 'var(--av-primary)', label: 'Scaling' },
  stressed: { color: 'var(--av-warning)', label: 'Stressed' },
  recovering: { color: 'var(--av-primary)', label: 'Recovering' },
  at_risk: { color: 'var(--av-danger)', label: 'At risk' },
  cash_constrained: { color: 'var(--av-danger)', label: 'Cash constrained' },
  sales_constrained: { color: 'var(--av-warning)', label: 'Sales constrained' },
  capacity_constrained: { color: 'var(--av-warning)', label: 'Capacity constrained' },
  opportunity_rich: { color: 'var(--av-success)', label: 'Opportunity-rich' },
  insufficient_data: { color: 'var(--av-text-muted)', label: 'Building a picture' },
}

export function StateCard({ state }: { state: BusinessState | null | undefined }) {
  if (!state || state.degraded || state.error) {
    return <GlassCard title="Business State" gradient="var(--av-grad-health)" degraded={!state ? false : true} action={{ label: 'See full picture', to: '/app/cockpit' }}>
      {!state ? <BigNumber value="—" sub="We're still building your business picture." /> : null}
    </GlassCard>
  }
  const tone = STATE_TONE[state.state] ?? { color: 'var(--av-text-muted)', label: state.state }
  return (
    <GlassCard
      title="Business State"
      gradient="var(--av-grad-health)"
      accent={<ConfidenceBadge confidence={state.confidence} />}
      action={{ label: 'See full picture', to: '/app/cockpit' }}
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl font-semibold" style={{ color: tone.color }}>{tone.label}</span>
        {/* ambient glow communicates the state — subtle, not decorative */}
        <span className="inline-block h-2.5 w-2.5 rounded-full animate-pulse" style={{ background: tone.color, boxShadow: `0 0 12px ${tone.color}` }} />
      </div>
      {state.reasons && state.reasons.length > 0 && (
        <p className="text-sm" style={{ color: 'var(--av-text-secondary)' }}>{state.reasons[0].label}</p>
      )}
    </GlassCard>
  )
}

export function NextBestActionCard({ nba }: { nba: NextBestAction | null | undefined }) {
  if (!nba || nba.degraded || nba.error) {
    return <GlassCard title="Next Best Action" gradient="var(--av-grad-intelligence)" degraded={!nba ? false : true} />
  }
  if (!nba.action) {
    return (
      <GlassCard title="Next Best Action" gradient="var(--av-grad-intelligence)">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} style={{ color: 'var(--av-success)' }} />
          <span className="text-lg font-semibold" style={{ color: 'var(--av-text)' }}>Nothing needs your attention</span>
        </div>
        <p className="text-sm" style={{ color: 'var(--av-text-secondary)' }}>{nba.note ?? "You're all caught up."}</p>
      </GlassCard>
    )
  }
  const a = nba.action
  const sevColor = a.severity === 'critical' ? 'var(--av-danger)' : a.severity === 'warning' ? 'var(--av-warning)' : 'var(--av-primary)'
  return (
    <GlassCard
      title="Next Best Action"
      gradient="var(--av-grad-intelligence)"
      accent={<span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--av-glass-bg-strong)', color: sevColor }}>{a.severity}</span>}
      action={{ label: 'Take action', to: '/app/cockpit' }}
    >
      <p className="text-base font-medium mb-2" style={{ color: 'var(--av-text)' }}>{a.statement}</p>
      {a.expected_impact && a.expected_impact.amount != null && a.expected_impact.amount > 0 && (
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={14} style={{ color: 'var(--av-success)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--av-success)' }}>
            Expected impact: ₦{a.expected_impact.amount.toLocaleString()}
          </span>
        </div>
      )}
      {a.expected_impact?.description && (
        <p className="text-xs" style={{ color: 'var(--av-text-muted)' }}>{a.expected_impact.description}</p>
      )}
    </GlassCard>
  )
}

function metricByPrefix(metrics: GovernedMetric[], prefix: string): GovernedMetric | undefined {
  return metrics.find(m => m.metric_key.toLowerCase().startsWith(prefix))
}

export function RevenueCard({ metrics }: { metrics: GovernedMetric[] }) {
  const m = metricByPrefix(metrics, 'revenue') ?? metricByPrefix(metrics, 'mrr')
  if (!m || m.current_value == null) {
    return <GlassCard title="Revenue" gradient="var(--av-grad-revenue)"><BigNumber value="—" sub="Your first invoice starts the revenue trend." /></GlassCard>
  }
  return (
    <GlassCard title="Revenue" gradient="var(--av-grad-revenue)" accent={<ConfidenceBadge confidence={m.confidence} />} action={{ label: 'See profitability', to: '/app/cockpit' }}>
      <BigNumber value={money(m.current_value)} sub="Revenue (period)" />
      <div className="mt-3"><TrendArrow change={m.change_percent} /></div>
    </GlassCard>
  )
}

export function CashCard({ metrics }: { metrics: GovernedMetric[] }) {
  // Cash = receivables overdue proxy; fall back to a cash-balance metric if present.
  const m = metricByPrefix(metrics, 'overdue') ?? metricByPrefix(metrics, 'cash') ?? metricByPrefix(metrics, 'receivable')
  if (!m || m.current_value == null) {
    return <GlassCard title="Cash & Receivables" gradient="var(--av-grad-cash)"><BigNumber value="—" sub="Track invoices to see cash flow." /></GlassCard>
  }
  return (
    <GlassCard title="Cash & Receivables" gradient="var(--av-grad-cash)" accent={<ConfidenceBadge confidence={m.confidence} />} action={{ label: 'Open Finance', to: '/app/finance' }}>
      <BigNumber value={money(m.current_value)} sub="Outstanding receivables" />
      <div className="mt-3"><TrendArrow change={m.change_percent} /></div>
    </GlassCard>
  )
}

export function ProfitCard({ metrics }: { metrics: GovernedMetric[] }) {
  const m = metricByPrefix(metrics, 'margin') ?? metricByPrefix(metrics, 'profit') ?? metricByPrefix(metrics, 'ebitda')
  if (!m || m.current_value == null) {
    return <GlassCard title="Profitability" gradient="var(--av-grad-opportunity)"><BigNumber value="—" sub="Margin appears after revenue + costs." /></GlassCard>
  }
  const isPct = m.unit === 'percent' || m.metric_key.includes('margin')
  return (
    <GlassCard title="Profitability" gradient="var(--av-grad-opportunity)" accent={<ConfidenceBadge confidence={m.confidence} />} action={{ label: 'See profitability', to: '/app/cockpit' }}>
      <BigNumber value={isPct ? `${m.current_value.toFixed(1)}%` : money(m.current_value)} sub={isPct ? 'Margin' : 'Profit (period)'} />
      <div className="mt-3"><TrendArrow change={m.change_percent} /></div>
    </GlassCard>
  )
}

export function PulseCard({ health }: { health: BusinessHealth | null | undefined }) {
  if (!health || health.overall_score == null) {
    return <GlassCard title="Business Pulse" gradient="var(--av-grad-health)" action={{ label: 'Set targets', to: '/app/cockpit' }}>
      <BigNumber value="—" sub="Set targets to activate your Business Pulse." />
    </GlassCard>
  }
  const score = health.overall_score
  const color = score >= 75 ? 'var(--av-success)' : score >= 50 ? 'var(--av-warning)' : 'var(--av-danger)'
  const dims = (Object.entries(health.dimension_scores || {}).filter(([k]) => k !== '_meta') as [string, HealthDimension][])
    .filter(([, d]) => d && d.score != null)
  return (
    <GlassCard title="Business Pulse" gradient="var(--av-grad-health)" accent={<ConfidenceBadge confidence="high" />} action={{ label: 'View health', to: '/app/cockpit' }}>
      <div className="flex items-end gap-3 mb-4">
        <span className="text-4xl font-semibold" style={{ color }}>{score}<span className="text-lg" style={{ color: 'var(--av-text-muted)' }}>/100</span></span>
        <span className="text-xs mb-1" style={{ color: 'var(--av-text-muted)' }}>overall health</span>
      </div>
      {/* Connected nodes — the "one organism" visualization */}
      <div className="flex flex-wrap gap-2">
        {dims.slice(0, 6).map(([key, d]) => {
          const dc = d.score! >= 75 ? 'var(--av-success)' : d.score! >= 50 ? 'var(--av-warning)' : 'var(--av-danger)'
          return (
            <span key={key} className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full"
              style={{ background: 'var(--av-glass-bg-strong)', color: 'var(--av-text-secondary)' }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: dc, boxShadow: `0 0 6px ${dc}` }} />
              {labelFor(key)} <b style={{ color: 'var(--av-text)' }}>{d.score}</b>
            </span>
          )
        })}
        {dims.length === 0 && <span className="text-xs" style={{ color: 'var(--av-text-muted)' }}>Set metric targets to see dimensions.</span>}
      </div>
    </GlassCard>
  )
}

export function OperationsCard({ metrics, attentionCount }: { metrics: GovernedMetric[]; attentionCount?: number }) {
  // Operations = bottlenecks / overdue tasks. Use a capacity or task metric if present.
  const m = metricByPrefix(metrics, 'overdue_task') ?? metricByPrefix(metrics, 'capacity') ?? metricByPrefix(metrics, 'bottleneck')
  const count = attentionCount ?? (m?.current_value ?? 0)
  return (
    <GlassCard title="Operations" gradient="var(--av-grad-operations)" action={{ label: 'Investigate', to: '/app/operations' }}>
      <BigNumber value={count} sub={count === 1 ? 'item needs attention' : 'items need attention'} />
      {m && <div className="mt-3"><TrendArrow change={m.change_percent} /></div>}
    </GlassCard>
  )
}

export function PeopleCard({ headcount }: { headcount: number }) {
  return (
    <GlassCard title="People" gradient="var(--av-grad-people)" action={{ label: 'Open team', to: '/app/people' }}>
      <BigNumber value={headcount} sub={headcount === 1 ? 'team member' : 'team members'} />
    </GlassCard>
  )
}

export function ValueLedgerCard({ ledger }: { ledger: ValueLedger | null | undefined }) {
  if (!ledger || ledger.degraded || ledger.error) {
    return <GlassCard title="Avenize Value" gradient="var(--av-grad-opportunity)">{!ledger ? <BigNumber value="₦0" sub="Value builds as you act on recommendations." /> : <DegradedNote />}</GlassCard>
  }
  const total = ledger.total_value ?? 0
  return (
    <GlassCard title="Avenize Value" gradient="var(--av-grad-opportunity)" action={{ label: 'See ledger', to: '/app/cockpit' }}>
      <BigNumber value={money(total)} sub="Value created with Avenize" />
      <div className="mt-3 flex flex-wrap gap-3 text-xs" style={{ color: 'var(--av-text-muted)' }}>
        <span>Recovered <b style={{ color: 'var(--av-text)' }}>{money(ledger.recovered)}</b></span>
        <span>Saved <b style={{ color: 'var(--av-text)' }}>{money(ledger.saved)}</b></span>
        <span>Generated <b style={{ color: 'var(--av-text)' }}>{money(ledger.generated)}</b></span>
      </div>
    </GlassCard>
  )
}

export function OpportunitiesCard({ count, value }: { count: number; value: number }) {
  return (
    <GlassCard title="Opportunities" gradient="var(--av-grad-opportunity)" action={{ label: 'Explore', to: '/app/cockpit' }}>
      <BigNumber value={count} sub={count === 1 ? 'opportunity detected' : 'opportunities detected'} />
      {value > 0 && <p className="text-sm mt-2" style={{ color: 'var(--av-success)' }}>{money(value)} potential value</p>}
    </GlassCard>
  )
}

export function RisksCard({ count }: { count: number }) {
  return (
    <GlassCard title="Risks" gradient="var(--av-grad-risk)" action={{ label: 'Investigate', to: '/app/cockpit' }}>
      <BigNumber value={count} sub={count === 1 ? 'risk flagged' : 'risks flagged'} />
      {count > 0 && <p className="text-xs mt-2" style={{ color: 'var(--av-text-muted)' }}>Avenize is tracking these for you.</p>}
    </GlassCard>
  )
}

export function DiagnosesCard({ diagnoses }: { diagnoses: DiagnosisResult | null | undefined }) {
  if (!diagnoses || diagnoses.degraded || diagnoses.error || !diagnoses.diagnoses?.length) {
    return <GlassCard title="Why?" gradient="var(--av-grad-intelligence)">{!diagnoses ? <BigNumber value="—" sub="Diagnoses appear as patterns emerge." /> : <DegradedNote />}</GlassCard>
  }
  const d = diagnoses.diagnoses[0]
  return (
    <GlassCard title="Why?" gradient="var(--av-grad-intelligence)" accent={<ClaimTag type="INFERENCE" />} action={{ label: 'See diagnosis', to: '/app/cockpit' }}>
      <p className="text-base font-medium mb-2" style={{ color: 'var(--av-text)' }}>{d.headline}</p>
      {d.impact_amount != null && d.impact_amount > 0 && (
        <p className="text-sm" style={{ color: 'var(--av-danger)' }}>~{money(d.impact_amount)} monthly exposure</p>
      )}
    </GlassCard>
  )
}

export function PipelineCard({ metrics }: { metrics: GovernedMetric[] }) {
  const m = metricByPrefix(metrics, 'pipeline') ?? metricByPrefix(metrics, 'deal')
  if (!m || m.current_value == null) {
    return <GlassCard title="Sales Pipeline" gradient="var(--av-grad-revenue)" action={{ label: 'Open CRM', to: '/app/crm' }}><BigNumber value="—" sub="Add a deal to start your pipeline." /></GlassCard>
  }
  return (
    <GlassCard title="Sales Pipeline" gradient="var(--av-grad-revenue)" accent={<ConfidenceBadge confidence={m.confidence} />} action={{ label: 'Open CRM', to: '/app/crm' }}>
      <BigNumber value={money(m.current_value)} sub="Open pipeline value" />
      <div className="mt-3"><TrendArrow change={m.change_percent} /></div>
    </GlassCard>
  )
}

export function CustomersCard({ metrics }: { metrics: GovernedMetric[] }) {
  const m = metricByPrefix(metrics, 'customer') ?? metricByPrefix(metrics, 'active_customer')
  if (!m || m.current_value == null) {
    return <GlassCard title="Customers" gradient="var(--av-grad-people)" action={{ label: 'Open CRM', to: '/app/crm' }}><BigNumber value="—" sub="Add a contact to begin." /></GlassCard>
  }
  return (
    <GlassCard title="Customers" gradient="var(--av-grad-people)" accent={<ConfidenceBadge confidence={m.confidence} />} action={{ label: 'Open CRM', to: '/app/crm' }}>
      <BigNumber value={m.current_value} sub="Active customers" />
      <div className="mt-3"><TrendArrow change={m.change_percent} /></div>
    </GlassCard>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────

function money(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '₦—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`
  return `₦${n.toLocaleString()}`
}

function labelFor(key: string): string {
  const map: Record<string, string> = {
    financial: 'Finance', sales: 'Sales', customers: 'Customers',
    operations: 'Ops', people: 'People', projects: 'Projects',
  }
  return map[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}
