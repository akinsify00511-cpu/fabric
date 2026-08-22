import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

export interface SubscriptionDetails {
  id: string; plan: string; plan_name: string; status: 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused' | null
  billing_cycle: 'monthly' | 'yearly'; amount: number; currency: string; start_date: string
  next_billing_date: string | null; cancelled_at: string | null; trial_ends_at: string | null
  seats_included: number; days_until_expiry: number | null; is_active: boolean
}
export interface PaymentRecord { id: string; amount: number; currency: string; status: 'successful' | 'failed' | 'pending' | 'refunded'; description: string; paid_at: string }
export interface InvoiceRecord { id: string; invoice_number: string; amount: number; currency: string; status: 'paid' | 'pending' | 'failed' | 'refunded' | 'void'; due_date: string; paid_at: string | null; pdf_url: string | null }
export interface AvailablePlan { code: string; name: string; monthly_price: number; yearly_price: number; yearly_monthly_equivalent: number; savings_percent: number }

export interface PaymentRequestInfo {
  reference: string; plan_code: string; billing_cycle: 'monthly' | 'yearly'
  amount_cents: number; currency: string; status: string
  instructions: { bank_name: string | null; account_name: string | null; account_number: string | null; note: string | null }
}

interface ReturnTypeData {
  subscription: SubscriptionDetails | null; payments: PaymentRecord[]; invoices: InvoiceRecord[]; availablePlans: AvailablePlan[]
  loading: boolean; error: string | null; refresh: () => Promise<void>
  cancelSubscription: (cancelAtPeriodEnd?: boolean) => Promise<{ success: boolean; message: string }>
  requestPlanPayment: (planCode: string, billingCycle: 'monthly' | 'yearly') => Promise<PaymentRequestInfo | null>
}

export function useSubscriptionData(): ReturnTypeData {
  const { staff } = useAuth()
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!staff?.business_id) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const businessId = staff.business_id
      const { data: sub } = await supabase.from('business_subscriptions').select('*').eq('business_id', businessId).maybeSingle()
      if (sub) {
        const days = sub.next_billing_date ? Math.ceil((new Date(sub.next_billing_date).getTime() - Date.now()) / 86400000) : null
        setSubscription({ id: sub.id, plan: sub.plan_code || sub.plan_name?.toLowerCase() || 'free', plan_name: sub.plan_name || 'Free', status: sub.status, billing_cycle: sub.billing_cycle, amount: sub.amount_cents / 100, currency: sub.currency, start_date: sub.start_date, next_billing_date: sub.next_billing_date, cancelled_at: sub.cancelled_at, trial_ends_at: null, seats_included: sub.seats_included || 5, days_until_expiry: days, is_active: sub.status === 'active' })
      } else setSubscription(null)

      const { data: ps } = await supabase.from('subscription_payments').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(20)
      setPayments((ps || []).map(p => ({ id: p.id, amount: p.amount_cents / 100, currency: p.currency, status: p.status, description: p.description || 'Subscription payment', paid_at: p.paid_at || p.created_at })))
      const { data: inv } = await supabase.from('subscription_invoices').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
      setInvoices((inv || []).map(i => ({ id: i.id, invoice_number: i.invoice_number, amount: i.amount_cents / 100, currency: i.currency, status: i.status, due_date: i.due_date, paid_at: i.paid_at, pdf_url: i.pdf_url })))
    } catch (e) {
      console.error('Subscription fetch error:', e); setError('Failed to load subscription data')
    } finally { setLoading(false) }
  }, [staff?.business_id])

  useEffect(() => { void refresh() }, [refresh])

  const cancelSubscription = useCallback(async (cancelAtPeriodEnd = true) => {
    if (!staff?.business_id) return { success: false, message: 'Not authenticated' }
    const { error: rpcError } = await supabase.rpc('cancel_subscription', { p_business_id: staff.business_id, p_cancel_at_period_end: cancelAtPeriodEnd })
    if (rpcError) return { success: false, message: rpcError.message }
    await refresh()
    return { success: true, message: cancelAtPeriodEnd ? 'Subscription will be cancelled at the end of the billing period' : 'Subscription cancelled immediately' }
  }, [staff?.business_id, refresh])

  // No external payment provider: create a manual payment request. The
  // business pays by bank transfer with the returned reference; an operator
  // confirms receipt and the plan activates.
  const requestPlanPayment = useCallback(async (planCode: string, billingCycle: 'monthly' | 'yearly'): Promise<PaymentRequestInfo | null> => {
    if (!staff?.business_id) return null
    try {
      const { data, error: rpcError } = await supabase.rpc('request_plan_payment', { p_plan_code: planCode, p_billing_cycle: billingCycle })
      if (rpcError || !data?.ok) { console.error('Payment request error:', rpcError, data); return null }
      return data as PaymentRequestInfo
    } catch (e) { console.error('Payment request error:', e); return null }
  }, [staff?.business_id])

  return { subscription, payments, invoices, availablePlans: getDefaultPlans(), loading, error, refresh, cancelSubscription, requestPlanPayment }
}

function getDefaultPlans(): AvailablePlan[] {
  return [
    { code: 'starter', name: 'Starter', monthly_price: 15000, yearly_price: 150000, yearly_monthly_equivalent: 12500, savings_percent: 17 },
    { code: 'team', name: 'Team', monthly_price: 48000, yearly_price: 480000, yearly_monthly_equivalent: 40000, savings_percent: 17 },
    { code: 'business', name: 'Business', monthly_price: 112000, yearly_price: 1120000, yearly_monthly_equivalent: 93333, savings_percent: 17 },
    { code: 'pro', name: 'Pro', monthly_price: 186000, yearly_price: 1860000, yearly_monthly_equivalent: 155000, savings_percent: 17 },
    { code: 'scale', name: 'Scale', monthly_price: 380000, yearly_price: 3800000, yearly_monthly_equivalent: 316667, savings_percent: 17 },
  ]
}
