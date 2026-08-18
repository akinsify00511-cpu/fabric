export type ForecastOpportunity = {
  opportunityId: string
  subsidiaryId: string
  amountMinor: number
  stage: 'lead' | 'qualified' | 'proposal' | 'negotiation'
  confidence?: number
  dueDate?: string
}

export type RevenueForecast = {
  subsidiaryId: string
  baseCaseMinor: number
  likelyCaseMinor: number
  upsideCaseMinor: number
  atRiskMinor: number
  assumptions: string[]
}

const stageProbability = { lead: 0.1, qualified: 0.25, proposal: 0.5, negotiation: 0.7 }

export function buildRevenueForecast(opportunities: ForecastOpportunity[]): RevenueForecast[] {
  const groups = new Map<string, ForecastOpportunity[]>()
  for (const opportunity of opportunities) {
    const list = groups.get(opportunity.subsidiaryId) ?? []
    list.push(opportunity)
    groups.set(opportunity.subsidiaryId, list)
  }
  return [...groups.entries()].map(([subsidiaryId, items]) => {
    const confidenceOf = (item: ForecastOpportunity) => item.confidence ?? stageProbability[item.stage]
    const baseCaseMinor = items.reduce((sum, item) => sum + item.amountMinor * confidenceOf(item), 0)
    const likelyCaseMinor = items.reduce((sum, item) => sum + item.amountMinor * Math.min(0.9, confidenceOf(item) + 0.15), 0)
    const upsideCaseMinor = items.reduce((sum, item) => sum + item.amountMinor * Math.min(1, confidenceOf(item) + 0.3), 0)
    const atRiskMinor = items.reduce((sum, item) => sum + (confidenceOf(item) < 0.4 ? item.amountMinor : 0), 0)
    return { subsidiaryId, baseCaseMinor, likelyCaseMinor, upsideCaseMinor, atRiskMinor, assumptions: ['Forecast is probability-weighted from current pipeline stage/confidence.', 'Forecast excludes opportunities not present in the supplied pipeline snapshot.'] }
  })
}
