// subscription-management — Paystack checkout, server-controlled.
//
// The browser NEVER supplies a price and NEVER decides success. This function:
//   createCheckout: verifies the caller is an owner/admin of the business,
//     reads the price from the DB (plan_price_cents), writes a PENDING
//     payment_transactions ledger row, initializes the Paystack transaction
//     and returns the authorization_url. Idempotent within a 10-minute window.
//   cancel: marks the subscription cancel_at_period_end (access kept until
//     the paid period ends; the entitlement trigger keeps everything in sync).
//   status: the current subscription + recent ledger rows.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PAYSTACK_SECRET_KEY,
//      APP_URL (checkout callback base).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCheckoutMetadata } from '../_shared/paymentsCore.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_PLANS = ['starter', 'team', 'business', 'pro', 'scale']

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY')
  const appUrl = (Deno.env.get('APP_URL') || 'https://avenize.riverwayse.com').replace(/\/$/, '')

  // --- Verify the caller (their JWT), then act with the service role ---
  const authHeader = req.headers.get('Authorization') || ''
  const callerJwt = authHeader.replace(/^Bearer\s+/i, '')
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: { user }, error: authError } = await admin.auth.getUser(callerJwt)
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  const { data: staffRows } = await admin
    .from('staff')
    .select('id, role, business_id, email')
    .eq('user_id', user.id)
    .eq('active', true)
    .limit(1)
  const staff = staffRows?.[0]
  if (!staff?.business_id) return json({ error: 'No business membership' }, 403)

  const body = await req.json().catch(() => ({}))
  const action = String(body.action || '')

  if (action === 'status') {
    const [{ data: sub }, { data: txs }] = await Promise.all([
      admin.from('business_subscriptions').select('*').eq('business_id', staff.business_id).maybeSingle(),
      admin.from('payment_transactions').select('*').eq('business_id', staff.business_id).order('created_at', { ascending: false }).limit(10),
    ])
    return json({ subscription: sub ?? null, transactions: txs ?? [] })
  }

  // Plan-changing actions require owner/admin.
  if (!['owner', 'admin'].includes(staff.role)) {
    return json({ error: 'Only a business owner or admin can change the plan' }, 403)
  }

  if (action === 'cancel') {
    const { error } = await admin
      .from('business_subscriptions')
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq('business_id', staff.business_id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, message: 'Subscription will cancel at the end of the paid period' })
  }

  if (action !== 'createCheckout') return json({ error: 'Unknown action' }, 400)

  const planCode = String(body.planCode || '')
  const billingCycle = body.billingCycle === 'yearly' ? 'yearly' : 'monthly'
  if (!VALID_PLANS.includes(planCode)) return json({ error: 'Invalid plan' }, 400)
  if (!paystackSecret) return json({ error: 'Payments are not configured' }, 503)

  // --- Server-side price. Never trust the client. ---
  const { data: priceCents, error: priceError } = await admin.rpc('plan_price_cents', {
    p_plan_code: planCode,
    p_billing_cycle: billingCycle,
  })
  if (priceError || !priceCents) return json({ error: 'Could not determine plan price' }, 500)

  // --- Idempotency: reuse a fresh pending checkout for the same plan ---
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: existing } = await admin
    .from('payment_transactions')
    .select('provider_reference, metadata')
    .eq('business_id', staff.business_id)
    .eq('plan_code', planCode)
    .eq('billing_cycle', billingCycle)
    .in('status', ['pending', 'processing'])
    .gte('created_at', tenMinutesAgo)
    .order('created_at', { ascending: false })
    .limit(1)
  const existingTx = existing?.[0]
  if (existingTx?.metadata?.authorization_url) {
    return json({ reference: existingTx.provider_reference, authorizationUrl: existingTx.metadata.authorization_url, reused: true })
  }

  const reference = `avz_${crypto.randomUUID().replace(/-/g, '')}`
  const metadata = buildCheckoutMetadata(staff.business_id, planCode, billingCycle)

  const { error: insertError } = await admin.from('payment_transactions').insert({
    business_id: staff.business_id,
    user_id: user.id,
    provider: 'paystack',
    provider_reference: reference,
    kind: 'subscription_checkout',
    plan_code: planCode,
    billing_cycle: billingCycle,
    amount_cents: priceCents,
    currency: 'NGN',
    status: 'pending',
    metadata,
  })
  if (insertError) return json({ error: insertError.message }, 500)

  // --- Initialize the Paystack transaction ---
  const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${paystackSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: staff.email || user.email,
      amount: priceCents, // Paystack expects the lowest currency unit (kobo)
      currency: 'NGN',
      reference,
      callback_url: `${appUrl}/app/subscription?reference=${reference}`,
      metadata,
    }),
  })
  const initBody = await initRes.json().catch(() => null)

  if (!initRes.ok || !initBody?.status || !initBody?.data?.authorization_url) {
    await admin
      .from('payment_transactions')
      .update({ status: 'failed', metadata: { ...metadata, init_error: initBody?.message || `HTTP ${initRes.status}` } })
      .eq('provider', 'paystack')
      .eq('provider_reference', reference)
    return json({ error: initBody?.message || 'Paystack initialization failed' }, 502)
  }

  await admin
    .from('payment_transactions')
    .update({
      status: 'processing',
      metadata: { ...metadata, authorization_url: initBody.data.authorization_url, access_code: initBody.data.access_code },
    })
    .eq('provider', 'paystack')
    .eq('provider_reference', reference)

  return json({ reference, authorizationUrl: initBody.data.authorization_url })
})
