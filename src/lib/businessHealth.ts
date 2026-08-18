export type BusinessHealthInputs = {
  revenueGrowth?: number
  grossMargin?: number
  marketingEfficiency?: number
  customerRetention?: number
  pipelineCoverage?: number
  operationalPerformance?: number
  unresolvedRiskCount: number
  overdueDecisionCount: number
}

export type BusinessHealth = {
  score: number
  status: 'strong' | 'watch' | 'attention' | 'critical'
  drivers: string[]
}

const clamp = (value: number) => Math.max(0, Math.min(100, value))

export function calculateBusinessHealth(input: BusinessHealthInputs): BusinessHealth {
  const components = [
    { name: 'Revenue growth', value: input.revenueGrowth === undefined ? 50 : clamp(50 + input.revenueGrowth * 100) },
    { name: 'Gross margin', value: input.grossMargin === undefined ? 50 : clamp(input.grossMargin * 100) },
    { name: 'Marketing efficiency', value: input.marketingEfficiency === undefined ? 50 : clamp(input.marketingEfficiency * 20) },
    { name: 'Customer retention', value: input.customerRetention === undefined ? 50 : clamp(input.customerRetention * 100) },
    { name: 'Pipeline coverage', value: input.pipelineCoverage === undefined ? 50 : clamp(input.pipelineCoverage * 50) },
    { name: 'Operational performance', value: input.operationalPerformance === undefined ? 50 : clamp(input.operationalPerformance * 100) },
  ]
  const base = components.reduce((sum, item) => sum + item.value, 0) / components.length
  const penalties = Math.min(30, input.unresolvedRiskCount * 5 + input.overdueDecisionCount * 3)
  const score = Math.round(clamp(base - penalties))
  const status = score >= 80 ? 'strong' : score >= 60 ? 'watch' : score >= 40 ? 'attention' : 'critical'
  const drivers = components.filter((item) => item.value < 50).map((item) => `${item.name} is below the healthy range`)
  if (input.unresolvedRiskCount > 0) drivers.push(`${input.unresolvedRiskCount} unresolved risk signal(s)`)
  if (input.overdueDecisionCount > 0) drivers.push(`${input.overdueDecisionCount} overdue decision(s)`)
  return { score, status, drivers }
}
