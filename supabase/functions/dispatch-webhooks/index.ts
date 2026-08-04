/**
 * DISPATCH-WEBHOOKS EDGE FUNCTION
 * 
 * Dispatches webhook events to registered endpoints.
 * Called by database triggers or cron jobs.
 * 
 * Usage:
 * POST /functions/v1/dispatch-webhooks
 * Body: { "event": "deal.won", "payload": { ... } }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookPayload {
  event: string
  payload: Record<string, unknown>
  timestamp: string
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
    const { event, payload }: WebhookPayload = await req.json()
    
    if (!event) {
      return new Response(
        JSON.stringify({ error: 'Missing event parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const webhookPayload = {
      event,
      payload,
      timestamp: new Date().toISOString(),
    }

    // Find all active webhooks subscribed to this event
    const { data: webhooks, error: webhookError } = await supabase
      .from('webhooks')
      .select('*')
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
      webhooks.map(async (webhook) => {
        const startTime = Date.now()
        
        try {
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Avenize-Event': event,
              'X-Avenize-Timestamp': webhookPayload.timestamp,
              'User-Agent': 'Avenize-Webhook/1.0',
            },
            body: JSON.stringify(webhookPayload),
            signal: AbortSignal.timeout(30000), // 30 second timeout
          })

          const duration = Date.now() - startTime
          const success = response.ok

          // Log the dispatch attempt
          await supabase.from('webhook_logs').insert({
            webhook_id: webhook.id,
            event,
            status: success ? 'success' : 'failed',
            response_status: response.status,
            response_body: success ? null : await response.text().catch(() => 'Unable to read response'),
            duration_ms: duration,
          })

          // Update webhook stats
          await supabase.from('webhooks').update({
            last_triggered_at: new Date().toISOString(),
            last_success_at: success ? new Date().toISOString() : webhook.last_success_at,
            last_error: success ? null : `HTTP ${response.status}: ${response.statusText}`,
          }).eq('id', webhook.id)

          return { webhook_id: webhook.id, success, status: response.status }
        } catch (error) {
          const duration = Date.now() - startTime
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'

          // Log the failure
          await supabase.from('webhook_logs').insert({
            webhook_id: webhook.id,
            event,
            status: 'failed',
            response_status: null,
            response_body: errorMessage,
            duration_ms: duration,
          })

          // Update webhook with error
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
