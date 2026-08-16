import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useAuth, type Staff } from './AuthContext'
import { useAccessibleTools, type ToolKey, TOOLS } from './useToolAccess'
import { useWorkspaceSelection } from './useWorkspaceSelection'

/**
 * Experience Context — the single authoritative context the whole app should
 * derive navigation / dashboard / quick actions / recommendations from.
 *
 * It COMPOSES the existing access hooks (entitled+role tools, workspace
 * selection) instead of re-fetching them, and adds the three signals that were
 * previously missing or computed ad-hoc per screen:
 *   - business industry (from businesses.industry, never loaded client-side before)
 *   - company size (staff count, centralizing what Dashboard computed inline)
 *   - complexity level (derived from size + active modules — the PRD's
 *     progressive-complexity axis)
 *
 * The "active tools" set is the INTERSECTION of authorized ∩ selected — i.e. a
 * tool the user is entitled+role-allowed to see AND chose to surface (or hasn't
 * curated yet). Selection can never ADD a tool the user isn't authorized for.
 *
 * Every screen should read from this hook instead of re-deriving signals, so
 * navigation, the dashboard, quick actions, and recommendations all make the
 * SAME decision about what a user needs.
 */

// ── Complexity tiers (PRD progressive complexity) ─────────────────────
// Derived automatically from company size + active-module count. The UI
// reveals more machinery (departments, approvals, budgeting, compliance) as a
// business grows, instead of forcing every business to see enterprise chrome.
export type ComplexityLevel = 'solo' | 'small' | 'mid' | 'enterprise'

export const COMPLEXITY_LABELS: Record<ComplexityLevel, string> = {
  solo: 'Solo',
  small: 'Small team',
  mid: 'Mid-size',
  enterprise: 'Enterprise',
}

// Tiers by headcount. A business nudges up one tier if it has many active
// modules (broad operational surface) even at a smaller headcount.
export function deriveComplexity(companySize: number, activeModuleCount: number): ComplexityLevel {
  if (companySize <= 1) return 'solo'
  if (companySize <= 10) return activeModuleCount >= 8 ? 'mid' : 'small'
  if (companySize <= 50) return 'mid'
  return 'enterprise'
}

// ── Context shape ─────────────────────────────────────────────────────
export interface ExperienceContext {
  staff: Staff | null
  role: Staff['role'] | null
  isPrivileged: boolean
  businessId: string | null
  industry: string | null
  companySize: number
  complexity: ComplexityLevel
  // authorized = entitled (plan) ∩ role (functional). selected = user curation
  // (stored as free-form strings in the DB; not every value maps to a real tool).
  authorizedTools: ToolKey[]
  selectedTools: string[]
  selectionCompleted: boolean
  // active = authorized ∩ selected (or all authorized if not curated). The set
  // the dashboard / nav / quick actions should surface.
  activeTools: ToolKey[]
  activeToolCount: number
  loading: boolean
  // Helper: is a given tool active (authorized AND selected)?
  isToolActive: (key: ToolKey) => boolean
  // Helper: is a given tool authorized (regardless of selection)?
  isToolAuthorized: (key: ToolKey) => boolean
}

// Module-level cache for the business-industry + headcount query so multiple
// callers (Shell, Dashboard, future screens) don't each fire it. Keyed by
// business_id; invalidated on sign-out by the auth layer (the hook returns to
// loading when staff clears).
interface BusinessProfile {
  industry: string | null
  companySize: number
}
const businessProfileCache = new Map<string, BusinessProfile>()

export function useExperienceContext(): ExperienceContext {
  const { staff } = useAuth()
  const { tools: authorizedTools, loading: toolsLoading } = useAccessibleTools()
  const { selectedTools, selectionCompleted, loading: selLoading } = useWorkspaceSelection()
  const [profile, setProfile] = useState<BusinessProfile | null>(
    staff?.business_id ? businessProfileCache.get(staff.business_id) ?? null : null,
  )
  const [profileLoading, setProfileLoading] = useState(!profile)

  useEffect(() => {
    if (!staff?.business_id) {
      setProfile(null)
      setProfileLoading(false)
      return
    }
    const bid = staff.business_id
    const cached = businessProfileCache.get(bid)
    if (cached) {
      setProfile(cached)
      setProfileLoading(false)
      return
    }
    setProfileLoading(true)
    let cancelled = false
    ;(async () => {
      // One joined query: the business's industry + its staff count (company
      // size). Best-effort — if the column/query is unavailable on a
      // deployment, the context degrades to industry=null, size=0 (solo).
      try {
        const [biz, head] = await Promise.all([
          supabase.from('businesses').select('industry').eq('id', bid).maybeSingle(),
          supabase.from('staff').select('id', { count: 'exact', head: true }).eq('business_id', bid),
        ])
        if (cancelled) return
        const p: BusinessProfile = {
          industry: (biz.data as any)?.industry ?? null,
          companySize: head.count ?? 0,
        }
        businessProfileCache.set(bid, p)
        setProfile(p)
      } catch {
        if (cancelled) return
        const p: BusinessProfile = { industry: null, companySize: 0 }
        businessProfileCache.set(bid, p)
        setProfile(p)
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [staff?.business_id])

  const isPrivileged = staff?.role === 'owner' || staff?.role === 'admin'
  const companySize = profile?.companySize ?? 0

  // active = authorized ∩ selected. If the user hasn't curated (or cleared),
  // active = all authorized (show everything they're allowed to see).
  const activeTools = useMemo(() => {
    if (!selectionCompleted || selectedTools.length === 0) return authorizedTools
    const selectedSet = new Set(selectedTools)
    return authorizedTools.filter((t) => selectedSet.has(t))
  }, [authorizedTools, selectedTools, selectionCompleted])

  const complexity = deriveComplexity(companySize, activeTools.length)

  const isToolActive = (key: ToolKey) =>
    (isPrivileged || authorizedTools.includes(key)) &&
    (!selectionCompleted || selectedTools.length === 0 || selectedTools.includes(key))
  const isToolAuthorized = (key: ToolKey) => isPrivileged || authorizedTools.includes(key)

  return {
    staff,
    role: staff?.role ?? null,
    isPrivileged,
    businessId: staff?.business_id ?? null,
    industry: profile?.industry ?? null,
    companySize,
    complexity,
    authorizedTools,
    selectedTools,
    selectionCompleted,
    activeTools,
    activeToolCount: activeTools.length,
    loading: toolsLoading || selLoading || profileLoading,
    isToolActive,
    isToolAuthorized,
  }
}

// Export TOOLS re-export so screens can import both from one place.
export { TOOLS, type ToolKey }

// Clear the business-profile cache (called on sign-out so a different user's
// profile isn't served stale).
export function clearExperienceContextCache() {
  businessProfileCache.clear()
}
