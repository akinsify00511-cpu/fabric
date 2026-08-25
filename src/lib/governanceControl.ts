import { supabase } from './supabase'
import { isRiverwaysAdmin } from './riverwaysAdmin'

export type GovernanceSeverity = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type IncidentStatus =
  | 'DETECTED' | 'CLASSIFIED' | 'INVESTIGATING' | 'REMEDIATING'
  | 'VERIFYING' | 'RESOLVED' | 'ESCALATED' | 'CLOSED'

export interface GovernanceIncident {
  id: string
  incident_key: string
  component: string
  severity: GovernanceSeverity
  status: IncidentStatus
  description: string
  impact: string | null
  root_cause: string | null
  detected_at: string
  resolved_at: string | null
  resolution?: string | null
}

export interface AutonomyAction {
  id: string
  action: string
  level: number
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'escalated' | 'cancelled'
  attempts: number
  max_attempts: number
  last_error: string | null
  queued_at: string
  policy: Record<string, unknown>
}

export interface HumanDecision {
  id: string
  title: string
  risk: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  proposed_action: unknown
  impact: unknown
  rollback_available: boolean
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  decision_reason?: string | null
  created_at: string
}

export interface AuditEntry {
  id: string
  actor: string
  actor_id: string | null
  action: string
  target: string | null
  before_state: unknown
  after_state: unknown
  result: 'success' | 'failure' | 'partial'
  risk: string | null
  created_at: string
}

export interface GovernanceEventRow {
  id: string
  component: string
  event_key: string
  status: string
  severity: GovernanceSeverity
  message: string
  payload: unknown
  actor: string
  created_at: string
}

export interface GovernanceOverview {
  authorized: boolean
  incidents?: { open: number; p0_open: number; p1_open: number; total: number }
  autonomy?: { queued: number; succeeded_today: number; escalated: number }
  decisions?: { pending: number }
  events_today?: number
  audit_today?: number
  latest_report?: {
    payload: { verdict?: { result?: string; compliance_score?: number } } & Record<string, unknown>
    published_at: string
    channel: string
  } | null
}

export interface SelfHealth {
  authorized: boolean
  status: 'healthy' | 'DEGRADED' | 'UNKNOWN'
  checks?: { event_ingest?: boolean; audit_ingest?: boolean; latest_event_at?: string | null }
}

export const INCIDENT_LIFECYCLE: IncidentStatus[] = [
  'DETECTED', 'CLASSIFIED', 'INVESTIGATING', 'REMEDIATING',
  'VERIFYING', 'RESOLVED', 'ESCALATED', 'CLOSED',
]

export const SEVERITY_ORDER: Record<GovernanceSeverity, number> = {
  P0: 0, P1: 1, P2: 2, P3: 3, P4: 4,
}

// Severity-first ordering never flattens a P0 below a P4 within open state.
export function sortedIncidents<T extends { severity: GovernanceSeverity }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

// An incident is open unless RESOLVED or CLOSED.
export function isIncidentOpen(status: IncidentStatus): boolean {
  return !['RESOLVED', 'CLOSED'].includes(status)
}

// The lifecycle is a ladder — never regress from a terminal state.
export function nextIncidentStatuses(current: IncidentStatus): IncidentStatus[] {
  if (current === 'RESOLVED' || current === 'CLOSED') return []
  return INCIDENT_LIFECYCLE.filter(s => s !== current)
}

async function guard(): Promise<boolean> {
  return isRiverwaysAdmin()
}

export async function getGovernanceOverview(): Promise<GovernanceOverview | null> {
  if (!await guard()) return null
  const { data, error } = await supabase.rpc('governance_overview')
  if (error) return null
  return data as GovernanceOverview
}

export async function getSelfHealth(): Promise<SelfHealth | null> {
  if (!await guard()) return null
  const { data, error } = await supabase.rpc('governance_self_health')
  if (error) return null
  return data as SelfHealth
}

export async function getIncidents(limit = 100): Promise<GovernanceIncident[]> {
  if (!await guard()) return []
  const { data, error } = await supabase.rpc('incidents_feed', { p_limit: limit })
  if (error) return []
  return (data ?? []) as GovernanceIncident[]
}

export async function transitionIncident(
  id: string,
  to: IncidentStatus,
  reason?: string,
): Promise<boolean> {
  if (!await guard()) return false
  const { data, error } = await supabase.rpc('transition_incident', {
    p_incident_id: id, p_to_status: to, p_reason: reason ?? null,
  })
  return !error && data === true
}

export async function createIncident(
  component: string,
  severity: GovernanceSeverity,
  description: string,
): Promise<string | null> {
  if (!await guard()) return null
  const { data, error } = await supabase.rpc('create_incident', {
    p_component: component, p_severity: severity, p_description: description,
  })
  if (error) return null
  return data as string
}

export async function getAutonomyFeed(limit = 50): Promise<AutonomyAction[]> {
  if (!await guard()) return []
  const { data, error } = await supabase.rpc('autonomy_feed', { p_limit: limit })
  if (error) return []
  return (data ?? []) as AutonomyAction[]
}

export async function searchAudit(action?: string, actor?: string, limit = 100): Promise<AuditEntry[]> {
  if (!await guard()) return []
  const { data, error } = await supabase.rpc('search_audit', {
    p_action: action || null, p_actor: actor || null, p_limit: limit,
  })
  if (error) return []
  return (data ?? []) as AuditEntry[]
}

export async function getDecisionsFeed(status?: 'pending'): Promise<HumanDecision[]> {
  if (!await guard()) return []
  const { data, error } = await supabase.rpc('decisions_feed', {
    p_status: status ?? null, p_limit: 100,
  })
  if (error) return []
  return (data ?? []) as HumanDecision[]
}

// decideHumanDecision: a high-risk decision needs step-up authorization.
// The client confirms the admin explicitly re-proved their authority (e.g.
// a second-click confirm dialog) before calling with p_step_up = true.
// stepUp defaults to TRUE so callers must consciously lower the gate only
// when the risk itself is 'low'.
export async function decideHumanDecision(
  id: string,
  decision: 'approved' | 'rejected',
  reason?: string,
  stepUp = true,
): Promise<boolean> {
  if (!await guard()) return false
  const { data, error } = await supabase.rpc('decide_human_decision', {
    p_decision_id: id, p_decision: decision, p_reason: reason ?? null,
    p_step_up: stepUp,
  })
  return !error && data === true
}

export const ACTORS = ['USER', 'ADMIN', 'SYSTEM', 'AUTONOMY_ENGINE', 'AI_AGENT', 'DEPLOYMENT', 'SCHEDULED_MONITOR'] as const
