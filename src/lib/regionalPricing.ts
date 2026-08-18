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
}

export function calculateRegionalTotal(price: RegionalPrice) {
  if (price.taxIncluded || !price.taxRate) return price.amountMinor
  return Math.round(price.amountMinor * (1 + price.taxRate / 100))
}

export function selectRegionalPrice(prices: RegionalPrice[], countryCode: string, currency?: string, interval: BillingInterval = 'monthly') {
  return prices.find((price) =>
    price.countryCode === countryCode &&
    price.interval === interval &&
    (!currency || price.currency === currency),
  ) ?? prices.find((price) => price.countryCode === countryCode && price.interval === interval)
}
