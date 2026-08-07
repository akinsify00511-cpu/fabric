// Supabase Edge Function: Flutterwave Webhook
// Receives Flutterwave webhook events and processes payment confirmations

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Flutterwave webhook event types
type FlutterwaveEvent = {
  event: string
  data: {
    id: number
    tx_ref: string
    flw_ref: string
    amount: number
    currency: string
    status: string
    customer: {
      email: string
      name: string
    }
    meta?: Record<string, any>
    created_at: string
  }
}

// Verify Flutterwave webhook signature
async function verifyFlutterwaveSignature(
  secretKey: string,
  payload: string,
  signature: string | null
): Promise<boolean> {
  // Flutterwave uses SHA256 HMAC
  const encoder = new TextEncoder()
  const key = encoder.encode(secretKey)
  const data = encoder.encode(payload)
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, data)
  const signatureArray = new Uint8Array(signatureBuffer)
  const expectedSignature = Array.from(signatureArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  return signature === expectedSignature
}

// Get Flutterwave secret key
async function getFlutterwaveConfig(supabase: any) {
  const { data: secretKey } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'flutterwave_secret_key')
    .single()

  return {
    secretKey: secretKey?.value || Deno.env.get('FLUTTERWAVE_SECRET_KEY'),
    publicKey: Deno.env.get('FLUTTERWAVE_PUBLIC_KEY'),
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get Flutterwave configuration
    const config = await getFlutterwaveConfig(supabase)
    
    if (!config.secretKey) {
      console.error('Flutterwave secret key not configured')
      return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get the raw body for signature verification
    const rawBody = await req.text()
    const signature = req.headers.get('flutterwave-webhook-signature')

    // Verify signature (Flutterwave may not always send this header)
    if (signature) {
      const isValid = await verifyFlutterwaveSignature(
        config.secretKey,
        rawBody,
        signature
      )
      if (!isValid) {
        console.error('Invalid Flutterwave webhook signature')
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Parse webhook payload
    const event: FlutterwaveEvent = JSON.parse(rawBody)
    
    console.log('Received Flutterwave webhook:', event.event, 'tx_ref:', event.data.tx_ref)

    // Handle different event types
    switch (event.event) {
      case 'charge.completed':
      case 'payment.completed':
        // Payment successful
        await handlePaymentSuccess(supabase, event.data)
        break
      
      case 'charge.failed':
      case 'payment.failed':
        // Payment failed
        await handlePaymentFailed(supabase, event.data)
        break
      
      case 'refund.complete':
        // Refund processed
        await handleRefundComplete(supabase, event.data)
        break
      
      default:
        console.log('Unhandled Flutterwave event:', event.event)
    }

    // Return 200 to acknowledge receipt
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Flutterwave webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// Handle successful payment
async function handlePaymentSuccess(
  supabase: any,
  data: FlutterwaveEvent['data']
) {
  try {
    // Update payment transaction
    await supabase
      .from('payment_transactions')
      .update({
        status: 'completed',
        provider_ref: data.flw_ref,
        completed_at: new Date().toISOString(),
      })
      .eq('tx_ref', data.tx_ref)
      .eq('provider', 'flutterwave')

    // Check for related subscription or invoice
    const metadata = data.meta || {}
    
    if (metadata.subscription_id) {
      // Activate subscription
      await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          flutterwave_subscription_id: metadata.flutterwave_subscription_id,
        })
        .eq('id', metadata.subscription_id)
    }

    if (metadata.invoice_id) {
      // Mark invoice as paid
      await supabase
        .from('invoices')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_provider: 'flutterwave',
          payment_reference: data.flw_ref,
        })
        .eq('id', metadata.invoice_id)
    }

    console.log('Flutterwave payment processed:', data.tx_ref)
  } catch (error) {
    console.error('Error processing Flutterwave payment success:', error)
  }
}

// Handle failed payment
async function handlePaymentFailed(
  supabase: any,
  data: FlutterwaveEvent['data']
) {
  try {
    await supabase
      .from('payment_transactions')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
      })
      .eq('tx_ref', data.tx_ref)
      .eq('provider', 'flutterwave')

    console.log('Flutterwave payment failed:', data.tx_ref)
  } catch (error) {
    console.error('Error processing Flutterwave payment failure:', error)
  }
}

// Handle refund
async function handleRefundComplete(
  supabase: any,
  data: FlutterwaveEvent['data']
) {
  try {
    await supabase
      .from('payment_transactions')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
      })
      .eq('tx_ref', data.tx_ref)
      .eq('provider', 'flutterwave')

    console.log('Flutterwave refund processed:', data.tx_ref)
  } catch (error) {
    console.error('Error processing Flutterwave refund:', error)
  }
}
