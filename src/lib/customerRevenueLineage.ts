export type RevenueLineageStage = 'lead' | 'opportunity' | 'customer' | 'deal' | 'invoice' | 'payment'

export type CustomerRevenueEvent = {
  id: string
  organizationId: string
  subsidiaryId: string
  crmScopeId: string
  customerId: string
  stage: RevenueLineageStage
  sourceId?: string
  campaignId?: string
  amountMinor?: number
  currency?: string
  occurredAt: string
}

export type CustomerRevenueSummary = {
  customerId: string
  subsidiaryId: string
  crmScopeId: string
  attributedRevenueMinor: number
  currencies: string[]
  campaigns: string[]
  stages: RevenueLineageStage[]
}

export function assertRevenueScope(event: CustomerRevenueEvent, expected: { organizationId: string; subsidiaryId: string; crmScopeId: string }) {
  if (event.organizationId !== expected.organizationId) throw new Error('Revenue event belongs to another organization')
  if (event.subsidiaryId !== expected.subsidiaryId) throw new Error('Revenue event belongs to another subsidiary')
  if (event.crmScopeId !== expected.crmScopeId) throw new Error('Revenue event belongs to another CRM scope')
  return true
}

export function buildCustomerRevenueSummary(events: CustomerRevenueEvent[]): CustomerRevenueSummary[] {
  const groups = new Map<string, CustomerRevenueSummary>()
  for (const event of events) {
    const summary = groups.get(event.customerId) ?? {
      customerId: event.customerId,
      subsidiaryId: event.subsidiaryId,
      crmScopeId: event.crmScopeId,
      attributedRevenueMinor: 0,
      currencies: [],
      campaigns: [],
      stages: [],
    }
    if (event.stage === 'invoice' || event.stage === 'payment' || event.stage === 'deal') {
      summary.attributedRevenueMinor += event.amountMinor ?? 0
    }
    if (event.currency && !summary.currencies.includes(event.currency)) summary.currencies.push(event.currency)
    if (event.campaignId && !summary.campaigns.includes(event.campaignId)) summary.campaigns.push(event.campaignId)
    if (!summary.stages.includes(event.stage)) summary.stages.push(event.stage)
    groups.set(event.customerId, summary)
  }
  return [...groups.values()]
}
