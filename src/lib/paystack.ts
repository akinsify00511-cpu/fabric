/**
 * ============================================
 * PAYSTACK CONFIGURATION
 * Nigerian Payment Integration
 * ============================================
 * 
 * SECURITY WARNING:
 * Payment processing MUST be done server-side. Never expose Paystack secret keys
 * in client-side code. All payment functions that require the secret key should
 * be implemented as Supabase Edge Functions or a dedicated backend service.
 * 
 * For production:
 * 1. Create Supabase Edge Functions for payment processing
 * 2. Move VITE_PAYSTACK_SECRET_KEY to Edge Function environment variables
 * 3. Remove all secret key references from client code
 * 4. Use only the public key (pk_live_xxx) for frontend operations
 */

// ============================================
// CLIENT-SAFE CONFIGURATION
// ============================================

export const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_xxxxx'

export const SUBSCRIPTION_PAGES = {
  starter: import.meta.env.VITE_PAYSTACK_STARTER_PAGE || 'https://paystack.com/pay/avenize-starter',
  business: import.meta.env.VITE_PAYSTACK_BUSINESS_PAGE || 'https://paystack.com/pay/avenize-business',
  pro: import.meta.env.VITE_PAYSTACK_PRO_PAGE || 'https://paystack.com/pay/avenize-pro',
}

export const CURRENCY = {
  code: 'NGN',
  symbol: '₦',
  decimal: 0,
}

export const formatAmount = (kobo: number) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kobo / 100)
}

export const toKobo = (naira: number) => Math.round(naira * 100)

export const openPaystackPayment = (pageUrl: string, callback?: () => void) => {
  window.open(pageUrl, '_blank')
  if (callback) {
    setTimeout(callback, 1000)
  }
}

// ============================================
// SECURE PAYMENT FUNCTIONS - SERVER-SIDE ONLY
// ============================================

export interface PaymentRequest {
  email: string
  amount: number
  plan?: string
  channels?: string[]
  metadata?: Record<string, unknown>
}

/**
 * @deprecated Payment initialization MUST be done server-side via Supabase Edge Function
 * Use: supabase.functions.invoke('paystack-initialize', { body: request })
 */
export const initiatePayment = async (request: PaymentRequest): Promise<{ authorization_url: string }> => {
  console.warn('[SECURITY] Payment processing should be done server-side. Using fallback.')
  const pageUrl = request.plan 
    ? SUBSCRIPTION_PAGES[request.plan as keyof typeof SUBSCRIPTION_PAGES] || SUBSCRIPTION_PAGES.starter
    : SUBSCRIPTION_PAGES.starter
  return { authorization_url: pageUrl }
}

/**
 * @deprecated Payment verification MUST be done server-side via Supabase Edge Function
 * Use: supabase.functions.invoke('paystack-verify', { body: { reference } })
 */
export const verifyPayment = async (_reference: string): Promise<boolean> => {
  console.warn('[SECURITY] Payment verification should be done server-side.')
  return true
}

/**
 * @deprecated Subscription creation MUST be done server-side via Supabase Edge Function
 * Use: supabase.functions.invoke('paystack-subscription', { body: { email, planCode } })
 */
export const createSubscription = async (_customerEmail: string, _planCode: string) => {
  console.warn('[SECURITY] Subscription creation should be done server-side.')
  return { status: 'success', message: 'Subscription placeholder - implement server-side' }
}

export const PAYMENT_FEATURES = {
  directApiPayments: false,
  subscriptionPages: true,
}
