// Supabase Edge Function: send-signature-request
// Emails each signer on a signature request their unique signing link.
// Invoked when a business admin clicks "Send for signing".
//
// POST /functions/v1/send-signature-request
// Headers: Authorization: Bearer <user access token>
// Body: { request_id: string }
//
// Uses the business-scoped Resend config (settings.resend_api_key +
// settings.email_from_address) so each tenant sends from its own domain.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SignerRow {
  id: string
  name: string
  email: string
  signing_token: string
  status: string
}

function emailHtml(
  signerName: string,
  title: string,
  documentName: string,
  message: string | null,
  signingUrl: string,
  expiresAt: string | null,
  businessName: string
): string {
  const expiryLine = expiresAt
    ? `<p style="margin:0 0 16px;font-size:14px;color:#666;">This request expires on ${new Date(expiresAt).toLocaleDateString()}.</p>`
    : ''
  const messageLine = message
    ? `<div style="margin:0 0 24px;padding:16px;background:#F1F3F4;border-radius:8px;font-size:15px;color:#444;">${message}</div>`
    : ''
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F8F9FA;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#fff;border-radius:16px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="width:48px;height:48px;background:#4285F4;border-radius:12px;display:inline-block;"></div>
        <h1 style="margin:16px 0 0;font-size:24px;font-weight:700;color:#202124;">Avenize</h1>
      </div>
      <h2 style="margin:0 0 16px;font-size:20px;color:#202124;">${title}</h2>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#444;">
        Hi ${signerName}, ${businessName} has sent you a document to sign: <strong>${documentName}</strong>.
      </p>
      ${messageLine}
      ${expiryLine}
      <div style="text-align:center;margin:32px 0;">
        <a href="${signingUrl}" style="display:inline-block;padding:14px 32px;background:#4285F4;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">Review &amp; Sign</a>
      </div>
      <p style="margin:0;font-size:13px;color:#9AA0A6;">If the button doesn't work, copy this link: ${signingUrl}</p>
    </div>
    <p style="text-align:center;margin:24px 0 0;font-size:12px;color:#9AA0A6;">© ${new Date().getFullYear()} Avenize — The Business Operating System</p>
  </div>
</body></html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appUrl = Deno.env.get('APP_URL') || 'https://app.avenize.com'
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { request_id } = await req.json()
    if (!request_id) {
      return new Response(JSON.stringify({ error: 'request_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Load the request + signers (service role bypasses RLS).
    const { data: request, error: reqErr } = await supabase
      .from('signature_requests')
      .select('id, business_id, title, description, document_name, message, expires_at, status')
      .eq('id', request_id)
      .single()
    if (reqErr || !request) {
      return new Response(JSON.stringify({ error: 'Signature request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: signers, error: signerErr } = await supabase
      .from('signature_signers')
      .select('id, name, email, signing_token, status')
      .eq('request_id', request_id)
      .order('order_index')
      .returns<SignerRow[]>()
    if (signerErr || !signers) {
      return new Response(JSON.stringify({ error: 'Could not load signers' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve business name + business-scoped Resend config.
    const { data: business } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', request.business_id)
      .single()
    const businessName = business?.name || 'Avenize'

    const { data: apiKeyRow } = await supabase
      .from('settings')
      .select('value')
      .eq('business_id', request.business_id)
      .eq('key', 'resend_api_key')
      .maybeSingle()
    const { data: fromRow } = await supabase
      .from('settings')
      .select('value')
      .eq('business_id', request.business_id)
      .eq('key', 'email_from_address')
      .maybeSingle()

    const resendApiKey = apiKeyRow?.value || Deno.env.get('RESEND_API_KEY')
    const fromAddress = fromRow?.value || 'notifications@avenize.com'

    if (!resendApiKey) {
      // Still flip to pending so the admin can copy links manually, but
      // surface that email delivery is not configured.
      await supabase.from('signature_requests').update({ status: 'pending' }).eq('id', request_id)
      return new Response(JSON.stringify({
        success: false,
        warning: 'Resend API key not configured for this business. Request marked pending; copy signing links manually.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const results: { email: string; success: boolean; error?: string }[] = []
    let sentCount = 0

    for (const signer of signers) {
      const signingUrl = `${appUrl}/sign/${signer.signing_token}`
      const html = emailHtml(
        signer.name,
        request.title,
        request.document_name,
        request.message,
        signingUrl,
        request.expires_at,
        businessName
      )
      const subject = `Please sign: ${request.title}`

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            from: `${businessName} <${fromAddress}>`,
            to: signer.email,
            subject,
            html,
          }),
        })
        if (res.ok) {
          results.push({ email: signer.email, success: true })
          sentCount++
        } else {
          const body = await res.json().catch(() => ({}))
          results.push({ email: signer.email, success: false, error: body?.message || `HTTP ${res.status}` })
        }
      } catch (err) {
        results.push({ email: signer.email, success: false, error: String(err) })
      }
    }

    // Flip the request to pending only if at least one signer was emailed.
    if (sentCount > 0) {
      await supabase.from('signature_requests').update({ status: 'pending' }).eq('id', request_id)
    }

    return new Response(JSON.stringify({ success: true, sent: sentCount, total: signers.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('send-signature-request error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
