// Governance layer — pure helpers for the Organization → Governance → Board
// architecture. The Board is organizational structure, not a product module.
// These helpers are the client-side mirror of the server-side rules in
// supabase/migrations/20260822120000_governance_layer.sql (keep in sync).

export type ResolutionType = 'ordinary' | 'special'
export type ResolutionStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'tabled'
  | 'withdrawn'
export type CascadeStatus = 'on_track' | 'at_risk' | 'unknown'

// Vote outcome derivation. Ordinary: simple majority of cast votes.
// Special: two-thirds of cast votes (mirrors record_board_vote).
export function deriveResolutionOutcome(
  type: ResolutionType,
  votesFor: number,
  votesAgainst: number
): 'approved' | 'rejected' {
  if (type === 'special') {
    const cast = votesFor + votesAgainst
    if (cast === 0) return 'rejected'
    return votesFor >= Math.ceil((cast * 2) / 3) ? 'approved' : 'rejected'
  }
  return votesFor > votesAgainst ? 'approved' : 'rejected'
}

// Cascade status: compare weighted KR progress against the elapsed fraction
// of the objective's period. Progress ≥ elapsed-15pts → on_track (honest 15
// point grace window, mirrored in compose_board_report). Needs real period
// dates — without them the status is unknown, never fabricated.
export function deriveCascadeStatus(
  progress: number | null | undefined,
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
  now: Date = new Date()
): CascadeStatus {
  if (progress === null || progress === undefined) return 'unknown'
  if (!periodStart || !periodEnd) return 'unknown'
  const start = new Date(periodStart).getTime()
  const end = new Date(periodEnd).getTime()
  if (!(start < end)) return 'unknown'
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - start) / (end - start))) * 100
  return progress + 15 < elapsed ? 'at_risk' : 'on_track'
}

// The contextual board-visibility boundary. A Board report must never
// include these domains — the exclusion is enforced by construction on the
// server (compose_board_report never references these tables); this list is
// the client-side contract anchor for what the UI may show.
export const BOARD_REPORT_EXCLUSIONS = [
  'payroll',
  'salary',
  'employee_pii',
  'customer_pii',
  'crm_conversations',
  'operational_row_detail',
] as const

export const RESOLUTION_TYPE_LABELS: Record<ResolutionType, string> = {
  ordinary: 'Ordinary resolution',
  special: 'Special resolution (needs 2/3)',
}

export const CASCADE_STATUS_LABELS: Record<CascadeStatus, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  unknown: 'No period set',
}

export type CommitteeType =
  | 'audit'
  | 'finance'
  | 'risk'
  | 'remuneration'
  | 'strategy'
  | 'nomination'
  | 'other'

export const COMMITTEE_TYPES: CommitteeType[] = [
  'audit',
  'finance',
  'risk',
  'remuneration',
  'strategy',
  'nomination',
  'other',
]

export function committeeTypeLabel(t: CommitteeType): string {
  const labels: Record<CommitteeType, string> = {
    audit: 'Audit',
    finance: 'Finance',
    risk: 'Risk',
    remuneration: 'Remuneration',
    strategy: 'Strategy',
    nomination: 'Nomination',
    other: 'Other',
  }
  return labels[t]
}
