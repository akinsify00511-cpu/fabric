// ============================================
// ONBOARDING RPC — canonical business-creation contract
// ============================================
// Single client for create_business_and_owner. Owns the wire-shape realities
// so Onboarding / Signup / AuthCallback never re-implement them:
//   - The canonical signature takes p_job_title; drifted databases that only
//     have the older 3-parameter function get one automatic retry without it.
//   - PostgREST returns a TABLE function as an array of rows; older versions
//     returned a scalar UUID. Both normalize to a business id string.
//   - "User already belongs to a business" is a RECOVERABLE state (the caller
//     refreshes membership and enters the app), not an error to show.
// ============================================

import { supabase } from './supabase'

export type BusinessCreationResult =
  | { ok: true; businessId: string }
  | { ok: false; reason: 'already_member' | 'unavailable' | 'error'; message: string }

export interface BusinessCreationInput {
  businessName: string
  industry?: string | null
  staffName?: string | null
  jobTitle?: string | null
}

function isFunctionMissing(message: string, code?: string): boolean {
  return code === 'PGRST202' || /could not find the function|no matches found/i.test(message)
}

function classifyRpcError(message: string, code?: string): BusinessCreationResult {
  if (/already belongs to a business/i.test(message)) {
    return { ok: false, reason: 'already_member', message }
  }
  if (isFunctionMissing(message, code)) {
    return { ok: false, reason: 'unavailable', message }
  }
  return { ok: false, reason: 'error', message }
}

// A TABLE-returning RPC arrives as [{ p_business_id, p_staff_id }]; older
// deployments returned the bare UUID. Anything else means we cannot identify
// the created business — treat as failure rather than guessing.
export function extractBusinessId(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data
  if (typeof row === 'string') return row
  if (row && typeof row === 'object') {
    const id = (row as Record<string, unknown>).p_business_id ?? (row as Record<string, unknown>).business_id
    if (typeof id === 'string' && id) return id
  }
  return null
}

export async function createBusinessAndOwner(input: BusinessCreationInput): Promise<BusinessCreationResult> {
  const baseArgs = {
    p_business_name: input.businessName,
    p_industry: input.industry ?? null,
    p_staff_name: input.staffName ?? null,
  }

  // Canonical 4-parameter call.
  let { data, error } = await supabase.rpc('create_business_and_owner', {
    ...baseArgs,
    p_job_title: input.jobTitle ?? null,
  })

  // Drifted deployments may still expose the 3-parameter function — retry once
  // without the job title. If that also misses, the function is genuinely not
  // deployed.
  if (error && isFunctionMissing(error.message, error.code)) {
    ;({ data, error } = await supabase.rpc('create_business_and_owner', baseArgs))
  }

  if (error) {
    console.error('create_business_and_owner RPC failed:', error)
    return classifyRpcError(error.message ?? '', error.code)
  }

  const businessId = extractBusinessId(data)
  if (!businessId) {
    console.error('create_business_and_owner returned an unexpected shape:', data)
    return { ok: false, reason: 'error', message: 'Business was created but its id could not be read. Please sign in again.' }
  }
  return { ok: true, businessId }
}
