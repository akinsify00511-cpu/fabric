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
// triggers; they fire when a date approaches. These wrappers let the app
// run them on demand (e.g. a cockpit "refresh pulse"). pg_cron runs them
// daily on the server; best-effort and non-blocking.

export async function detectContractsExpiring(windowDays = 30): Promise<number> {
  const { data, error } = await supabase.rpc('detect_contracts_expiring', { p_window_days: windowDays })
  if (error) return 0
  return (data as number) ?? 0
}

export async function detectPayrollDue(windowDays = 7): Promise<number> {
  const { data, error } = await supabase.rpc('detect_payroll_due', { p_window_days: windowDays })
  if (error) return 0
  return (data as number) ?? 0
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
