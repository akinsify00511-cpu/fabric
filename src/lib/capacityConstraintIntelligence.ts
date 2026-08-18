export type CapacitySignal = {
  subsidiaryId: string
  resource: string
  capacity: number
  committed: number
  demand: number
  unit?: string
  marketKey?: string
}

export type CapacityConstraintInsight = {
  subsidiaryId: string
  resource: string
  utilizationRate: number
  demandCoverageRate: number
  constraint: 'critical' | 'tight' | 'balanced' | 'underutilized'
  recommendedAction: 'protect_capacity' | 'expand_capacity' | 'balance_demand' | 'increase_demand'
  headroom: number
}

export function evaluateCapacityConstraints(signals: CapacitySignal[]): CapacityConstraintInsight[] {
  return signals.map((signal) => {
    const utilizationRate = signal.capacity > 0 ? signal.committed / signal.capacity : 1
    const demandCoverageRate = signal.capacity > 0 ? signal.demand / signal.capacity : 1
    const headroom = signal.capacity - Math.max(signal.committed, signal.demand)
    const constraint = demandCoverageRate > 1.1 || utilizationRate > 0.95 ? 'critical' : demandCoverageRate > 0.85 || utilizationRate > 0.8 ? 'tight' : utilizationRate < 0.4 && demandCoverageRate < 0.5 ? 'underutilized' : 'balanced'
    const recommendedAction = constraint === 'critical' ? 'protect_capacity' : constraint === 'tight' ? 'expand_capacity' : constraint === 'underutilized' ? 'increase_demand' : 'balance_demand'
    return { subsidiaryId: signal.subsidiaryId, resource: signal.resource, utilizationRate, demandCoverageRate, constraint, recommendedAction, headroom }
  })
}
