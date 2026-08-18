import type { MarketOpportunity } from './customerMarketIntelligence'

export type MarketRecommendation = MarketOpportunity & {
  priority: 'high' | 'medium' | 'watch'
  rationale: string
  recommendedActions: string[]
}

export function recommendMarketActions(opportunities: MarketOpportunity[]): MarketRecommendation[] {
  return opportunities.map((opportunity) => {
    const strongRevenue = opportunity.revenueMinor > 0 && opportunity.averageRevenueMinor > 0
    const priority: MarketRecommendation['priority'] = opportunity.customers >= 10 && strongRevenue
      ? 'high'
      : opportunity.customers >= 3 && strongRevenue
        ? 'medium'
        : 'watch'

    const recommendedActions = priority === 'high'
      ? ['Increase qualified marketing coverage', 'Prioritize sales follow-up', 'Measure CAC and LTV before scaling further']
      : priority === 'medium'
        ? ['Run a targeted market test', 'Track conversion and customer value', 'Review campaign coverage']
        : ['Collect more customer and revenue data', 'Avoid major budget changes until evidence improves']

    return {
      ...opportunity,
      priority,
      rationale: priority === 'high'
        ? 'The market has enough observed customer and revenue activity to justify active commercial attention.'
        : priority === 'medium'
          ? 'The market shows promising activity but needs additional evidence before significant investment.'
          : 'Current evidence is insufficient for a confident market expansion decision.',
      recommendedActions,
    }
  })
}
