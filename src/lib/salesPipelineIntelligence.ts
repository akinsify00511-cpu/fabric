export type SalesPipelineEvent = {
  opportunityId: string
  customerId?: string
  subsidiaryId: string
  stage: 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
  amountMinor?: number
  occurredAt: string
  ownerId?: string
  marketKey?: string
  channel?: string
}

export type SalesPipelineInsight = {
  subsidiaryId: string
  pipelineMinor: number
  weightedPipelineMinor: number
  wonMinor: number
  lostMinor: number
  winRate: number
  averageCycleDays?: number
  bottleneckStage?: SalesPipelineEvent['stage']
}

const probability: Record<SalesPipelineEvent['stage'], number> = { lead: 0.1, qualified: 0.25, proposal: 0.5, negotiation: 0.7, won: 1, lost: 0 }

export function buildSalesPipelineInsights(events: SalesPipelineEvent[]): SalesPipelineInsight[] {
  const bySubsidiary = new Map<string, SalesPipelineEvent[]>()
  for (const event of events) {
    const list = bySubsidiary.get(event.subsidiaryId) ?? []
    list.push(event)
    bySubsidiary.set(event.subsidiaryId, list)
  }
  return [...bySubsidiary.entries()].map(([subsidiaryId, items]) => {
    const latest = new Map<string, SalesPipelineEvent>()
    for (const item of [...items].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))) latest.set(item.opportunityId, item)
    const active = [...latest.values()].filter((item) => item.stage !== 'won' && item.stage !== 'lost')
    const pipelineMinor = active.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0)
    const weightedPipelineMinor = active.reduce((sum, item) => sum + (item.amountMinor ?? 0) * probability[item.stage], 0)
    const wonMinor = items.filter((item) => item.stage === 'won').reduce((sum, item) => sum + (item.amountMinor ?? 0), 0)
    const lostMinor = items.filter((item) => item.stage === 'lost').reduce((sum, item) => sum + (item.amountMinor ?? 0), 0)
    const won = new Set(items.filter((item) => item.stage === 'won').map((item) => item.opportunityId)).size
    const closed = new Set(items.filter((item) => item.stage === 'won' || item.stage === 'lost').map((item) => item.opportunityId)).size
    const stageCounts = new Map<string, number>()
    for (const item of active) stageCounts.set(item.stage, (stageCounts.get(item.stage) ?? 0) + 1)
    const bottleneckStage = [...stageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as SalesPipelineEvent['stage'] | undefined
    const durations = new Map<string, { first: number; last: number }>()
    for (const item of items) {
      const time = Date.parse(item.occurredAt)
      const current = durations.get(item.opportunityId)
      durations.set(item.opportunityId, current ? { first: Math.min(current.first, time), last: Math.max(current.last, time) } : { first: time, last: time })
    }
    const cycleValues = [...durations.values()].filter((d) => d.last > d.first).map((d) => (d.last - d.first) / 86400000)
    return { subsidiaryId, pipelineMinor, weightedPipelineMinor, wonMinor, lostMinor, winRate: closed ? won / closed : 0, averageCycleDays: cycleValues.length ? cycleValues.reduce((a, b) => a + b, 0) / cycleValues.length : undefined, bottleneckStage }
  })
}
