/**
 * Centralized formatting utilities.
 * Uses native Intl APIs — zero dependencies.
 * All date/currency formatting in the app should funnel through these
 * to prevent the 20+ duplicate implementations that existed before.
 */

const NG_LOCALE = 'en-NG'

export function formatDate(
  dateStr: string | Date,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(NG_LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...opts,
  }).format(d)
}

export function formatDateTime(dateStr: string | Date): string {
  return formatDate(dateStr, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatCurrency(
  amount: number,
  currency = 'NGN',
  opts: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(NG_LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    ...opts,
  }).format(amount || 0)
}

/** Compact currency for dashboards: ₦1.2K, ₦3.4M */
export function formatCompactCurrency(amount: number, currency = 'NGN'): string {
  const abs = Math.abs(amount || 0)
  const symbol = currency === 'NGN' ? '₦' : '$'
  if (abs >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${symbol}${(amount / 1_000).toFixed(1)}K`
  return `${symbol}${(amount || 0).toLocaleString()}`
}

export function timeAgo(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return '—'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
