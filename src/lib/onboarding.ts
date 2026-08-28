// ============================================
// ONBOARDING RPC — canonical business-creation contract
// ============================================
// Single client for create_business_and_owner. Owns the wire-shape realities
// so Onboarding / Signup / AuthCallback never re-implement them.
//
// Important safety rule: business creation is NEVER attempted for an account
// that already has a business membership. This is checked before the creation
// RPC and is also enforced server-side by create_business_and_owner itself.
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
  if (/already belongs to a business|already.*business|already.*member/i.test(message)) {
    return { ok: false, reason: 'already_member', message }
  }
  if (isFunctionMissing(message, code)) {
    return { ok: false, reason: 'unavailable', message }
  }
  return { ok: false, reason: 'error', message }
}

export function extractBusinessId(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data
  if (typeof row === 'string') return row
  if (row && typeof row === 'object') {
    const id = (row as Record<string, unknown>).p_business_id ?? (row as Record<string, unknown>).business_id
    if (typeof id === 'string' && id) return id
  }
  return null
}

async function resolveExistingMembership(): Promise<string | null> {
  const { data, error } = await supabase.rpc('resolve_current_user_context')
  if (error) {
    console.warn('Could not preflight onboarding identity:', error)
    return null
  }

  const row = Array.isArray(data) ? data[0] : data
  return row?.business_id || null
}

export async function createBusinessAndOwner(input: BusinessCreationInput): Promise<BusinessCreationResult> {
  const existingBusinessId = await resolveExistingMembership()
  if (existingBusinessId) {
    return { ok: false, reason: 'already_member', message: 'User already belongs to a business' }
  }

  const baseArgs = {
    p_business_name: input.businessName,
    p_industry: input.industry ?? null,
    p_staff_name: input.staffName ?? null,
  }

  let { data, error } = await supabase.rpc('create_business_and_owner', {
    ...baseArgs,
    p_job_title: input.jobTitle ?? null,
  })

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
