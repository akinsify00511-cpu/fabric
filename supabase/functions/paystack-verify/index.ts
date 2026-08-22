// paystack-verify — the browser-return helper.
//
// After Paystack redirects the customer back, the browser asks THIS function
// what happened. The server re-queries Paystack and answers from the ledger +
// the provider — the browser never decides success on its own.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PAYSTACK_SECRET_KEY.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
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

  // The caller must belong to the business that owns this reference.
  const { data: ledgerRows } = await admin
    .from('payment_transactions')
    .select('id, business_id, status, plan_code, billing_cycle, amount_cents, currency, paid_at')
    .eq('provider', 'paystack')
    .eq('provider_reference', reference)
    .limit(1)
  const ledger = ledgerRows?.[0]
  if (!ledger) return json({ error: 'Unknown reference' }, 404)

  const { data: membership } = await admin
    .from('staff')
    .select('id')
    .eq('user_id', user.id)
    .eq('business_id', ledger.business_id)
    .eq('active', true)
    .limit(1)
  if (!membership?.length) return json({ error: 'Not authorized' }, 403)

  // Re-query the provider for the freshest truth.
  let providerStatus: string | null = null
  if (paystackSecret) {
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackSecret}` },
    })
    const verifyBody = await verifyRes.json().catch(() => null)
    providerStatus = verifyBody?.data?.status ?? null
  }

  return json({
    reference,
    // The ledger is authoritative; the provider status is informational.
    status: ledger.status,
    providerStatus,
    planCode: ledger.plan_code,
    billingCycle: ledger.billing_cycle,
    amountCents: ledger.amount_cents,
    currency: ledger.currency,
    paidAt: ledger.paid_at,
  })
})
