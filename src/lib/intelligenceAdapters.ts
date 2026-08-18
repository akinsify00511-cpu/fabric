import { createSignal, type IntelligenceContext, type IntelligenceSignal } from './intelligenceCore'

export type IntelligenceMetric = {
  source: string
  metric: string
  value: number
  previousValue?: number
  unit?: string
  observedAt?: string
  reliability?: number
}

export type IntelligenceAdapter = {
  name: string
  domain: 'marketing' | 'sales' | 'finance' | 'customer' | 'market' | 'operations'
  toSignals: (metrics: IntelligenceMetric[], context: IntelligenceContext) => IntelligenceSignal[]
}

export function createMetricAdapterSignal(metric: IntelligenceMetric, context: IntelligenceContext, input: Partial<IntelligenceSignal>): IntelligenceSignal {
  const delta = metric.previousValue !== undefined ? metric.value - metric.previousValue : undefined
  const deltaPct = metric.previousValue !== undefined && metric.previousValue !== 0 ? delta! / Math.abs(metric.previousValue) : undefined
  const magnitude = Math.min(1, Math.abs(deltaPct ?? 0))
  return createSignal({
    id: `${metric.source}:${metric.metric}:${metric.observedAt ?? 'current'}`,
    kind: input.kind ?? 'observation',
    title: input.title ?? `${metric.metric} changed`,
    summary: input.summary ?? `${metric.metric} is ${metric.value}${metric.unit ? ` ${metric.unit}` : ''}.`,
    context,
    severity: input.severity ?? (magnitude >= 0.5 ? 'high' : magnitude >= 0.2 ? 'medium' : 'info'),
    financialImpactMinor: input.financialImpactMinor,
    riskExposureMinor: input.riskExposureMinor,
    evidence: [{ source: metric.source, metric: metric.metric, value: metric.value, unit: metric.unit, observedAt: metric.observedAt, explanation: input.summary }],
    recommendedAction: input.recommendedAction,
    expectedOutcome: input.expectedOutcome,
    tags: [...(input.tags ?? []), metric.metric, metric.source, context.marketKey ?? 'global'],
    createdAt: metric.observedAt ?? new Date().toISOString(),
  })
}

export function buildDomainSignals(adapters: IntelligenceAdapter[], metricsByDomain: Partial<Record<IntelligenceAdapter['domain'], IntelligenceMetric[]>>, context: IntelligenceContext): IntelligenceSignal[] {
  return adapters.flatMap((adapter) => adapter.toSignals(metricsByDomain[adapter.domain] ?? [], context))
}
