// Supabase Edge Function: Platform Pager
//
// Proactive paging, not passive dashboard. Reads OPEN CRITICAL incidents that
// have not yet been paged (paged_at IS NULL) and dispatches a page to each
// active on-call contact via email (Resend) and/or SMS (Termii). Records a
// platform_pages audit row for every page sent, then marks the incident
// paged_at so it isn't re-paged on the next run.
//
// This is the PUSH half of the ops dashboard: the dashboard is where you go
// AFTER being paged, not the primary detection mechanism. Detection is the
// threshold->incident automation (evaluate_platform_alerts); this function is
// the escalation.
//
// Invocation: external cron (Vercel cron / GitHub Actions) every 1-2 min,
// gated by PLATFORM_PAGER_CRON_SECRET. Service-role (no client JWT).
//
// WhatsApp/Meta NOT used for paging (no external dependency built there).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error: string | null }> {
  const key = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('PLATFORM_PAGER_FROM_EMAIL') || Deno.env.get('FROM_EMAIL') || 'ops@riverwayse.com'
  if (!key) return { ok: false, error: 'no RESEND_API_KEY configured' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true, error: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function sendSms(to: string, message: string): Promise<{ ok: boolean; error: string | null }> {
  const key = Deno.env.get('TERMII_API_KEY')
  const sender = Deno.env.get('TERMII_SENDER_ID') || 'Riverwayse'
  if (!key) return { ok: false, error: 'no TERMII_API_KEY configured' }
  try {
    const res = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, to, from: sender, sms: message, type: 'plain', channel: 'generic' }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true, error: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function incidentEmail(inc: { title: string; summary: string | null; opened_at: string; id: string }, appUrl: string): { subject: string; html: string } {
  const subject = `[CRITICAL] ${inc.title}`
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#202124;max-width:560px;margin:0 auto;padding:20px;">
  <div style="background:#A63A2F;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:600;">CRITICAL INCIDENT</div>
  <div style="background:#fff;border:1px solid #E8EAED;border-top:none;padding:20px;border-radius:0 0 12px 12px;">
    <h1 style="font-size:18px;margin:0 0 8px;">${inc.title}</h1>
    <p style="color:#5F6368;margin:0 0 12px;">${inc.summary ?? 'No summary.'}</p>
    <p style="color:#9AA0A6;font-size:12px;margin:0 0 16px;">Opened ${new Date(inc.opened_at).toLocaleString()}</p>
    <a href="${appUrl}/platform-ops" style="display:inline-block;padding:10px 20px;background:#155BB4;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Open Ops Dashboard</a>
  </div>
</div>`
  return { subject, html }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const cronSecret = Deno.env.get('PLATFORM_PAGER_CRON_SECRET')
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret')
    if (provided !== cronSecret) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const appUrl = Deno.env.get('APP_URL') || Deno.env.get('VITE_APP_URL') || 'https://avenize.app'
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'missing supabase env' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  // Open critical incidents that haven't been paged yet.
  const { data: incidents, error: incErr } = await supabase
    .from('platform_incidents')
    .select('id, opened_at, trigger_key, severity, title, summary')
    .eq('status', 'open')
    .eq('severity', 'critical')
    .is('paged_at', null)
  if (incErr) {
    return new Response(JSON.stringify({ error: incErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!incidents || incidents.length === 0) {
    return new Response(JSON.stringify({ paged: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: contacts, error: cErr } = await supabase
    .from('platform_oncall_contacts')
    .select('id, name, email, phone, channel')
    .eq('is_active', true)
  if (cErr || !contacts) {
    return new Response(JSON.stringify({ error: cErr?.message ?? 'no contacts' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const pages: Record<string, unknown>[] = []
  for (const inc of incidents) {
    const { subject, html } = incidentEmail(inc, appUrl)
    const smsMsg = `[CRITICAL] ${inc.title}. ${inc.summary ?? ''} Open: ${appUrl}/platform-ops`.slice(0, 160)
    for (const c of contacts) {
      const channels: ('email' | 'sms')[] = c.channel === 'both'
        ? (c.email ? ['email'] : []).concat(c.phone ? ['sms'] : [])
        : c.channel === 'sms' ? (c.phone ? ['sms'] : []) : (c.email ? ['email'] : [])
      for (const ch of channels) {
        let result: { ok: boolean; error: string | null }
        let recipient = ''
        if (ch === 'email' && c.email) {
          recipient = c.email
          result = await sendEmail(c.email, subject, html)
        } else if (ch === 'sms' && c.phone) {
          recipient = c.phone
          result = await sendSms(c.phone, smsMsg)
        } else {
          continue
        }
        pages.push({
          incident_id: inc.id,
          contact_id: c.id,
          channel: ch,
          recipient,
          delivery_status: result.ok ? 'sent' : 'failed',
          error: result.error,
        })
      }
    }
    // Mark paged regardless of per-recipient success — we attempted; a failed
    // page is recorded in platform_pages for follow-up, not retried blindly.
    await supabase.from('platform_incidents').update({ paged_at: new Date().toISOString() }).eq('id', inc.id)
  }

  // Write the page audit rows (best-effort batch).
  if (pages.length > 0) {
    await supabase.from('platform_pages').insert(pages)
  }

  return new Response(JSON.stringify({
    incidents: incidents.length,
    pages: pages.length,
    failed: pages.filter((p) => p.delivery_status === 'failed').length,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
