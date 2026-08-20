import { supabase } from './supabase'

/** Analytics is telemetry. It must never block auth/onboarding. */
export function recordAnalyticsEventSafe(input: {
  businessId?: string | null
  userId?: string | null
  eventName: string
  category?: string | null
  page?: string | null
  component?: string | null
  action?: string | null
  metadata?: Record<string, unknown>
  durationMs?: number | null
  sessionId?: string | null
}) {
  const payload = {
    p_business_id: input.businessId ?? null,
    p_user_id: input.userId ?? null,
    p_event_name: input.eventName,
    p_category: input.category ?? null,
    p_page: input.page ?? null,
    p_component: input.component ?? null,
    p_action: input.action ?? null,
    p_metadata: input.metadata ?? {},
    p_duration_ms: input.durationMs ?? null,
    p_session_id: input.sessionId ?? null,
  }

  void supabase.rpc('record_analytics_event', payload).then(
    () => undefined,
    () => undefined,
  )
}
