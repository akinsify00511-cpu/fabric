// Evidence labeling — the platform-wide fact/inference/estimate/recommendation
// model (Master Build Guide §20, Thinking Framework §6). Every material
// claim surfaced to a user should carry one of these tags so the business
// never silently treats an inference as a fact.

import { ShieldCheck, Brain, FlaskConical, Lightbulb, Info } from 'lucide-react'
import type { ReactNode } from 'react'

export type ClaimType = 'FACT' | 'INFERENCE' | 'ESTIMATE' | 'RECOMMENDATION' | 'UNKNOWN'

const MAP: Record<ClaimType, { label: string; icon: any; color: string; bg: string }> = {
  FACT:          { label: 'Fact',          icon: ShieldCheck, color: 'var(--av-success)', bg: 'var(--av-success-soft)' },
  INFERENCE:     { label: 'Inference',     icon: Brain,       color: 'var(--av-info)',    bg: 'var(--av-info-soft)' },
  ESTIMATE:      { label: 'Estimate',      icon: FlaskConical,color: 'var(--av-warning)', bg: 'var(--av-warning-soft)' },
  RECOMMENDATION:{ label: 'Recommendation',icon: Lightbulb,   color: 'var(--av-accent)',  bg: 'var(--av-accent-soft)' },
  UNKNOWN:       { label: 'Unverified',    icon: Info,        color: 'var(--av-text-muted)', bg: 'var(--av-surface-3)' },
}

export function ClaimTag({ type, confidence }: { type?: ClaimType | string; confidence?: number }) {
  const t = (String(type || 'UNKNOWN').toUpperCase()) as ClaimType
  const m = MAP[t] || MAP.UNKNOWN
  const Icon = m.icon
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide"
      style={{ color: m.color, backgroundColor: m.bg }}
      title={confidence != null ? `${m.label} · ${Math.round(confidence * 100)}% confidence` : m.label}
    >
      <Icon size={10} /> {m.label}{confidence != null ? ` ${Math.round(confidence * 100)}%` : ''}
    </span>
  )
}

export function ClaimNote({ tone = 'muted', children }: { tone?: 'muted' | 'warn' | 'danger' | 'info'; children: ReactNode }) {
  const color = tone === 'warn' ? 'var(--av-warning)' : tone === 'danger' ? 'var(--av-danger)' : tone === 'info' ? 'var(--av-info)' : 'var(--av-text-secondary)'
  const bg = tone === 'warn' ? 'var(--av-warning-soft)' : tone === 'danger' ? 'var(--av-danger-soft)' : tone === 'info' ? 'var(--av-info-soft)' : 'var(--av-surface-3)'
  return (
    <div className="rounded-xl p-3 text-sm flex items-start gap-2" style={{ color, backgroundColor: bg }}>
      <Info size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

// Provenance line — shows source, creator, timestamp, verification state.
export function ProvenanceLine({ source, by, at, verified }: { source?: string; by?: string; at?: string; verified?: boolean }) {
  if (!source && !by && !at) return null
  return (
    <div className="text-[11px] text-[var(--av-text-muted)] flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {source && <span>Source: {source}</span>}
      {by && <span>· by {by}</span>}
      {at && <span>· {new Date(at).toLocaleDateString()}</span>}
      {verified != null && (
        <span className={verified ? 'text-[var(--av-success)]' : 'text-[var(--av-text-muted)]'}>
          · {verified ? 'verified' : 'unverified'}
        </span>
      )}
    </div>
  )
}

// §19 explainability — renders a recommendation's evidence JSONB so the user
// can answer "why are you telling me this?" with the actual source data,
// calculation, period, and comparison. The evidence shape is rule-specific
// (a JSONB object); we render known keys in a readable form and fall back to a
// generic key/value listing for anything we don't recognize. Never invents
// values — only shows what the rule actually recorded.
function formatEvidenceValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number') {
    // Heuristic: amounts > 100 with currency-ish keys render as plain numbers;
    // ratios (0–1) render as %.
    if (v > 0 && v < 1 && Number.isFinite(v)) return `${(v * 100).toFixed(1)}%`
    return v.toLocaleString()
  }
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return String(v) }
}

const NIGERIA_NAIRA = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 })
const AMOUNT_KEYS = ['amount', 'income_90d', 'expense_90d', 'net_90d', 'overdue_total', 'overdue_amount', 'revenue', 'expected_recovery', 'value', 'balance', 'total', 'sum']

export function EvidencePanel({ evidence, ruleId }: { evidence: unknown; ruleId?: string | null }) {
  const ev = (Array.isArray(evidence) ? (evidence[0] ?? {}) : evidence ?? {}) as Record<string, unknown>
  const entries = Object.entries(ev).filter(([, v]) => v != null && v !== '')
  if (entries.length === 0) {
    return (
      <p className="text-[11px] text-[var(--av-text-muted)] italic">
        No detailed evidence was recorded for this finding. The recommendation is based on the rule{ruleId ? ` ${ruleId}` : ''}.
      </p>
    )
  }
  return (
    <div className="rounded-xl bg-[var(--av-surface-2)] border border-[var(--av-border)] p-3 mt-2 space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--av-text-muted)] flex items-center gap-1">
        <ShieldCheck size={11} /> Evidence — why we're telling you this
      </div>
      {entries.map(([k, v]) => {
        const label = k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        const isAmount = AMOUNT_KEYS.some((ak) => k.toLowerCase().includes(ak)) && typeof v === 'number' && v >= 100
        return (
          <div key={k} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-[var(--av-text-secondary)]">{label}</span>
            <span className="font-mono text-[var(--av-text)] text-right break-all">
              {isAmount ? NIGERIA_NAIRA.format(v as number) : formatEvidenceValue(v)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
