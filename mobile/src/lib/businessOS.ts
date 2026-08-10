// Mobile businessOS client — typed wrappers over the event bus, freshness,
// and intelligence RPCs. Mirrors src/lib/businessOS.ts on web so both
// surfaces behave identically.

import { supabase } from './supabase'

export type BusinessEvent = {
  id: string
  event_type: string
  entity_type: string
  entity_id: string | null
  payload: Record<string, any>
  occurred_at: string
}

export type FreshnessTier = 'fresh' | 'today' | 'stale' | 'old' | 'unknown'

export async function raiseEvent(params: {
  business_id: string
  event_type: string
  entity_type: string
  entity_id?: string
  payload?: Record<string, any>
  source?: string
}): Promise<BusinessEvent | null> {
  const { data, error } = await supabase.rpc('emit_business_event', {
    p_business_id: params.business_id,
    p_event_type: params.event_type,
    p_entity_type: params.entity_type,
    p_entity_id: params.entity_id ?? null,
    p_payload: params.payload ?? {},
    p_source: params.source ?? 'mobile',
  })
  if (error) { console.warn('[raiseEvent]', error.message); return null }
  return data as BusinessEvent
}

export async function observerSnapshot(businessId: string) {
  const { data, error } = await supabase.rpc('observer_snapshot', { p_business_id: businessId })
  if (error) { console.warn('[observer]', error.message); return null }
  return data
}

export async function intelligenceIndexes(businessId: string) {
  const { data, error } = await supabase.rpc('intelligence_indexes', { p_business_id: businessId })
  if (error) return null
  return data
}

export async function openExceptions(businessId: string) {
  const { data, error } = await supabase
    .from('attention_exceptions')
    .select('*')
    .eq('business_id', businessId)
    .eq('resolved', false)
    .order('detected_at', { ascending: false })
    .limit(20)
  if (error) return []
  return data
}

export async function recentEvents(businessId: string, limit = 15) {
  const { data, error } = await supabase
    .from('business_events')
    .select('*')
    .eq('business_id', businessId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data as BusinessEvent[]) ?? []
}

// Offline-tolerant: parse-intent calls the edge function; on failure we
// return a structured error instead of throwing so the UI degrades.
// The edge function returns { intent, guardrail, actor_id }.
export async function parseIntent(text: string, businessId: string) {
  const { data: fn } = await supabase.functions.invoke('parse-intent', {
    body: { text, business_id: businessId },
  })
  return fn?.intent ?? fn
}
