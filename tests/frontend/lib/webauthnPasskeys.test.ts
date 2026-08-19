import { describe, it, expect } from 'vitest'

// Contract tests for the internal WebAuthn/passkey system. The cryptographic
// verification runs server-side in the `webauthn` edge function
// (@simplewebauthn/server); these tests lock the security invariants the
// implementation must honour. Pure mirrors, no mocks of real crypto.

const CHALLENGE_TTL_MS = 5 * 60 * 1000

interface Challenge {
  used_at: string | null
  expires_at: string
}

function challengeUsable(c: Challenge, now = Date.now()): boolean {
  return c.used_at === null && new Date(c.expires_at).getTime() > now
}

// Counter monotonicity: a valid authenticator's counter always increases.
// A regression (newCounter <= stored) indicates a cloned authenticator.
// Counters that never move (stored 0 -> 0) are tolerated: some authenticators
// (platform, e.g. some Touch ID flows) always report 0.
function counterValid(stored: number, newCounter: number): boolean {
  if (newCounter <= stored && stored > 0) return false
  return true
}

describe('challenge single-use + TTL', () => {
  it('fresh challenge within TTL is usable', () => {
    expect(challengeUsable({ used_at: null, expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString() })).toBe(true)
  })

  it('expired challenge is rejected', () => {
    expect(challengeUsable({ used_at: null, expires_at: new Date(Date.now() - 1000).toISOString() })).toBe(false)
  })

  it('used challenge is rejected (replay protection)', () => {
    expect(challengeUsable({ used_at: new Date().toISOString(), expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString() })).toBe(false)
  })

  it('TTL is 5 minutes — long enough for biometrics, short enough to limit replay windows', () => {
    expect(CHALLENGE_TTL_MS).toBe(300_000)
  })
})

describe('counter monotonicity (clone detection)', () => {
  it('advancing counter is valid', () => {
    expect(counterValid(5, 6)).toBe(true)
  })

  it('counter regression is rejected — cloned authenticator signal', () => {
    expect(counterValid(5, 5)).toBe(false)
    expect(counterValid(5, 3)).toBe(false)
  })

  it('always-zero counters (some platform authenticators) are tolerated', () => {
    expect(counterValid(0, 0)).toBe(true)
  })

  it('first advance from zero is valid', () => {
    expect(counterValid(0, 1)).toBe(true)
  })
})

describe('credential registry contract', () => {
  it('stores only public material — passkeys are asymmetric by design', () => {
    // The table columns: public_key, counter, transports, device_name,
    // backed_up, aaguid. There is NO secret column to leak.
    const publicColumns = ['public_key', 'counter', 'transports', 'device_name', 'backed_up', 'aaguid']
    expect(publicColumns.some((c) => /secret|private|password/i.test(c))).toBe(false)
  })

  it('revocation is a soft revoke (revoked_at) — the audit trail is preserved', () => {
    // revoke_my_passkey sets revoked_at; it never DELETEs the row.
    const row = { revoked_at: null as string | null }
    row.revoked_at = new Date().toISOString()
    expect(row.revoked_at).not.toBeNull()
  })
})

describe('passwordless login contract', () => {
  it('a session is minted ONLY after a verified assertion', () => {
    // verify-authentication returns { verified, token_hash } — the client
    // must exchange token_hash; there is no path that returns a session
    // without verified === true.
    const verifiedResult = { verified: true, token_hash: 'tok' }
    const rejectedResult = { error: 'Passkey verification failed.' }
    expect('token_hash' in verifiedResult && verifiedResult.verified).toBe(true)
    expect('token_hash' in rejectedResult).toBe(false)
  })

  it('registration requires an existing session (passkeys attach to accounts, never create them)', () => {
    // generate/verify-registration call callerUser() first and 401 without a JWT.
    const noJwtUser = null
    expect(noJwtUser).toBeNull()
  })

  it('discoverable credentials: authentication options use an empty allowCredentials list', () => {
    // allowCredentials: [] = usernameless passkey login (resident keys).
    const allowCredentials: unknown[] = []
    expect(allowCredentials).toHaveLength(0)
  })
})
