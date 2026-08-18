export type GeographicMarket = {
  marketKey: string
  label: string
  customers: number
  revenueMinor: number
  addressableMarket?: number
  growthRate?: number
  conversionRate?: number
  ltvMinor?: number
  cacMinor?: number
  roas?: number
  marketingSpendMinor?: number
}

export type GeographicOpportunity = {
  marketKey: string
  label: string
  score: number
  confidence: 'low' | 'medium' | 'high'
  opportunity: 'expand' | 'increase_marketing' | 'test' | 'defend'
  reasons: string[]
}

const clamp = (value: number) => Math.max(0, Math.min(100, value))

export function rankGeographicOpportunities(markets: GeographicMarket[]): GeographicOpportunity[] {
  return markets.map((market) => {
    const penetration = market.addressableMarket && market.addressableMarket > 0 ? market.customers / market.addressableMarket : undefined
    const underPenetration = penetration === undefined ? 50 : clamp(100 - penetration * 100)
    const growth = clamp(50 + (market.growthRate ?? 0) * 100)
    const conversion = clamp((market.conversionRate ?? 0) * 100)
    const value = market.ltvMinor && market.cacMinor && market.cacMinor > 0 ? clamp((market.ltvMinor / market.cacMinor) * 20) : 50
    const efficiency = market.roas === undefined ? 50 : clamp(market.roas * 20)
    const score = Math.round((underPenetration + growth + conversion + value + efficiency) / 5)
    const reasons: string[] = []
    if (underPenetration >= 70) reasons.push('Customer penetration appears low relative to the addressable market')
    if (growth >= 65) reasons.push('Market growth signal is positive')
    if (conversion >= 60) reasons.push('Conversion performance is strong')
    if (value >= 65) reasons.push('Customer economics support expansion')
    if (efficiency >= 65) reasons.push('Marketing efficiency is attractive')
    const confidence: GeographicOpportunity['confidence'] = market.customers >= 50 ? 'high' : market.customers >= 15 ? 'medium' : 'low'
    const opportunity: GeographicOpportunity['opportunity'] = score >= 80 ? 'expand' : score >= 68 && efficiency >= 60 ? 'increase_marketing' : score >= 52 ? 'test' : 'defend'
    return { marketKey: market.marketKey, label: market.label, score, confidence, opportunity, reasons }
  }).sort((a, b) => b.score - a.score)
}
