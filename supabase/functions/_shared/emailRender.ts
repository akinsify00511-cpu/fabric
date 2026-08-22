// Transactional email template renderer.
// Pure TypeScript — unit-tested by vitest; the email-service edge function
// imports the same module.

export interface EmailTemplate {
  key: string
  subject: string
  body_html: string
  body_text: string
}

// {{placeholder}} substitution + {{#flag}}...{{/flag}} truthy sections.
// Unknown placeholders render as empty string — never leaked raw braces,
// never fabricated values.
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  let out = template
  out = out.replace(/\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key: string, inner: string) =>
    data[key] ? inner : '',
  )
  out = out.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_m, key: string) => {
    const v = data[key]
    return v === null || v === undefined ? '' : String(v)
  })
  return out
}

export function renderEmail(template: EmailTemplate, data: Record<string, unknown>): { subject: string; html: string; text: string } {
  return {
    subject: renderTemplate(template.subject, data),
    html: renderTemplate(template.body_html, data),
    text: renderTemplate(template.body_text, data),
  }
}

// Delivery status precedence — a webhook event may only move a message
// FORWARD (a late 'sent' must not downgrade a 'delivered').
export const EMAIL_STATUS_RANK: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  bounced: 3,
  complained: 3,
  failed: 3,
  cancelled: 3,
}

export function shouldAdvanceEmailStatus(current: string, next: string): boolean {
  const cur = EMAIL_STATUS_RANK[current] ?? 0
  const nxt = EMAIL_STATUS_RANK[next] ?? 0
  return nxt > cur
}

export function mapResendEventType(type: unknown): string | null {
  switch (type) {
    case 'email.sent':
      return 'sent'
    case 'email.delivered':
      return 'delivered'
    case 'email.opened':
      return 'opened'
    case 'email.bounced':
      return 'bounced'
    case 'email.complained':
      return 'complained'
    default:
      return null
  }
}

// Svix webhook verification (Resend signs webhooks with svix):
//   signature = base64( HMAC-SHA256(`${id}.${timestamp}.${rawBody}`, secret) )
// The secret comes as 'whsec_<base64>'; the prefix is stripped before use.
export async function verifySvixSignature(
  rawBody: string,
  secret: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false
  const ts = Number(svixTimestamp)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) return false

  const secretBytes = secret.startsWith('whsec_') ? base64ToBytes(secret.slice(6)) : new TextEncoder().encode(secret)
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${svixId}.${svixTimestamp}.${rawBody}`))
  const expected = bytesToBase64(new Uint8Array(digest))

  // Header may carry multiple space-separated 'v1,<sig>' entries (rotation).
  return svixSignature
    .split(' ')
    .filter((p) => p.startsWith('v1,'))
    .some((p) => constantTimeEqualText(p.slice(3), expected))
}

function constantTimeEqualText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
