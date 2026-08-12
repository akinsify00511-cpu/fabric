// Supabase Edge Function: Initialize Flutterwave Payment
// Handles initializing Flutterwave transactions

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Flutterwave API endpoints
const FLUTTERWAVE_BASE_URL = 'https://api.flutterwave.com/v3'

interface FlutterwavePaymentRequest {
  amount: number
  currency?: string
  customer_email: string
  customer_name?: string
  description?: string
  tx_ref: string
  redirect_url?: string
  metadata?: Record<string, any>
  business_id?: string
}

interface FlutterwavePaymentResponse {
  status: string
  message: string
  data?: {
    link: string
    tx_ref: string
  }
  error?: string
}

// Get Flutterwave configuration
async function getFlutterwaveConfig(supabase: any) {
  const { data: publicKey } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'flutterwave_public_key')
    .single()
  
  const { data: secretKey } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'flutterwave_secret_key')
    .single()

  return {
    publicKey: publicKey?.value || Deno.env.get('FLUTTERWAVE_PUBLIC_KEY'),
    secretKey: secretKey?.value || Deno.env.get('FLUTTERWAVE_SECRET_KEY'),
  }
}

// Initialize Flutterwave payment
async function initializeFlutterwavePayment(
  secretKey: string,
  paymentData: Omit<FlutterwavePaymentRequest, 'business_id'>
): Promise<FlutterwavePaymentResponse> {
  try {
    const response = await fetch(`${FLUTTERWAVE_BASE_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secretKey}`,
      },
      body: JSON.stringify({
        amount: paymentData.amount,
        currency: paymentData.currency || 'NGN',
        customer_email: paymentData.customer_email,
        customer_name: paymentData.customer_name,
        description: paymentData.description,
        tx_ref: paymentData.tx_ref,
        redirect_url: paymentData.redirect_url,
        metadata: paymentData.metadata,
        payment_options: 'card,ussd,mobile_money,bank_transfer',
      }),
    })

    const data = await response.json()
    return data
  } catch (error) {
    return {
      status: 'error',
      message: 'Failed to initialize Flutterwave payment',
      error: error.message,
    }
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

    // SECURITY: Verify authentication — this endpoint uses the service role
    // key (bypasses RLS), so we MUST authenticate the caller and scope the
    // transaction to the caller's own business_id.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('business_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (staffError || !staffData) {
      return new Response(JSON.stringify({ error: 'User not associated with a business' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const callerBusinessId = staffData.business_id

    // Parse request body
    const paymentData: FlutterwavePaymentRequest = await req.json()

    // SECURITY: force business_id to the caller's own business
    paymentData.business_id = callerBusinessId

    // Validate required fields
    if (!paymentData.amount || !paymentData.customer_email || !paymentData.tx_ref) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: amount, customer_email, and tx_ref are required',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get Flutterwave configuration
    const config = await getFlutterwaveConfig(supabase)
    
    if (!config.secretKey) {
      return new Response(JSON.stringify({
        error: 'Flutterwave not configured. Please set flutterwave_secret_key in settings or FLUTTERWAVE_SECRET_KEY environment variable.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Initialize Flutterwave payment
    const result = await initializeFlutterwavePayment(config.secretKey, {
      amount: paymentData.amount,
      currency: paymentData.currency,
      customer_email: paymentData.customer_email,
      customer_name: paymentData.customer_name,
      description: paymentData.description,
      tx_ref: paymentData.tx_ref,
      redirect_url: paymentData.redirect_url,
      metadata: {
        ...paymentData.metadata,
        business_id: paymentData.business_id,
      },
    })

    if (result.status === 'success' && result.data?.link) {
      // Log the transaction
      await supabase.from('payment_transactions').insert({
        provider: 'flutterwave',
        tx_ref: paymentData.tx_ref,
        amount: paymentData.amount,
        currency: paymentData.currency || 'NGN',
        status: 'pending',
        customer_email: paymentData.customer_email,
        business_id: paymentData.business_id,
        metadata: {
          ...paymentData.metadata,
          link: result.data.link,
        },
      })

      return new Response(JSON.stringify({
        success: true,
        link: result.data.link,
        tx_ref: result.data.tx_ref,
        provider: 'flutterwave',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      return new Response(JSON.stringify({
        error: result.error || result.message || 'Failed to initialize Flutterwave payment',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

  } catch (error) {
    console.error('Flutterwave initialize error:', error)
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
