// ============================================
// PAYSTACK CONFIGURATION
// Nigerian Payment Integration
// ============================================

// Paystack Public Key (from Paystack Dashboard)
export const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_live_xxxxx'

// Subscription Page URLs (from Paystack Dashboard)
export const SUBSCRIPTION_PAGES = {
  starter: import.meta.env.VITE_PAYSTACK_STARTER_PAGE || 'https://paystack.com/pay/avenize-starter',
  business: import.meta.env.VITE_PAYSTACK_BUSINESS_PAGE || 'https://paystack.com/pay/avenize-business',
  pro: import.meta.env.VITE_PAYSTACK_PRO_PAGE || 'https://paystack.com/pay/avenize-pro',
}

// Alternative: Use Paystack API for dynamic pricing
export const PAYSTACK_API = {
  baseUrl: 'https://api.paystack.co',
  secretKey: import.meta.env.VITE_PAYSTACK_SECRET_KEY || '',
}

// Currency
export const CURRENCY = {
  code: 'NGN',
  symbol: '₦',
  decimal: 0,
}

// Format amount (kobo to naira)
export const formatAmount = (kobo: number) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kobo / 100)
}

// Convert naira to kobo
export const toKobo = (naira: number) => Math.round(naira * 100)

// Open Paystack Payment Page
export const openPaystackPayment = (pageUrl: string, callback?: () => void) => {
  const handler = (window as any).PaystackPop && new (window as any).PaystackPop()
  
  if (handler) {
    handler.openIframe()
  } else {
    // Fallback: Open in new tab
    window.open(pageUrl, '_blank')
  }
  
  // For subscription pages, they handle the callback
  if (callback) {
    // Check for payment status after return
    setTimeout(callback, 1000)
  }
}

// Direct payment with Paystack API (requires backend)
export interface PaymentRequest {
  email: string
  amount: number // in kobo
  plan?: string
  channels?: string[]
  metadata?: Record<string, any>
}

export const initiatePayment = async (request: PaymentRequest): Promise<{ authorization_url: string }> => {
  const response = await fetch(`${PAYSTACK_API.baseUrl}/transaction/initialize`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAYSTACK_API.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })
  
  if (!response.ok) {
    throw new Error('Payment initialization failed')
  }
  
  return response.json()
}

// Verify payment
export const verifyPayment = async (reference: string): Promise<boolean> => {
  const response = await fetch(`${PAYSTACK_API.baseUrl}/transaction/verify/${reference}`, {
    headers: {
      'Authorization': `Bearer ${PAYSTACK_API.secretKey}`,
    },
  })
  
  const data = await response.json()
  return data.status && data.data.status === 'success'
}

// Create subscription
export const createSubscription = async (customerEmail: string, planCode: string) => {
  const response = await fetch(`${PAYSTACK_API.baseUrl}/subscription`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAYSTACK_API.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer: customerEmail,
      plan: planCode,
    }),
  })
  
  return response.json()
}
