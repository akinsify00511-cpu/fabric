// paystack-webhook — the ONLY writer of successful payment state.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { classifyPaystackEvent, isAmountSufficient, nextBillingDate, PLAN_DISPLAY_NAMES, verifyPaystackSignature, webhookEventId } from '../_shared/paymentsCore.ts'
function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }) }
serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY')
  if (!paystackSecret) return json({ error: 'Not configured' }, 503)
  const rawBody = await req.text()
  const signature = req.headers.get('x-paystack-signature')
  if (!(await verifyPaystackSignature(rawBody, signature, paystackSecret))) return json({ error: 'Invalid signature' }, 401)
  let event: any
  try { event = JSON.parse(rawBody) } catch { return json({ error: 'Invalid JSON' }, 400) }
  const eventType = String(event?.event || '')
  const data = event?.data ?? {}
  const eventId = webhookEventId(eventType, data)
  const admin = createClient(supabaseUrl, serviceKey)
  const { error: insertError } = await admin.from('payment_webhook_events').insert({ provider: 'paystack', event_id: eventId, event_type: eventType, payload: event })
  if (insertError?.code === '23505') return json({ status: 'duplicate' })
  if (insertError) return json({ error: insertError.message }, 500)
  const finish = async (result: 'processed' | 'ignored' | 'failed', error?: string) => { await admin.from('payment_webhook_events').update({ processed_at: new Date().toISOString(), processing_result: result, error: error ?? null }).eq('provider', 'paystack').eq('event_id', eventId) }
  const kind = classifyPaystackEvent(eventType)
  if (kind === 'ignored') { await finish('ignored'); return json({ status: 'ignored' }) }
  const reference = String(data?.reference || '')
  if (!reference) { await finish('failed', 'missing reference'); return json({ status: 'failed', error: 'missing reference' }) }
  const { data: ledgerRows } = await admin.from('payment_transactions').select('*').eq('provider', 'paystack').eq('provider_reference', reference).limit(1)
  const ledger = ledgerRows?.[0]
  if (!ledger) { await finish('ignored'); return json({ status: 'ignored', reason: 'unknown reference' }) }
  const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${paystackSecret}` } })
  const verifyBody = await verifyRes.json().catch(() => null)
  const verified = verifyBody?.status === true && verifyBody?.data?.status === 'success'
  const providerAmount = Number(verifyBody?.data?.amount ?? 0)
  if (kind === 'charge_failed' || !verified || !isAmountSufficient(providerAmount, ledger.amount_cents)) {
    await admin.from('payment_transactions').update({ status: 'failed', metadata: { ...(ledger.metadata ?? {}), verify_status: verifyBody?.data?.status ?? 'unverified', verify_amount: providerAmount || null } }).eq('id', ledger.id)
    await finish('failed', verified ? 'amount mismatch' : 'verification failed')
    return json({ status: 'failed' })
  }
  if (ledger.status === 'success') { await finish('processed'); return json({ status: 'already settled' }) }
  const paidAt = verifyBody?.data?.paid_at || new Date().toISOString()
  const { error: settleError } = await admin.from('payment_transactions').update({ status: 'success', verified_at: new Date().toISOString(), paid_at: paidAt, metadata: { ...(ledger.metadata ?? {}), channel: verifyBody?.data?.channel ?? null, provider_amount: providerAmount } }).eq('id', ledger.id)
  if (settleError) { await finish('failed', settleError.message); return json({ status: 'failed', error: settleError.message }, 500) }
  const planCode = ledger.plan_code || 'starter'
  const cycle = ledger.billing_cycle === 'yearly' ? 'yearly' : 'monthly'
  const planName = PLAN_DISPLAY_NAMES[planCode] ?? planCode
  const { data: subscription, error: subError } = await admin.from('business_subscriptions').upsert({ business_id: ledger.business_id, provider: 'paystack', plan_code: planCode, plan_name: planName, status: 'active', billing_cycle: cycle, amount_cents: ledger.amount_cents ?? providerAmount, currency: ledger.currency || 'NGN', start_date: paidAt, next_billing_date: nextBillingDate(paidAt, cycle), cancel_at_period_end: false, cancelled_at: null, provider_customer_code: verifyBody?.data?.customer?.customer_code ?? null, provider_email_token: null, last_payment_reference: reference, updated_at: new Date().toISOString() }, { onConflict: 'business_id' }).select('id').single()
  if (subError) { await finish('failed', subError.message); return json({ status: 'failed', error: subError.message }, 500) }
  const { data: existingSubPayment } = await admin.from('subscription_payments').select('id').eq('provider_payment_id', reference).maybeSingle()
  if (!existingSubPayment) {
    const { error: spError } = await admin.from('subscription_payments').insert({ business_id: ledger.business_id, subscription_id: subscription.id, provider: 'paystack', provider_payment_id: reference, amount_cents: ledger.amount_cents ?? providerAmount, currency: ledger.currency || 'NGN', status: 'successful', description: `${planName} plan (${cycle})`, paid_at: paidAt })
    if (spError && spError.code !== '23505') { await finish('failed', spError.message); return json({ status: 'failed', error: spError.message }, 500) }
  }
  const { data: existingAccounting } = await admin.from('payments').select('id').eq('reference', reference).maybeSingle()
  if (!existingAccounting) {
    const accounting = { business_id: ledger.business_id, date: paidAt.slice(0, 10), amount: Number(ledger.amount_cents ?? providerAmount) / 100, type: 'receive', method: 'paystack', description: `${planName} plan (${cycle}) — Paystack subscription payment`, reference, status: 'completed', allocation_status: 'unallocated', provider: 'paystack', currency: ledger.currency || 'NGN', provider_reference: reference, payment_type: 'subscription', payment_method: 'paystack', idempotency_key: `paystack:${reference}` }
    const { error: payError } = await admin.from('payments').insert(accounting)
    if (payError && payError.code !== '23505') { await finish('failed', payError.message); return json({ status: 'failed', error: payError.message }, 500) }
  }
  await finish('processed')
  return json({ status: 'processed' })
})
