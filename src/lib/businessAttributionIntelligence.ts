export type AttributionEvent = {
  customerId: string
  subsidiaryId: string
  stage: 'lead' | 'opportunity' | 'won' | 'invoice' | 'payment' | 'repeat_purchase'
  channel?: string
  campaign?: string
  marketKey?: string
  amountMinor?: number
  occurredAt: string
}

export type AttributionPath = {
  customerId: string
  subsidiaryId: string
  channels: string[]
  campaigns: string[]
  marketKeys: string[]
  revenueMinor: number
  paidMinor: number
  stages: AttributionEvent['stage'][]
}

export type AttributionSummary = {
  key: string
  customers: number
  wonCustomers: number
  revenueMinor: number
  paidMinor: number
  conversionRate: number
  revenuePerWonCustomerMinor: number
  attributedRoas?: number
}

export function buildAttributionPaths(events: AttributionEvent[]): AttributionPath[] {
  const grouped = new Map<string, AttributionEvent[]>()
  for (const event of events) {
    const list = grouped.get(event.customerId) ?? []
    list.push(event)
    grouped.set(event.customerId, list)
  }
  return [...grouped.entries()].map(([customerId, items]) => {
    const ordered = [...items].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    return {
      customerId,
      subsidiaryId: ordered[0].subsidiaryId,
      channels: [...new Set(ordered.map((e) => e.channel).filter(Boolean))] as string[],
      campaigns: [...new Set(ordered.map((e) => e.campaign).filter(Boolean))] as string[],
      marketKeys: [...new Set(ordered.map((e) => e.marketKey).filter(Boolean))] as string[],
      revenueMinor: ordered.filter((e) => e.stage === 'invoice' || e.stage === 'repeat_purchase').reduce((s, e) => s + (e.amountMinor ?? 0), 0),
      paidMinor: ordered.filter((e) => e.stage === 'payment').reduce((s, e) => s + (e.amountMinor ?? 0), 0),
      stages: [...new Set(ordered.map((e) => e.stage))],
    }
  })
}

export function summarizeAttribution(paths: AttributionPath[], dimension: 'channel' | 'campaign' | 'market' = 'channel'): AttributionSummary[] {
  const groups = new Map<string, AttributionPath[]>()
  for (const path of paths) {
    const keys = dimension === 'channel' ? path.channels : dimension === 'campaign' ? path.campaigns : path.marketKeys
    for (const key of keys.length ? keys : ['unknown']) {
      const list = groups.get(key) ?? []
      list.push(path)
      groups.set(key, list)
    }
  }
  return [...groups.entries()].map(([key, items]) => {
    const wonCustomers = items.filter((item) => item.stages.includes('won')).length
    const revenueMinor = items.reduce((s, i) => s + i.revenueMinor, 0)
    const paidMinor = items.reduce((s, i) => s + i.paidMinor, 0)
    return {
      key,
      customers: items.length,
      wonCustomers,
      revenueMinor,
      paidMinor,
      conversionRate: items.length ? wonCustomers / items.length : 0,
      revenuePerWonCustomerMinor: wonCustomers ? revenueMinor / wonCustomers : 0,
      attributedRoas: paidMinor > 0 ? revenueMinor / paidMinor : undefined,
    }
  }).sort((a, b) => b.revenueMinor - a.revenueMinor)
}
