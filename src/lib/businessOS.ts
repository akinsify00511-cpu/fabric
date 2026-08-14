// Business OS client helpers: event bus, context graph, freshness,
// intelligence indexes, simulation, learning loop. These wrap the Supabase
// RPCs/views created in migrations 058+ so pages stay thin.

import { supabase } from './supabase'

// ---------- Business Event Bus (058) ----------

export interface BusinessEvent {
  id: string
  business_id: string
  event_type: string
  entity_type: string
  entity_id: string | null
  related_entities: any[]
  payload: Record<string, any>
  source: string
  actor_id: string | null
  capture_mode: string | null
  confidence: number | null
  processed: boolean
  processed_at: string | null
  processing_error: string | null
  occurred_at: string
  created_at: string
}

export async function emitBusinessEvent(params: {
  business_id: string
  event_type: string
  entity_type: string
  entity_id?: string
  payload?: Record<string, any>
  related_entities?: any[]
  source?: 'staff' | 'system' | 'automation' | 'ai_gateway' | 'integration'
  actor_id?: string
  capture_mode?: string
  confidence?: number
}) {
  const { data, error } = await supabase.rpc('emit_business_event', {
    p_business_id: params.business_id,
    p_event_type: params.event_type,
    p_entity_type: params.entity_type,
    p_entity_id: params.entity_id ?? null,
    p_payload: params.payload ?? {},
    p_related_entities: params.related_entities ?? [],
    p_source: params.source ?? 'system',
    p_actor_id: params.actor_id ?? null,
    p_capture_mode: params.capture_mode ?? null,
    p_confidence: params.confidence ?? null,
  })
  if (error) throw error
  return data as string
}

export async function fetchBusinessEvents(businessId: string, limit = 50) {
  const { data, error } = await supabase
    .from('business_events')
    .select('*')
    .eq('business_id', businessId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []) as BusinessEvent[]
}

// ---------- Freshness (058) ----------

export type FreshnessTier = 'fresh' | 'today' | 'stale' | 'old' | 'unknown'

export interface FreshnessStatus {
  entity_type: string
  entity_id: string
  last_event_type: string | null
  last_event_at: string | null
  freshness_tier: FreshnessTier
  seconds_since_update: number | null
}

export async function fetchFreshness(businessId: string, entityType?: string) {
  let q = supabase.from('entity_freshness_status').select('*').eq('business_id', businessId)
  if (entityType) q = q.eq('entity_type', entityType)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as FreshnessStatus[]
}

export const FRESHNESS_META: Record<FreshnessTier, { label: string; color: string }> = {
  fresh: { label: 'Fresh', color: '#34A853' },
  today: { label: 'Today', color: '#4285F4' },
  stale: { label: 'Stale', color: '#FBBC05' },
  old: { label: 'Outdated', color: '#EA4335' },
  unknown: { label: 'No data', color: '#9AA0A6' },
}

// ---------- Governed Metrics (086) ----------
// The canonical, governed metric layer. `refreshBusinessMetrics` is the ONLY
// caller of the write RPC; `fetchCurrentMetrics` is the single read a metric
// panel should make. Confidence 'insufficient' means the UI must show the
// definition's insufficient_note (§21 small-data safety).

export type MetricConfidence = 'high' | 'medium' | 'low' | 'insufficient' | 'error'

export interface GovernedMetric {
  metric_key: string
  name: string
  category: string
  unit: string
  formula: string
  current_value: number | null
  previous_value: number | null
  change_percent: number | null
  sample_size: number
  confidence: MetricConfidence
  insufficient_note: string | null
  period: string
  last_calculated_at: string | null
}

export async function fetchCurrentMetrics(businessId: string) {
  const { data, error } = await supabase.rpc('current_metrics', { p_business_id: businessId })
  if (error) throw error
  return (data || []) as GovernedMetric[]
}

// Trigger a refresh on load (best-effort). Never blocks the UI: failures are
// swallowed so business operations stay authoritative (§24).
export async function refreshBusinessMetrics(businessId: string) {
  try {
    await supabase.rpc('refresh_business_metrics', { p_business_id: businessId })
  } catch (e) {
    console.error('refresh_business_metrics failed (non-blocking):', e)
  }
}

// ---------- Context Graph (087 wiring of 060) ----------
// The business relationship graph. `fetchRelationships` asks "what is
// connected to this entity?" for cross-module diagnosis / impact analysis.

export interface GraphNeighbor {
  entity_type: string
  entity_id: string
  depth: number
  path: string[]
}

export async function fetchRelationships(
  businessId: string, startType: string, startId: string, maxDepth = 3
) {
  const { data, error } = await supabase.rpc('business_relationships', {
    p_business_id: businessId, p_start_type: startType, p_start_id: startId, p_max_depth: maxDepth,
  })
  if (error) throw error
  return (data || []) as GraphNeighbor[]
}

// ---------- Recommendations + Outcome Loop (088) ----------
// A recommendation is a `claims` row (claim_type='RECOMMENDATION'). These
// wrap the lifecycle RPCs. Best-effort callers never block business ops.

export type RecommendationStatus =
  | 'issued' | 'acknowledged' | 'accepted' | 'rejected'
  | 'acted' | 'outcome_recorded' | 'superseded' | 'expired'

export interface Recommendation {
  id: string
  rule_id: string | null
  severity: 'info' | 'warning' | 'critical' | null
  statement: string
  evidence: any[]
  expected_impact: { amount?: number; description?: string; metric_key?: string } | null
  status: RecommendationStatus
  owner_id: string | null
  action_type: string | null
  linked_action_id: string | null
  created_at: string
  subject_type: string | null
  subject_id: string | null
}

export async function fetchOpenRecommendations(businessId: string, limit = 50) {
  const { data, error } = await supabase.rpc('open_recommendations', {
    p_business_id: businessId, p_limit: limit,
  })
  if (error) throw error
  return (data || []) as Recommendation[]
}

export async function decideRecommendation(claimId: string, accepted: boolean, byStaffId: string) {
  const { error } = await supabase.rpc('set_recommendation_decision', {
    p_claim_id: claimId, p_accepted: accepted, p_by: byStaffId,
  })
  if (error) throw error
}

export async function acknowledgeRecommendation(claimId: string, byStaffId: string) {
  const { error } = await supabase.rpc('acknowledge_recommendation', {
    p_claim_id: claimId, p_by: byStaffId,
  })
  if (error) throw error
}

export async function markRecommendationActed(
  claimId: string, actionType: string, actionId: string
) {
  const { error } = await supabase.rpc('mark_recommendation_acted', {
    p_claim_id: claimId, p_action_type: actionType, p_action_id: actionId,
  })
  if (error) throw error
}

export async function recordRecommendationOutcome(claimId: string, actualImpact: Record<string, any>) {
  const { error } = await supabase.rpc('record_recommendation_outcome', {
    p_claim_id: claimId, p_actual_impact: actualImpact,
  })
  if (error) throw error
}

export async function fetchRecommendationEffectiveness(businessId: string) {
  const { data, error } = await supabase.rpc('recommendation_effectiveness', {
    p_business_id: businessId,
  })
  if (error) throw error
  return data || []
}

// Best-effort: run the deterministic recommendation issuer for this business.
// Creates specific, evidenced RECOMMENDATION claims from real data (§12/§13).
export async function runRecommendationRules(businessId: string) {
  try {
    await supabase.rpc('run_recommendation_rules', { p_business_id: businessId })
  } catch (e) {
    console.error('run_recommendation_rules failed (non-blocking):', e)
  }
}

// ---------- Data Quality (089) ----------
// Deterministic data-quality findings. `scanDataQuality` writes findings
// (advisory; never mutates business data). `fetchDataQualityFindings` reads.

export interface DataQualityFinding {
  id: string
  category: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
  entity_type: string | null
  entity_id: string | null
  suggested_remediation: string | null
  resolved: boolean
  created_at: string
}

export async function fetchDataQualityFindings(businessId: string) {
  const { data, error } = await supabase.rpc('data_quality_findings', { p_business_id: businessId })
  if (error) throw error
  return (data || []) as DataQualityFinding[]
}

// Best-effort scan trigger (non-blocking).
export async function scanDataQuality(businessId: string) {
  try {
    await supabase.rpc('scan_data_quality', { p_business_id: businessId })
  } catch (e) {
    console.error('scan_data_quality failed (non-blocking):', e)
  }
}
