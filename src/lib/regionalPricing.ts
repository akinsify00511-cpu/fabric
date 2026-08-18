export type BillingInterval = 'monthly' | 'annual'

export type RegionalPrice = {
  planId: string
  countryCode: string
  currency: string
  interval: BillingInterval
  amountMinor: number
  taxIncluded: boolean
  taxRate?: number
  paymentMethods: string[]
  marketTier: 'emerging' | 'growth' | 'premium'
}

export function calculateRegionalTotal(price: RegionalPrice) {
  if (price.taxIncluded || !price.taxRate) return price.amountMinor
  return Math.round(price.amountMinor * (1 + price.taxRate / 100))
}

export function selectRegionalPrice(prices: RegionalPrice[], countryCode: string, currency?: string, interval: BillingInterval = 'monthly') {
  return prices.find((price) => price.countryCode === countryCode && price.interval === interval && (!currency || price.currency === currency))
    ?? prices.find((price) => price.countryCode === countryCode && price.interval === interval)
}

/** Prevents accidental underpricing by requiring an explicit market tier for every regional price. */
export function validateRegionalPrice(price: RegionalPrice) {
  if (price.amountMinor <= 0) throw new Error('Regional price must be greater than zero')
  if (!price.planId || !price.countryCode || !price.currency) throw new Error('Plan, country and currency are required')
  if (!['emerging', 'growth', 'premium'].includes(price.marketTier)) throw new Error('A market tier is required')
  return true
}
