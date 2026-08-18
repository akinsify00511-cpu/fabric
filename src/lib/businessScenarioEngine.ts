export type ScenarioInput = {
  subsidiaryId: string
  baselineRevenueMinor: number
  baselineGrossProfitMinor: number
  baselineMarketingSpendMinor: number
  baselineCustomers: number
  baselineConversionRate: number
  baselineCacMinor?: number
  marketingSpendChangePct?: number
  conversionChangePct?: number
  cacChangePct?: number
  averageOrderValueMinor?: number
}

export type ScenarioResult = {
  subsidiaryId: string
  projectedCustomers: number
  projectedRevenueMinor: number
  projectedGrossProfitMinor: number
  projectedMarketingSpendMinor: number
  projectedProfitAfterMarketingMinor: number
  revenueDeltaMinor: number
  profitDeltaMinor: number
  assumptions: string[]
}

export function simulateBusinessScenario(input: ScenarioInput): ScenarioResult {
  const spendMultiplier = 1 + (input.marketingSpendChangePct ?? 0) / 100
  const conversionMultiplier = 1 + (input.conversionChangePct ?? 0) / 100
  const cacMultiplier = 1 + (input.cacChangePct ?? 0) / 100
  const projectedMarketingSpendMinor = input.baselineMarketingSpendMinor * spendMultiplier
  const baselineAcquired = input.baselineCustomers > 0 ? input.baselineCustomers : input.baselineMarketingSpendMinor / Math.max(1, input.baselineCacMinor ?? 1)
  const effectiveCac = input.baselineCacMinor ? input.baselineCacMinor * cacMultiplier : undefined
  const projectedFromSpend = effectiveCac ? projectedMarketingSpendMinor / effectiveCac : baselineAcquired * spendMultiplier
  const projectedCustomers = Math.max(0, projectedFromSpend * conversionMultiplier)
  const averageOrderValue = input.averageOrderValueMinor ?? (input.baselineCustomers > 0 ? input.baselineRevenueMinor / input.baselineCustomers : 0)
  const projectedRevenueMinor = projectedCustomers * averageOrderValue
  const baselineMargin = input.baselineRevenueMinor > 0 ? input.baselineGrossProfitMinor / input.baselineRevenueMinor : 0
  const projectedGrossProfitMinor = projectedRevenueMinor * baselineMargin
  const projectedProfitAfterMarketingMinor = projectedGrossProfitMinor - projectedMarketingSpendMinor
  const baselineProfitAfterMarketingMinor = input.baselineGrossProfitMinor - input.baselineMarketingSpendMinor
  return {
    subsidiaryId: input.subsidiaryId,
    projectedCustomers,
    projectedRevenueMinor,
    projectedGrossProfitMinor,
    projectedMarketingSpendMinor,
    projectedProfitAfterMarketingMinor,
    revenueDeltaMinor: projectedRevenueMinor - input.baselineRevenueMinor,
    profitDeltaMinor: projectedProfitAfterMarketingMinor - baselineProfitAfterMarketingMinor,
    assumptions: ['Scenario is directional and uses supplied baseline economics.', 'Projected revenue assumes average order value remains stable.', 'Projected gross margin assumes baseline gross-margin percentage remains stable.'],
  }
}
