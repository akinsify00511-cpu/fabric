// Checkout return handling. When Paystack finishes (or the user abandons),
// it redirects to our callback_url with ?trxref=...&reference=... appended.
// The reference lets us verify the payment server-side; its absence means
// the user came back without completing (or never left for) checkout.

export type CheckoutReturnState =
  | 'form'        // no return params — render the normal checkout form
  | 'verifying'   // a reference came back — verify before claiming anything
  | 'confirmed'   // provider says the payment succeeded
  | 'failed'      // provider says the payment failed / verification rejected

/** Extract the payment reference from the Paystack redirect. */
export function extractCheckoutReference(params: Pick<URLSearchParams, 'get'>): string | null {
  return params.get('reference') || params.get('trxref') || null
}

/** Initial UI state for the return visit. */
export function initialCheckoutState(params: Pick<URLSearchParams, 'get'>): CheckoutReturnState {
  if (params.get('success') === 'true') return 'confirmed' // legacy manual flag
  return extractCheckoutReference(params) ? 'verifying' : 'form'
}

/** Map a verify response onto a UI state. Never trust the browser: only a
 *  server-confirmed success may reach 'confirmed'. */
export function stateFromVerification(res: { success?: boolean; status?: string } | null): CheckoutReturnState {
  if (!res) return 'failed'
  if (res.success === true && res.status === 'success') return 'confirmed'
  return 'failed'
}
