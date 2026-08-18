export type CustomerValueObservation = {
  customerId: string
  subsidiaryId: string
  acquisitionChannel?: string
  marketKey?: string
  cohortKey?: string
  revenueMinor: number
  grossProfitMinor?: number
  acquisitionCostMinor?: number
  observedAt: string
}

export type CustomerValueProfile = {
  customerId: string
  subsidiaryId: string
  channel?: string
  marketKey?: string
  cohortKey?: string
  revenueMinor: number
  grossProfitMinor: number
  acquisitionCostMinor: number
  estimatedLtvMinor: number
  ltvToCac?: number
  contributionMargin?: number
}

export type CustomerValueSegment = {
  key: string
  customers: number
  revenueMinor: number
  grossProfitMinor: number
  acquisitionCostMinor: number
  averageLtvMinor: number
  averageCacMinor?: number
  ltvToCac?: number
  contributionMargin?: number
}

export function buildCustomerValueProfiles(observations: CustomerValueObservation[]): CustomerValueProfile[] {
  const grouped = new Map<string, CustomerValueObservation[]>()
  for (const item of observations) {
    const list = grouped.get(item.customerId) ?? []
    list.push(item)
    grouped.set(item.customerId, list)
  }
  return [...grouped.entries()].map(([customerId, items]) => {
    const first = [...items].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))[0]
    const revenueMinor = items.reduce((sum, item) => sum + item.revenueMinor, 0)
    const grossProfitMinor = items.reduce((sum, item) => sum + (item.grossProfitMinor ?? 0), 0)
    const acquisitionCostMinor = items.reduce((sum, item) => sum + (item.acquisitionCostMinor ?? 0), 0)
    return {
      customerId, subsidiaryId: first.subsidiaryId, channel: first.acquisitionChannel,
      marketKey: first.marketKey, cohortKey: first.cohortKey, revenueMinor,
      grossProfitMinor, acquisitionCostMinor, estimatedLtvMinor: grossProfitMinor || revenueMinor,
      ltvToCac: acquisitionCostMinor > 0 ? (grossProfitMinor || revenueMinor) / acquisitionCostMinor : undefined,
      contributionMargin: revenueMinor > 0 ? grossProfitMinor / revenueMinor : undefined,
    }
  })
}

export function segmentCustomerValue(profiles: CustomerValueProfile[], dimension: 'channel' | 'marketKey' | 'cohortKey' = 'channel'): CustomerValueSegment[] {
  const groups = new Map<string, CustomerValueProfile[]>()
  for (const profile of profiles) {
    const key = profile[dimension] ?? 'unknown'
    const list = groups.get(key) ?? []
    list.push(profile)
    groups.set(key, list)
  }
  return [...groups.entries()].map(([key, items]) => {
    const revenueMinor = items.reduce((sum, item) => sum + item.revenueMinor, 0)
    const grossProfitMinor = items.reduce((sum, item) => sum + item.grossProfitMinor, 0)
    const acquisitionCostMinor = items.reduce((sum, item) => sum + item.acquisitionCostMinor, 0)
    const averageLtvMinor = items.reduce((sum, item) => sum + item.estimatedLtvMinor, 0) / items.length
    const averageCacMinor = acquisitionCostMinor > 0 ? acquisitionCostMinor / items.length : undefined
    return { key, customers: items.length, revenueMinor, grossProfitMinor, acquisitionCostMinor, averageLtvMinor, averageCacMinor,
      ltvToCac: averageCacMinor && averageCacMinor > 0 ? averageLtvMinor / averageCacMinor : undefined,
      contributionMargin: revenueMinor > 0 ? grossProfitMinor / revenueMinor : undefined }
  }).sort((a, b) => b.averageLtvMinor - a.averageLtvMinor)
}
