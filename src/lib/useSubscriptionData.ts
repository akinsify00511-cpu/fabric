/**
 * Subscription Data Hook
 * Fetches subscription details, payments, and invoices from the database
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

export interface SubscriptionDetails {
  id: string
  plan: string
  plan_name: string
  status: 'active' | 'cancelled' | 'expired' | 'past_due' | 'trialing' | 'paused' | null
  billing_cycle: 'monthly' | 'yearly'
  amount: number
  currency: string
  start_date: string
  next_billing_date: string | null
  cancelled_at: string | null
  trial_ends_at: string | null
  seats_included: number
  days_until_expiry: number | null
  is_active: boolean
}

export interface PaymentRecord {
  id: string
  amount: number
  currency: string
  status: 'successful' | 'failed' | 'pending' | 'refunded'
  description: string
  paid_at: string
}

export interface InvoiceRecord {
  id: string
  invoice_number: string
  amount: number
  currency: string
  status: 'paid' | 'pending' | 'failed' | 'refunded' | 'void'
  due_date: string
  paid_at: string | null
  pdf_url: string | null
}

export interface AvailablePlan {
  code: string
  name: string
  monthly_price: number
  yearly_price: number
  yearly_monthly_equivalent: number
  savings_percent: number
}

interface UseSubscriptionDataReturn {
  subscription: SubscriptionDetails | null
  payments: PaymentRecord[]
  invoices: InvoiceRecord[]
  availablePlans: AvailablePlan[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  cancelSubscription: (cancelAtPeriodEnd?: boolean) => Promise<{ success: boolean; message: string }>
  createCheckout: (planCode: string, billingCycle: 'monthly' | 'yearly') => Promise<{ checkout_url: string; reference: string } | null>
}

export function useSubscriptionData(): UseSubscriptionDataReturn {
  const { staff } = useAuth()
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSubscriptionData = useCallback(async () => {
    if (!staff?.business_id) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const businessId = staff.business_id

      // Fetch subscription
      const { data: subData, error: subError } = await supabase
        .from('business_subscriptions')
        .select('*')
        .eq('business_id', businessId)
        .single()

      if (subError && subError.code !== 'PGRST116') {
        console.warn('Subscription fetch error:', subError)
      }

      if (subData) {
        // Calculate days until expiry
        let daysUntilExpiry: number | null = null
        if (subData.next_billing_date) {
          const expiryDate = new Date(subData.next_billing_date)
          const today = new Date()
          daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        }

        setSubscription({
          id: subData.id,
          plan: subData.plan_code || subData.plan_name?.toLowerCase() || 'free',
          plan_name: subData.plan_name || 'Free',
          status: subData.status,
          billing_cycle: subData.billing_cycle,
          amount: subData.amount_cents / 100,
          currency: subData.currency,
          start_date: subData.start_date,
          next_billing_date: subData.next_billing_date,
          cancelled_at: subData.cancelled_at,
          trial_ends_at: subData.trial_ends_at,
          seats_included: subData.seats_included || 5,
          days_until_expiry: daysUntilExpiry,
          is_active: subData.status === 'active' || subData.status === 'trialing',
        })
      } else {
        // No subscription - user is on free plan from entitlements
        setSubscription(null)
      }

      // Fetch payment history
      const { data: paymentData } = await supabase
        .from('subscription_payments')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(20)

      setPayments(
        (paymentData || []).map((p) => ({
          id: p.id,
          amount: p.amount_cents / 100,
          currency: p.currency,
          status: p.status,
          description: p.description || 'Subscription payment',
          paid_at: p.paid_at || p.created_at,
        }))
      )

      // Fetch invoices
      const { data: invoiceData } = await supabase
        .from('subscription_invoices')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })

      setInvoices(
        (invoiceData || []).map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          amount: inv.amount_cents / 100,
          currency: inv.currency,
          status: inv.status,
          due_date: inv.due_date,
          paid_at: inv.paid_at,
          pdf_url: inv.pdf_url,
        }))
      )

      // Fetch available plans from edge function or use defaults
      try {
        const { data: plansData } = await supabase.functions.invoke('subscription-management', {
          body: { action: 'available_plans' },
        })
        if (plansData?.plans) {
          setAvailablePlans(plansData.plans)
        }
      } catch {
        // Use default plans if edge function not available
        setAvailablePlans(getDefaultPlans())
      }
    } catch (err) {
      console.error('Error fetching subscription data:', err)
      setError('Failed to load subscription data')
      // Set default plans as fallback
      setAvailablePlans(getDefaultPlans())
    } finally {
      setLoading(false)
    }
  }, [staff?.business_id])

  useEffect(() => {
    fetchSubscriptionData()
  }, [fetchSubscriptionData])

  const refresh = useCallback(async () => {
    await fetchSubscriptionData()
  }, [fetchSubscriptionData])

  const cancelSubscription = useCallback(
    async (cancelAtPeriodEnd = true): Promise<{ success: boolean; message: string }> => {
      if (!staff?.business_id) {
        return { success: false, message: 'Not authenticated' }
      }

      try {
        const { error } = await supabase.rpc('cancel_subscription', {
          p_business_id: staff.business_id,
          p_cancel_at_period_end: cancelAtPeriodEnd,
        })

        if (error) {
          return { success: false, message: error.message }
        }

        await refresh()
        return {
          success: true,
          message: cancelAtPeriodEnd
            ? 'Subscription will be cancelled at the end of the billing period'
            : 'Subscription cancelled immediately',
        }
      } catch (err) {
        return { success: false, message: 'Failed to cancel subscription' }
      }
    },
    [staff?.business_id, refresh]
  )

  const createCheckout = useCallback(
    async (
      planCode: string,
      billingCycle: 'monthly' | 'yearly'
    ): Promise<{ checkout_url: string; reference: string } | null> => {
      if (!staff?.business_id || !staff?.email) {
        return null
      }

      try {
        const { data, error } = await supabase.functions.invoke('subscription-management', {
          body: {
            action: 'create_checkout',
            plan_code: planCode,
            billing_cycle: billingCycle,
          },
        })

        if (error || !data?.checkout_url) {
          console.error('Checkout error:', error, data)
          return null
        }

        return { checkout_url: data.checkout_url, reference: data.reference }
      } catch (err) {
        console.error('Checkout error:', err)
        return null
      }
    },
    [staff?.business_id, staff?.email]
  )

  return {
    subscription,
    payments,
    invoices,
    availablePlans,
    loading,
    error,
    refresh,
    cancelSubscription,
    createCheckout,
  }
}

// Default plans fallback
function getDefaultPlans(): AvailablePlan[] {
  return [
    {
      code: 'starter',
      name: 'Starter',
      monthly_price: 15000,
      yearly_price: 150000,
      yearly_monthly_equivalent: 12500,
      savings_percent: 17,
    },
    {
      code: 'team',
      name: 'Team',
      monthly_price: 48000,
      yearly_price: 480000,
      yearly_monthly_equivalent: 40000,
      savings_percent: 17,
    },
    {
      code: 'business',
      name: 'Business',
      monthly_price: 112000,
      yearly_price: 1120000,
      yearly_monthly_equivalent: 93333,
      savings_percent: 17,
    },
    {
      code: 'pro',
      name: 'Pro',
      monthly_price: 186000,
      yearly_price: 1860000,
      yearly_monthly_equivalent: 155000,
      savings_percent: 17,
    },
    {
      code: 'scale',
      name: 'Scale',
      monthly_price: 380000,
      yearly_price: 3800000,
      yearly_monthly_equivalent: 316667,
      savings_percent: 17,
    },
  ]
}
