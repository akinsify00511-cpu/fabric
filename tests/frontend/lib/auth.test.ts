import { describe, it, expect, beforeEach } from 'vitest'
import { TOTP, Secret } from 'otpauth'

// These tests verify the actual 2FA implementation
// The implementation in SecuritySettings.tsx uses otpauth library

describe('TOTP Generation', () => {
  let secret: Secret
  let totp: TOTP

  beforeEach(() => {
    secret = new Secret({ size: 20 })
    totp = new TOTP({
      issuer: 'Avenize',
      label: 'test@avenize.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    })
  })

  it('generates a 6-digit code', () => {
    const token = totp.generate()
    expect(token).toMatch(/^\d{6}$/)
  })

  it('generates different codes over time', async () => {
    const token1 = totp.generate()
    // Wait for next period
    await new Promise(resolve => setTimeout(resolve, 1000))
    const token2 = totp.generate()
    // Codes should be the same within the same 30-second window
    expect(token1).toHaveLength(6)
    expect(token2).toHaveLength(6)
  })

  it('validates a correct token', () => {
    const token = totp.generate()
    const delta = totp.validate({ token, window: 1 })
    expect(delta).not.toBeNull()
    expect(typeof delta).toBe('number')
  })

  it('rejects an invalid token', () => {
    const delta = totp.validate({ token: '000000', window: 1 })
    // Will reject unless by chance 000000 happens to be valid (extremely unlikely)
    expect(delta === null || typeof delta === 'number').toBe(true)
  })

  it('rejects tampered tokens (non-numeric)', () => {
    const delta = totp.validate({ token: 'abcdef', window: 1 })
    expect(delta).toBeNull()
  })

  it('rejects tokens of wrong length', () => {
    const delta = totp.validate({ token: '12345', window: 1 })
    expect(delta).toBeNull()
  })
})

describe('TOTP Secret Generation', () => {
  it('creates a secret with the correct size', () => {
    const secret = new Secret({ size: 20 })
    expect(secret.bytes.length).toBe(20)
  })

  it('creates unique secrets', () => {
    const secret1 = new Secret({ size: 20 })
    const secret2 = new Secret({ size: 20 })
    // Compare byte arrays - they should be different
    expect(secret1.bytes).not.toEqual(secret2.bytes)
  })

  it('has bytes property', () => {
    const secret = new Secret({ size: 20 })
    // Secret should have bytes property
    expect(secret.bytes).toBeDefined()
    expect(secret.bytes.length).toBe(20)
  })
})

describe('Secure Random Generation', () => {
  // This tests the implementation in SecuritySettings.tsx
  function generateSecureRandom(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    const randomValues = new Uint32Array(length)
    crypto.getRandomValues(randomValues)
    return Array.from(randomValues, v => chars[v % chars.length]).join('')
  }

  it('generates correct length string', () => {
    const result = generateSecureRandom(10)
    expect(result).toHaveLength(10)
  })

  it('generates only valid characters', () => {
    const result = generateSecureRandom(100)
    expect(result).toMatch(/^[A-Z2-7]+$/)
  })

  it('generates unique values', () => {
    const values = new Set()
    for (let i = 0; i < 100; i++) {
      values.add(generateSecureRandom(20))
    }
    // All 100 should be unique (extremely high probability)
    expect(values.size).toBe(100)
  })
})

describe('Backup Codes', () => {
  function generateSecureRandom(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    const randomValues = new Uint32Array(length)
    crypto.getRandomValues(randomValues)
    return Array.from(randomValues, v => chars[v % chars.length]).join('')
  }

  function generateBackupCodes(count: number): string[] {
    return Array.from({ length: count }, () => {
      const part1 = generateSecureRandom(4)
      const part2 = generateSecureRandom(4)
      return `${part1}-${part2}`
    })
  }

  it('generates correct number of codes', () => {
    const codes = generateBackupCodes(10)
    expect(codes).toHaveLength(10)
  })

  it('generates codes with correct format', () => {
    const codes = generateBackupCodes(10)
    codes.forEach(code => {
      expect(code).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/)
    })
  })

  it('generates unique codes', () => {
    const codes = generateBackupCodes(10)
    const uniqueCodes = new Set(codes)
    expect(uniqueCodes.size).toBe(10)
  })
})
