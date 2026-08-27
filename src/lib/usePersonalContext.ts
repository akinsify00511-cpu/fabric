import { useCallback, useEffect, useState } from 'react'
import {
  fetchMyContext,
  removePinnedItem,
  updateGoalStatus,
  upsertPinnedItem,
  type MyContext,
  type PinnedItem,
  type PinEntityType,
} from './personalExperience'
import { useAuth } from './AuthContext'

/**
 * usePersonalContext — the personal Experience Layer consumer for UI surfaces.
 *
 * Loads the canonical server-assembled `my_context()` object (identity, membership,
 * responsibilities, business, entitlements, workspaces, ai_memory, goals) for the
 * authenticated user. Backed by the Personalization Constitution (Art IX): this is
 * the ONE authoritative context object the shell/home should derive the personal
 * surface from.
 *
 * Best-effort (Article VI): if the migration/RPC isn't deployed yet, `context`
 * stays null and the UI renders honest empty states — never an error. RLS remains
 * the only authorization boundary; this hook only surfaces the caller's own rows.
 */
export function usePersonalContext() {
  const { session } = useAuth()
  const [context, setContext] = useState<MyContext | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!session) {
      setContext(null)
      setLoading(false)
      return
    }
    try {
      setContext(await fetchMyContext())
    } catch {
      setContext(null)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const businessId = context?.membership?.business_id ?? null
  const pins = context?.workspaces?.pinned_items ?? []
  const goals = context?.goals ?? []

  return {
    context,
    pins,
    goals,
    loading,
    businessId,
    refresh,
    pinItem: (item: { entity_type: PinEntityType; entity_id: string; pin_label?: string; sort_order?: number }) =>
      businessId ? upsertPinnedItem(businessId, item) : Promise.resolve(false),
    unpinItem: (entityType: PinEntityType, entityId: string) =>
      businessId ? removePinnedItem(businessId, entityType, entityId) : Promise.resolve(false),
    setGoalStatus: (goalId: string, status: 'active' | 'at_risk' | 'paused' | 'achieved' | 'abandoned') =>
      businessId ? updateGoalStatus(businessId, goalId, status) : Promise.resolve(false),
  }
}