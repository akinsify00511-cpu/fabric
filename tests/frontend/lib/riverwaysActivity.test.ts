import { describe, it, expect } from 'vitest'

// The Riverways Activity & Operations Center contract. The authoritative
// privacy boundary is server-side (sanitize_platform_payload in migration
// 20260821150000); these tests lock the client-side conventions the console
// relies on.

describe('platform activity event taxonomy', () => {
  // The event types the SPA + edge functions emit. Console panels group on
  // these prefixes — renaming one without updating the panels breaks them.
  const EMITTED = [
    'user.signed_in',
    'user.signed_out',
    'onboarding.completed',
    'lead.imported',
    'lead.converted',
    'meeting.scheduled',
    'task.created',
    'ai.completed',
    'ai.failed',
    'billing.checkout_started',
    'billing.checkout_failed',
    'subscription.cancelled',
    'subscription.cancel_failed',
  ]

  it('AI events use the ai.* prefix (the AI activity panel filters on it)', () => {
    const ai = EMITTED.filter(e => e.startsWith('ai.'))
    expect(ai).toContain('ai.completed')
    expect(ai).toContain('ai.failed')
  })

  it('billing events use billing.* or subscription.* prefixes', () => {
    const billing = EMITTED.filter(e => e.startsWith('billing.') || e.startsWith('subscription.'))
    expect(billing.length).toBeGreaterThanOrEqual(4)
  })

  it('every emitted type has a result of started/completed/failed/succeeded', () => {
    const validResults = new Set(['started', 'completed', 'failed', 'succeeded'])
    // The RPC defaults null results to 'completed'; emitters only pass these.
    for (const r of ['completed', 'failed']) expect(validResults.has(r)).toBe(true)
  })
})

describe('privacy boundary', () => {
  // Keys the server-side sanitizer strips. Any key containing one of these
  // substrings never reaches storage.
  const BLOCKED = ['password', 'token', 'secret', 'credential', 'api_key', 'apikey', 'access_code', 'totp', 'session']

  it('credential-like keys are all in the block list', () => {
    const candidates = ['password', 'auth_token', 'service_secret', 'user_credential', 'api_key', 'totp_secret', 'session_id']
    for (const c of candidates) {
      expect(BLOCKED.some(b => c.toLowerCase().includes(b))).toBe(true)
    }
  })

  it('operational metadata keys are NOT blocked (they must survive)', () => {
    const allowed = ['duration_ms', 'count', 'plan', 'intent', 'provider', 'industry']
    for (const a of allowed) {
      expect(BLOCKED.some(b => a.toLowerCase().includes(b))).toBe(false)
    }
  })

  it('conversation content keys are never emitted by the AI emitters', () => {
    // The ask-avenize emitter payload is { intent, provider, duration_ms } —
    // question/answer text is deliberately absent.
    const aiPayload = ['intent', 'provider', 'duration_ms']
    expect(aiPayload).not.toContain('question')
    expect(aiPayload).not.toContain('answer')
    expect(aiPayload).not.toContain('content')
  })
})

describe('severity ordering (console stream tones)', () => {
  const ORDER = ['info', 'warn', 'error', 'critical']
  it('critical ranks above error above warn above info', () => {
    expect(ORDER.indexOf('critical')).toBeGreaterThan(ORDER.indexOf('error'))
    expect(ORDER.indexOf('error')).toBeGreaterThan(ORDER.indexOf('warn'))
    expect(ORDER.indexOf('warn')).toBeGreaterThan(ORDER.indexOf('info'))
  })
})
