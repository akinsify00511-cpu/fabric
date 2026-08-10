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
