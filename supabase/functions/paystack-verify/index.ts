// paystack-verify — browser-return verification; never trust the browser for payment success.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY')
  const authHeader = req.headers.get('Authorization') || ''
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''))
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)
  const body = await req.json().catch(() => ({}))
  const reference = String(body.reference || '')
  if (!reference) return json({ error: 'reference is required' }, 400)
  const { data: ledgerRows, error: ledgerError } = await admin.from('payment_transactions').select('id, business_id, status, plan_code, billing_cycle, amount_cents, currency, paid_at, metadata').eq('provider', 'paystack').eq('provider_reference', reference).limit(1)
  if (ledgerError) return json({ error: 'Could not read payment ledger' }, 500)
  const ledger = ledgerRows?.[0]
  if (!ledger) return json({ error: 'Unknown reference' }, 404)
  const { data: membership } = await admin.from('staff').select('id').eq('user_id', user.id).eq('business_id', ledger.business_id).eq('active', true).limit(1)
  if (!membership?.length) return json({ error: 'Not authorized' }, 403)
  if (!paystackSecret) return json({ error: 'Payment verification unavailable' }, 503)
  const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${paystackSecret}` } })
  const verifyBody = await verifyRes.json().catch(() => null)
  if (!verifyRes.ok || !verifyBody?.status) return json({ error: 'Paystack verification failed' }, 502)
  const providerData = verifyBody.data || {}
  const providerStatus = String(providerData.status || '')
  const providerAmount = Number(providerData.amount || 0)
  const providerCurrency = String(providerData.currency || '')
  if (providerAmount !== Number(ledger.amount_cents) || providerCurrency !== String(ledger.currency)) return json({ error: 'Payment amount or currency mismatch', reference, status: ledger.status, providerStatus }, 409)
  if (providerStatus === 'success') {
    const paidAt = String(providerData.paid_at || new Date().toISOString())
    const mergedMetadata = { ...((ledger.metadata || {}) as Record<string, unknown>), paystack_status: 'success', paystack_channel: providerData.channel ?? null, verification_source: 'browser_return' }
    if (ledger.status !== 'success') {
      const { error } = await admin.from('payment_transactions').update({ status: 'success', verified_at: new Date().toISOString(), paid_at: paidAt, metadata: mergedMetadata, updated_at: new Date().toISOString() }).eq('id', ledger.id)
      if (error) return json({ error: 'Could not finalize payment ledger' }, 500)
    }
    const planName = String((ledger.metadata as Record<string, unknown> | null)?.plan_name || ledger.plan_code)
    const cycle = ledger.billing_cycle === 'yearly' ? 'yearly' : 'monthly'
    const { data: subscription, error: subError } = await admin.from('business_subscriptions').upsert({ business_id: ledger.business_id, provider: 'paystack', plan_code: ledger.plan_code, plan_name: planName, status: 'active', billing_cycle: cycle, amount_cents: ledger.amount_cents, currency: ledger.currency, next_billing_date: new Date(Date.now() + (cycle === 'yearly' ? 365 : 30) * 86400000).toISOString(), trial_ends_at: null, cancelled_at: null, last_payment_reference: reference }, { onConflict: 'business_id' }).select('id').single()
    if (subError) return json({ error: 'Could not activate subscription' }, 500)
    const { data: existingPayment } = await admin.from('subscription_payments').select('id').eq('provider_payment_id', reference).maybeSingle()
    if (!existingPayment) { const { error } = await admin.from('subscription_payments').insert({ business_id: ledger.business_id, subscription_id: subscription.id, provider: 'paystack', provider_payment_id: reference, amount_cents: ledger.amount_cents, currency: ledger.currency, status: 'successful', description: `${planName} plan (${cycle})`, paid_at: paidAt }); if (error && error.code !== '23505') return json({ error: 'Could not record subscription payment' }, 500) }
    const { data: existingAccounting } = await admin.from('payments').select('id').eq('reference', reference).maybeSingle()
    if (!existingAccounting) { const { error } = await admin.from('payments').insert({ business_id: ledger.business_id, date: paidAt.slice(0,10), amount: Number(ledger.amount_cents) / 100, type: 'receive', method: 'paystack', description: `${planName} plan (${cycle}) — Paystack subscription payment`, reference, status: 'completed', allocation_status: 'unallocated', provider: 'paystack', currency: ledger.currency, provider_reference: reference, payment_type: 'subscription', payment_method: 'paystack', idempotency_key: `paystack:${reference}` }); if (error && error.code !== '23505') return json({ error: 'Could not record accounting payment' }, 500) }
  } else if (providerStatus === 'failed' || providerStatus === 'abandoned' || providerStatus === 'reversed') {
    await admin.from('payment_transactions').update({ status: 'failed', metadata: { ...((ledger.metadata || {}) as Record<string, unknown>), paystack_status: providerStatus }, updated_at: new Date().toISOString() }).eq('id', ledger.id)
  }
  return json({ reference, status: providerStatus === 'success' ? 'success' : ledger.status, providerStatus, planCode: ledger.plan_code, billingCycle: ledger.billing_cycle, amountCents: ledger.amount_cents, currency: ledger.currency, paidAt: providerStatus === 'success' ? providerData.paid_at : ledger.paid_at })
})
