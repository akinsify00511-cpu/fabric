import type { MarketSignal, MarketRecommendation } from './marketIntelligence'

export type MarketAction = 'expand' | 'increase_marketing' | 'increase_sales' | 'investigate' | 'defend' | 'test' | 'deprioritize' | 'watch'

export type MarketOpportunity = MarketRecommendation & {
  action: MarketAction
  score: number
}

export function buildMarketOpportunities(signals: MarketSignal[]): MarketOpportunity[] {
  return signals.flatMap((signal) => {
    const recommendations: MarketOpportunity[] = []
    const demandScore = Math.min(signal.leads / 100, 1)
    const conversionScore = Math.min(signal.conversionRate / 0.3, 1)
    const valueScore = signal.averageDealValue > 0 ? Math.min(signal.averageDealValue / 100000000, 1) : 0
    const score = Math.round((demandScore * 0.35 + conversionScore * 0.35 + valueScore * 0.3) * 100)

    if (signal.conversionRate >= 0.2 && signal.wonDeals > 0) {
      recommendations.push({
        subsidiaryId: signal.subsidiaryId,
        location: signal.location,
        type: 'hotspot',
        title: `Expand focus in ${signal.location}`,
        reason: `${signal.location} combines strong conversion with ${signal.wonDeals} won opportunities.`,
        suggestedAction: 'Increase targeted marketing and sales coverage while monitoring marginal acquisition cost.',
        priority: score >= 70 ? 'high' : 'medium',
        action: 'expand',
        score,
      })
    } else if (signal.leads >= 20 && signal.conversionRate < 0.1) {
      recommendations.push({
        subsidiaryId: signal.subsidiaryId,
        location: signal.location,
        type: 'conversion-risk',
        title: `Investigate ${signal.location} before increasing spend`,
        reason: `${signal.leads} leads are producing only ${Math.round(signal.conversionRate * 100)}% conversion.`,
        suggestedAction: 'Review lead quality, response time, offer fit and follow-up before adding budget.',
        priority: 'high',
        action: 'investigate',
        score,
      })
    } else if (signal.leads >= 10 && signal.wonDeals === 0) {
      recommendations.push({
        subsidiaryId: signal.subsidiaryId,
        location: signal.location,
        type: 'whitespace',
        title: `Test ${signal.location} as an emerging market`,
        reason: `${signal.leads} leads indicate demand, but there are not yet enough wins to establish a proven market.`,
        suggestedAction: 'Run a controlled marketing or sales test and measure conversion before scaling.',
        priority: 'medium',
        action: 'test',
        score,
      })
    }

    return recommendations
  }).sort((a, b) => b.score - a.score)
}
