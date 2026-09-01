// resend-webhook — delivery events from Resend (svix-signed).
// Updates the email_events ledger by provider_message_id. Status only moves FORWARD.
// Signature is the authentication — no JWT.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, svix-id, svix-timestamp, svix-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_STATUS_RANK: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  bounced: 3,
  complained: 3,
  failed: 3,
  cancelled: 3,
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders })
}

function mapResendEventType(type: unknown): string | null {
  switch (type) {
    case 'email.sent': return 'sent'
    case 'email.delivered': return 'delivered'
    case 'email.opened': return 'opened'
    case 'email.bounced': return 'bounced'
    case 'email.complained': return 'complained'
    default: return null
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifySvixSignature(
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

  const encodedSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const binary = atob(encodedSecret)
  const secretBytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) secretBytes[i] = binary.charCodeAt(i)

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${svixId}.${svixTimestamp}.${rawBody}`),
  )

  let binaryDigest = ''
  for (const byte of new Uint8Array(digest)) binaryDigest += String.fromCharCode(byte)
  const expected = btoa(binaryDigest)

  return svixSignature
    .split(' ')
    .filter((part) => part.startsWith('v1,'))
    .some((part) => constantTimeEqual(part.slice(3), expected))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  if (!webhookSecret) return json({ error: 'Not configured' }, 503)

  const rawBody = await req.text()
  const valid = await verifySvixSignature(
    rawBody,
    webhookSecret,
    req.headers.get('svix-id'),
    req.headers.get('svix-timestamp'),
    req.headers.get('svix-signature'),
  )
  if (!valid) return json({ error: 'Invalid signature' }, 401)

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const nextStatus = mapResendEventType(event?.type)
  const messageId = event?.data?.email_id
  if (!nextStatus || !messageId) return json({ status: 'ignored' })

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: rows } = await admin
    .from('email_events')
    .select('id, status')
    .eq('provider_message_id', String(messageId))
    .limit(1)

  const row = rows?.[0]
  if (!row) return json({ status: 'ignored', reason: 'unknown message' })

  if ((EMAIL_STATUS_RANK[nextStatus] ?? 0) > (EMAIL_STATUS_RANK[row.status] ?? 0)) {
    await admin.from('email_events').update({ status: nextStatus }).eq('id', row.id)
  }

  return json({ status: 'processed' })
})
