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

// Gap-analysis display contract (mirrors objective_gap_analysis RPC).
export type GapStatus =
  | 'achieved'
  | 'on_track'
  | 'at_risk'
  | 'unlikely'
  | 'insufficient_data'

export type GapTone = 'good' | 'warn' | 'bad' | 'neutral'

export function gapStatusTone(status: GapStatus | undefined): GapTone {
  switch (status) {
    case 'achieved':
    case 'on_track':
      return 'good'
    case 'at_risk':
      return 'warn'
    case 'unlikely':
      return 'bad'
    default:
      return 'neutral'
  }
}

export function gapConstraintLabel(constraint: string | null | undefined): string {
  switch (constraint) {
    case 'pipeline':
      return 'Pipeline constraint'
    case 'conversion':
      return 'Conversion constraint'
    case 'data':
      return 'Not enough deal history'
    case 'pacing':
      return 'Pacing'
    default:
      return ''
  }
}

// ── Board pack (printable report) ────────────────────────────────────────────
// Self-contained HTML for print/PDF (no tokens — print needs absolute values).
// Generated from the aggregate board report only: the §21 boundary holds.

export interface BoardPackInput {
  business_name?: string
  period_start?: string | null
  period_end?: string | null
  headline?: string
  totals?: {
    resolutions_approved?: number
    resolutions_open?: number
    meetings_this_period?: number
    members_count?: number
  }
  sections?: { title: string; lines: string[] }[]
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function generateBoardPackHtml(input: BoardPackInput): string {
  const period =
    input.period_start || input.period_end
      ? `${input.period_start ?? ''}${input.period_start && input.period_end ? ' → ' : ''}${input.period_end ?? ''}`
      : 'Current period'
  const totals = input.totals ?? {}
  const sections = input.sections ?? []
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${esc(input.business_name ?? 'Board')} — Board pack</title>`,
    '<style>body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:800px;margin:auto}',
    'h1{font-size:22px;margin:0 0 4px} .muted{color:#555;font-size:12px}',
    'h2{font-size:14px;margin:20px 0 6px;border-bottom:1px solid #ddd;padding-bottom:2px}',
    'ul{margin:0;padding-left:18px}li{font-size:12px;margin:2px 0}',
    '.grid{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0}.cell{min-width:120px}',
    '.num{font-size:18px;font-weight:700} .cap{font-size:11px;color:#555}</style>',
    '</head><body>',
    `<h1>${esc(input.business_name ?? 'Board pack')}</h1>`,
    `<p class="muted">${esc(period)}</p>`,
    input.headline ? `<p class="muted">${esc(input.headline)}</p>` : '',
    '<div class="grid">',
    `<div class="cell"><div class="num">${totals.resolutions_approved ?? 0}</div><div class="cap">Resolutions approved</div></div>`,
    `<div class="cell"><div class="num">${totals.resolutions_open ?? 0}</div><div class="cap">Open resolutions</div></div>`,
    `<div class="cell"><div class="num">${totals.meetings_this_period ?? 0}</div><div class="cap">Meetings</div></div>`,
    `<div class="cell"><div class="num">${totals.members_count ?? 0}</div><div class="cap">Board members</div></div>`,
    '</div>',
    ...sections.flatMap(s => [
      `<h2>${esc(s.title)}</h2>`,
      s.lines.length
        ? `<ul>${s.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '<p class="muted">No items.</p>',
    ]),
    '</body></html>',
  ].join('')
}
