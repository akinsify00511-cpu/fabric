export type CohortEvent = {
  customerId: string
  subsidiaryId: string
  cohortKey: string
  periodKey: string
  revenueMinor: number
  grossProfitMinor?: number
  active?: boolean
}

export type CohortPeriod = {
  periodKey: string
  customers: number
  activeCustomers: number
  retentionRate: number
  revenueMinor: number
  grossProfitMinor: number
  revenueRetentionRate?: number
  grossProfitRetentionRate?: number
}

export type CohortRetentionProfile = {
  cohortKey: string
  subsidiaryId: string
  initialCustomers: number
  periods: CohortPeriod[]
  latestRetentionRate: number
  latestRevenueRetentionRate?: number
  latestGrossProfitRetentionRate?: number
  status: 'strong' | 'healthy' | 'watch' | 'weak' | 'insufficient_data'
}

export function buildCohortRetentionProfiles(events: CohortEvent[]): CohortRetentionProfile[] {
  const cohorts = new Map<string, CohortEvent[]>()
  for (const event of events) {
    const key = `${event.subsidiaryId}:${event.cohortKey}`
    const list = cohorts.get(key) ?? []
    list.push(event)
    cohorts.set(key, list)
  }

  return [...cohorts.values()].map((items) => {
    const first = items[0]
    const customerSet = new Set(items.map((item) => item.customerId))
    const initialPeriod = [...new Set(items.map((item) => item.periodKey))].sort()[0]
    const initialItems = items.filter((item) => item.periodKey === initialPeriod)
    const initialCustomers = new Set(initialItems.map((item) => item.customerId)).size || customerSet.size
    const initialRevenue = initialItems.reduce((sum, item) => sum + item.revenueMinor, 0)
    const initialGrossProfit = initialItems.reduce((sum, item) => sum + (item.grossProfitMinor ?? 0), 0)
    const periodKeys = [...new Set(items.map((item) => item.periodKey))].sort()
    const periods = periodKeys.map((periodKey) => {
      const periodItems = items.filter((item) => item.periodKey === periodKey)
      const activeCustomers = new Set(periodItems.filter((item) => item.active !== false).map((item) => item.customerId)).size
      const revenueMinor = periodItems.reduce((sum, item) => sum + item.revenueMinor, 0)
      const grossProfitMinor = periodItems.reduce((sum, item) => sum + (item.grossProfitMinor ?? 0), 0)
      return {
        periodKey,
        customers: new Set(periodItems.map((item) => item.customerId)).size,
        activeCustomers,
        retentionRate: initialCustomers ? activeCustomers / initialCustomers : 0,
        revenueMinor,
        grossProfitMinor,
        revenueRetentionRate: initialRevenue > 0 ? revenueMinor / initialRevenue : undefined,
        grossProfitRetentionRate: initialGrossProfit > 0 ? grossProfitMinor / initialGrossProfit : undefined,
      }
    })
    const latest = periods[periods.length - 1]
    const latestRetentionRate = latest?.retentionRate ?? 0
    const status = periods.length < 2 ? 'insufficient_data' : latestRetentionRate >= 0.8 ? 'strong' : latestRetentionRate >= 0.6 ? 'healthy' : latestRetentionRate >= 0.4 ? 'watch' : 'weak'
    return {
      cohortKey: first.cohortKey,
      subsidiaryId: first.subsidiaryId,
      initialCustomers,
      periods,
      latestRetentionRate,
      latestRevenueRetentionRate: latest?.revenueRetentionRate,
      latestGrossProfitRetentionRate: latest?.grossProfitRetentionRate,
      status,
    }
  })
}
