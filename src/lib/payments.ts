// ============================================
// PAYMENT INTEGRATIONS
// Paystack, Flutterwave, Stripe
// ============================================

import { supabase } from './supabase'

export interface PaymentConfig {
  provider: 'paystack' | 'flutterwave' | 'stripe'
  publicKey: string
  secretKey: string
  currency: string
}

export interface PaymentRequest {
  amount: number
  currency: string
  email: string
  reference?: string
  description?: string
  metadata?: Record<string, any>
  customer?: {
    name?: string
    phone?: string
  }
}

export interface PaymentResult {
  success: boolean
  reference: string
  transactionId?: string
  amount?: number
  currency?: string
  status?: string
  message?: string
  redirectUrl?: string
}

// ============================================
// PAYSTACK INTEGRATION
// ============================================

declare global {
  interface Window {
    PaystackPop?: {
      resolver: (action: string, params?: any) => void
    }
  }
}

export const PaystackService = {
  // Initialize Paystack
  async loadScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if (window.PaystackPop) {
        resolve(true)
        return
      }
      
      const script = document.createElement('script')
      script.src = 'https://js.paystack.co/v2/inline.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.head.appendChild(script)
    })
  },

  // Get public key from settings
  async getPublicKey(): Promise<string | null> {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'paystack_public_key')
      .single()
    return data?.value || null
  },

  // Start payment
  async pay(request: PaymentRequest): Promise<PaymentResult> {
    const publicKey = await this.getPublicKey()
    if (!publicKey) {
      return { success: false, reference: '', message: 'Paystack not configured' }
    }

    const reference = `PS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return new Promise((resolve) => {
      if (!window.PaystackPop) {
        resolve({ success: false, reference, message: 'Paystack not loaded' })
        return
      }

      const handler = window.PaystackPop as any

      handler.resolver('newFrame', {
        key: publicKey,
        email: request.email,
        amount: request.amount * 100, // kobo
        currency: request.currency || 'NGN',
        reference: reference,
        metadata: request.metadata || {},
        callback: (response: any) => {
          resolve({
            success: true,
            reference: response.reference,
            transactionId: response.trans,
            amount: request.amount,
            currency: request.currency,
            status: response.status,
          })
        },
        onClose: () => {
          resolve({ success: false, reference, message: 'Payment cancelled' })
        },
      })
    })
  },

  // Verify payment (server-side recommended)
  async verifyPayment(reference: string): Promise<PaymentResult> {
    try {
      // Call your backend to verify
      // This is a client-side check - in production, verify server-side
      const response = await fetch(`${import.meta.env.VITE_API_URL}/payments/verify/paystack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      })
      return await response.json()
    } catch (e) {
      return { success: false, reference, message: 'Verification failed' }
    }
  },
}

// ============================================
// FLUTTERWAVE INTEGRATION
// ============================================

declare global {
  interface Window {
    FlutterwaveCheckout?: (options: any) => void
  }
}

export const FlutterwaveService = {
  async loadScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if (window.FlutterwaveCheckout) {
        resolve(true)
        return
      }
      
      const script = document.createElement('script')
      script.src = 'https://checkout.flutterwave.com/v3.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.head.appendChild(script)
    })
  },

  async getPublicKey(): Promise<string | null> {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'flutterwave_public_key')
      .single()
    return data?.value || null
  },

  async pay(request: PaymentRequest): Promise<PaymentResult> {
    const publicKey = await this.getPublicKey()
    if (!publicKey) {
      return { success: false, reference: '', message: 'Flutterwave not configured' }
    }

    const reference = `FW_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return new Promise((resolve) => {
      if (!window.FlutterwaveCheckout) {
        resolve({ success: false, reference, message: 'Flutterwave not loaded' })
        return
      }

      window.FlutterwaveCheckout({
        public_key: publicKey,
        tx_ref: reference,
        amount: request.amount,
        currency: request.currency || 'NGN',
        payment_options: 'card,mobilemoney,ussd',
        customer: {
          email: request.email,
          name: request.customer?.name || request.email,
          phonenumber: request.customer?.phone || '',
        },
        customizations: {
          title: 'Avenize Payment',
          description: request.description || 'Payment',
          logo: '/icons/icon-192x192.png',
        },
        callback: (response: any) => {
          if (response.status === 'successful') {
            resolve({
              success: true,
              reference: response.tx_ref,
              transactionId: response.transaction_id,
              amount: response.amount,
              currency: response.currency,
              status: response.status,
            })
          } else {
            resolve({ success: false, reference, message: 'Payment not completed' })
          }
        },
        onclose: () => {
          resolve({ success: false, reference, message: 'Payment cancelled' })
        },
      })
    })
  },
}

// ============================================
// STRIPE INTEGRATION
// ============================================
// To enable Stripe:
// 1. Run: npm install @stripe/stripe-js
// 2. Add Stripe public key to settings
// 3. Create a backend endpoint for checkout sessions

export const StripeService = {
  async getPublicKey(): Promise<string | null> {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'stripe_public_key')
      .single()
    return data?.value || null
  },

  async createCheckoutSession(items: { name: string; amount: number; quantity: number }[]): Promise<{ sessionId?: string; url?: string; error?: string }> {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/payments/checkout/stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await response.json()
      return data
    } catch (e) {
      return { error: 'Failed to create checkout session - Stripe requires backend setup' }
    }
  },
}

// ============================================
// PAYMENT UTILITIES
// ============================================

export const PaymentUtils = {
  // Format amount
  formatAmount(amount: number, currency: string = 'NGN'): string {
    const symbols: Record<string, string> = {
      NGN: '₦',
      USD: '$',
      EUR: '€',
      GBP: '£',
      KES: 'KSh',
      GHS: '₵',
      ZAR: 'R',
    }
    const symbol = symbols[currency] || currency + ' '
    return `${symbol}${amount.toLocaleString()}`
  },

  // Get provider display name
  getProviderName(provider: string): string {
    const names: Record<string, string> = {
      paystack: 'Paystack',
      flutterwave: 'Flutterwave',
      stripe: 'Stripe',
    }
    return names[provider] || provider
  },

  // Get provider logo
  getProviderLogo(provider: string): string {
    const logos: Record<string, string> = {
      paystack: 'https://paystack.com/favicon.ico',
      flutterwave: 'https://flutterwave.com/favicon.ico',
      stripe: 'https://stripe.com/favicon.ico',
    }
    return logos[provider] || ''
  },

  // Get supported currencies per provider
  getSupportedCurrencies(provider: string): string[] {
    const currencies: Record<string, string[]> = {
      paystack: ['NGN', 'USD', 'GHS', 'ZAR'],
      flutterwave: ['NGN', 'USD', 'EUR', 'GBP', 'KES', 'GHS', 'UGX', 'TZS', 'ZAR'],
      stripe: ['USD', 'EUR', 'GBP', 'NGN', 'KES', 'ZAR'],
    }
    return currencies[provider] || ['USD']
  },

  // Generate payment link
  generatePaymentLink(provider: string, invoiceId: string, amount: number): string {
    const baseUrl = window.location.origin
    return `${baseUrl}/pay/${provider}/${invoiceId}?amount=${amount}`
  },
}

// ============================================
// PAYMENT RECORDING
// ============================================

export async function recordPayment(payment: {
  business_id: string
  invoice_id?: string
  customer_id?: string
  amount: number
  currency: string
  provider: string
  reference: string
  transaction_id?: string
  status: string
  description?: string
}) {
  const { data, error } = await supabase
    .from('payments')
    .insert(payment)
    .select()
    .single()

  if (error) {
    console.error('Failed to record payment:', error)
    return null
  }

  return data
}

export async function getPaymentStatus(reference: string) {
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .single()

  return data
}

export async function getPaymentsByInvoice(invoiceId: string) {
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })

  return data || []
}

export async function getPaymentsByCustomer(customerId: string) {
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  return data || []
}
