import { supabase } from './supabase'

export type ActivitySeverity = 'info' | 'warn' | 'error' | 'critical'

export interface PlatformActivityEvent {
  id: number
  event_type: string
  actor_email?: string | null
  business_name?: string | null
  feature?: string | null
  result?: string | null
  severity: ActivitySeverity
  service?: string | null
  correlation_id?: string | null
  payload?: Record<string, unknown>
  created_at: string
}

export interface ActivityFeed {
  authorized: boolean
  events: PlatformActivityEvent[]
}

export interface GlobalSearchResult {
  authorized: boolean
  users: Array<{ email: string; created_at: string }>
  organizations: Array<{ id: string; name: string; industry?: string | null }>
  events: Array<{ event_type: string; feature?: string; severity: string; created_at: string }>
  incidents: Array<{ id: string; title: string; status: string; created_at: string }>
  rpcs: Array<{ proname: string }>
}

export interface SecurityCenter {
  authorized: boolean
  failed_logins?: number
  mfa_failures?: number
  permission_changes?: number
  admin_actions?: number
  rls_violations?: number
  tenant_isolation_violations?: number
  suspicious?: number
  critical_stream?: Array<Pick<PlatformActivityEvent, 'event_type' | 'actor_email' | 'feature' | 'result' | 'created_at'>>
}

export interface SelfHealingSummary {
  authorized: boolean
  detected?: number
  repaired?: number
  failed?: number
  awaiting_approval?: number
  rolled_back?: number
  recent_repairs?: Array<{
    rule_key: string
    repair_action: string
    status: string
    dry_run: boolean
    started_at?: string
    completed_at?: string
    error_message?: string | null
  }>
}

export interface AiActivity {
  authorized: boolean
  requests?: number
  completed?: number
  failed?: number
  avg_duration_ms?: number | null
  success_rate?: number | null
  by_feature?: Record<string, number>
  recent?: Array<PlatformActivityEvent & { duration_ms?: string }>
}

export interface BillingActivity {
  authorized: boolean
  by_plan?: Record<string, number>
  by_status?: Record<string, number>
  recent?: Array<{ business: string; plan: string; status: string; updated_at: string }>
}

export interface PlatformAnalytics {
  authorized: boolean
  dau?: number
  wau?: number
  mau?: number
  signups_30d?: number
  organizations?: number
  module_adoption_30d?: Array<{ module: string; touches: number; businesses: number }>
  ai_events_30d?: number
}

function unwrap<T>(data: unknown, fallback: T): T {
  const o = Array.isArray(data) ? data[0] : data
  return (o as T) ?? fallback
}

export async function fetchActivityFeed(opts: {
  limit?: number
  eventType?: string | null
  severity?: string | null
  businessId?: string | null
  actorEmail?: string | null
} = {}): Promise<ActivityFeed> {
  const { data, error } = await supabase.rpc('riverways_activity_feed', {
    p_limit: opts.limit ?? 100,
    p_event_type: opts.eventType ?? null,
    p_severity: opts.severity ?? null,
    p_business_id: opts.businessId ?? null,
    p_actor_email: opts.actorEmail ?? null,
  })
  if (error) return { authorized: false, events: [] }
  return unwrap<ActivityFeed>(data, { authorized: false, events: [] })
}

export async function globalSearch(q: string): Promise<GlobalSearchResult> {
  const { data, error } = await supabase.rpc('riverways_global_search', { p_q: q })
  if (error) return { authorized: false, users: [], organizations: [], events: [], incidents: [], rpcs: [] }
  return unwrap<GlobalSearchResult>(data, { authorized: false, users: [], organizations: [], events: [], incidents: [], rpcs: [] })
}

export async function fetchUserActivity(email: string) {
  const { data, error } = await supabase.rpc('riverways_user_activity', { p_email: email })
  if (error) return { authorized: false, counts: {}, recent: [] }
  return unwrap<{ authorized: boolean; counts: Record<string, number>; recent: PlatformActivityEvent[] }>(data, { authorized: false, counts: {}, recent: [] })
}

export async function fetchOrgActivity(businessId: string) {
  const { data, error } = await supabase.rpc('riverways_org_activity', { p_business_id: businessId })
  if (error) return { authorized: false }
  return unwrap<{ authorized: boolean; business?: string; members?: number; feature_counts?: Record<string, number>; recent?: PlatformActivityEvent[] }>(data, { authorized: false })
}

export async function fetchAiActivity(limit = 100): Promise<AiActivity> {
  const { data, error } = await supabase.rpc('riverways_ai_activity', { p_limit: limit })
  if (error) return { authorized: false }
  return unwrap<AiActivity>(data, { authorized: false })
}

export async function fetchBillingActivity(): Promise<BillingActivity> {
  const { data, error } = await supabase.rpc('riverways_billing_activity')
  if (error) return { authorized: false }
  return unwrap<BillingActivity>(data, { authorized: false })
}

export async function fetchSecurityCenter(): Promise<SecurityCenter> {
  const { data, error } = await supabase.rpc('riverways_security_center')
  if (error) return { authorized: false }
  return unwrap<SecurityCenter>(data, { authorized: false })
}

export async function fetchErrorCenter() {
  const { data, error } = await supabase.rpc('riverways_error_center')
  if (error) return { authorized: false, incidents: [], recent_errors: [] }
  return unwrap<{ authorized: boolean; incidents: Array<Record<string, unknown>>; recent_errors: Array<Record<string, unknown>> }>(data, { authorized: false, incidents: [], recent_errors: [] })
}

export async function fetchSelfHealing(): Promise<SelfHealingSummary> {
  const { data, error } = await supabase.rpc('riverways_self_healing')
  if (error) return { authorized: false }
  return unwrap<SelfHealingSummary>(data, { authorized: false })
}

export async function fetchPlatformAnalytics(): Promise<PlatformAnalytics> {
  const { data, error } = await supabase.rpc('riverways_platform_analytics')
  if (error) return { authorized: false }
  return unwrap<PlatformAnalytics>(data, { authorized: false })
}

/** Fire-and-forget activity emission from the SPA. Never blocks UX, never
 * throws. The server sanitizes the payload (credential keys stripped) and
 * fills actor from the session — do NOT pass secrets in `payload`. */
export function logPlatformActivity(
  eventType: string,
  opts: {
    feature?: string
    businessId?: string | null
    result?: 'started' | 'completed' | 'failed' | 'succeeded'
    severity?: ActivitySeverity
    correlationId?: string
    payload?: Record<string, unknown>
  } = {},
): void {
  supabase
    .rpc('emit_platform_activity', {
      p_event_type: eventType,
      p_feature: opts.feature ?? null,
      p_business_id: opts.businessId ?? null,
      p_result: opts.result ?? 'completed',
      p_severity: opts.severity ?? 'info',
      p_service: 'web-app',
      p_correlation_id: opts.correlationId ?? null,
      p_payload: opts.payload ?? {},
    })
    .then(() => undefined, () => undefined)
}
