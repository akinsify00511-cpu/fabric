export type CustomerLocationObservation = {
  subsidiaryId: string
  customerId: string
  countryCode: string
  region?: string
  city?: string
  district?: string
  latitude?: number
  longitude?: number
  revenueMinor: number
  acquisitionSpendMinor?: number
  ltvMinor?: number
  converted: boolean
  observedAt: string
}

export type GeographicMarketInsight = {
  marketKey: string
  label: string
  subsidiaryId: string
  customers: number
  revenueMinor: number
  conversionRate: number
  revenuePerCustomerMinor: number
  averageLtvMinor: number
  estimatedCacMinor?: number
  roas?: number
  confidence: 'low' | 'medium' | 'high'
}

function keyOf(item: CustomerLocationObservation) {
  return [item.countryCode, item.region ?? '', item.city ?? '', item.district ?? ''].join('|')
}

function labelOf(item: CustomerLocationObservation) {
  return [item.district, item.city, item.region, item.countryCode].filter(Boolean).join(', ')
}

export function buildGeographicMarketInsights(observations: CustomerLocationObservation[]): GeographicMarketInsight[] {
  const groups = new Map<string, CustomerLocationObservation[]>()
  for (const observation of observations) {
    const key = `${observation.subsidiaryId}:${keyOf(observation)}`
    const group = groups.get(key) ?? []
    group.push(observation)
    groups.set(key, group)
  }

  return [...groups.entries()].map(([compoundKey, items]) => {
    const first = items[0]
    const customers = new Set(items.map((item) => item.customerId)).size
    const revenueMinor = items.reduce((sum, item) => sum + item.revenueMinor, 0)
    const conversions = items.filter((item) => item.converted).length
    const spend = items.reduce((sum, item) => sum + (item.acquisitionSpendMinor ?? 0), 0)
    const ltvValues = items.map((item) => item.ltvMinor).filter((value): value is number => typeof value === 'number')
    return {
      marketKey: compoundKey,
      label: labelOf(first),
      subsidiaryId: first.subsidiaryId,
      customers,
      revenueMinor,
      conversionRate: items.length ? conversions / items.length : 0,
      revenuePerCustomerMinor: customers ? revenueMinor / customers : 0,
      averageLtvMinor: ltvValues.length ? ltvValues.reduce((sum, value) => sum + value, 0) / ltvValues.length : 0,
      estimatedCacMinor: conversions ? spend / conversions : undefined,
      roas: spend ? revenueMinor / spend : undefined,
      confidence: customers >= 50 || items.length >= 100 ? 'high' : customers >= 15 || items.length >= 30 ? 'medium' : 'low',
    }
  }).sort((a, b) => b.revenueMinor - a.revenueMinor)
}
