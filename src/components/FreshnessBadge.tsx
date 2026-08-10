// Freshness badge — rendered on real-time views per Architecture §8.
// Shows last-update time and a staleness tier so users never trust a
// number without knowing how current it is.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchFreshness, FRESHNESS_META, type FreshnessTier } from '../lib/businessOS'

interface Props {
  businessId: string
  entityType: string
  entityId?: string
  compact?: boolean
}

export default function FreshnessBadge({ businessId, entityType, entityId, compact }: Props) {
  const [tier, setTier] = useState<FreshnessTier>('unknown')
  const [seconds, setSeconds] = useState<number | null>(null)
  const [at, setAt] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const rows = await fetchFreshness(businessId, entityType)
        const row = entityId
          ? rows.find(r => r.entity_id === entityId)
          : rows[0]
        if (active && row) {
          setTier(row.freshness_tier)
          setSeconds(row.seconds_since_update)
          setAt(row.last_event_at)
        }
      } catch {
        /* no freshness row yet */
      }
    })()
    return () => { active = false }
  }, [businessId, entityType, entityId])

  const meta = FRESHNESS_META[tier]
  const ago = formatAgo(seconds)

  return (
    <span
      title={at ? `Last updated ${new Date(at).toLocaleString()}` : 'No recorded updates'}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ backgroundColor: meta.color + '14', color: meta.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {!compact && meta.label}
      {ago && <span className="opacity-70">· {ago}</span>}
    </span>
  )
}

function formatAgo(s: number | null): string {
  if (s == null) return ''
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

// Convenience: a live-list of recent business events for the observer view.
export function useRecentEvents(businessId: string | undefined, limit = 25) {
  const [events, setEvents] = useState<any[]>([])
  useEffect(() => {
    if (!businessId) return
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from('business_events')
          .select('id,event_type,entity_type,entity_id,payload,occurred_at,source')
          .eq('business_id', businessId)
          .order('occurred_at', { ascending: false })
          .limit(limit)
        if (active) setEvents(data || [])
      } catch { /* noop */ }
    })()
    const channel = supabase
      .channel(`events-${businessId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'business_events', filter: `business_id=eq.${businessId}` },
        (payload: any) => { if (active) setEvents(prev => [payload.new, ...prev].slice(0, limit)) })
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [businessId, limit])
  return events
}
