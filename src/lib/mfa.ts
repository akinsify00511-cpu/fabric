// ============================================
// MFA (Two-Factor) helpers — shared by login + settings
// ============================================
// Internal, no new dependencies. Uses the already-installed `otpauth` for
// TOTP verification and the native `crypto.subtle` API for backup-code
// hashing.
//
// Trust model: TOTP verification happens client-side against the user's own
// `user_mfa` row (RLS = `user_id = auth.uid()`), AFTER the password step has
// succeeded. This is a client-enforced post-auth gate: it prevents the
// practical "stolen password → full app access" attack by blocking the SPA
// from rendering until a valid second factor is supplied. It does NOT make
// the underlying Supabase session invalid (a sophisticated attacker could
// still call Supabase APIs directly) — RLS remains the data boundary. For
// server-enforced MFA, migrate to Supabase's native MFA factors API.

import { TOTP, Secret } from 'otpauth'
import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

export interface UserMfaRow {
  user_id: string
  enabled: boolean
  method: string
  totp_secret: string | null
  totp_confirmed_at: string | null
  backup_codes_hash: string | null
  backup_codes_used: number
}

const VERIFIED_KEY = (userId: string) => `avenize_mfa_verified_${userId}`

/** Has the user already cleared the MFA challenge this session? */
export function isMfaVerified(userId: string): boolean {
  try {
    return sessionStorage.getItem(VERIFIED_KEY(userId)) === '1'
  } catch {
    return false
  }
}

export function setMfaVerified(userId: string): void {
  try {
    sessionStorage.setItem(VERIFIED_KEY(userId), '1')
  } catch {
    // sessionStorage may be unavailable (private mode) — best-effort
  }
}

export function clearMfaVerified(userId: string): void {
  try {
    sessionStorage.removeItem(VERIFIED_KEY(userId))
  } catch {
    // best-effort
  }
}

/** Load the current user's MFA row (or null if none / not enabled). */
export async function getUserMfa(session: Session | null): Promise<UserMfaRow | null> {
  if (!session?.user?.id) return null
  // .maybeSingle() — returns null with no error when no row exists (first run)
  const { data, error } = await supabase
    .from('user_mfa')
    .select('user_id, enabled, method, totp_secret, totp_confirmed_at, backup_codes_hash, backup_codes_used')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (error) {
    console.warn('Failed to load MFA row:', error.message)
    return null
  }
  return data as UserMfaRow | null
}

/** Does this session require an MFA challenge before the app may render? */
export function mfaRequired(mfa: UserMfaRow | null): boolean {
  return !!(mfa && mfa.enabled && mfa.method === 'totp' && mfa.totp_confirmed_at)
}

/** Verify a 6-digit TOTP code against the stored base32 secret. */
export function verifyTotpCode(secretBase32: string, token: string): boolean {
  const cleaned = secretBase32.replace(/[^A-Z2-7]/g, '').toUpperCase()
  if (!cleaned) return false
  try {
    const totp = new TOTP({
      issuer: 'Avenize',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(cleaned),
    })
    // window:1 allows ±30s clock drift
    return totp.validate({ token, window: 1 }) !== null
  } catch {
    return false
  }
}

/** SHA-256 hash a backup code (native crypto.subtle, no dependency). */
export async function hashBackupCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code.trim().toLowerCase())
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Parse the stored comma-joined backup-code hash list. */
export function parseBackupCodeHashes(stored: string | null): string[] {
  if (!stored) return []
  return stored.split(',').map(h => h.trim()).filter(Boolean)
}

/**
 * Verify a backup code against the stored hashes. Returns the remaining
 * hash list (with the matched hash removed) so the caller can persist the
 * consumption and bump `backup_codes_used`.
 */
export async function verifyBackupCode(
  storedHashes: string[],
  entered: string
): Promise<{ ok: boolean; remaining: string[] }> {
  if (storedHashes.length === 0 || !entered) return { ok: false, remaining: storedHashes }
  const enteredHash = await hashBackupCode(entered)
  const idx = storedHashes.indexOf(enteredHash)
  if (idx === -1) return { ok: false, remaining: storedHashes }
  const remaining = storedHashes.filter((_, i) => i !== idx)
  return { ok: true, remaining }
}

/** Consume a backup code: persist the reduced hash list + bumped counter. */
export async function consumeBackupCode(
  userId: string,
  remainingHashes: string[],
  newUsedCount: number
): Promise<void> {
  await supabase
    .from('user_mfa')
    .update({
      backup_codes_hash: remainingHashes.join(','),
      backup_codes_used: newUsedCount,
    })
    .eq('user_id', userId)
}
