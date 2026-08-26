// Canonical PostgREST probe classification.
//
// Production hits two failure classes the plain schema-drift circuit cannot
// distinguish:
//
//  1. Clock-skew rejections (PGRST303 "JWT issued at future"): the client
//     device's wall clock is ahead of the server, so PostgREST rejects the
//     JWT at the gateway. Retryable — not "object missing", not "auth broken".
//
//  2. Drift availability checks (PGRST303-class or true schema errors)
//     on RPC/table existence probes.
//
// The auth resolver (resolveStaffIdentity) currently conflates the first
// class with "membership resolution failed" and marks the user resolved but
// broken, flooding every post-auth page. This one helper lets every call
// site grade the failure deterministically; the outer loop treats
// clock-skew as retryable (PACE_limited) and nullifies the cavity it made.

export interface PostgrestVerdict {
  /** Authish failure that mean slack-timed clients reads retryable. */
  kind: 'clock_skew' | 'clear' | 'drift' | 'noise'
  userMessage?: string
}

/** True when the PostgREST/Supabase error is a wall-clock skew denial. */
export function isClockSkewError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === 'PGRST303') return true
  return /issued at future|jwt.*future|pgrst303/i.test(err.message ?? '')
}

/** Trivial UX copy for the skew case (Login page common). */
export function describeProbeFailure(err: { code?: string; message?: string } | null | undefined): PostgrestVerdict {
  if (isClockSkewError(err)) {
    return { kind: 'clock_skew', userMessage: 'Your device clock is ahead. Sync it and try again.' }
  }
  return { kind: 'clear' }
}

/**
 * Wrap a probe promise so a PGRST303 response becomes a thrown
 * `ClockSkewError` the caller can catch deterministically instead of
 * leaking into the resolve/RLS cavity.
 */
export class ClockSkewError extends Error {
  constructor(message = 'JWT rejected: client clock ahead of server.') {
    super(message)
    this.name = 'ClockSkewError'
  }
}
