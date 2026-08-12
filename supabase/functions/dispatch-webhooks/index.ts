/**
 * DISPATCH-WEBHOOKS EDGE FUNCTION
 *
 * Dispatches webhook events to registered endpoints.
 * Called by external systems (with business_id + secret) or cron jobs.
 *
 * Usage:
 * POST /functions/v1/dispatch-webhooks
 * Body: { "event": "deal.won", "payload": { ... }, "business_id": "...", "secret": "..." }
 *
 * Security: requires business_id + secret matching an active webhook for that
 * business. Prevents cross-tenant triggering and unauthorized dispatch.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DispatchRequest {
  event: string
  payload: Record<string, unknown>
  business_id?: string
  secret?: string
}

// SSRF protection — block internal/private IPs and localhost
function isInternalUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    const host = url.hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true
    if (host.startsWith('10.') || host.startsWith('192.168.')) return true
    if (host.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)) return true
    if (host.startsWith('169.254.')) return true // link-local
    if (host.endsWith('.local') || host.endsWith('.internal')) return true
    if (host === '0' || host === '::1' || host === '[::1]') return true
    return false
  } catch {
    return true // invalid URL = treat as internal (block)
  }
}

function buildOutboundHeaders(webhook: { auth_type: string; auth_header: string | null; auth_value: string | null }, event: string, timestamp: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Avenize-Event': event,
    'X-Avenize-Timestamp': timestamp,
    'User-Agent': 'Avenize-Webhook/1.0',
  }
  // Apply configured auth to the outgoing request
  if (webhook.auth_type && webhook.auth_type !== 'none' && webhook.auth_value) {
    const headerName = webhook.auth_header || 'Authorization'
    if (webhook.auth_type === 'bearer') {
      headers[headerName] = `Bearer ${webhook.auth_value}`
    } else if (webhook.auth_type === 'basic') {
      headers[headerName] = `Basic ${webhook.auth_value}`
    } else {
      headers[headerName] = webhook.auth_value // signature, apikey, etc.
    }
  }
  return headers
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const { event, payload, business_id, secret }: DispatchRequest = await req.json()

    if (!event) {
      return new Response(
        JSON.stringify({ error: 'Missing event parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!business_id || !secret) {
      return new Response(
        JSON.stringify({ error: 'business_id and secret are required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // SECURITY: Verify the caller knows a valid webhook secret for this business.
    // This prevents unauthorized triggering and cross-tenant access.
    const { data: verifyWebhook, error: verifyError } = await supabase
      .from('webhooks')
      .select('id, secret')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (verifyError || !verifyWebhook) {
      return new Response(
        JSON.stringify({ error: 'No active webhook found for this business' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (verifyWebhook.secret !== secret) {
      return new Response(
        JSON.stringify({ error: 'Invalid secret' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const timestamp = new Date().toISOString()
    const webhookPayload = { event, payload, timestamp }

    // Find active webhooks subscribed to this event, scoped to this business
    const { data: webhooks, error: webhookError } = await supabase
      .from('webhooks')
      .select('*')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .contains('events', [event])

    if (webhookError) {
      console.error('Error fetching webhooks:', webhookError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch webhooks' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!webhooks || webhooks.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No webhooks registered for this event', dispatched: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Dispatch to all matching webhooks
    const results = await Promise.allSettled(
      webhooks.map(async (webhook: { id: string; url: string; auth_type: string; auth_header: string | null; auth_value: string | null; last_success_at: string | null }) => {
        const startTime = Date.now()

        // SSRF check
        if (isInternalUrl(webhook.url)) {
          await supabase.from('webhook_logs').insert({
            webhook_id: webhook.id,
            event,
            status: 'failed',
            response_status: null,
            response_body: 'Blocked: internal URL not allowed',
            duration_ms: 0,
          })
          return { webhook_id: webhook.id, success: false, error: 'Blocked: internal URL not allowed' }
        }

        try {
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: buildOutboundHeaders(webhook, event, timestamp),
            body: JSON.stringify(webhookPayload),
            signal: AbortSignal.timeout(30000),
          })

          const duration = Date.now() - startTime
          const success = response.ok

          await supabase.from('webhook_logs').insert({
            webhook_id: webhook.id,
            event,
            status: success ? 'success' : 'failed',
            response_status: response.status,
            response_body: success ? null : await response.text().catch(() => 'Unable to read response'),
            duration_ms: duration,
          })

          await supabase.from('webhooks').update({
            last_triggered_at: new Date().toISOString(),
            last_success_at: success ? new Date().toISOString() : webhook.last_success_at,
            last_error: success ? null : `HTTP ${response.status}: ${response.statusText}`,
          }).eq('id', webhook.id)

          return { webhook_id: webhook.id, success, status: response.status }
        } catch (error) {
          const duration = Date.now() - startTime
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'

          await supabase.from('webhook_logs').insert({
            webhook_id: webhook.id,
            event,
            status: 'failed',
            response_status: null,
            response_body: errorMessage,
            duration_ms: duration,
          })

          await supabase.from('webhooks').update({
            last_triggered_at: new Date().toISOString(),
            last_error: errorMessage,
          }).eq('id', webhook.id)

          return { webhook_id: webhook.id, success: false, error: errorMessage }
        }
      })
    )

    const successful = results.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<unknown>).value && (r as PromiseFulfilledResult<{success: boolean}>).value.success).length
    const failed = results.length - successful

    return new Response(
      JSON.stringify({
        message: `Dispatched to ${results.length} webhooks`,
        successful,
        failed,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Webhook dispatch error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
