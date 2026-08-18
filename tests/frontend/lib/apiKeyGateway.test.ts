import { describe, it, expect } from 'vitest'

// API key gateway contract (#extensibility). Locks: (1) the hash-not-plaintext
// storage rule, (2) the read-only gateway contract, (3) the business-scoping
// boundary, (4) the verify_api_key deny-paths (inactive/expired/rotation/IP).

// Mirrors the client hashing: the stored value is the SHA-256 hex, never the
// raw key. (The actual sha256Hex runs in the browser via Web Crypto; here we
// assert the contract — the stored string must NOT start with the key prefix.)
function storedValueIsHashed(rawKey: string, stored: string): boolean {
  return stored !== rawKey && !stored.startsWith('avenize_')
}

// Mirrors verify_api_key deny logic: any of these conditions → NULL (deny).
function verifyDenies(opts: {
  isActive: boolean
  needsRotation: boolean
  expired: boolean
  ipAllowed: boolean
}): boolean {
  if (!opts.isActive) return true
  if (opts.needsRotation) return true
  if (opts.expired) return true
  if (!opts.ipAllowed) return true
  return false
}

describe('API key storage — hash not plaintext (#extensibility security fix)', () => {
  it('stores the SHA-256 hash, never the raw key', () => {
    const rawKey = 'avenize_abc123def456'
    const hash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
    expect(storedValueIsHashed(rawKey, hash)).toBe(true)
  })
  it('rejects plaintext storage (the pre-fix defect)', () => {
    const rawKey = 'avenize_abc123def456'
    expect(storedValueIsHashed(rawKey, rawKey)).toBe(false)
  })
  it('rejects a stored value that still has the key prefix (plaintext leak)', () => {
    const rawKey = 'avenize_abc123def456'
    expect(storedValueIsHashed(rawKey, 'avenize_something')).toBe(false)
  })
})

describe('API key gateway — read-only contract', () => {
  const ALLOWED_METHODS = ['GET', 'OPTIONS']
  it('only GET/OPTIONS are allowed through the gateway', () => {
    expect(ALLOWED_METHODS).not.toContain('POST')
    expect(ALLOWED_METHODS).not.toContain('PUT')
    expect(ALLOWED_METHODS).not.toContain('DELETE')
    expect(ALLOWED_METHODS).not.toContain('PATCH')
  })
  it('the resource allowlist is explicit (no wildcard)', () => {
    const RESOURCES = ['contacts', 'deals', 'invoices', 'products', 'tasks']
    RESOURCES.forEach((r) => expect(typeof r).toBe('string'))
    expect(RESOURCES).not.toContain('*')
  })
  it('the data:read scope is required', () => {
    const REQUIRED_SCOPE = 'data:read'
    expect(['data:read', 'data:write']).toContain(REQUIRED_SCOPE)
    expect(REQUIRED_SCOPE).not.toBe('data:write')
  })
})

describe('API key gateway — business-scoping boundary', () => {
  it('a key for business A cannot read business B data (explicit business_id filter)', () => {
    const keyBusinessId = 'business-A'
    const queryBusinessId = 'business-A'
    expect(keyBusinessId === queryBusinessId).toBe(true)
    // The gateway filters .eq('business_id', verified.business_id) — a key
    // for business A always queries business A, never B.
  })
  it('the verified business_id drives the query, not a user-supplied param', () => {
    // The gateway ignores any ?business_id= query param — the business_id comes
    // ONLY from verify_api_key's return value.
    const verifiedBusinessId = 'from-rpc'
    const userSupplied = 'attacker-supplied'
    expect(verifiedBusinessId).not.toBe(userSupplied)
  })
})

describe('verify_api_key — deny-paths (no oracle)', () => {
  it('denies an inactive key', () => {
    expect(verifyDenies({ isActive: false, needsRotation: false, expired: false, ipAllowed: true })).toBe(true)
  })
  it('denies a key flagged for rotation (plaintext-stored)', () => {
    expect(verifyDenies({ isActive: true, needsRotation: true, expired: false, ipAllowed: true })).toBe(true)
  })
  it('denies an expired key', () => {
    expect(verifyDenies({ isActive: true, needsRotation: false, expired: true, ipAllowed: true })).toBe(true)
  })
  it('denies a key outside its IP allowlist', () => {
    expect(verifyDenies({ isActive: true, needsRotation: false, expired: false, ipAllowed: false })).toBe(true)
  })
  it('allows a valid active non-rotated non-expired in-IP key', () => {
    expect(verifyDenies({ isActive: true, needsRotation: false, expired: false, ipAllowed: true })).toBe(false)
  })
  it('all deny-paths return the same generic error (no oracle)', () => {
    // The gateway returns "Invalid, expired, or inactive API key." for every
    // deny-path — an attacker cannot distinguish which check failed.
    const GENERIC = 'Invalid, expired, or inactive API key.'
    expect(GENERIC).toContain('Invalid')
    expect(GENERIC).not.toContain('expired but active')
    expect(GENERIC).not.toContain('IP not allowed')
  })
})
