// Supabase Edge Function: Business Digest Delivery (§7.4)
// Called by the platform-ops-cron (or any scheduler) to deliver the daily/weekly
// business digest to each owner. Composes the digest server-side via the
// compose_business_digest RPC (§22: every line cites its source), then sends
// the email via Resend (the existing email provider — NO WhatsApp dependency).
//
// Guiding Principles: §0.2 (sentences over dashboards), §0.5 (proactive —
// the owner learns how their business is doing without opening the app),
// §7.4 (opt-in cadence, one line per fact, no jargon), §7.5 (audited — the
// RPC logs every delivery). §22: never fabricates — composed from real data.
//
// Trigger: the function accepts a JSON body { "type": "daily" | "weekly" }
// (default daily) and iterates all businesses with an owner who opted in.
// Fire-and-forget per business (one failure never aborts the batch).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMAIL_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #202124; background: #f8f9fa; }
  .container { max-width: 560px; margin: 0 auto; padding: 24px; }
  .card { background: #ffffff; border-radius: 12px; padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .h { font-size: 18px; font-weight: 600; color: #202124; margin: 0 0 4px 0; }
  .sub { font-size: 13px; color: #5F6368; margin: 0 0 20px 0; }
  .line { padding: 12px 0; border-bottom: 1px solid #f1f3f4; font-size: 15px; color: #202124; }
  .line:last-child { border-bottom: none; }
  .action { display: inline-block; margin-top: 6px; padding: 6px 14px; background: #155BB4; color: #fff; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 500; }
  .footer { text-align: center; font-size: 12px; color: #9AA0A6; margin-top: 20px; }
`

function digestToHtml(digest: any, appUrl: string, ownerName: string): string {
  const greeting = ownerName ? `Hi ${ownerName.split(' ')[0]}, here's your business digest.` : 'Here\'s your business digest.'
  const lines = (digest.lines || []).map((l: any) => {
    const action = l.action && l.route
      ? `<a class="action" href="${appUrl}${l.route}">${l.action}</a>`
      : ''
    return `<div class="line">${l.text}${action}</div>`
  }).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${EMAIL_STYLES}</style></head>
<body><div class="container"><div class="card">
  <p class="h">Your business digest</p>
  <p class="sub">${greeting}</p>
  ${lines}
  <p class="footer">Avenize · You're receiving this because you opted into ${digest.digest_type || 'daily'} digests. <a href="${appUrl}/app/settings" style="color:#5F6368;">Manage preferences</a></p>
</div></div></body></html>`
}

async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') || 'Avenize <digest@avenize.app>',
      to,
      subject,
      html,
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Resend error ${response.status}: ${text}`)
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const digestType: 'daily' | 'weekly' = body?.type === 'weekly' ? 'weekly' : 'daily'
    const explicitBusinessId: string | undefined = body?.business_id

    // Service-role client (this fn runs server-side from cron, no user JWT).
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const appUrl = Deno.env.get('APP_URL') || Deno.env.get('VITE_APP_URL') || 'https://avenize.app'

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Look up the Resend API key from settings (same path as send-email-notification).
    let resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'resend_api_key')
        .maybeSingle()
      resendKey = setting?.value || undefined
    }
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'Resend API key not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Determine which businesses to deliver to.
    let businessQuery = supabase.from('businesses').select('id, name')
    if (explicitBusinessId) {
      businessQuery = businessQuery.eq('id', explicitBusinessId)
    }
    const { data: businesses, error: bizErr } = await businessQuery
    if (bizErr) throw bizErr

    const results: { business_id: string; status: string; error?: string }[] = []
    for (const biz of businesses || []) {
      try {
        // send_business_digest composes + checks opt-in + idempotency + logs.
        const { data: sendResult, error: sendErr } = await supabase.rpc('send_business_digest', {
          p_business_id: biz.id,
          p_digest_type: digestType,
        })
        if (sendErr) throw sendErr
        const r = sendResult as any
        if (!r?.ok) {
          results.push({ business_id: biz.id, status: 'failed', error: r?.error })
          continue
        }
        if (r.skipped) {
          results.push({ business_id: biz.id, status: r.skipped })  // recently_sent / opted_out
          continue
        }

        // Actually deliver the email via Resend (the RPC composed + logged it).
        const digest = r.digest
        const to = digest?.recipient_email
        const name = digest?.recipient_name || biz.name
        if (!to) {
          results.push({ business_id: biz.id, status: 'no_owner_email' })
          continue
        }
        const subject = digestType === 'weekly'
          ? `Your weekly ${biz.name} digest`
          : `Your daily ${biz.name} digest`
        const html = digestToHtml(digest, appUrl, name)
        await sendEmail(resendKey, to, subject, html)
        results.push({ business_id: biz.id, status: 'sent' })
      } catch (e) {
        // Fire-and-forget per business (§24 best-effort): one failure never aborts the batch.
        results.push({ business_id: biz.id, status: 'failed', error: String(e) })
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      type: digestType,
      delivered: results.filter(r => r.status === 'sent').length,
      skipped: results.filter(r => r.status !== 'sent' && r.status !== 'failed').length,
      failed: results.filter(r => r.status === 'failed').length,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
