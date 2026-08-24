// paystack-webhook — the ONLY writer of successful payment state.
//
// Pipeline per event:
//   1. Verify x-paystack-signature (HMAC-SHA512 of the RAW body). The
//      signature is the authentication — no JWT here.
//   2. Idempotency: unique (provider, event_id) on payment_webhook_events.
//      A duplicate delivery returns 200 immediately without re-processing.
//   3. charge.success: RE-VERIFY the transaction against Paystack
//      (GET /transaction/verify/:reference) — never trust the webhook body.
//      Settle only when provider status is 'success' AND the amount covers
//      the ledger amount.
//   4. Settle: payment_transactions -> success, upsert business_subscriptions
//      (the sync_entitlement_from_subscription trigger then unlocks the
//      plan), record subscription_payments. The DB trigger queues the
//      receipt email — email failure can never break settlement.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PAYSTACK_SECRET_KEY.
//      Optional: META_PIXEL_ID + META_CAPI_ACCESS_TOKEN (server-authoritative
//      Purchase conversion signal), APP_URL (event_source_url base).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildCapiPurchaseEvent,
  classifyPaystackEvent,
  isAmountSufficient,
  nextBillingDate,
  PLAN_DISPLAY_NAMES,
  verifyPaystackSignature,
  webhookEventId,
} from '../_shared/paymentsCore.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY')
  if (!paystackSecret) return json({ error: 'Not configured' }, 503)

  const rawBody = await req.text()
  const signature = req.headers.get('x-paystack-signature')
  if (!(await verifyPaystackSignature(rawBody, signature, paystackSecret))) {
    return json({ error: 'Invalid signature' }, 401)
  }

  const event = JSON.parse(rawBody)
  const eventType = String(event?.event || '')
  const data = event?.data ?? {}
  const eventId = webhookEventId(eventType, data)
  const admin = createClient(supabaseUrl, serviceKey)

  // --- Idempotency gate ---
  const { error: insertError } = await admin.from('payment_webhook_events').insert({
    provider: 'paystack',
    event_id: eventId,
    event_type: eventType,
    payload: event,
  })
  if (insertError?.code === '23505') {
    return json({ status: 'duplicate' })
  }
  if (insertError) return json({ error: insertError.message }, 500)

  const finish = async (result: 'processed' | 'ignored' | 'failed', error?: string) => {
    await admin
      .from('payment_webhook_events')
      .update({ processed_at: new Date().toISOString(), processing_result: result, error: error ?? null })
      .eq('provider', 'paystack')
      .eq('event_id', eventId)
  }

  const kind = classifyPaystackEvent(eventType)
  if (kind === 'ignored') {
    await finish('ignored')
    return json({ status: 'ignored' })
  }

  const reference = String(data?.reference || '')
  if (!reference) {
    await finish('failed', 'missing reference')
    return json({ status: 'failed', error: 'missing reference' })
  }

  // --- Find the ledger row; a charge we did not initiate is ignored ---
  const { data: ledgerRows } = await admin
    .from('payment_transactions')
    .select('*')
    .eq('provider', 'paystack')
    .eq('provider_reference', reference)
    .limit(1)
  const ledger = ledgerRows?.[0]
  if (!ledger) {
    await finish('ignored')
    return json({ status: 'ignored', reason: 'unknown reference' })
  }

  // --- Re-verify against Paystack (server-side re-query) ---
  const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackSecret}` },
  })
  const verifyBody = await verifyRes.json().catch(() => null)
  const verified = verifyBody?.status === true && verifyBody?.data?.status === 'success'
  const providerAmount = Number(verifyBody?.data?.amount ?? 0)

  if (kind === 'charge_failed' || !verified || !isAmountSufficient(providerAmount, ledger.amount_cents)) {
    await admin
      .from('payment_transactions')
      .update({
        status: 'failed',
        metadata: {
          ...(ledger.metadata ?? {}),
          verify_status: verifyBody?.data?.status ?? 'unverified',
          verify_amount: providerAmount || null,
        },
      })
      .eq('id', ledger.id)
    await finish('failed', verified ? 'amount mismatch' : 'verification failed')
    return json({ status: 'failed' })
  }

  // --- Settle (idempotent: a second success event is a no-op) ---
  if (ledger.status === 'success') {
    await finish('processed')
    return json({ status: 'already settled' })
  }

  const paidAt = verifyBody?.data?.paid_at || new Date().toISOString()
  const { error: settleError } = await admin
    .from('payment_transactions')
    .update({
      status: 'success',
      verified_at: new Date().toISOString(),
      paid_at: paidAt,
      metadata: {
        ...(ledger.metadata ?? {}),
        channel: verifyBody?.data?.channel ?? null,
        provider_amount: providerAmount,
      },
    })
    .eq('id', ledger.id)
  if (settleError) {
    await finish('failed', settleError.message)
    return json({ status: 'failed', error: settleError.message }, 500)
  }

  // --- Activate the subscription (entitlement trigger does the rest) ---
  const planCode = ledger.plan_code || 'starter'
  const cycle = ledger.billing_cycle === 'yearly' ? 'yearly' : 'monthly'
  const { error: subError } = await admin.from('business_subscriptions').upsert(
    {
      business_id: ledger.business_id,
      provider: 'paystack',
      plan_code: planCode,
      plan_name: PLAN_DISPLAY_NAMES[planCode] ?? planCode,
      status: 'active',
      billing_cycle: cycle,
      amount_cents: ledger.amount_cents ?? providerAmount,
      currency: ledger.currency || 'NGN',
      start_date: paidAt,
      next_billing_date: nextBillingDate(paidAt, cycle),
      cancel_at_period_end: false,
      cancelled_at: null,
      provider_customer_code: verifyBody?.data?.customer?.customer_code ?? null,
      provider_email_token: null,
      last_payment_reference: reference,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'business_id' },
  )
  if (subError) {
    await finish('failed', subError.message)
    return json({ status: 'failed', error: subError.message }, 500)
  }

  await admin.from('subscription_payments').insert({
    business_id: ledger.business_id,
    provider: 'paystack',
    provider_payment_id: reference,
    amount_cents: ledger.amount_cents ?? providerAmount,
    currency: ledger.currency || 'NGN',
    status: 'successful',
    description: `${PLAN_DISPLAY_NAMES[planCode] ?? planCode} plan (${cycle})`,
    paid_at: paidAt,
  })

  // --- Meta Conversions API Purchase (server-authoritative revenue signal) ---
  // Fires exactly once per reference: the 'already settled' guard above
  // returns early on repeat deliveries. The browser pixel Purchase (fired on
  // the verified return) shares event_id = reference, so Meta deduplicates.
  // Best-effort: a CAPI failure must never break settlement (same rule as
  // the receipt email).
  const metaPixelId = Deno.env.get('META_PIXEL_ID')
  const metaCapiToken = Deno.env.get('META_CAPI_ACCESS_TOKEN')
  if (metaPixelId && metaCapiToken) {
    try {
      const attribution = (ledger.metadata?.attribution ?? null) as Record<string, string> | null
      const appUrl = (Deno.env.get('APP_URL') || 'https://avenize.riverwayse.com').replace(/\/$/, '')
      const event = await buildCapiPurchaseEvent({
        reference,
        paidAtIso: paidAt,
        amountCents: ledger.amount_cents ?? providerAmount,
        currency: ledger.currency || 'NGN',
        planCode,
        planName: PLAN_DISPLAY_NAMES[planCode] ?? planCode,
        email: verifyBody?.data?.customer?.email ?? null,
        fbp: attribution?.fbp ?? null,
        fbc: attribution?.fbc ?? null,
        fbclid: attribution?.fbclid ?? null,
        sourceUrl: attribution?.landingPath ? `${appUrl}${attribution.landingPath}` : appUrl,
      })
      const capiRes = await fetch(`https://graph.facebook.com/v21.0/${metaPixelId}/events?access_token=${metaCapiToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [event] }),
      })
      const capiBody = await capiRes.json().catch(() => null)
      if (!capiRes.ok || (capiBody?.events_received ?? 0) < 1) {
        console.warn('Meta CAPI Purchase not accepted', { status: capiRes.status, body: capiBody })
      }
    } catch (capiError) {
      console.warn('Meta CAPI Purchase failed (non-blocking):', capiError)
    }
  }

  await finish('processed')
  return json({ status: 'processed' })
})
