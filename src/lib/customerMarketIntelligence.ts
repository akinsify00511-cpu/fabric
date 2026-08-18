export type CustomerMarketSignal = {
  customerId: string
  subsidiaryId: string
  countryCode?: string
  region?: string
  city?: string
  latitude?: number
  longitude?: number
  revenueMinor: number
  currency: string
  campaignIds: string[]
}

export type MarketOpportunity = {
  key: string
  subsidiaryId: string
  location: { countryCode?: string; region?: string; city?: string }
  customers: number
  revenueMinor: number
  currencies: string[]
  averageRevenueMinor: number
  campaignCount: number
}

export function buildMarketOpportunities(signals: CustomerMarketSignal[]): MarketOpportunity[] {
  const groups = new Map<string, MarketOpportunity>()
  for (const signal of signals) {
    const locationKey = [signal.countryCode ?? 'unknown', signal.region ?? 'unknown', signal.city ?? 'unknown'].join(':')
    const key = `${signal.subsidiaryId}:${locationKey}`
    const existing = groups.get(key) ?? {
      key,
      subsidiaryId: signal.subsidiaryId,
      location: { countryCode: signal.countryCode, region: signal.region, city: signal.city },
      customers: 0,
      revenueMinor: 0,
      currencies: [],
      averageRevenueMinor: 0,
      campaignCount: 0,
    }
    existing.customers += 1
    existing.revenueMinor += signal.revenueMinor
    if (!existing.currencies.includes(signal.currency)) existing.currencies.push(signal.currency)
    existing.campaignCount += signal.campaignIds.length
    existing.averageRevenueMinor = existing.customers > 0 ? existing.revenueMinor / existing.customers : 0
    groups.set(key, existing)
  }
  return [...groups.values()].sort((a, b) => b.revenueMinor - a.revenueMinor)
}

export function rankMarketOpportunities(opportunities: MarketOpportunity[]) {
  return opportunities.map((opportunity, index) => ({
    ...opportunity,
    rank: index + 1,
    signal: opportunity.customers > 0 && opportunity.averageRevenueMinor > 0 ? 'validated_market' as const : 'insufficient_data' as const,
  }))
}
