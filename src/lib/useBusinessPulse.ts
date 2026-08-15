import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from './supabase'

/**
 * useBusinessPulse — the brain's realtime sense of the body.
 *
 * Subscribes to the `business_events` table (the central event bus, 058)
 * via Supabase Realtime. Every time ANY part of the business moves — a
 * deal won, a payment received, inventory low, a contract expiring, a
 * campaign converted, payroll due — an event row is inserted (by the DB
 * triggers in 059/090/109 or by AICapture's emitBusinessEvent), and this
 * hook fires, delivering the event to the UI live.
 *
 * This is what makes the app feel like one organism: the cockpit/activity
 * feed/notifications all react to the same pulse without each page polling.
 *
 * The hook is business-scoped (RLS on business_events ensures a staff
 * member only sees their own business's events) and best-effort (realtime
 * failures are swallowed — the app still works, just without live updates).
 */

export interface BusinessPulseEvent {
  id: string
  event_type: string
  entity_type: string
  entity_id: string | null
  payload: Record<string, any>
  source: string
  occurred_at: string
}

const MAX_PULSE_EVENTS = 50

export function useBusinessPulse(businessId?: string) {
  const [events, setEvents] = useState<BusinessPulseEvent[]>([])
  const [live, setLive] = useState(false)
  const loadedRef = useRef(false)

  // Seed with the most recent events on mount / business change.
  useEffect(() => {
    if (!businessId) {
      setEvents([])
      loadedRef.current = false
      return
    }
    loadedRef.current = false
    let cancelled = false

    supabase
      .from('business_events')
      .select('id, event_type, entity_type, entity_id, payload, source, occurred_at')
      .eq('business_id', businessId)
      .order('occurred_at', { ascending: false })
      .limit(MAX_PULSE_EVENTS)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        setEvents(data as BusinessPulseEvent[])
        loadedRef.current = true
      })

    return () => {
      cancelled = true
    }
  }, [businessId])

  // Realtime subscription: new events arrive live.
  useEffect(() => {
    if (!businessId) return

    const channel = supabase
      .channel(`business-pulse:${businessId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'business_events',
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const row = payload.new as BusinessPulseEvent
          setEvents((prev) => [row, ...prev].slice(0, MAX_PULSE_EVENTS))
        }
      )
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
      setLive(false)
    }
  }, [businessId])

  const clear = useCallback(() => setEvents([]), [])

  return { events, live, clear }
}
