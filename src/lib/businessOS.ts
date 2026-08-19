// Business OS client helpers: event bus, context graph, freshness,
// intelligence indexes, simulation, learning loop. These wrap the Supabase
// RPCs/views created in migrations 058+ so pages stay thin.

import { supabase } from './supabase'
import type { UserRole } from './AuthContext'

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

// ---------- Business Health (093 / §21) ----------
// Explainable, decomposable composite score derived from governed metrics vs
// targets + data-quality penalty + recommendation flags. Every number has
// evidence (dimension_scores JSONB). Honest NULL when no target-backed data.

export interface HealthDimension {
  score: number | null
  status: 'healthy' | 'watch' | 'at_risk' | 'insufficient_data'
  metrics: {
    metric_key: string
    label: string
    actual: number
    target: number
    direction: 'higher' | 'lower'
    score: number
  }[]
}

export interface BusinessHealth {
  overall_score: number | null
  dimension_scores: Record<string, HealthDimension> & { _meta?: {
    data_quality_penalty: number
    open_critical_findings: number
    open_warning_findings: number
    recommendations: { open_critical_recommendations: number }
  } }
  data_quality_penalty: number
  insufficient_dimensions: string[]
  computed_at: string | null
}

// Best-effort: compute then read (non-blocking if migration not deployed).
export async function computeBusinessHealth(businessId: string): Promise<void> {
  try {
    await supabase.rpc('compute_business_health', { p_business_id: businessId })
  } catch (e) {
    console.error('compute_business_health failed (non-blocking):', e)
  }
}

export async function fetchBusinessHealth(businessId: string): Promise<BusinessHealth | null> {
  const { data, error } = await supabase.rpc('current_business_health', { p_business_id: businessId })
  if (error) throw error
  return (data || null) as BusinessHealth | null
}

// ---------- Scheduled Event Detectors (109) ----------
// Time-based events (ContractExpiring, PayrollDue) are not row-change
// triggers; they fire when a date approaches. pg_cron runs them daily on
// the server. Public RPC access was revoked in the Session-33 security
// closure (cross-business scanners must not be callable by tenants); these
// wrappers remain exported for compatibility and return 0.

export async function detectContractsExpiring(): Promise<number> {
  return 0
}

export async function detectPayrollDue(): Promise<number> {
  return 0
}

// ---------- Said-vs-Used Reality Gap (20260101000008 / #12) ----------
// "What you said you need (onboarding) vs what you actually use (telemetry)."
// Deterministic comparison of user_workspace_selections vs usage_events.
// Best-effort + non-blocking (§24): stays empty when the RPC/migration is not
// deployed to the live DB — the page degrades gracefully.

export interface SaidVsUsedRow {
  module_key: string
  selected: boolean
  actually_used: boolean
  distinct_staff_used: number
  event_count: number
  last_seen: string | null
  gap_label: 'selected_unused' | 'used_unselected' | 'adopted' | 'trying' | 'untouched' | string
}

export async function fetchSaidVsUsed(businessId: string): Promise<SaidVsUsedRow[]> {
  const { data, error } = await supabase.rpc('said_vs_used', { p_business_id: businessId })
  if (error) throw error
  return (data || []) as SaidVsUsedRow[]
}

// ---------- Owner-Only Business Intelligence (20260101000010 / #18) ----------
// The #18 private intelligence layer: owner/admin-gated analytics ordinary
// users cannot access. The RPC verifies role IN ('owner','admin') AND business
// membership via get_current_staff (defense-in-depth — client role check is
// UX only). Returns one structured JSONB payload (feature activation, quick-
// turnoff, ignored automations, workflow funnel, onboarding completion).
// #21 boundary: reads ONLY usage_events + automations — NEVER privileged/
// walled content (legal, disciplinary, board finance, litigation).
// Best-effort + non-blocking (§24): returns null when the RPC/migration is not
// deployed, or when the caller is not owner/admin — the page degrades gracefully.

export interface OwnerFeatureActivation {
  module_key: string
  first_active_at: string | null
  distinct_active_days: number
  last_active_at: string | null
  reuse_label: 'reused' | 'returning' | 'activated' | 'view_only' | string
}
export interface OwnerQuickTurnoff {
  tool_key: string
  selected_at: string
  deselected_at: string
  days_until_turnoff: number
}
export interface OwnerIgnoredAutomation {
  id: string
  name: string
  trigger_type: string
  created_at: string
  last_run_at: string | null
  run_count: number
  enabled: boolean
}
export interface OwnerWorkflowFunnel {
  workflow: string
  started: number
  completed: number
  abandoned: number
  completion_rate: number | null
}
export interface OwnerOnboardingCompletion {
  completed_at: string
  steps_reached: number
  duration_seconds: number
}
export interface OwnerIntelligence {
  authorized: boolean
  feature_activation: OwnerFeatureActivation[]
  quick_turnoff: OwnerQuickTurnoff[]
  ignored_automations: OwnerIgnoredAutomation[]
  workflow_funnel: OwnerWorkflowFunnel[]
  onboarding_completion: OwnerOnboardingCompletion | null
  data_scope?: string
}

export async function fetchOwnerIntelligence(businessId: string): Promise<OwnerIntelligence | null> {
  const { data, error } = await supabase.rpc('owner_intelligence', { p_business_id: businessId })
  if (error) throw error
  return (data as OwnerIntelligence) ?? null
}

// ---------- Sector Intelligence + Behavior Recommendations (20260101000011 / #16/#17) ----------
// #16: sector benchmark — the business vs its sector's ANONYMIZED aggregate
// (count/avg only, never individual businesses). First-party data only; no
// fabricated external benchmarks (§22). Owner-gated + membership-guarded.
// #17: behavior-driven recommendation issuer — runs USAGE-001/002 + SECTOR-001
// alongside the financial/operational rules. Best-effort + non-blocking (§24).

export interface SectorModuleRow {
  module_key: string
  i_selected: boolean
  i_used: boolean
  sector_businesses_selected: number
  sector_adoption_pct: number | null
}
export interface SectorBenchmark {
  authorized: boolean
  industry: string
  sector_sample_size: number
  modules: SectorModuleRow[]
}

export async function fetchSectorBenchmark(businessId: string): Promise<SectorBenchmark | null> {
  const { data, error } = await supabase.rpc('sector_benchmark', { p_business_id: businessId })
  if (error) throw error
  return (data as SectorBenchmark) ?? null
}

export async function runBehaviorRecommendationRules(businessId: string): Promise<{ rule_id: string; issued_count: number }[] | null> {
  const { data, error } = await supabase.rpc('run_behavior_recommendation_rules', { p_business_id: businessId })
  if (error) throw error
  return (data as { rule_id: string; issued_count: number }[]) ?? null
}

// ---------- Builder / Board Dashboard (20260101000012 / #19/#34) ----------
// The PLATFORM-OPERATOR surface (distinct from per-business owner intelligence
// #18). Aggregate cross-business patterns: module adoption/abandonment
// platform-wide, onboarding conversion, sector×module adoption. Gated by a
// platform_admins email allowlist (NOT a business role) — verified server-side.
// #21: aggregate only, never business PII or walled content. Best-effort §24.

export interface BuilderOnboardingConversion {
  total_authenticated: number
  total_completed: number
  total_abandoned: number
  conversion_rate: number | null
  median_steps_reached: number | null
  avg_duration_seconds: number | null
}
export interface BuilderCrossBusinessAdoption {
  module_key: string
  businesses_touching: number
  total_events: number
}
export interface BuilderSectorModuleUsage {
  industry: string
  module_key: string
  businesses_selecting: number
  businesses_using: number
  adoption_rate: number | null
}
export interface BuilderDashboard {
  authorized: boolean
  onboarding_conversion: BuilderOnboardingConversion | null
  cross_business_adoption: BuilderCrossBusinessAdoption[]
  sector_module_usage: BuilderSectorModuleUsage[]
  data_scope?: string
}

export async function fetchBuilderDashboard(): Promise<BuilderDashboard | null> {
  const { data, error } = await supabase.rpc('builder_dashboard')
  if (error) throw error
  return (data as BuilderDashboard) ?? null
}

// ---------- Automation Health (20260101000013 / #20) ----------
// Success/failure rates, never-run automations, recent runs. Owner-gated +
// membership-guarded. Powers the #20 "automation health" requirement.
// Best-effort + non-blocking (§24).

export interface AutomationHealth {
  authorized: boolean
  total_automations: number
  enabled_automations: number
  total_runs: number
  successful_runs: number
  failed_runs: number
  never_run: { id: string; name: string; trigger_type: string; action_type: string; enabled: boolean; created_at: string }[]
  recent_runs: { id: string; automation_name: string; trigger_type: string; status: string; error_message: string | null; executed_at: string }[]
}

export async function fetchAutomationHealth(businessId: string): Promise<AutomationHealth | null> {
  const { data, error } = await supabase.rpc('automation_health', { p_business_id: businessId })
  if (error) throw error
  return (data as AutomationHealth) ?? null
}

/** §N automation health WITH the dead-letter queue view. Best-effort. */
export interface AutomationDLQEntry {
  id: string
  automation_name: string
  error_message: string | null
  retry_count: number
  executed_at: string
  last_attempted_at: string | null
}
export interface AutomationDLQHealth {
  authorized: boolean
  summary: {
    total_failed: number
    total_retried: number
    dead_lettered_count: number
    avg_retries_to_success: number
  }
  dead_lettered: AutomationDLQEntry[]
}
export async function fetchAutomationDLQHealth(businessId: string): Promise<AutomationDLQHealth | null> {
  try {
    const { data, error } = await supabase.rpc('automation_health_with_dlq', { p_business_id: businessId })
    if (error) throw error
    return (data as AutomationDLQHealth) ?? null
  } catch (e) {
    console.error('fetchAutomationDLQHealth failed (non-blocking):', e)
    return null
  }
}
export async function reviveDeadLetteredAutomation(runId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('revive_dead_lettered_automation', { p_run_id: runId })
    if (error) throw error
    return true
  } catch (e) {
    console.error('reviveDeadLetteredAutomation failed (non-blocking):', e)
    return false
  }
}

// ============================================================================
// §K Multi-role switching. A user can hold secondary business roles beyond
// their primary staff.role, and switch which persona they're operating as.
// UX/context only — security stays staff.role + RLS + functional_roles.
// ============================================================================

export interface StaffRoles {
  authorized: boolean
  primary: UserRole
  secondary: UserRole[]
  roles: UserRole[]       // primary + secondary (for the switcher)
  effective: UserRole    // MAX-level role (permission precedence)
  effective_level: number
}
export async function fetchStaffRoles(staffId: string): Promise<StaffRoles | null> {
  try {
    const { data, error } = await supabase.rpc('get_staff_roles', { p_staff_id: staffId })
    if (error) throw error
    return (data as StaffRoles) ?? null
  } catch (e) {
    console.error('fetchStaffRoles failed (non-blocking):', e)
    return null
  }
}

/** Switch the active persona. Server-validates the user holds the role. */
export async function setActiveRole(staffId: string, role: UserRole): Promise<UserRole | null> {
  try {
    const { data, error } = await supabase.rpc('set_active_role', { p_staff_id: staffId, p_role: role })
    if (error) throw error
    return (data as UserRole) ?? null
  } catch (e) {
    console.error('setActiveRole failed (non-blocking):', e)
    return null
  }
}

/** Reset to the primary role. */
export async function clearActiveRole(staffId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('clear_active_role', { p_staff_id: staffId })
    if (error) throw error
    return true
  } catch (e) {
    console.error('clearActiveRole failed (non-blocking):', e)
    return false
  }
}

// ============================================================================
// §G Profitability Intelligence — "Where is the business making/losing money?"
// Decomposes the aggregate EBITDA into per-segment profitability + leakage.
// Composes on the same invoices/transactions/invoice_items EBITDA reads.
// ============================================================================

export interface ProfitabilitySegment {
  segment_name: string
  revenue: number
  cost: number
  profit: number
  margin_pct: number | null
  invoice_count?: number
  units_sold?: number
}
export interface ProfitabilityBySegmentResult {
  authorized: boolean
  segment: string
  total_revenue: number
  total_cogs: number
  cost_allocation: string
  segments: ProfitabilitySegment[]
  error?: string
}
export async function fetchProfitabilityBySegment(
  businessId: string,
  segment: 'customer' | 'product' | 'salesperson' | 'channel' = 'customer'
): Promise<ProfitabilityBySegmentResult | null> {
  try {
    const { data, error } = await supabase.rpc('profitability_by_segment', {
      p_business_id: businessId, p_segment: segment,
    })
    if (error) throw error
    return (data as ProfitabilityBySegmentResult) ?? null
  } catch (e) {
    console.error('fetchProfitabilityBySegment failed (non-blocking):', e)
    return null
  }
}

export interface LeakageFinding {
  client_name: string
  invoice_number?: string
  total?: number
  days_overdue?: number
  margin_pct?: number
  prior_margin?: number
  margin_change?: number
  deal_value?: number
  invoiced_total?: number
  days_outstanding?: number
}
export interface ProfitabilityLeakageResult {
  authorized: boolean
  overdue: LeakageFinding[]
  declining_margin: LeakageFinding[]
  negative_margin_deals: LeakageFinding[]
  stale_receivables: LeakageFinding[]
  total_exposure: number
  note?: string
  error?: string
}
export async function fetchProfitabilityLeakage(businessId: string): Promise<ProfitabilityLeakageResult | null> {
  try {
    const { data, error } = await supabase.rpc('profitability_leakage', { p_business_id: businessId })
    if (error) throw error
    return (data as ProfitabilityLeakageResult) ?? null
  } catch (e) {
    console.error('fetchProfitabilityLeakage failed (non-blocking):', e)
    return null
  }
}

export interface PricingOpportunity {
  product: string
  revenue: number
  margin_pct: number | null
}
export interface PricingOpportunitiesResult {
  authorized: boolean
  high_margin: PricingOpportunity[]
  low_margin: PricingOpportunity[]
  note?: string
  error?: string
}
export async function fetchPricingOpportunities(businessId: string): Promise<PricingOpportunitiesResult | null> {
  try {
    const { data, error } = await supabase.rpc('pricing_opportunities', { p_business_id: businessId })
    if (error) throw error
    return (data as PricingOpportunitiesResult) ?? null
  } catch (e) {
    console.error('fetchPricingOpportunities failed (non-blocking):', e)
    return null
  }
}

// ============================================================================
// §J Business Graph — impact propagation. Composes on entity_relationships +
// recursive_neighbors (060/087). "If this deal closes, what else changes?"
// ============================================================================

export interface GraphNodeCount { entity_type: string; node_count: number }
export interface GraphEdgeCount { relationship: string; edge_count: number }
export interface GraphHubEntity { entity_type: string; entity_id: string; connections: number }
export interface GraphOverview {
  authorized: boolean
  total_edges: number
  nodes_by_type: GraphNodeCount[]
  edges_by_relationship: GraphEdgeCount[]
  hub_entities: GraphHubEntity[]
  note?: string
  error?: string
}
export async function fetchGraphOverview(businessId: string): Promise<GraphOverview | null> {
  try {
    const { data, error } = await supabase.rpc('graph_overview', { p_business_id: businessId })
    if (error) throw error
    return (data as GraphOverview) ?? null
  } catch (e) {
    console.error('fetchGraphOverview failed (non-blocking):', e)
    return null
  }
}

export interface ImpactEntity {
  entity_type: string
  entity_id: string
  depth: number
  path: string[]
  propagated_delta: number | null
  evidence_tag: 'FACT' | 'INFERENCE' | 'UNKNOWN'
  impact_description: string
}
export interface PropagateImpactResult {
  authorized: boolean
  scenario_label: string
  scenario_delta: number
  start_entity: { type: string; id: string }
  impacted_entities: ImpactEntity[]
  note?: string
  error?: string
}
export async function propagateImpact(
  businessId: string,
  startType: string,
  startId: string,
  scenarioDelta: number,
  scenarioLabel: string
): Promise<PropagateImpactResult | null> {
  try {
    const { data, error } = await supabase.rpc('propagate_impact', {
      p_business_id: businessId, p_start_type: startType, p_start_id: startId,
      p_scenario_delta: scenarioDelta, p_scenario_label: scenarioLabel,
    })
    if (error) throw error
    return (data as PropagateImpactResult) ?? null
  } catch (e) {
    console.error('propagateImpact failed (non-blocking):', e)
    return null
  }
}

// ============================================================================
// §AA Evolved Business Review — the narrative synthesis. Composes on
// monthly_review (097) + claims lifecycle (088) + organizational_memory (064).
// ============================================================================

export interface MetricMover { metric: string; change_pct: number }
export interface LearnedItem { topic: string; lesson: string }
export interface NextPriority { rule_id: string; statement: string; severity: string }
export interface BusinessReview {
  authorized: boolean
  period_start: string
  period_end: string
  what_happened?: any
  what_improved: MetricMover[]
  what_deteriorated: MetricMover[]
  what_we_learned: LearnedItem[]
  recommended_vs_done: {
    recommended: number; accepted: number; acted: number
    outcomes_recorded: number; successful_outcomes: number
  }
  next_month_priorities: NextPriority[]
  health_snapshot?: any
  evidence_note?: string
  note?: string
  error?: string
}
export async function composeBusinessReview(
  businessId: string,
  periodStart?: string,
  periodEnd?: string
): Promise<BusinessReview | null> {
  try {
    const { data, error } = await supabase.rpc('compose_business_review', {
      p_business_id: businessId,
      p_period_start: periodStart ?? null,
      p_period_end: periodEnd ?? null,
    })
    if (error) throw error
    return (data as BusinessReview) ?? null
  } catch (e) {
    console.error('composeBusinessReview failed (non-blocking):', e)
    return null
  }
}

// ============================================================================
// Riverwayse Platform Operations Dashboard
// Separate system from Owner Intelligence. Answers "is the platform working
// right now, for everyone" — NOT "is this business healthy". Sits behind the
// is_platform_admin() boundary. Aggregate + structural only by default;
// tenant drill-down is a separate audit-logged RPC. Best-effort/non-blocking.
// ============================================================================

export interface PlatformSystemStatus {
  status: 'healthy' | 'degraded' | 'down' | 'unknown'
  error_count_5m?: number
}

export interface PlatformOps {
  authorized: boolean
  data_scope: string
  systems?: Record<string, PlatformSystemStatus>
  integrations?: Array<{
    integration: string
    display_name: string
    status: string
    consecutive_failures: number
    last_check_at: string | null
    last_error: string | null
    last_success_at: string | null
    latency_ms: number | null
  }>
  recent_errors?: Array<{
    id: string
    captured_at: string
    source: string
    source_detail: string | null
    severity: string
    message: string
    has_business: boolean
    resolved_at: string | null
  }>
  open_incidents?: Array<{
    id: string
    opened_at: string
    trigger_key: string
    severity: string
    status: string
    title: string
    summary: string | null
    affected_business_count: number
  }>
  recent_incidents?: Array<{
    id: string
    opened_at: string
    closed_at: string | null
    severity: string
    status: string
    title: string
    summary: string | null
  }>
  error_counts?: {
    last_5m: number
    last_1h: number
    last_24h: number
    unresolved: number
  }
}

export async function fetchPlatformOps(): Promise<PlatformOps | null> {
  const { data, error } = await supabase.rpc('platform_ops')
  if (error) throw error
  return (data as PlatformOps) ?? null
}

/** Fire-and-forget error ingest. Never throws — logging must not break a user's request path. */
export function logPlatformError(params: {
  source: string
  severity?: string
  message?: string
  sourceDetail?: string
  businessId?: string
  stack?: string
  clientEventId?: string
}): void {
  try {
    void supabase.rpc('log_platform_error', {
      p_source: params.source,
      p_severity: params.severity ?? 'error',
      p_message: params.message ?? null,
      p_source_detail: params.sourceDetail ?? null,
      p_business_id: params.businessId ?? null,
      p_stack: params.stack ?? null,
      p_client_event_id: params.clientEventId ?? null,
    })
  } catch {
    // Swallowed: logging is best-effort.
  }
}

export async function resolvePlatformError(errorId: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc('resolve_platform_error', {
    p_error_id: errorId,
    p_resolution_note: note ?? null,
  })
  if (error) throw error
}

export async function updatePlatformIncident(params: {
  incidentId: string
  status?: string
  resolutionNotes?: string
  postmortem?: string
}): Promise<void> {
  const { error } = await supabase.rpc('update_platform_incident', {
    p_incident_id: params.incidentId,
    p_status: params.status ?? null,
    p_resolution_notes: params.resolutionNotes ?? null,
    p_postmortem: params.postmortem ?? null,
  })
  if (error) throw error
}

export async function investigateBusinessIncident(params: {
  incidentId: string
  businessId: string
  reason: string
  accessedTables?: string[]
}): Promise<void> {
  const { error } = await supabase.rpc('investigate_business_incident', {
    p_incident_id: params.incidentId,
    p_business_id: params.businessId,
    p_reason: params.reason,
    p_accessed_tables: params.accessedTables ?? [],
  })
  if (error) throw error
}

/** §N: read the audit trail of who investigated which tenant for which incident.
 * Surfaces the logged drill-downs so the platform team can review access. */
export interface IncidentInvestigation {
  id: string
  incident_id: string
  business_id: string
  investigated_by_email: string | null
  reason: string
  accessed_tables: string[] | null
  investigated_at: string
}

export async function listIncidentInvestigations(incidentId: string): Promise<IncidentInvestigation[]> {
  try {
    const { data, error } = await supabase
      .from('platform_incident_investigations')
      .select('id, incident_id, business_id, investigated_by_email, reason, accessed_tables, investigated_at')
      .eq('incident_id', incidentId)
      .order('investigated_at', { ascending: false })
      .limit(20)
    if (error) throw error
    return (data as IncidentInvestigation[] | null) ?? []
  } catch (e) {
    console.error('listIncidentInvestigations failed (non-blocking):', e)
    return []
  }
}

export interface PlatformOncallContact {
  id: string
  name: string
  email: string | null
  phone: string | null
  channel: string
  is_active: boolean
  created_at: string
}

export async function listPlatformOncall(): Promise<PlatformOncallContact[]> {
  const { data, error } = await supabase.rpc('list_platform_oncall')
  if (error) throw error
  const payload = data as { authorized: boolean; contacts: PlatformOncallContact[] } | null
  if (!payload?.authorized) return []
  return payload.contacts ?? []
}

export async function upsertPlatformOncall(params: {
  id?: string
  name: string
  email?: string
  phone?: string
  channel?: string
  isActive?: boolean
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('upsert_platform_oncall', {
    p_id: params.id ?? null,
    p_name: params.name,
    p_email: params.email ?? null,
    p_phone: params.phone ?? null,
    p_channel: params.channel ?? 'email',
    p_is_active: params.isActive ?? true,
  })
  if (error) throw error
  return (data as string) ?? null
}

export async function deletePlatformOncall(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_platform_oncall', { p_id: id })
  if (error) throw error
}

export interface PlatformThreshold {
  key: string
  display_name: string
  system: string
  metric: string
  warning_value: number | null
  critical_value: number | null
  enabled: boolean
  updated_at: string
}

export async function listPlatformThresholds(): Promise<PlatformThreshold[]> {
  const { data, error } = await supabase.rpc('list_platform_thresholds')
  if (error) throw error
  const payload = data as { authorized: boolean; thresholds: PlatformThreshold[] } | null
  if (!payload?.authorized) return []
  return payload.thresholds ?? []
}

export async function updatePlatformThreshold(params: {
  key: string
  warningValue?: number
  criticalValue?: number
  enabled?: boolean
}): Promise<void> {
  const { error } = await supabase.rpc('update_platform_threshold', {
    p_key: params.key,
    p_warning_value: params.warningValue ?? null,
    p_critical_value: params.criticalValue ?? null,
    p_enabled: params.enabled ?? null,
  })
  if (error) throw error
}

// ============================================================================
// §5.5 / §7.4 — Proactive alert delivery + digest (no WhatsApp dependency)
// ============================================================================

export interface DigestLine {
  text: string
  source: string
  action?: string
  route?: string
}

export interface BusinessDigest {
  authorized: boolean
  business_id?: string
  digest_type?: string
  recipient_email?: string
  recipient_name?: string
  lines: DigestLine[]
  stats: {
    overall_score?: number | null
    overdue_invoices: number
    overdue_total: number
    low_stock: number
    stale_deals: number
    tasks_due: number
    open_recommendations: number
  }
  recommendations?: unknown[]
  composed_at?: string
}

/** §7.4: compose (but do not send) a business digest. Best-effort, non-blocking (§24). */
export async function composeBusinessDigest(
  businessId: string,
  digestType: 'daily' | 'weekly' = 'daily',
): Promise<BusinessDigest | null> {
  try {
    const { data, error } = await supabase.rpc('compose_business_digest', {
      p_business_id: businessId,
      p_digest_type: digestType,
    })
    if (error) throw error
    return data as BusinessDigest | null
  } catch (e) {
    console.error('composeBusinessDigest failed (non-blocking):', e)
    return null
  }
}

/** §7.4: send the digest to the owner (idempotent, opt-in, audited). Best-effort. */
export async function sendBusinessDigest(
  businessId: string,
  digestType: 'daily' | 'weekly' = 'daily',
): Promise<{ ok: boolean; skipped?: string; error?: string } | null> {
  try {
    const { data, error } = await supabase.rpc('send_business_digest', {
      p_business_id: businessId,
      p_digest_type: digestType,
    })
    if (error) throw error
    return data as { ok: boolean; skipped?: string; error?: string } | null
  } catch (e) {
    console.error('sendBusinessDigest failed (non-blocking):', e)
    return null
  }
}

export interface AlertAction {
  rule_id: string
  label: string
  route: string
  type: string
}

/** §5.5: the one-tap resolving action per alert rule. Best-effort. */
export async function fetchAlertActions(businessId: string): Promise<AlertAction[]> {
  try {
    const { data, error } = await supabase.rpc('get_alert_actions', { p_business_id: businessId })
    if (error) throw error
    return (data as AlertAction[] | null) ?? []
  } catch (e) {
    console.error('fetchAlertActions failed (non-blocking):', e)
    return []
  }
}

// ============================================================================
// §5.3 — EBITDA / operating profitability (server-derived, §0.4)
// ============================================================================

export interface EbitdaResult {
  authorized: boolean
  period_start?: string
  period_end?: string
  revenue: number
  cogs: number
  recurring_expenses: number
  other_expenses: number
  total_expenses: number
  ebitda: number
  margin_pct: number | null
  label: string
  components?: {
    revenue: { amount: number; source: string; count: number }
    cogs: { amount: number; source: string; count: number }
    recurring: { amount: number; source: string; count: number }
  }
  insufficient_data?: boolean
}

/** §5.3: compute EBITDA server-side (revenue − COGS − opex). Best-effort, non-blocking (§24). */
export async function computeEbitda(
  businessId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<EbitdaResult | null> {
  try {
    const { data, error } = await supabase.rpc('compute_ebitda', {
      p_business_id: businessId,
      p_period_start: periodStart ?? null,
      p_period_end: periodEnd ?? null,
    })
    if (error) throw error
    return data as EbitdaResult | null
  } catch (e) {
    console.error('computeEbitda failed (non-blocking):', e)
    return null
  }
}

// ============================================================================
// §7.3 — Business approval threshold configuration
// ============================================================================

export interface BusinessApprovalConfig {
  business_id: string
  bypass_all_approvals: boolean
  auto_approve_below: number | null
  updated_at?: string
}

export interface ApprovalRequiredResult {
  requires_approval: boolean
  reason: string
}

/** §7.3: load the business approval config. Best-effort, non-blocking (§24). */
export async function fetchBusinessApprovalConfig(businessId: string): Promise<BusinessApprovalConfig | null> {
  try {
    const { data, error } = await supabase
      .from('business_approval_config')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle()
    if (error) throw error
    return data as BusinessApprovalConfig | null
  } catch (e) {
    console.error('fetchBusinessApprovalConfig failed (non-blocking):', e)
    return null
  }
}

/** §7.3: save the business approval config (owner/admin only via RLS). */
export async function saveBusinessApprovalConfig(
  businessId: string,
  config: { bypass_all_approvals: boolean; auto_approve_below: number | null },
): Promise<void> {
  const { error } = await supabase
    .from('business_approval_config')
    .upsert({ business_id: businessId, ...config })
  if (error) throw error
}

/** §7.3: the centralized approval-decision helper. Best-effort, non-blocking. */
export async function isApprovalRequired(
  businessId: string,
  amount?: number,
  categoryId?: string,
): Promise<ApprovalRequiredResult> {
  try {
    const { data, error } = await supabase.rpc('is_approval_required', {
      p_business_id: businessId,
      p_amount: amount ?? null,
      p_category_id: categoryId ?? null,
    })
    if (error) throw error
    return (data as ApprovalRequiredResult) ?? { requires_approval: true, reason: 'Default' }
  } catch (e) {
    // Fail SAFE — require approval if the RPC isn't available.
    return { requires_approval: true, reason: 'Approval check unavailable — fail-safe' }
  }
}

// ============================================================================
// P0 #15 — AI plan recommendation at trial end (deterministic, evidence-based)
// ============================================================================

export interface PlanRecommendation {
  authorized: boolean
  in_trial?: boolean
  trial_ends_at?: string | null
  current_plan?: string
  recommended_plan?: string
  recommended_plan_name?: string
  recommended_price?: string
  should_upgrade?: boolean
  modules_used_count?: number
  modules_requiring_higher_count?: number
  used_modules?: string[]
  locked_modules?: string[]
  evidence?: string[]
  reasons?: string[]
  additional_value_unlocks?: string[]
  error?: string
}

/**
 * P0 #15: the AI plan recommendation. Deterministic — recommends the lowest
 * plan tier that covers every module the business actually used, with an
 * evidence-based rationale citing real usage (§22 — never fabricated). Best-
 * effort, non-blocking (§24).
 */
export async function fetchPlanRecommendation(businessId: string): Promise<PlanRecommendation | null> {
  try {
    const { data, error } = await supabase.rpc('recommend_plan', { p_business_id: businessId })
    if (error) throw error
    return (data as PlanRecommendation) ?? null
  } catch (e) {
    console.error('fetchPlanRecommendation failed (non-blocking):', e)
    return null
  }
}

// ============================================================================
// P0 #13 — Autonomous trial feature-discovery engine
// ============================================================================

export interface FeatureSuggestion {
  module_key: string
  display_name: string
  value_headline: string
  value_explanation: string
  explore_route: string
  value_estimate: number | null
  value_estimate_label: string | null
  viewed_but_unused: boolean
}

export interface FeatureDiscoveryResult {
  authorized: boolean
  current_tier?: number
  modules_used_count?: number
  suggestions: FeatureSuggestion[]
  error?: string
}

/**
 * P0 #13: the feature-discovery engine. Returns unexplored tools with plain-
 * language value propositions + REAL value estimates from the business's data.
 * Best-effort, non-blocking (§24).
 */
export async function fetchFeatureDiscovery(businessId: string): Promise<FeatureDiscoveryResult | null> {
  try {
    const { data, error } = await supabase.rpc('feature_discovery', { p_business_id: businessId })
    if (error) throw error
    return (data as FeatureDiscoveryResult) ?? null
  } catch (e) {
    console.error('fetchFeatureDiscovery failed (non-blocking):', e)
    return null
  }
}

/** Format a value estimate as naira (e.g. 45000 -> "₦45,000"). */
export function formatNaira(amount: number | null | undefined): string {
  if (amount == null || amount === 0) return ''
  return '₦' + Math.round(amount).toLocaleString()
}

// ============================================================================
// P0 #16 — Autonomous trial assistance
// ============================================================================

export interface TrialNudge {
  type: string
  headline: string
  body: string
  action_label: string
  action_route: string
}

export interface TrialAssistanceResult {
  authorized: boolean
  in_trial?: boolean
  trial_ends_at?: string | null
  days_left?: number
  phase?: string
  setup_complete?: boolean
  steps_reached?: number
  paid_modules_used?: number
  health_score?: number
  nudge?: TrialNudge | null
  error?: string
}

/**
 * P0 #16: the trial-assistance engine. Returns the ONE nudge that best moves
 * a trial user toward value, based on their trial phase + setup completeness +
 * feature usage. Deterministic (§22). Best-effort, non-blocking (§24).
 */
export async function fetchTrialAssistance(businessId: string): Promise<TrialAssistanceResult | null> {
  try {
    const { data, error } = await supabase.rpc('trial_assistance', { p_business_id: businessId })
    if (error) throw error
    return (data as TrialAssistanceResult) ?? null
  } catch (e) {
    console.error('fetchTrialAssistance failed (non-blocking):', e)
    return null
  }
}

// ============================================================================
// THE AVENIZE BUSINESS BRAIN — State + Diagnosis + Next Best Action + Value Ledger
// The four engines that turn isolated modules into one intelligent organism.
// ============================================================================

export interface BusinessState {
  state: string
  confidence: string
  reasons: Array<{ label: string; evidence: string; detail?: string }>
  signals?: Record<string, number | null>
  error?: boolean
  degraded?: boolean
}

export interface Diagnosis {
  rule_id: string
  symptom_metric: string
  symptom_change_pct: number
  cause_metric: string
  cause_change_pct: number
  relationship: string
  impact_amount: number | null
  severity: string
  evidence: { symptom: string; cause_link: string }
  headline: string
}

export interface DiagnosisResult {
  diagnoses: Diagnosis[]
  note?: string
  error?: boolean
  degraded?: boolean
}

export interface NextBestAction {
  action: {
    id: string
    rule_id?: string
    statement: string
    severity: string
    expected_impact?: { amount?: number; description?: string }
    action_type?: string
    _nba_score?: number
    _nba_reason?: string
    _nba_owner_id?: string | null
    _nba_due_at?: string
  } | null
  business_state?: string | null
  note?: string
  error?: boolean
  degraded?: boolean
}

export interface ValueLedger {
  total_value: number
  recovered: number
  saved: number
  generated: number
  identified: number
  recommendations_acted: number
  outcomes_recorded: number
  successful_outcomes: number
  recent?: unknown[]
  note?: string | null
  error?: boolean
  degraded?: boolean
}

export interface BusinessBrain {
  authorized: boolean
  state?: BusinessState
  pulse?: Record<string, unknown>
  diagnoses?: DiagnosisResult
  next_best_action?: NextBestAction
  value_ledger?: ValueLedger
  error?: boolean
  message?: string
}

/** The Business State Engine. Classifies the business (growing/stressed/at-risk/etc). Deterministic, best-effort. */
export async function classifyBusinessState(businessId: string): Promise<BusinessState | null> {
  try {
    const { data, error } = await supabase.rpc('classify_business_state', { p_business_id: businessId })
    if (error) throw error
    return (data as BusinessState) ?? null
  } catch (e) {
    console.error('classifyBusinessState failed (non-blocking):', e)
    return null
  }
}

/** The Diagnosis Engine. Cross-module causal reasoning (symptom=FACT, cause=INFERENCE). Deterministic, best-effort. */
export async function fetchDiagnoses(businessId: string): Promise<DiagnosisResult | null> {
  try {
    const { data, error } = await supabase.rpc('diagnose_business', { p_business_id: businessId })
    if (error) throw error
    return (data as DiagnosisResult) ?? null
  } catch (e) {
    console.error('fetchDiagnoses failed (non-blocking):', e)
    return null
  }
}

/** The Next Best Action engine. The SINGLE most valuable thing to do now. Deterministic, best-effort. */
export async function fetchNextBestAction(businessId: string): Promise<NextBestAction | null> {
  try {
    const { data, error } = await supabase.rpc('next_best_action', { p_business_id: businessId })
    if (error) throw error
    return (data as NextBestAction) ?? null
  } catch (e) {
    console.error('fetchNextBestAction failed (non-blocking):', e)
    return null
  }
}

/** The Business Value Ledger. "Avenize helped recover ₦X." Aggregates real outcomes. Deterministic, best-effort. */
export async function fetchValueLedger(businessId: string): Promise<ValueLedger | null> {
  try {
    const { data, error } = await supabase.rpc('business_value_ledger', { p_business_id: businessId })
    if (error) throw error
    return (data as ValueLedger) ?? null
  } catch (e) {
    console.error('fetchValueLedger failed (non-blocking):', e)
    return null
  }
}

/** The Avenize Business Brain. ONE call returns State + Pulse + Diagnoses + Next Best Action + Value Ledger. */
export async function fetchBusinessBrain(businessId: string): Promise<BusinessBrain | null> {
  try {
    const { data, error } = await supabase.rpc('business_brain', { p_business_id: businessId })
    if (error) throw error
    return (data as BusinessBrain) ?? null
  } catch (e) {
    console.error('fetchBusinessBrain failed (non-blocking):', e)
    return null
  }
}

/** §I Business Memory recall: prior similar problems + what was tried + the outcome. Deterministic, best-effort. */
export interface MemoryMatch {
  source: 'prior_diagnosis' | 'decision' | 'organizational_memory'
  title: string
  what_happened?: string | null
  what_was_tried?: string | null
  outcome?: string | null
  lesson?: string | null
  date?: string
  relevance: 'high' | 'medium' | 'low'
  evidence_tag: 'FACT' | 'INFERENCE'
  times_applied?: number | null
}
export interface RecallResult {
  authorized: boolean
  matches: MemoryMatch[]
  note?: string
}
export async function recallSimilarProblems(
  businessId: string,
  ruleId?: string | null,
  symptomMetric?: string | null
): Promise<RecallResult | null> {
  try {
    const { data, error } = await supabase.rpc('recall_similar_problems', {
      p_business_id: businessId,
      p_rule_id: ruleId ?? null,
      p_symptom_metric: symptomMetric ?? null,
    })
    if (error) throw error
    return (data as RecallResult) ?? null
  } catch (e) {
    console.error('recallSimilarProblems failed (non-blocking):', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Team invites + seat enforcement (migration 20260818330000)
// ---------------------------------------------------------------------------

export interface InviteResult {
  token: string | null
  joinUrl: string | null
  businessName: string | null
  seatAvailable: boolean
}

export async function createInvite(
  email: string,
  role: string,
  businessId?: string,
  memberKind: string = 'staff',
): Promise<InviteResult | null> {
  try {
    const { data, error } = await supabase.rpc('create_invite', {
      p_email: email,
      p_role: role,
      p_member_kind: memberKind,
      p_business_id: businessId ?? null,
    })
    if (error) throw error
    if (!data) return null
    return {
      token: data.p_token,
      joinUrl: data.p_join_url,
      businessName: data.p_business_name,
      seatAvailable: data.p_seat_available,
    }
  } catch (e) {
    console.error('createInvite failed:', e)
    return null
  }
}

export async function setMemberKind(staffId: string, memberKind: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('set_member_kind', {
      p_staff_id: staffId,
      p_member_kind: memberKind,
    })
    if (error) throw error
    return data === true
  } catch (e) {
    console.error('setMemberKind failed:', e)
    return false
  }
}

export async function revokeInvite(inviteId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('revoke_invite', { p_invite_id: inviteId })
    if (error) throw error
    return data === true
  } catch (e) {
    console.error('revokeInvite failed:', e)
    return false
  }
}

export interface PendingInvite {
  id: string
  email: string
  role: string
  token: string
  expires_at: string | null
  created_at: string
}

export async function fetchPendingInvites(businessId: string): Promise<PendingInvite[]> {
  try {
    const { data, error } = await supabase
      .from('invites')
      .select('id, email, role, token, expires_at, created_at')
      .eq('business_id', businessId)
      .eq('used', false)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as PendingInvite[]) ?? []
  } catch (e) {
    console.error('fetchPendingInvites failed (non-blocking):', e)
    return []
  }
}

// ---------------------------------------------------------------------------
// Board members (migration 20260818330000) — governance roster
// ---------------------------------------------------------------------------

export type BoardTitle =
  | 'Chair' | 'Vice Chair' | 'Director' | 'Secretary' | 'Treasurer' | 'Member' | 'Observer'

export interface BoardMember {
  id: string
  name: string
  email: string | null
  phone: string | null
  title: BoardTitle
  bio: string | null
  term_start: string | null
  term_end: string | null
  is_active: boolean
}

export async function fetchBoardMembers(businessId: string): Promise<BoardMember[]> {
  try {
    const { data, error } = await supabase
      .from('board_members')
      .select('id, name, email, phone, title, bio, term_start, term_end, is_active')
      .eq('business_id', businessId)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true })
    if (error) throw error
    return (data as BoardMember[]) ?? []
  } catch (e) {
    console.error('fetchBoardMembers failed (non-blocking):', e)
    return []
  }
}

export async function saveBoardMember(
  businessId: string,
  member: Partial<BoardMember> & { name: string; title: BoardTitle },
): Promise<boolean> {
  try {
    if (member.id) {
      const { error } = await supabase
        .from('board_members')
        .update({
          name: member.name,
          email: member.email ?? null,
          phone: member.phone ?? null,
          title: member.title,
          bio: member.bio ?? null,
          term_start: member.term_start ?? null,
          term_end: member.term_end ?? null,
          is_active: member.is_active ?? true,
        })
        .eq('id', member.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('board_members').insert({
        business_id: businessId,
        name: member.name,
        email: member.email ?? null,
        phone: member.phone ?? null,
        title: member.title,
        bio: member.bio ?? null,
        term_start: member.term_start ?? null,
        term_end: member.term_end ?? null,
        is_active: member.is_active ?? true,
      })
      if (error) throw error
    }
    return true
  } catch (e) {
    console.error('saveBoardMember failed:', e)
    return false
  }
}

export async function deleteBoardMember(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('board_members').delete().eq('id', id)
    if (error) throw error
    return true
  } catch (e) {
    console.error('deleteBoardMember failed:', e)
    return false
  }
}

// ============================================================================
// MEETING LIFECYCLE (Phase A — sections 6, 7, 9, 11, 12, 31, 32, 34)
// All best-effort/non-blocking (§24 — degrade gracefully if migration not
// deployed). Reuses the existing meetings table + emit_business_event
// telemetry (058/059 — NOT a new event system, per §2 non-negotiable).
// ============================================================================

export interface Meeting {
  id: string
  business_id: string
  title: string
  description: string | null
  meeting_type: string
  status: string
  scheduled_start: string | null
  scheduled_end: string | null
  actual_start: string | null
  actual_end: string | null
  duration_seconds: number | null
  recording_status: string
  transcript_status: string
  visibility: string
  created_by: string | null
  meeting_link: string | null
  created_at: string
}

export interface MeetingParticipant {
  id: string
  meeting_id: string
  staff_id: string | null
  guest_name: string | null
  guest_email: string | null
  guest_token: string | null
  role: string
  status: string
  invited_at: string | null
  joined_at: string | null
  left_at: string | null
  total_seconds: number
}

export interface MeetingParticipantEvent {
  id: string
  meeting_id: string
  participant_id: string
  event_type: string
  occurred_at: string
  metadata: Record<string, unknown> | null
}

export interface MeetingMedia {
  id: string
  meeting_id: string
  media_type: string
  storage_path: string | null
  duration_seconds: number | null
  size_bytes: number | null
  processing_status: string
  retention_until: string | null
  created_at: string
}

export interface CreateMeetingResult {
  meeting_id: string
  join_token: string
}

export async function createMeeting(
  businessId: string,
  title: string,
  opts?: {
    scheduledStart?: string
    scheduledEnd?: string
    meetingType?: string
    visibility?: string
    description?: string
    createdBy?: string
  }
): Promise<CreateMeetingResult | null> {
  try {
    const { data, error } = await supabase.rpc('create_meeting', {
      p_business_id: businessId,
      p_title: title,
      p_scheduled_start: opts?.scheduledStart ?? null,
      p_scheduled_end: opts?.scheduledEnd ?? null,
      p_meeting_type: opts?.meetingType ?? 'internal',
      p_visibility: opts?.visibility ?? 'business',
      p_description: opts?.description ?? null,
      p_created_by: opts?.createdBy ?? null,
    })
    if (error) {
      console.warn('[meetings] create_meeting failed:', error.message)
      return null
    }
    return data as CreateMeetingResult
  } catch (e) {
    console.warn('[meetings] create_meeting error:', e)
    return null
  }
}

export async function startMeeting(meetingId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('start_meeting', { p_meeting_id: meetingId })
    if (error) {
      console.warn('[meetings] start_meeting failed:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[meetings] start_meeting error:', e)
    return false
  }
}

export async function joinMeeting(
  meetingId: string,
  guestToken?: string
): Promise<{ participantId: string; authorized: boolean } | null> {
  try {
    const { data, error } = await supabase.rpc('join_meeting', {
      p_meeting_id: meetingId,
      p_guest_token: guestToken ?? null,
    })
    if (error) {
      console.warn('[meetings] join_meeting failed:', error.message)
      return null
    }
    const row = data as { participant_id: string; authorized: boolean } | null
    if (!row || !row.authorized) return null
    return { participantId: row.participant_id, authorized: true }
  } catch (e) {
    console.warn('[meetings] join_meeting error:', e)
    return null
  }
}

export async function leaveMeeting(meetingId: string, participantId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('leave_meeting', {
      p_meeting_id: meetingId,
      p_participant_id: participantId,
    })
    if (error) {
      console.warn('[meetings] leave_meeting failed:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[meetings] leave_meeting error:', e)
    return false
  }
}

export async function endMeeting(meetingId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('end_meeting', { p_meeting_id: meetingId })
    if (error) {
      console.warn('[meetings] end_meeting failed:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[meetings] end_meeting error:', e)
    return false
  }
}

export async function generateMeetingToken(
  meetingId: string,
  guestEmail: string,
  guestName?: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('generate_meeting_token', {
      p_meeting_id: meetingId,
      p_guest_email: guestEmail,
      p_guest_name: guestName ?? null,
    })
    if (error) {
      console.warn('[meetings] generate_meeting_token failed:', error.message)
      return null
    }
    return data as string
  } catch (e) {
    console.warn('[meetings] generate_meeting_token error:', e)
    return null
  }
}

export async function fetchMeetings(businessId: string): Promise<Meeting[]> {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('business_id', businessId)
      .order('scheduled_start', { ascending: false, nullsFirst: false })
    if (error) {
      console.warn('[meetings] fetch failed:', error.message)
      return []
    }
    return (data as Meeting[]) ?? []
  } catch (e) {
    console.warn('[meetings] fetch error:', e)
    return []
  }
}

export async function fetchMeetingParticipants(meetingId: string): Promise<MeetingParticipant[]> {
  try {
    const { data, error } = await supabase
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('joined_at', { ascending: true, nullsFirst: false })
    if (error) {
      console.warn('[meetings] fetch participants failed:', error.message)
      return []
    }
    return (data as MeetingParticipant[]) ?? []
  } catch (e) {
    console.warn('[meetings] fetch participants error:', e)
    return []
  }
}

export async function fetchMeetingEvidence(meetingId: string): Promise<MeetingParticipantEvent[]> {
  try {
    const { data, error } = await supabase
      .from('meeting_participant_events')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('occurred_at', { ascending: true })
    if (error) {
      console.warn('[meetings] fetch evidence failed:', error.message)
      return []
    }
    return (data as MeetingParticipantEvent[]) ?? []
  } catch (e) {
    console.warn('[meetings] fetch evidence error:', e)
    return []
  }
}

// ============================================================================
// MEETING RECORDING + CAPTURE (Phase B — sections 6, 13, 14, 32, 34)
// Signed-URL access (never getPublicUrl — section 32 security fix).
// Loom-style async captures. All best-effort/non-blocking (§24).
// ============================================================================

export interface MeetingCapture {
  id: string
  business_id: string
  meeting_id: string | null
  creator_id: string | null
  title: string
  description: string | null
  capture_type: 'screen' | 'camera' | 'screen_with_camera' | 'audio_only'
  storage_path: string | null
  duration_seconds: number | null
  size_bytes: number | null
  processing_status: 'pending' | 'processing' | 'available' | 'failed' | 'expired'
  view_count: number
  retention_until: string | null
  deleted_at: string | null
  created_at: string
}

export interface RecordingMedia {
  id: string
  meeting_id: string
  media_type: string
  storage_path: string | null
  duration_seconds: number | null
  size_bytes: number | null
  processing_status: string
  created_at: string
}

export interface CreateCaptureResult {
  captureId: string
  uploadPath: string
}

export async function createCapture(
  title: string,
  captureType: 'screen' | 'camera' | 'screen_with_camera' | 'audio_only' = 'screen',
  opts?: { description?: string; meetingId?: string }
): Promise<CreateCaptureResult | null> {
  try {
    const { data, error } = await supabase.rpc('create_capture', {
      p_title: title,
      p_capture_type: captureType,
      p_description: opts?.description ?? null,
      p_meeting_id: opts?.meetingId ?? null,
    })
    if (error) {
      console.warn('[meetings] create_capture failed:', error.message)
      return null
    }
    const row = data as { capture_id: string; upload_path: string } | null
    if (!row) return null
    return { captureId: row.capture_id, uploadPath: row.upload_path }
  } catch (e) {
    console.warn('[meetings] create_capture error:', e)
    return null
  }
}

export async function uploadRecording(
  uploadPath: string,
  blob: Blob
): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from('meeting-recordings')
      .upload(uploadPath, blob, { upsert: false })
    if (error) {
      console.warn('[meetings] upload failed:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[meetings] upload error:', e)
    return false
  }
}

export async function finalizeRecording(
  storagePath: string,
  opts?: { durationSeconds?: number; sizeBytes?: number; meetingId?: string; captureId?: string }
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('finalize_recording', {
      p_storage_path: storagePath,
      p_duration_seconds: opts?.durationSeconds ?? null,
      p_size_bytes: opts?.sizeBytes ?? null,
      p_meeting_id: opts?.meetingId ?? null,
      p_capture_id: opts?.captureId ?? null,
    })
    if (error) {
      console.warn('[meetings] finalize_recording failed:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[meetings] finalize_recording error:', e)
    return false
  }
}

export async function getRecordingSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  try {
    // The RPC verifies authorization (business membership). The actual signed
    // URL is generated by the Supabase storage API. This is the section-32
    // security fix: NEVER getPublicUrl on a private bucket.
    const { data: authPath, error: authError } = await supabase.rpc(
      'generate_recording_signed_url',
      { p_storage_path: storagePath, p_expires_seconds: expiresInSeconds }
    )
    if (authError || !authPath) {
      console.warn('[meetings] recording access denied (auth gate)')
      return null
    }
    const { data } = await supabase.storage
      .from('meeting-recordings')
      .createSignedUrl(authPath as string, expiresInSeconds)
    return data?.signedUrl ?? null
  } catch (e) {
    console.warn('[meetings] getRecordingSignedUrl error:', e)
    return null
  }
}

export async function fetchCaptures(): Promise<MeetingCapture[]> {
  try {
    const { data, error } = await supabase
      .from('meeting_captures')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('[meetings] fetch captures failed:', error.message)
      return []
    }
    return (data as MeetingCapture[]) ?? []
  } catch (e) {
    console.warn('[meetings] fetch captures error:', e)
    return []
  }
}

export async function fetchMeetingRecordings(
  meetingId: string
): Promise<RecordingMedia[]> {
  try {
    const { data, error } = await supabase
      .from('meeting_media')
      .select('*')
      .eq('meeting_id', meetingId)
      .eq('media_type', 'recording')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('[meetings] fetch recordings failed:', error.message)
      return []
    }
    return (data as RecordingMedia[]) ?? []
  } catch (e) {
    console.warn('[meetings] fetch recordings error:', e)
    return []
  }
}

export async function incrementCaptureView(captureId: string): Promise<void> {
  try {
    await supabase.rpc('increment_capture_view', { p_capture_id: captureId })
  } catch {
    // fire-and-forget — view count is non-critical
  }
}

// ============================================================================
// MEETING TRANSCRIPT + SUMMARY + DECISIONS + ACTIONS (Phase C — §6,7,9,12)
// Relational transcript storage + structured decisions/actions.
// Actions link to REAL tasks (004) — NOT a parallel task system.
// ============================================================================

export interface TranscriptSegment {
  id: string
  segment_index: number
  start_time_ms: number
  end_time_ms: number
  text: string
  speaker: string | null
  confidence: number | null
}

export interface MeetingDecision {
  id: string
  meeting_id: string
  decision_text: string
  rationale: string | null
  decided_by: string | null
  timestamp_ms: number | null
  status: 'proposed' | 'decided' | 'reversed' | 'superseded'
  created_at: string
}

export interface MeetingAction {
  id: string
  meeting_id: string
  decision_id: string | null
  task_id: string | null
  action_text: string
  assignee_id: string | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'completed' | 'cancelled' | 'deferred'
  timestamp_ms: number | null
  created_at: string
}

export interface MeetingIntelligence {
  meeting: {
    id: string
    title: string
    status: string
    transcript_status: string
  }
  transcripts: Array<{
    id: string
    full_text: string
    language: string
    duration_seconds: number | null
    word_count: number | null
    created_at: string
  }>
  segments: TranscriptSegment[]
  summaries: Array<{
    id: string
    summary: string
    key_points: string[] | null
  }>
  decisions: MeetingDecision[]
  actions: MeetingAction[]
}

export async function fetchMeetingIntelligence(
  meetingId: string
): Promise<MeetingIntelligence | null> {
  try {
    const { data, error } = await supabase.rpc('get_meeting_intelligence', {
      p_meeting_id: meetingId,
    })
    if (error) {
      console.warn('[meetings] fetch intelligence failed:', error.message)
      return null
    }
    return data as MeetingIntelligence | null
  } catch (e) {
    console.warn('[meetings] fetch intelligence error:', e)
    return null
  }
}

export async function createActionTask(
  actionId: string,
  title: string,
  opts?: { assigneeId?: string; dueDate?: string; priority?: string }
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('create_action_task', {
      p_action_id: actionId,
      p_title: title,
      p_assignee_id: opts?.assigneeId ?? null,
      p_due_date: opts?.dueDate ?? null,
      p_priority: opts?.priority ?? 'medium',
    })
    if (error) {
      console.warn('[meetings] create_action_task failed:', error.message)
      return null
    }
    return data as string | null
  } catch (e) {
    console.warn('[meetings] create_action_task error:', e)
    return null
  }
}

export async function updateActionStatus(
  actionId: string,
  status: MeetingAction['status']
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('meeting_actions')
      .update({ status })
      .eq('id', actionId)
    if (error) {
      console.warn('[meetings] update action status failed:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[meetings] update action status error:', e)
    return false
  }
}

export async function searchTranscripts(
  query: string,
  limit = 20
): Promise<Array<{
  segment_id: string
  text: string
  start_time_ms: number
  meeting_id: string
  meeting_title: string
  transcript_id: string
}>> {
  try {
    const { data, error } = await supabase.rpc('search_transcripts', {
      p_query: query,
      p_limit: limit,
    })
    if (error) {
      console.warn('[meetings] search transcripts failed:', error.message)
      return []
    }
    return (data as any[]) ?? []
  } catch (e) {
    console.warn('[meetings] search transcripts error:', e)
    return []
  }
}

// ============================================================================
// MEETING REPORT + NOTIFICATIONS (Phase D — §6,7,11,12,25)
// Composed post-meeting report (snapshot) + attendee notifications.
// ============================================================================

export interface MeetingReport {
  id: string
  meeting_id: string
  report_data: {
    meeting: {
      id: string
      title: string
      date: string
      start_time: string
      end_time?: string
      location?: string
      meeting_link?: string
    }
    summary: string
    key_points: string[]
    decisions: Array<{
      id: string
      text: string
      rationale: string | null
      status: string
      timestamp_ms: number | null
    }>
    actions: Array<{
      id: string
      text: string
      assignee_id: string | null
      due_date: string | null
      priority: string
      status: string
      task_id: string | null
    }>
    attendees: unknown[]
    generated_at: string
    generated_by: string
  }
  sent_to: string[]
  sent_at: string | null
  created_at: string
}

export async function generateMeetingReport(
  meetingId: string,
  sendNotifications = true
): Promise<{ reportId: string; reportData: MeetingReport['report_data']; notified: number } | null> {
  try {
    const { data, error } = await supabase.rpc('generate_meeting_report', {
      p_meeting_id: meetingId,
      p_send_notifications: sendNotifications,
    })
    if (error) {
      console.warn('[meetings] generate report failed:', error.message)
      return null
    }
    const row = data as { report_id: string; report_data: MeetingReport['report_data']; notified: number } | null
    if (!row) return null
    return { reportId: row.report_id, reportData: row.report_data, notified: row.notified }
  } catch (e) {
    console.warn('[meetings] generate report error:', e)
    return null
  }
}

export async function fetchMeetingReports(
  meetingId: string
): Promise<MeetingReport[]> {
  try {
    const { data, error } = await supabase.rpc('get_meeting_reports', {
      p_meeting_id: meetingId,
    })
    if (error) {
      console.warn('[meetings] fetch reports failed:', error.message)
      return []
    }
    return (data as MeetingReport[]) ?? []
  } catch (e) {
    console.warn('[meetings] fetch reports error:', e)
    return []
  }
}

// ============================================================================
// MEETING ANALYTICS (Phase E — §6,9,12 productivity intelligence)
// ============================================================================

export interface MeetingAnalytics {
  period_days: number
  totals: {
    total_meetings: number
    total_hours: number
    meetings_with_transcripts: number
    total_decisions: number
    total_actions: number
  }
  action_completion_pct: number | null
  wasted_meetings: Array<{
    meeting_id: string
    title: string
    date: string
    duration_hours: number | null
  }>
  wasted_meetings_count: number
  per_staff: Array<{
    staff_id: string
    staff_name: string
    meetings_created: number
    meetings_attended: number
  }>
  per_status: Array<{ status: string; count: number }>
  small_data_note: string | null
}

export async function fetchMeetingAnalytics(
  periodDays = 30
): Promise<MeetingAnalytics | null> {
  try {
    const { data, error } = await supabase.rpc('meeting_analytics', {
      p_period_days: periodDays,
    })
    if (error) {
      console.warn('[meetings] fetch analytics failed:', error.message)
      return null
    }
    return data as MeetingAnalytics | null
  } catch (e) {
    console.warn('[meetings] fetch analytics error:', e)
    return null
  }
}

// =============================================================================
// Internal Receipt OCR (20260819020000) — upload -> OCR -> extract -> confirm
// =============================================================================

export interface ReceiptDocument {
  id: string
  business_id: string
  uploaded_by: string | null
  storage_path: string
  original_filename: string | null
  status: 'uploaded' | 'processing' | 'extracted' | 'confirmed' | 'rejected'
  raw_text?: string | null
  vendor: string | null
  receipt_number: string | null
  receipt_date: string | null
  currency: string
  subtotal: number | null
  tax: number | null
  discount: number | null
  total: number | null
  payment_method: string | null
  category: string | null
  expense_account: string | null
  line_items: Array<{ description: string; amount: number; quantity?: number }>
  field_confidence: Record<string, string>
  overall_confidence: number | null
  linked_transaction_id: string | null
  confirmed_at: string | null
  created_at: string
}

export async function createReceiptUploadPath(
  filename: string,
): Promise<{ receiptId: string; storagePath: string } | null> {
  try {
    const { data, error } = await supabase.rpc('create_receipt_upload_path', {
      p_filename: filename,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return null
    return { receiptId: row.p_receipt_id, storagePath: row.p_storage_path }
  } catch (e) {
    console.error('[receipts] create upload path failed:', e)
    return null
  }
}

export async function finalizeReceiptExtraction(
  receiptId: string,
  rawText: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('finalize_receipt_extraction', {
      p_receipt_id: receiptId,
      p_raw_text: rawText,
      p_fields: fields,
    })
    if (error) throw error
    return data === true
  } catch (e) {
    console.error('[receipts] finalize extraction failed:', e)
    return false
  }
}

export async function confirmReceipt(receiptId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('confirm_receipt', {
      p_receipt_id: receiptId,
    })
    if (error) throw error
    return data as string | null
  } catch (e) {
    console.error('[receipts] confirm failed:', e)
    return null
  }
}

export async function rejectReceipt(receiptId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('reject_receipt', {
      p_receipt_id: receiptId,
    })
    if (error) throw error
    return data === true
  } catch (e) {
    console.error('[receipts] reject failed:', e)
    return false
  }
}

export async function fetchReceipts(): Promise<ReceiptDocument[]> {
  try {
    const { data, error } = await supabase
      .from('receipt_documents')
      .select(
        'id, business_id, uploaded_by, storage_path, original_filename, status, vendor, receipt_number, receipt_date, currency, subtotal, tax, discount, total, payment_method, category, expense_account, line_items, field_confidence, overall_confidence, linked_transaction_id, confirmed_at, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return (data || []) as ReceiptDocument[]
  } catch (e) {
    console.warn('[receipts] fetch failed (migration may not be deployed):', e)
    return []
  }
}

export async function receiptSignedUrl(storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(storagePath, 300)
    if (error) throw error
    return data?.signedUrl ?? null
  } catch (e) {
    console.warn('[receipts] signed url failed:', e)
    return null
  }
}


// ---------- Discovery Intelligence (20260819090000 / Phase B) ----------
// SEO/AEO/GEO/AIO as one product layer. Every wrapper is best-effort and
// non-blocking (§24): returns null/empty when the migration isn't deployed.

export interface DiscoveryOverview {
  authorized: boolean
  targets?: number
  observations_30d?: number
  present_30d?: number
  cited_30d?: number
  presence_rate?: number | null
  citation_rate?: number | null
  brand_checks?: number
  brand_mismatches?: number
  open_mismatches?: number
  opportunities?: Record<string, number>
  referrals?: number
  referrals_30d?: number
  engines?: { engine: string; checks: number; present: number; cited: number }[]
  trend?: { week: string; checks: number; present: number; cited: number }[]
}

export interface DiscoveryLeaderboardRow {
  target_id: string
  query: string
  cluster: string
  kind: 'seo' | 'aeo' | 'geo'
  checks: number
  avenize_present: number
  avenize_cited: number
  top_competitors: { name: string; cited: number }[]
  last_observed_at: string | null
}

export interface DiscoveryBrandTruthRow {
  truth_id: string
  aspect: string
  expected_statement: string
  latest_ai_statement: string | null
  latest_engine: string | null
  latest_mismatch: boolean | null
  latest_severity: string | null
  open_checks: number
}

export interface DiscoveryRoi {
  authorized: boolean
  referrals?: number
  linked?: number
  by_source?: { source: string; visits: number; linked: number }[]
  deal_revenue?: number
  subscription_revenue?: number
  attributed_revenue?: number
  note?: string | null
}

export interface ContentOpportunity {
  id: string
  business_id: string
  title: string
  cluster: string
  rationale: string | null
  search_intent: string | null
  target_audience: string | null
  supporting_topics: string[]
  internal_links: string[]
  evidence_required: string | null
  conversion_goal: string | null
  priority_score: number
  status: 'suggested' | 'approved' | 'in_progress' | 'published' | 'rejected'
  originality_confirmed: boolean
  evidence_confirmed: boolean
  human_reviewed: boolean
  published_url: string | null
  created_at: string
}

export interface DiscoveryTarget {
  id: string
  business_id: string
  query: string
  cluster: string
  kind: 'seo' | 'aeo' | 'geo'
  priority: number
  active: boolean
}

export async function seedDiscoveryDefaults(businessId: string) {
  try {
    const { data, error } = await supabase.rpc('seed_discovery_defaults', { p_business_id: businessId })
    if (error) throw error
    return data as { authorized: boolean; truths: number; targets: number }
  } catch (e) {
    console.warn('[discovery] seed failed (migration may not be deployed):', e)
    return null
  }
}

export async function fetchDiscoveryOverview(businessId: string): Promise<DiscoveryOverview | null> {
  try {
    const { data, error } = await supabase.rpc('discovery_overview', { p_business_id: businessId })
    if (error) throw error
    return (data as DiscoveryOverview) ?? null
  } catch (e) {
    console.warn('[discovery] overview failed:', e)
    return null
  }
}

export async function fetchDiscoveryLeaderboard(businessId: string): Promise<DiscoveryLeaderboardRow[]> {
  try {
    const { data, error } = await supabase.rpc('discovery_query_leaderboard', { p_business_id: businessId })
    if (error) throw error
    return (data || []) as DiscoveryLeaderboardRow[]
  } catch (e) {
    console.warn('[discovery] leaderboard failed:', e)
    return []
  }
}

export async function fetchDiscoveryBrandTruths(businessId: string): Promise<DiscoveryBrandTruthRow[]> {
  try {
    const { data, error } = await supabase.rpc('discovery_brand_truth_report', { p_business_id: businessId })
    if (error) throw error
    return (data || []) as DiscoveryBrandTruthRow[]
  } catch (e) {
    console.warn('[discovery] brand truths failed:', e)
    return []
  }
}

export async function fetchDiscoveryRoi(businessId: string): Promise<DiscoveryRoi | null> {
  try {
    const { data, error } = await supabase.rpc('discovery_roi', { p_business_id: businessId })
    if (error) throw error
    return (data as DiscoveryRoi) ?? null
  } catch (e) {
    console.warn('[discovery] roi failed:', e)
    return null
  }
}

export async function recordDiscoveryReferral(
  businessId: string,
  attribution: {
    source?: string | null
    medium?: string | null
    campaign?: string | null
    contentUrl?: string | null
    referrer?: string | null
    landingPath?: string | null
    entityType?: string | null
    entityId?: string | null
  },
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('record_discovery_referral', {
      p_business_id: businessId,
      p_source: attribution.source ?? null,
      p_medium: attribution.medium ?? null,
      p_campaign: attribution.campaign ?? null,
      p_content_url: attribution.contentUrl ?? null,
      p_referrer: attribution.referrer ?? null,
      p_landing_path: attribution.landingPath ?? null,
      p_entity_type: attribution.entityType ?? null,
      p_entity_id: attribution.entityId ?? null,
    })
    if (error) throw error
    return (data as string) ?? null
  } catch (e) {
    console.warn('[discovery] referral record failed:', e)
    return null
  }
}
