// Supabase Edge Function: Verify Flutterwave Payment
// Verifies payment status from Flutterwave

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Get Flutterwave configuration
async function getFlutterwaveConfig(supabase: any) {
  const { data: secretKey } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'flutterwave_secret_key')
    .single()

  return {
    secretKey: secretKey?.value || Deno.env.get('FLUTTERWAVE_SECRET_KEY'),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // SECURITY: Verify the caller's JWT before using the service role key
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.substring(7)
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { reference } = await req.json()

    if (!reference) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Reference is required',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const config = await getFlutterwaveConfig(supabase)
    
    if (!config.secretKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Flutterwave not configured',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify payment with Flutterwave
    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`,
      {
        headers: {
          'Authorization': `Bearer ${config.secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    const data = await response.json()

    if (data.status === 'success' && data.data) {
      const paymentData = data.data

      // Update transaction status
      await supabase
        .from('payment_transactions')
        .update({
          status: paymentData.status === 'successful' ? 'completed' : 'failed',
          provider_ref: String(paymentData.id),
          completed_at: paymentData.status === 'successful' ? new Date().toISOString() : null,
        })
        .eq('tx_ref', reference)
        .eq('provider', 'flutterwave')

      return new Response(JSON.stringify({
        success: paymentData.status === 'successful',
        status: paymentData.status,
        reference: reference,
        amount: paymentData.amount,
        currency: paymentData.currency,
        customer_email: paymentData.customer?.email,
        customer_name: paymentData.customer?.name,
        transaction_id: String(paymentData.id),
        metadata: paymentData.meta,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: data.message || 'Payment verification failed',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

  } catch (error) {
    console.error('Flutterwave verify error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
