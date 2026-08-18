import type { MarketSignal } from './marketIntelligence'

export type LocationRecord = {
  subsidiaryId: string
  country?: string | null
  region?: string | null
  city?: string | null
  area?: string | null
  leadValue?: number | null
  opportunityValue?: number | null
  status?: string | null
}

function locationName(record: LocationRecord) {
  return record.area || record.city || record.region || record.country || 'Unknown market'
}

export function aggregateLocationRecords(records: LocationRecord[], periodStart: string, periodEnd: string): MarketSignal[] {
  const groups = new Map<string, MarketSignal>()

  for (const record of records) {
    const location = locationName(record)
    const key = `${record.subsidiaryId}:${location}`
    const current = groups.get(key) ?? {
      id: key,
      organizationId: '',
      subsidiaryId: record.subsidiaryId,
      location,
      granularity: record.area ? 'area' : record.city ? 'city' : record.region ? 'region' : 'country',
      leads: 0,
      opportunities: 0,
      wonDeals: 0,
      revenue: 0,
      averageDealValue: 0,
      conversionRate: 0,
      periodStart,
      periodEnd,
    }

    current.leads += 1
    if ((record.opportunityValue ?? 0) > 0) current.opportunities += 1
    if ((record.status ?? '').toLowerCase() === 'won') {
      current.wonDeals += 1
      current.revenue += record.opportunityValue ?? record.leadValue ?? 0
    }

    groups.set(key, current)
  }

  return [...groups.values()].map((signal) => ({
    ...signal,
    averageDealValue: signal.wonDeals ? signal.revenue / signal.wonDeals : 0,
    conversionRate: signal.leads ? signal.wonDeals / signal.leads : 0,
  }))
}
