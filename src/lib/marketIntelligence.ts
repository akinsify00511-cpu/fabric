export type GeoGranularity = 'country' | 'region' | 'city' | 'area'

export type MarketSignal = {
  id: string
  organizationId: string
  subsidiaryId: string
  location: string
  granularity: GeoGranularity
  leads: number
  opportunities: number
  wonDeals: number
  revenue: number
  averageDealValue: number
  conversionRate: number
  periodStart: string
  periodEnd: string
}

export type MarketRecommendation = {
  subsidiaryId: string
  location: string
  type: 'hotspot' | 'emerging' | 'whitespace' | 'conversion-risk'
  title: string
  reason: string
  suggestedAction: string
  priority: 'low' | 'medium' | 'high' | 'critical'
}

export function rankMarketSignals(signals: MarketSignal[]) {
  return [...signals].sort((a, b) => {
    const revenueDelta = b.revenue - a.revenue
    if (revenueDelta !== 0) return revenueDelta
    return b.conversionRate - a.conversionRate
  })
}

export function detectMarketSignals(signals: MarketSignal[]): MarketRecommendation[] {
  return signals.flatMap((signal) => {
    const recommendations: MarketRecommendation[] = []

    if (signal.wonDeals > 0 && signal.conversionRate >= 0.2) {
      recommendations.push({
        subsidiaryId: signal.subsidiaryId,
        location: signal.location,
        type: 'hotspot',
        title: `${signal.location} is a high-performing market`,
        reason: `${Math.round(signal.conversionRate * 100)}% conversion with ${signal.wonDeals} won opportunities.`,
        suggestedAction: 'Evaluate increasing sales coverage and targeted marketing investment.',
        priority: signal.averageDealValue > 0 ? 'high' : 'medium',
      })
    }

    if (signal.leads >= 20 && signal.conversionRate < 0.1) {
      recommendations.push({
        subsidiaryId: signal.subsidiaryId,
        location: signal.location,
        type: 'conversion-risk',
        title: `${signal.location} has demand but weak conversion`,
        reason: `${signal.leads} leads are producing only ${Math.round(signal.conversionRate * 100)}% conversion.`,
        suggestedAction: 'Investigate lead quality, response time, offer fit and sales follow-up before increasing spend.',
        priority: 'high',
      })
    }

    return recommendations
  })
}
