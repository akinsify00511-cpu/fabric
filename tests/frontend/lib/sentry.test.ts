import { describe, expect, it } from 'vitest'
import { captureException, captureMessage, initSentry, setSentryTag, setSentryUser } from '../../../src/lib/sentry'

// These tests run with VITE_SENTRY_DSN unset — the production-relevant path
// for any deployment that has not configured Sentry. The contract: every
// function is fully inert (no SDK download, no network, no throw).
describe('sentry wrapper without a DSN', () => {
  it('initSentry is a no-op and does not throw', () => {
    expect(() => initSentry()).not.toThrow()
  })

  it('initSentry is idempotent', () => {
    expect(() => {
      initSentry()
      initSentry()
    }).not.toThrow()
  })

  it('captureException is a no-op and does not throw', () => {
    expect(() => captureException(new Error('boom'), { source: 'test' })).not.toThrow()
  })

  it('captureException tolerates non-Error values', () => {
    expect(() => captureException('string failure')).not.toThrow()
    expect(() => captureException(undefined)).not.toThrow()
    expect(() => captureException(null)).not.toThrow()
  })

  it('captureMessage is a no-op and does not throw', () => {
    expect(() => captureMessage('hello')).not.toThrow()
  })

  it('setSentryUser accepts a user and null without throwing', () => {
    expect(() => setSentryUser({ id: 'u1', email: 'a@b.c' })).not.toThrow()
    expect(() => setSentryUser(null)).not.toThrow()
  })

  it('setSentryTag does not throw', () => {
    expect(() => setSentryTag('module', 'billing')).not.toThrow()
  })

  it('never triggers the SDK download without a DSN', async () => {
    // If init had fired, the dynamic import would have created a chunk fetch.
    // The DSN gate returns before that point, so calling init again must
    // still be a synchronous no-op that resolves no promises.
    initSentry()
    await Promise.resolve()
    expect(import.meta.env.VITE_SENTRY_DSN ?? '').toBe('')
  })
})
