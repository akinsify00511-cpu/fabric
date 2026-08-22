import { describe, it, expect } from 'vitest'
import {
  mapResendEventType,
  renderEmail,
  renderTemplate,
  shouldAdvanceEmailStatus,
  verifySvixSignature,
  EMAIL_STATUS_RANK,
} from '../../../supabase/functions/_shared/emailRender'

describe('template rendering', () => {
  it('substitutes placeholders from the payload', () => {
    expect(renderTemplate('Hello {{name}}, your plan is {{plan}}', { name: 'Ada', plan: 'Team' })).toBe(
      'Hello Ada, your plan is Team',
    )
  })

  it('renders unknown placeholders as empty — never leaks braces, never fabricates', () => {
    expect(renderTemplate('Amount: {{amount}}', {})).toBe('Amount: ')
    expect(renderTemplate('{{missing}}', {})).toBe('')
  })

  it('renders truthy sections only when the flag is present', () => {
    const tpl = 'Task: {{title}}{{#due_date}}, due {{due_date}}{{/due_date}}'
    expect(renderTemplate(tpl, { title: 'Call the supplier' })).toBe('Task: Call the supplier')
    expect(renderTemplate(tpl, { title: 'Call the supplier', due_date: 'Friday' })).toBe('Task: Call the supplier, due Friday')
  })

  it('renders the full email (subject + html + text)', () => {
    const rendered = renderEmail(
      { key: 'payment_receipt', subject: 'Receipt {{reference}}', body_html: '<b>{{amount}}</b>', body_text: '{{amount}}' },
      { reference: 'avz_1', amount: '₦48,000' },
    )
    expect(rendered.subject).toBe('Receipt avz_1')
    expect(rendered.html).toBe('<b>₦48,000</b>')
    expect(rendered.text).toBe('₦48,000')
  })
})

describe('delivery status precedence', () => {
  it('only moves forward (a late sent never downgrades delivered)', () => {
    expect(shouldAdvanceEmailStatus('queued', 'sent')).toBe(true)
    expect(shouldAdvanceEmailStatus('sent', 'delivered')).toBe(true)
    expect(shouldAdvanceEmailStatus('delivered', 'sent')).toBe(false)
    expect(shouldAdvanceEmailStatus('opened', 'bounced')).toBe(false)
    expect(shouldAdvanceEmailStatus('delivered', 'opened')).toBe(true)
  })

  it('unknown current ranks lowest (recoverable)', () => {
    expect(EMAIL_STATUS_RANK.queued).toBe(0)
    expect(shouldAdvanceEmailStatus('sent', 'sent')).toBe(false)
  })
})

describe('resend event mapping', () => {
  it('maps known delivery events', () => {
    expect(mapResendEventType('email.sent')).toBe('sent')
    expect(mapResendEventType('email.delivered')).toBe('delivered')
    expect(mapResendEventType('email.opened')).toBe('opened')
    expect(mapResendEventType('email.bounced')).toBe('bounced')
    expect(mapResendEventType('email.complained')).toBe('complained')
  })

  it('ignores unknown event types', () => {
    expect(mapResendEventType('domain.verified')).toBeNull()
    expect(mapResendEventType(undefined)).toBeNull()
  })
})

describe('svix signature verification', () => {
  function toBase64(bytes: Uint8Array): string {
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
  }

  async function sign(id: string, ts: string, body: string, secretBytes: Uint8Array): Promise<string> {
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`))
    return toBase64(new Uint8Array(digest))
  }

  it('accepts a valid whsec_-prefixed signature', async () => {
    const rawSecret = new Uint8Array(32).fill(7)
    const secret = `whsec_${toBase64(rawSecret)}`
    const id = 'msg_1'
    const ts = String(Math.floor(Date.now() / 1000))
    const body = '{"type":"email.delivered","data":{"email_id":"abc"}}'
    const sig = await sign(id, ts, body, rawSecret)
    await expect(verifySvixSignature(body, secret, id, ts, `v1,${sig}`)).resolves.toBe(true)
  })

  it('rejects a tampered body and stale timestamps', async () => {
    const rawSecret = new Uint8Array(32).fill(7)
    const secret = `whsec_${toBase64(rawSecret)}`
    const id = 'msg_1'
    const ts = String(Math.floor(Date.now() / 1000))
    const body = '{"a":1}'
    const sig = await sign(id, ts, body, rawSecret)
    await expect(verifySvixSignature('{"a":2}', secret, id, ts, `v1,${sig}`)).resolves.toBe(false)
    const stale = String(Math.floor(Date.now() / 1000) - 3600)
    const staleSig = await sign(id, stale, body, rawSecret)
    await expect(verifySvixSignature(body, secret, id, stale, `v1,${staleSig}`)).resolves.toBe(false)
  })

  it('rejects missing headers', async () => {
    await expect(verifySvixSignature('{}', 'whsec_x', null, '1', 'v1,x')).resolves.toBe(false)
    await expect(verifySvixSignature('{}', '', 'a', '1', 'v1,x')).resolves.toBe(false)
  })
})
