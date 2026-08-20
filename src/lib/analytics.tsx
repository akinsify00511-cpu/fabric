/**
 * Analytics Events Tracking
 * Lightweight event log for funnel tracking and bug discovery.
 *
 * Analytics is strictly non-blocking. It must never participate in auth,
 * membership, onboarding, routing, or access decisions.
 */

import { useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

export interface AnalyticsEvent {
  business_id?: string
  staff_id?: string
  event_name: string
  meta?: Record<string, unknown>
}

let pendingEvents: AnalyticsEvent[] = []
let flushTimeout: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL = 1000
const MAX_BATCH_SIZE = 10

async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user?.id ?? null
  } catch {
    return null
  }
}

/** Track an event. Never throws into product flows. */
export async function trackEvent(
  eventName: string,
  meta?: Record<string, unknown>,
  options?: {
    businessId?: string
    staffId?: string
    immediate?: boolean
  },
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
  if (pendingEvents.length >= MAX_BATCH_SIZE) {
    await flushPending()
    return
  }
  if (!flushTimeout) flushTimeout = setTimeout(flushPending, FLUSH_INTERVAL)
}

/**
 * Send telemetry only when there is a real authenticated business context.
 * In particular, Auth-only users currently in onboarding have no staff row
 * yet; sending analytics with null p_user_id/business_id used to generate
 * production 400s and noisy auth diagnostics.
 */
async function flushEvent(event: AnalyticsEvent): Promise<void> {
  if (!event.business_id) return
  const userId = await getAuthenticatedUserId()
  if (!userId) return

  try {
    await supabase.rpc('record_analytics_event', {
      p_business_id: event.business_id,
      p_user_id: userId,
      p_event_name: event.event_name,
      p_category: 'user_action',
      p_metadata: event.meta || {},
    })
  } catch {
    // Telemetry is best-effort. Never surface or retry permanently-invalid RPCs.
  }
}

async function flushPending(): Promise<void> {
  if (flushTimeout) {
    clearTimeout(flushTimeout)
    flushTimeout = null
  }
  if (pendingEvents.length === 0) return

  const events = pendingEvents
  pendingEvents = []

  const userId = await getAuthenticatedUserId()
  if (!userId) return

  // Events without a business context are deliberately dropped. They are
  // usually pre-membership/onboarding events and cannot satisfy the secure
  // analytics RPC's business ownership check.
  const validEvents = events.filter((event) => !!event.business_id)
  if (!validEvents.length) return

  try {
    await Promise.all(
      validEvents.map((event) =>
        supabase.rpc('record_analytics_event', {
          p_business_id: event.business_id,
          p_user_id: userId,
          p_event_name: event.event_name,
          p_category: 'user_action',
          p_metadata: event.meta || {},
        }),
      ),
    )
  } catch {
    // Analytics must not become an infinite retry loop or affect onboarding.
  }
}

export const ANALYTICS_EVENTS = {
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_STEP_FAILED: 'onboarding_step_failed',
  ONBOARDING_RPC_FAILED: 'onboarding_rpc_failed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  FEATURE_ENABLED: 'feature_enabled',
  FEATURE_DISABLED: 'feature_disabled',
  FEATURE_ERROR: 'feature_error',
  SETTINGS_2FA_ENABLED: 'settings_2fa_enabled',
  SETTINGS_2FA_DISABLED: 'settings_2fa_disabled',
  SETTINGS_SSO_VIEWED: 'settings_sso_viewed',
  NAVIGATION_ERROR: 'navigation_error',
  PAGE_LOAD_ERROR: 'page_load_error',
  AUTOMATION_CREATED: 'automation_created',
  AUTOMATION_ENABLED: 'automation_enabled',
  AUTOMATION_DISABLED: 'automation_deleted',
  AUTOMATION_RUN_FAILED: 'automation_run_failed',
  WEBHOOK_CREATED: 'webhook_created',
  WEBHOOK_DELETED: 'webhook_deleted',
  WEBHOOK_TEST_FAILED: 'webhook_test_failed',
  DEAL_CREATED: 'deal_created',
  DEAL_WON: 'deal_won',
  DEAL_LOST: 'deal_lost',
  CONTACT_CREATED: 'contact_created',
  RPC_FAILED: 'rpc_failed',
  CONSOLE_ERROR: 'console_error',
} as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

export function useAnalytics() {
  const { staff } = useAuth()
  const staffRef = useRef(staff)
  staffRef.current = staff

  return {
    track: (eventName: string, meta?: Record<string, unknown>) => {
      void trackEvent(eventName, meta, {
        businessId: staffRef.current?.business_id,
        staffId: staffRef.current?.id,
      })
    },
    trackImmediate: (eventName: string, meta?: Record<string, unknown>) => {
      void trackEvent(eventName, meta, {
        businessId: staffRef.current?.business_id,
        staffId: staffRef.current?.id,
        immediate: true,
      })
    },
  }
}

export function withPageTracking<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  pageName: string,
): React.FC<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'

  const WithPageTracking: React.FC<P> = (props) => {
    const { staff } = useAuth()

    useEffect(() => {
      void trackEvent('page_view', {
        page: pageName,
        path: window.location.pathname,
      }, {
        businessId: staff?.business_id,
        staffId: staff?.id,
      })

      return () => {
        void flushPending()
      }
    }, [pageName, staff])

    return <WrappedComponent {...props} />
  }

  WithPageTracking.displayName = `WithPageTracking(${displayName})`
  return WithPageTracking
}

export function flushAnalytics(): void {
  void flushPending()
}
