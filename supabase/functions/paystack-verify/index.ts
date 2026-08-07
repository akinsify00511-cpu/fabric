// Supabase Edge Function: Verify Paystack Payment
// Verifies payment status from Paystack

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Get Paystack configuration
async function getPaystackConfig(supabase: any) {
  const { data: secretKey } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'paystack_secret_key')
    .single()

  return {
    secretKey: secretKey?.value || Deno.env.get('PAYSTACK_SECRET_KEY'),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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

    const config = await getPaystackConfig(supabase)
    
    if (!config.secretKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Paystack not configured',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify payment with Paystack
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          'Authorization': `Bearer ${config.secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    const data = await response.json()

    if (data.status && data.data) {
      const paymentData = data.data

      // Determine status
      const status = paymentData.status === 'success' ? 'completed' : paymentData.status

      // Update transaction status
      await supabase
        .from('payment_transactions')
        .update({
          status: status,
          provider_ref: String(paymentData.id),
          completed_at: status === 'completed' ? new Date().toISOString() : null,
        })
        .eq('tx_ref', reference)
        .eq('provider', 'paystack')

      return new Response(JSON.stringify({
        success: paymentData.status === 'success',
        status: paymentData.status,
        reference: reference,
        amount: paymentData.amount / 100, // Convert from kobo
        currency: paymentData.currency,
        customer_email: paymentData.customer?.email,
        customer_name: paymentData.customer?.first_name && paymentData.customer?.last_name
          ? `${paymentData.customer.first_name} ${paymentData.customer.last_name}`
          : paymentData.customer?.email,
        transaction_id: String(paymentData.id),
        metadata: paymentData.metadata,
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
    console.error('Paystack verify error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
