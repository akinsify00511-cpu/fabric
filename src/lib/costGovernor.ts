// Cost Governor (C15) + infrastructure-cost ledger (C16) — pure helpers.
// Limits: per-plan defaults, per-business overrides, overage actions
// (allow / notify / throttle / block). Ledger: revenue - priced provider cost
// = gross margin; unpriced usage is excluded from the margin and flagged
// honestly (§22) so the ledger never fabricates a margin it can't see.

export type OverageAction = 'allow' | 'notify' | 'throttle' | 'block'

export interface ProviderLimit {
  provider: string
  plan: string
  month: string
  used_units: number
  limit_units: number | null
  overage_action: OverageAction
  blocked: boolean
  throttled: boolean
  over_limit: boolean
}

export interface ProviderCatalogEntry {
  provider_key: string
  label: string
  unit: string
  cost_cents_per_unit: number
  active: boolean
}

export interface LedgerMonth {
  business_id: string
  month: string
  revenue_cents: number
  priced_cost_cents: number
  gross_margin_cents: number
  unpriced_units: number
  notes: string[]
  computed_at: string
}

export interface CostGovernorPayload {
  authorized: boolean
  business_id?: string
  month?: string
  limits?: ProviderLimit[]
  ledger?: LedgerMonth[]
}

// The overage taxonomy: notify shows a warning, throttle slows the feature,
// block denies it, allow has no cap. 'blocked'/'throttled' flags come from
// the server; the UI only chooses how strongly to surface them.
export function overageLabel(action: OverageAction): string {
  switch (action) {
    case 'block': return 'blocked'
    case 'throttle': return 'throttled'
    case 'notify': return 'over limit'
    case 'allow': return 'unmetered'
  }
}

export function marginStatus(m: LedgerMonth): 'healthy' | 'thin' | 'negative' {
  if (m.gross_margin_cents <= 0) return 'negative'
  if (m.revenue_cents <= 0) return 'thin'
  const ratio = m.gross_margin_cents / m.revenue_cents
  return ratio < 0.5 ? 'thin' : 'healthy'
}

export function marginStatusLabel(s: 'healthy' | 'thin' | 'negative'): string {
  switch (s) {
    case 'healthy': return 'Healthy margin'
    case 'thin': return 'Thin margin (<50%)'
    case 'negative': return 'Costs exceed revenue'
  }
}

// Usage fraction for progress bars; null limit = unmetered plan.
export function usageFraction(l: ProviderLimit): number | null {
  if (l.limit_units == null || l.limit_units <= 0) return null
  return Math.min(1, l.used_units / l.limit_units)
}

export function formatCents(cents: number, currency = 'NGN'): string {
  const n = cents / 100
  return currency === 'NGN' ? `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${n.toLocaleString()} ${currency}`
}
