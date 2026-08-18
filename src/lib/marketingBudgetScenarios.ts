import type { MarketEconomics } from './marketEconomics'

export type BudgetScenario = {
  marketKey: string
  currentSpendMinor: number
  proposedSpendMinor: number
  currency: string
}

export type BudgetScenarioResult = BudgetScenario & {
  incrementalSpendMinor: number
  expectedIncrementalRevenueMinor?: number
  expectedIncrementalGrossProfitMinor?: number
  expectedIncrementalCustomers?: number
  confidence: 'low' | 'medium' | 'high'
}

export function modelBudgetScenario(market: MarketEconomics, scenario: BudgetScenario): BudgetScenarioResult {
  const incrementalSpendMinor = scenario.proposedSpendMinor - scenario.currentSpendMinor
  if (incrementalSpendMinor <= 0) return { ...scenario, incrementalSpendMinor, confidence: 'low' }

  const expectedIncrementalRevenueMinor = market.roas ? Math.round(incrementalSpendMinor * market.roas) : undefined
  const expectedIncrementalGrossProfitMinor = market.contributionRoas ? Math.round(incrementalSpendMinor * market.contributionRoas) : undefined
  const expectedIncrementalCustomers = market.cacMinor && market.cacMinor > 0 ? Math.floor(incrementalSpendMinor / market.cacMinor) : undefined
  const confidence: BudgetScenarioResult['confidence'] = market.customers >= 50 && market.roas !== undefined && market.contributionRoas !== undefined
    ? 'high'
    : market.customers >= 10 && market.roas !== undefined ? 'medium' : 'low'

  return { ...scenario, incrementalSpendMinor, expectedIncrementalRevenueMinor, expectedIncrementalGrossProfitMinor, expectedIncrementalCustomers, confidence }
}

export function compareBudgetScenarios(markets: MarketEconomics[], scenarios: BudgetScenario[]) {
  return scenarios.map((scenario) => {
    const market = markets.find((candidate) => candidate.marketKey === scenario.marketKey)
    return market ? modelBudgetScenario(market, scenario) : undefined
  }).filter((result): result is BudgetScenarioResult => Boolean(result))
    .sort((a, b) => (b.expectedIncrementalGrossProfitMinor ?? 0) - (a.expectedIncrementalGrossProfitMinor ?? 0))
}
