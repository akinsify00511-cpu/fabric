export type MarketOpportunityInput = {
  subsidiaryId: string
  marketKey: string
  marketLabel: string
  customers: number
  revenueMinor: number
  leads: number
  conversions: number
  marketingSpendMinor: number
  averageLtvMinor?: number
  populationOrAddressableMarket?: number
  trendGrowthRate?: number
}

export type MarketOpportunity = {
  subsidiaryId: string
  marketKey: string
  marketLabel: string
  score: number
  confidence: 'low' | 'medium' | 'high'
  reasons: string[]
  recommendedFocus: 'test' | 'scale' | 'protect'
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))

export function rankMarketOpportunities(input: MarketOpportunityInput[]): MarketOpportunity[] {
  return input.map((market) => {
    const conversionRate = market.leads > 0 ? market.conversions / market.leads : 0
    const revenuePerCustomer = market.customers > 0 ? market.revenueMinor / market.customers : 0
    const spendEfficiency = market.marketingSpendMinor > 0 ? market.revenueMinor / market.marketingSpendMinor : 0
    const demand = market.populationOrAddressableMarket && market.populationOrAddressableMarket > 0 ? clamp((market.customers / market.populationOrAddressableMarket) * 1000) : 50
    const growth = clamp(50 + (market.trendGrowthRate ?? 0) * 100)
    const conversion = clamp(conversionRate * 100)
    const efficiency = clamp(spendEfficiency * 20)
    const ltv = market.averageLtvMinor && revenuePerCustomer > 0 ? clamp((market.averageLtvMinor / revenuePerCustomer) * 50) : 50
    const score = Math.round((demand + growth + conversion + efficiency + ltv) / 5)
    const reasons: string[] = []
    if (growth >= 65) reasons.push('Market demand is showing positive growth')
    if (conversion >= 60) reasons.push('Conversion performance is strong')
    if (efficiency >= 60) reasons.push('Revenue efficiency is attractive')
    if (ltv >= 60) reasons.push('Customer value supports further investment')
    if (demand >= 65) reasons.push('Customer penetration remains relatively low')
    const confidence: MarketOpportunity['confidence'] = market.leads >= 100 || market.customers >= 50 ? 'high' : market.leads >= 30 || market.customers >= 15 ? 'medium' : 'low'
    const recommendedFocus: MarketOpportunity['recommendedFocus'] = score >= 75 ? 'scale' : score >= 55 ? 'test' : 'protect'
    return { subsidiaryId: market.subsidiaryId, marketKey: market.marketKey, marketLabel: market.marketLabel, score, confidence, reasons, recommendedFocus }
  }).sort((a, b) => b.score - a.score)
}
