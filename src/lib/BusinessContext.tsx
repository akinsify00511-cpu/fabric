/**
 * BusinessContext — the active-subsidiary context.
 *
 * The org hierarchy (migration 20260817150000) lets one user belong to
 * multiple businesses under one organization (a group owner/admin can see
 * every subsidiary). But the frontend had no concept of "which subsidiary am
 * I viewing right now" — every page read `staff.business_id` as a single
 * fixed context, so a group owner was stuck on the subsidiary their staff row
 * belonged to.
 *
 * This context provides `activeBusinessId` — the subsidiary the user is
 * currently operating in. It defaults to `staff.business_id` (so
 * single-business users see ZERO behavior change), and becomes switchable
 * when `get_current_accessible_businesses()` returns >1 business.
 *
 * SECURITY: the context only switches which business_id the UI READS. RLS
 * remains the authority — `get_current_accessible_businesses()` is the
 * server-side gate that decides which businesses the user may access at all.
 * A user cannot switch to a business they are not a member of; the switcher
 * only offers businesses the RPC returned. Setting `activeBusinessId` to an
 * inaccessible business yields empty data (RLS denies the reads) — no leak.
 *
 * Migration path: pages adopt `useBusiness().activeBusinessId` incrementally.
 * Pages that haven't migrated keep reading `staff.business_id` (their
 * original subsidiary) — no breakage. The home + CRM adopt it first (the
 * user's explicit per-subsidiary examples).
 */
import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth, type Staff } from './AuthContext'
import { clearExperienceContextCache } from './useExperienceContext'

export interface AccessibleBusiness {
  business_id: string
  organization_id: string | null
  access_role: string
  access_reason: string
  /** joined business name for display */
  name?: string
  entity_type?: string
}

interface BusinessContextValue {
  /** The subsidiary the user is currently operating in. */
  activeBusinessId: string | null
  /** All businesses the user may access (from get_current_accessible_businesses). */
  accessibleBusinesses: AccessibleBusiness[]
  /** Whether the switcher should be shown (>1 accessible business). */
  canSwitch: boolean
  /** Switch the active subsidiary. No-op if the id isn't in accessibleBusinesses. */
  setActiveBusiness: (businessId: string) => void
  /** Reload the accessible list (after creating a subsidiary). */
  refresh: () => Promise<void>
  loading: boolean
}

const BusinessContext = createContext<BusinessContextValue | null>(null)

const STORAGE_KEY = (userId: string) => `avenize_active_business_${userId}`

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { staff } = useAuth()
  const userId = staff?.user_id ?? null
  const defaultBid = staff?.business_id ?? null

  const [accessible, setAccessible] = useState<AccessibleBusiness[]>([])
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(defaultBid)
  const [loading, setLoading] = useState(true)

  const loadAccessible = async (_uid: string): Promise<AccessibleBusiness[]> => {
    const { data, error } = await supabase.rpc('get_current_accessible_businesses')
    if (error || !data) return []
    const rows = data as Array<Omit<AccessibleBusiness, 'name' | 'entity_type'>>
    if (!rows.length) return []
    // Join business names for display (RLS lets the user read businesses they
    // are a member of — the same set the RPC returned).
    const ids = rows.map(r => r.business_id)
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name, entity_type')
      .in('id', ids)
    const nameMap = new Map((biz ?? []).map((b: any) => [b.id, b] as const))
    return rows.map(r => ({
      ...r,
      name: nameMap.get(r.business_id)?.name,
      entity_type: nameMap.get(r.business_id)?.entity_type,
    }))
  }

  const refresh = async () => {
    if (!userId) return
    const list = await loadAccessible(userId)
    setAccessible(list)
    // If the active id is no longer accessible (e.g. removed), reset to default.
    if (activeBusinessId && !list.some(b => b.business_id === activeBusinessId)) {
      setActiveBusinessId(defaultBid)
    }
  }

  useEffect(() => {
    if (!userId || !defaultBid) { setLoading(false); return }
    let active = true
    setLoading(true);
    (async () => {
      const list = await loadAccessible(userId)
      if (!active) return
      setAccessible(list)
      // Restore a previously-chosen subsidiary if still accessible.
      const saved = localStorage.getItem(STORAGE_KEY(userId))
      if (saved && list.some(b => b.business_id === saved)) {
        setActiveBusinessId(saved)
      } else {
        setActiveBusinessId(defaultBid)
      }
      setLoading(false)
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, defaultBid])

  const setActiveBusiness = (businessId: string) => {
    if (!accessible.some(b => b.business_id === businessId)) return
    setActiveBusinessId(businessId)
    if (userId) localStorage.setItem(STORAGE_KEY(userId), businessId)
    // The experience context caches by business_id; switching subsidiaries
    // invalidates that cache so the home adapts to the new business.
    clearExperienceContextCache()
  }

  const value = useMemo<BusinessContextValue>(() => ({
    activeBusinessId,
    accessibleBusinesses: accessible,
    canSwitch: accessible.length > 1,
    setActiveBusiness,
    refresh,
    loading,
  }), [activeBusinessId, accessible, loading])

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext)
  if (!ctx) throw new Error('useBusiness must be used within a BusinessProvider')
  return ctx
}

/**
 * Resolve the effective business id for a page. Falls back to the staff's
 * own business_id when the BusinessProvider isn't mounted (backward compat
 * for pages that haven't migrated). Pages that HAVE migrated should call
 * useBusiness() directly.
 */
export function useActiveBusinessId(staff: Staff | null | undefined): string | null {
  try {
    const ctx = useContext(BusinessContext)
    return ctx?.activeBusinessId ?? staff?.business_id ?? null
  } catch {
    return staff?.business_id ?? null
  }
}
