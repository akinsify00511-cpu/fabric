export type MarketEconomicsSignal = {
  marketKey: string
  subsidiaryId: string
  customers: number
  revenueMinor: number
  grossProfitMinor: number
  marketingSpendMinor: number
  attributedCustomers: number
  currency: string
  repeatCustomerRate?: number
  estimatedLtvMinor?: number
}

export type MarketEconomics = MarketEconomicsSignal & {
  cacMinor?: number
  roas?: number
  contributionRoas?: number
  ltvCac?: number
  economicScore: number
}

export function calculateMarketEconomics(signal: MarketEconomicsSignal): MarketEconomics {
  const cacMinor = signal.attributedCustomers > 0 ? Math.round(signal.marketingSpendMinor / signal.attributedCustomers) : undefined
  const roas = signal.marketingSpendMinor > 0 ? signal.revenueMinor / signal.marketingSpendMinor : undefined
  const contributionRoas = signal.marketingSpendMinor > 0 ? signal.grossProfitMinor / signal.marketingSpendMinor : undefined
  const ltvCac = signal.estimatedLtvMinor && cacMinor && cacMinor > 0 ? signal.estimatedLtvMinor / cacMinor : undefined
  const score = Math.min((roas ?? 0) / 5, 1) * 30 + Math.min((contributionRoas ?? 0) / 3, 1) * 30 + Math.min((ltvCac ?? 0) / 5, 1) * 25 + Math.min(signal.repeatCustomerRate ?? 0, 1) * 15
  return { ...signal, cacMinor, roas, contributionRoas, ltvCac, economicScore: Math.round(score * 100) / 100 }
}
