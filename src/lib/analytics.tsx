/**
 * Analytics Events Tracking
 * Lightweight event log for funnel tracking and bug discovery
 */

import { supabase } from './supabase'

export interface AnalyticsEvent {
  business_id?: string
  staff_id?: string
  event_name: string
  meta?: Record<string, unknown>
}

// Debounce tracking calls to avoid flooding
let pendingEvents: AnalyticsEvent[] = []
let flushTimeout: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL = 1000 // 1 second
const MAX_BATCH_SIZE = 10

/**
 * Track an analytics event
 */
export async function trackEvent(
  eventName: string,
  meta?: Record<string, unknown>,
  options?: {
    businessId?: string
    staffId?: string
    immediate?: boolean // Skip batching, send immediately
  }
): Promise<void> {
  const event: AnalyticsEvent = {
    event_name: eventName,
    meta: meta || {},
    business_id: options?.businessId,
    staff_id: options?.staffId,
  }

  if (options?.immediate) {
    await flushEvent(event)
    return
  }

  pendingEvents.push(event)

  // Flush if we have too many pending
  if (pendingEvents.length >= MAX_BATCH_SIZE) {
    await flushPending()
    return
  }

  // Schedule a flush
  if (!flushTimeout) {
    flushTimeout = setTimeout(flushPending, FLUSH_INTERVAL)
  }
}

/**
 * Flush a single event immediately. Routes through the canonical
 * record_analytics_event RPC (SECURITY DEFINER, bypasses RLS) — the SAME
 * path src/lib/eventTracker.ts uses — so there is one insert shape, not two.
 * Previously this did a direct .from('analytics_events').insert() with
 * staff_id/meta columns that diverged from the RPC's user_id/metadata shape,
 * causing a second source of schema drift.
 */
async function flushEvent(event: AnalyticsEvent): Promise<void> {
  try {
    await supabase.rpc('record_analytics_event', {
      p_business_id: event.business_id ?? null,
      p_user_id: null,
      p_event_name: event.event_name,
      p_category: 'user_action',
      p_metadata: event.meta || {},
    })
  } catch (err) {
    // Analytics is non-essential; never surface to the user.
    console.warn('Analytics event failed:', err)
  }
}

/**
 * Flush all pending events
 */
async function flushPending(): Promise<void> {
  if (flushTimeout) {
    clearTimeout(flushTimeout)
    flushTimeout = null
  }

  if (pendingEvents.length === 0) return

  const events = pendingEvents
  pendingEvents = []

  try {
    // Fire each event through the canonical RPC (one insert path). Best-effort
    // — a missing/unavailable RPC drops the batch rather than throwing.
    await Promise.all(
      events.map((e) =>
        supabase.rpc('record_analytics_event', {
          p_business_id: e.business_id ?? null,
          p_user_id: null,
          p_event_name: e.event_name,
          p_category: 'user_action',
          p_metadata: e.meta || {},
        })
      )
    )
  } catch (err) {
    console.warn('Analytics batch failed:', err)
    // Put events back for retry
    pendingEvents = [...events, ...pendingEvents]
  }
}

/**
 * Pre-defined event names for type safety
 */
export const ANALYTICS_EVENTS = {
  // Onboarding
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_STEP_FAILED: 'onboarding_step_failed',
  ONBOARDING_RPC_FAILED: 'onboarding_rpc_failed',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // Feature usage
  FEATURE_ENABLED: 'feature_enabled',
  FEATURE_DISABLED: 'feature_disabled',
  FEATURE_ERROR: 'feature_error',

  // Settings
  SETTINGS_2FA_ENABLED: 'settings_2fa_enabled',
  SETTINGS_2FA_DISABLED: 'settings_2fa_disabled',
  SETTINGS_SSO_VIEWED: 'settings_sso_viewed',

  // Navigation
  NAVIGATION_ERROR: 'navigation_error',
  PAGE_LOAD_ERROR: 'page_load_error',

  // Automations
  AUTOMATION_CREATED: 'automation_created',
  AUTOMATION_ENABLED: 'automation_enabled',
  AUTOMATION_DISABLED: 'automation_deleted',
  AUTOMATION_RUN_FAILED: 'automation_run_failed',

  // Webhooks
  WEBHOOK_CREATED: 'webhook_created',
  WEBHOOK_DELETED: 'webhook_deleted',
  WEBHOOK_TEST_FAILED: 'webhook_test_failed',

  // CRM
  DEAL_CREATED: 'deal_created',
  DEAL_WON: 'deal_won',
  DEAL_LOST: 'deal_lost',
  CONTACT_CREATED: 'contact_created',

  // Errors
  RPC_FAILED: 'rpc_failed',
  CONSOLE_ERROR: 'console_error',
} as const

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

/**
 * Hook to track events with automatic auth context
 */
import { useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'

export function useAnalytics() {
  const { staff } = useAuth()
  const staffRef = useRef(staff)
  staffRef.current = staff

  return {
    track: (
      eventName: string,
      meta?: Record<string, unknown>
    ) => {
      trackEvent(eventName, meta, {
        businessId: staffRef.current?.business_id,
        staffId: staffRef.current?.id,
      })
    },
    trackImmediate: (
      eventName: string,
      meta?: Record<string, unknown>
    ) => {
      trackEvent(eventName, meta, {
        businessId: staffRef.current?.business_id,
        staffId: staffRef.current?.id,
        immediate: true,
      })
    },
  }
}

/**
 * Higher-order component wrapper for page-level tracking
 */
export function withPageTracking<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  pageName: string
): React.FC<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'

  const WithPageTracking: React.FC<P> = (props) => {
    const { staff } = useAuth()

    useEffect(() => {
      // Track page view
      trackEvent('page_view', {
        page: pageName,
        path: window.location.pathname,
      }, {
        businessId: staff?.business_id,
        staffId: staff?.id,
      })

      // Cleanup on unmount
      return () => {
        flushPending()
      }
    }, [pageName, staff])

    return <WrappedComponent {...props} />
  }

  WithPageTracking.displayName = `WithPageTracking(${displayName})`

  return WithPageTracking
}

/**
 * Force flush any pending events (call on app unmount)
 */
export function flushAnalytics(): void {
  flushPending()
}
