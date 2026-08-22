// email-service — the ONE transactional email service.
//
// Actions:
//   send    { emailEventId }  — deliver one queued email_events row
//   process { limit? }        — drain the queue (cron-invoked)
//
// Callers: the email_events fanout trigger (service key), a cron secret, or a
// platform admin. Delivery goes through Resend; the provider message id and
// the resulting status are written back to the ledger. Business sending
// domains (business_email_domains, verified) override the platform From.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//      EMAIL_FROM (default platform From), EMAIL_SERVICE_CRON_SECRET (optional).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmail } from '../_shared/emailRender.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const defaultFrom = Deno.env.get('EMAIL_FROM') || 'Avenize <notifications@avenize.app>'
  const cronSecret = Deno.env.get('EMAIL_SERVICE_CRON_SECRET')

  // --- Authorization: service key, cron secret, or nothing else ---
  const authHeader = req.headers.get('Authorization') || ''
  const bearer = authHeader.replace(/^Bearer\s+/i, '')
  const isService = bearer === serviceKey
  const isCron = cronSecret && req.headers.get('x-cron-secret') === cronSecret
  if (!isService && !isCron) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)
  const body = await req.json().catch(() => ({}))
  const action = String(body.action || 'process')

  const sendOne = async (eventId: string): Promise<{ id: string; status: string; error?: string }> => {
    const { data: eventRows } = await admin.from('email_events').select('*').eq('id', eventId).limit(1)
    const event = eventRows?.[0]
    if (!event) return { id: eventId, status: 'missing' }
    if (event.status !== 'queued') return { id: eventId, status: event.status }

    const { data: templateRows } = await admin
      .from('transactional_email_templates')
      .select('key, subject, body_html, body_text')
      .eq('key', event.template)
      .eq('active', true)
      .limit(1)
    const template = templateRows?.[0]
    if (!template) {
      await admin.from('email_events').update({ status: 'failed', error: 'unknown template' }).eq('id', eventId)
      return { id: eventId, status: 'failed', error: 'unknown template' }
    }

    // Business sending domain wins when verified.
    let from = defaultFrom
    if (event.business_id) {
      const { data: domains } = await admin
        .from('business_email_domains')
        .select('domain, from_addresses')
        .eq('business_id', event.business_id)
        .eq('status', 'verified')
        .limit(1)
      const domain = domains?.[0]
      if (domain?.domain) {
        const local = domain.from_addresses?.[0] || 'notifications'
        from = `${local}@${domain.domain}`
      }
    }

    if (!resendKey) {
      await admin.from('email_events').update({ status: 'failed', error: 'RESEND_API_KEY not configured' }).eq('id', eventId)
      return { id: eventId, status: 'failed', error: 'RESEND_API_KEY not configured' }
    }

    const rendered = renderEmail(template, { ...(event.payload ?? {}), subject: event.subject })
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [event.recipient],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
    })
    const resBody = await res.json().catch(() => null)

    if (!res.ok || !resBody?.id) {
      const message = resBody?.message || `HTTP ${res.status}`
      await admin.from('email_events').update({ status: 'failed', error: message }).eq('id', eventId)
      return { id: eventId, status: 'failed', error: message }
    }

    await admin
      .from('email_events')
      .update({ status: 'sent', provider_message_id: resBody.id, provider: 'resend' })
      .eq('id', eventId)
    return { id: eventId, status: 'sent' }
  }

  if (action === 'send') {
    const emailEventId = String(body.emailEventId || '')
    if (!emailEventId) return json({ error: 'emailEventId is required' }, 400)
    return json(await sendOne(emailEventId))
  }

  if (action === 'process') {
    const limit = Math.min(Number(body.limit) || 25, 100)
    const { data: queued } = await admin
      .from('email_events')
      .select('id')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(limit)
    const results = []
    for (const row of queued ?? []) {
      results.push(await sendOne(row.id))
    }
    return json({ processed: results.length, results })
  }

  return json({ error: 'Unknown action' }, 400)
})
