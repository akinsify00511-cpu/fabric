// resend-webhook — delivery events from Resend (svix-signed).
//
// Updates the email_events ledger by provider_message_id. Status only moves
// FORWARD (a late 'sent' never downgrades a 'delivered'). Signature is the
// authentication — no JWT.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_WEBHOOK_SECRET.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mapResendEventType, shouldAdvanceEmailStatus, verifySvixSignature } from '../_shared/emailRender.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

serve(async (req) => {
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

  const event = JSON.parse(rawBody)
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

  if (shouldAdvanceEmailStatus(row.status, nextStatus)) {
    await admin.from('email_events').update({ status: nextStatus }).eq('id', row.id)
  }
  return json({ status: 'processed' })
})
