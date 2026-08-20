import { supabase } from './supabase'

export type MembershipResolution =
  | { status: 'member'; businessId: string | null }
  | { status: 'no_membership' }
  | { status: 'retry' }

/**
 * Resolve membership without using a PostgREST `.single()` lookup.
 * A missing row is different from a failed query; only the former may lead
 * to onboarding. This prevents legacy users from being misclassified when
 * RLS/PostgREST returns 406 or another transient error.
 */
export async function resolveMembership(userId: string): Promise<MembershipResolution> {
  try {
    const { data, error } = await supabase.rpc('get_current_staff')
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data
      if (row && typeof row === 'object') {
        const value = row as Record<string, unknown>
        return {
          status: 'member',
          businessId: typeof value.business_id === 'string' ? value.business_id : null,
        }
      }
      return { status: 'no_membership' }
    }

    // Do not fall through to .single(). A 406 is a query-shape problem,
    // not evidence that the user is new.
    const fallback = await supabase
      .from('staff')
      .select('business_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (!fallback.error && fallback.data) {
      return { status: 'member', businessId: fallback.data.business_id ?? null }
    }
    if (!fallback.error && !fallback.data) return { status: 'no_membership' }
    return { status: 'retry' }
  } catch {
    return { status: 'retry' }
  }
}
