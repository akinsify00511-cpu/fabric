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
        signal: AbortSignal.timeout(15000),
      }
    )

    const data = await response.json()

    if (data.status && data.data) {
      const paymentData = data.data

      // Anti-oracle: a reference reveals amount/email/metadata — only the
      // business that owns the payment may verify it. Ownership comes from
      // the Paystack metadata we set at initialize time, or our own attempt
      // / payment records keyed by the caller's business.
      const { data: callerStaff } = await supabase
        .from('staff').select('business_id').eq('user_id', user.id).limit(1).maybeSingle()
      const callerBusiness = callerStaff?.business_id ?? null
      const metaBusiness = paymentData.metadata?.business_id ?? null
      let owns = metaBusiness && callerBusiness && metaBusiness === callerBusiness
      if (!owns && callerBusiness) {
        const { data: attempt } = await supabase
          .from('subscription_provider_attempts').select('id')
          .eq('provider_reference', reference).eq('business_id', callerBusiness).limit(1).maybeSingle()
        if (attempt) owns = true
      }
      if (!owns && callerBusiness) {
        const { data: invoicePayment } = await supabase
          .from('payments_paystack').select('id')
          .eq('paystack_reference', reference).eq('business_id', callerBusiness).limit(1).maybeSingle()
        if (invoicePayment) owns = true
      }
      if (!owns) {
        // Same response as a failed verification — no information leaks
        // about whether the reference exists or who it belongs to.
        return new Response(JSON.stringify({ success: false, error: 'Payment verification failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

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
