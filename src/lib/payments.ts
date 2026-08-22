// Client wrapper for the Paystack payment rail.
//
// The browser NEVER decides "payment successful" — it starts a checkout
// (server sets the price), redirects to Paystack, and on return ASKS the
// server (paystack-verify) what happened. The payment_transactions ledger
// and the paystack-webhook are the source of truth.

import { supabase } from './supabase'

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

export async function startPlanCheckout(planCode: string, billingCycle: 'monthly' | 'yearly'): Promise<CheckoutStart> {
  const { data, error } = await supabase.functions.invoke('subscription-management', {
    body: { action: 'createCheckout', planCode, billingCycle },
  })
  if (error) throw new Error(error.message || 'Could not start checkout')
  if (data?.error) throw new Error(data.error)
  if (!data?.authorizationUrl || !data?.reference) throw new Error('Checkout did not return a payment URL')
  return data as CheckoutStart
}

// On return from Paystack (?reference=...), ask the server what happened.
export async function verifyPaymentReturn(reference: string): Promise<PaymentVerdict | null> {
  try {
    const { data, error } = await supabase.functions.invoke('paystack-verify', {
      body: { reference },
    })
    if (error || data?.error) return null
    return data as PaymentVerdict
  } catch {
    return null
  }
}

export async function cancelSubscriptionAtPeriodEnd(): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('subscription-management', {
    body: { action: 'cancel' },
  })
  if (error) return { ok: false, message: error.message || 'Could not cancel the subscription' }
  if (data?.error) return { ok: false, message: data.error }
  return { ok: true, message: data?.message || 'Subscription will cancel at the end of the paid period' }
}
