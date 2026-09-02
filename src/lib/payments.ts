// Client wrapper for the Paystack payment rail.
//
// The browser NEVER decides "payment successful" — it starts a checkout
// (server sets the price), redirects to Paystack, and on return ASKS the
// server (paystack-verify) what happened. The payment_transactions ledger
// and the paystack-webhook are the source of truth.

import { supabase } from './supabase'
import { getStoredAttribution } from './attribution'

export interface CheckoutStart {
  reference: string
  authorizationUrl: string
  reused?: boolean
}

export interface PaymentVerdict {
  reference: string
  status: 'pending' | 'processing' | 'success' | 'failed' | 'refunded'
  providerStatus: string | null
  planCode: string | null
  billingCycle: 'monthly' | 'yearly' | null
  amountCents: number | null
  currency: string
  paidAt: string | null
}

async function callPaymentFunction<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  // Use the same explicit browser -> Edge Function request pattern as Sarah.
  // supabase.functions.invoke() adds extra client headers and was producing
  // repeated OPTIONS requests without a following POST in production. The
  // payment function only needs the user's bearer token for authentication.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session expired. Please sign in again.')

  const base = import.meta.env.VITE_SUPABASE_URL as string
  const response = await fetch(`${base}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  let data: any = {}
  try { data = await response.json() } catch { /* handled below */ }

  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Payment service failed (${response.status})`)
  }
  return data as T
}

export async function startPlanCheckout(planCode: string, billingCycle: 'monthly' | 'yearly'): Promise<CheckoutStart> {
  // Attach the stored UTM/referrer provenance so the ledger row carries the
  // campaign that produced the payment (attribution -> revenue chain). The
  // server sanitizes it; it is advisory metadata, never price- or access-
  // relevant.
  const attribution = getStoredAttribution()
  const data = await callPaymentFunction<CheckoutStart>('subscription-management', {
    action: 'createCheckout',
    planCode,
    billingCycle,
    attribution,
  })
  if (!data?.authorizationUrl || !data?.reference) throw new Error('Checkout did not return a payment URL')
  return data
}

// On return from Paystack (?reference=...), ask the server what happened.
export async function verifyPaymentReturn(reference: string): Promise<PaymentVerdict | null> {
  try {
    return await callPaymentFunction<PaymentVerdict>('paystack-verify', { reference })
  } catch {
    return null
  }
}

export async function cancelSubscriptionAtPeriodEnd(): Promise<{ ok: boolean; message: string }> {
  try {
    const data = await callPaymentFunction<{ message?: string }>('subscription-management', { action: 'cancel' })
    return { ok: true, message: data?.message || 'Subscription will cancel at the end of the paid period' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not cancel the subscription' }
  }
}
