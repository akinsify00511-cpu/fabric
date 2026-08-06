/**
 * Centralized currency formatting for Nigerian Naira (NGN).
 * Replace this implementation to support additional currencies.
 */

const NGN_FORMATTER = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

/**
 * Format a number as Nigerian Naira (₦).
 * Handles compact notation for large values.
 *
 * @param amount - The amount in Naira (no decimals)
 * @param compact - If true, shows "₦1.2M" / "₦500k" for large amounts
 */
export function formatCurrency(amount: number, compact = false): string {
  if (compact) {
    if (amount >= 1_000_000) {
      return `₦${(amount / 1_000_000).toFixed(1)}M`
    }
    if (amount >= 1_000) {
      return `₦${(amount / 1_000).toFixed(0)}k`
    }
  }
  return NGN_FORMATTER.format(amount)
}

export function useCurrency() {
  return { formatCurrency }
}
