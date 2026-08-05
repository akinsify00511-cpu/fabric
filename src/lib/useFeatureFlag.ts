/**
 * Feature Flag Hook
 * Resolves feature flags from the database, respecting:
 * - Per-business overrides
 * - Beta tester status
 * - Global enabled_globally flag
 * - Gradual rollout percentage
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

export interface FeatureFlag {
  key: string
  name: string
  description: string | null
  enabled_globally: boolean
  enabled_for_beta: boolean
  rollout_percentage: number
}

// Cache for feature flags to reduce database calls
let featureFlagsCache: FeatureFlag[] | null = null
let cacheTimestamp = 0
const CACHE_DURATION = 60 * 1000 // 1 minute

/**
 * Hook to check if a feature flag is enabled
 */
export function useFeatureFlag(key: string): boolean {
  const { staff, business } = useAuth()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const checkFlag = async () => {
      // If no auth yet, assume disabled
      if (!staff) {
        setEnabled(false)
        setLoading(false)
        return
      }

      try {
        // Call the resolve_feature_flag RPC
        const { data, error } = await supabase.rpc('resolve_feature_flag', {
          p_key: key,
          p_business_id: staff.business_id,
          p_is_beta: staff.is_beta_tester ?? false,
        })

        if (error) {
          console.warn(`Feature flag '${key}' resolution failed:`, error)
          if (!cancelled) setEnabled(false)
        } else {
          if (!cancelled) setEnabled(!!data)
        }
      } catch (err) {
        console.warn(`Feature flag '${key}' check error:`, err)
        if (!cancelled) setEnabled(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    checkFlag()

    return () => {
      cancelled = true
    }
  }, [key, staff?.business_id, staff?.is_beta_tester])

  return enabled
}

/**
 * Hook to check multiple feature flags at once
 */
export function useFeatureFlags(keys: string[]): Record<string, boolean> {
  const { staff } = useAuth()
  const [flags, setFlags] = useState<Record<string, boolean>>(
    Object.fromEntries(keys.map((k) => [k, false]))
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const checkFlags = async () => {
      if (!staff) {
        setFlags(Object.fromEntries(keys.map((k) => [k, false])))
        setLoading(false)
        return
      }

      try {
        // Batch check all flags in parallel
        const results = await Promise.all(
          keys.map((key) =>
            supabase.rpc('resolve_feature_flag', {
              p_key: key,
              p_business_id: staff.business_id,
              p_is_beta: staff.is_beta_tester ?? false,
            }).then(({ data, error }) => ({ key, enabled: error ? false : !!data }))
          )
        )

        if (!cancelled) {
          const newFlags: Record<string, boolean> = {}
          results.forEach(({ key, enabled }) => {
            newFlags[key] = enabled
          })
          setFlags(newFlags)
        }
      } catch (err) {
        console.warn('Feature flags batch check error:', err)
        if (!cancelled) {
          setFlags(Object.fromEntries(keys.map((k) => [k, false])))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    checkFlags()

    return () => {
      cancelled = true
    }
  }, [staff?.business_id, staff?.is_beta_tester])

  return flags
}

/**
 * Hook to get all feature flags (admin use)
 */
export function useAllFeatureFlags(): {
  flags: FeatureFlag[]
  loading: boolean
  error: Error | null
} {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchFlags = async () => {
      // Check cache
      if (featureFlagsCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
        setFlags(featureFlagsCache)
        setLoading(false)
        return
      }

      try {
        const { data, error } = await supabase
          .from('feature_flags')
          .select('*')
          .order('name')

        if (error) throw error

        featureFlagsCache = data as FeatureFlag[]
        cacheTimestamp = Date.now()
        setFlags(featureFlagsCache)
      } catch (err) {
        console.error('Failed to fetch feature flags:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
      } finally {
        setLoading(false)
      }
    }

    fetchFlags()
  }, [])

  return { flags, loading, error }
}

/**
 * Toggle a feature flag (admin only - requires service role)
 * Note: This should be called server-side or via Edge Function for security
 */
export async function toggleFeatureFlag(
  key: string,
  enabled: boolean,
  scope: 'beta' | 'global' = 'beta'
): Promise<boolean> {
  try {
    const column = scope === 'beta' ? 'enabled_for_beta' : 'enabled_globally'

    const { error } = await supabase
      .from('feature_flags')
      .update({ [column]: enabled })
      .eq('key', key)

    if (error) throw error

    // Invalidate cache
    featureFlagsCache = null

    return true
  } catch (err) {
    console.error('Failed to toggle feature flag:', err)
    return false
  }
}

/**
 * Set per-business override
 */
export async function setBusinessFeatureOverride(
  businessId: string,
  featureKey: string,
  enabled: boolean
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('business_feature_overrides')
      .upsert({
        business_id: businessId,
        feature_key: featureKey,
        enabled,
      })

    if (error) throw error
    return true
  } catch (err) {
    console.error('Failed to set business feature override:', err)
    return false
  }
}

/**
 * Clear per-business override (revert to default)
 */
export async function clearBusinessFeatureOverride(
  businessId: string,
  featureKey: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('business_feature_overrides')
      .delete()
      .eq('business_id', businessId)
      .eq('feature_key', featureKey)

    if (error) throw error
    return true
  } catch (err) {
    console.error('Failed to clear business feature override:', err)
    return false
  }
}

/**
 * Mark staff as beta tester
 */
export async function setBetaTester(staffId: string, isBetaTester: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('staff')
      .update({ is_beta_tester: isBetaTester })
      .eq('id', staffId)

    if (error) throw error
    return true
  } catch (err) {
    console.error('Failed to update beta tester status:', err)
    return false
  }
}

// Pre-defined feature flag keys for type safety
export const FEATURE_FLAG_KEYS = {
  TWO_FACTOR_AUTH: 'two_factor_auth',
  SSO: 'sso',
  WEBHOOKS: 'webhooks',
  AUTOMATIONS: 'automations',
  COMPANY_HOME: 'company_home',
  ONBOARDING_V2: 'onboarding_v2',
} as const

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS]
