import { createMetricAdapterSignal, type IntelligenceAdapter, type IntelligenceMetric } from './intelligenceAdapters'
import type { IntelligenceContext, IntelligenceSignal } from './intelligenceCore'
import { assessFinancialHealth, type FinancialHealthSignal } from './financialHealthIntelligence'

export const financialIntelligenceAdapter: IntelligenceAdapter = {
  name: 'financial-health',
  domain: 'finance',
  toSignals(metrics: IntelligenceMetric[], context: IntelligenceContext): IntelligenceSignal[] {
    return metrics.map((metric) => createMetricAdapterSignal(metric, context, {
      kind: metric.metric.toLowerCase().includes('cash') ? 'risk' : 'observation',
      title: `${metric.metric} financial signal`,
      summary: `${metric.metric} is ${metric.value}${metric.unit ? ` ${metric.unit}` : ''}.`,
      tags: ['finance', 'liquidity'],
    }))
  },
}

export function financialHealthToSignal(input: FinancialHealthSignal, context: IntelligenceContext): IntelligenceSignal {
  const assessment = assessFinancialHealth(input)
  const severity = assessment.cashPressure === 'critical' ? 'critical' : assessment.cashPressure === 'high' ? 'high' : assessment.cashPressure === 'moderate' ? 'medium' : 'info'
  const kind = assessment.cashPressure === 'healthy' ? 'opportunity' : 'risk'
  return createMetricAdapterSignal({ source: 'financial-health', metric: 'liquidityCoverageMonths', value: assessment.liquidityCoverageMonths, unit: 'months' }, context, {
    kind,
    severity,
    title: `Financial health is ${assessment.cashPressure}`,
    summary: `Liquidity covers approximately ${assessment.liquidityCoverageMonths.toFixed(1)} months of projected net operating need.`,
    riskExposureMinor: Math.max(0, -assessment.netLiquidityMinor),
    financialImpactMinor: assessment.expansionCapacityMinor,
    recommendedAction: assessment.recommendation,
    expectedOutcome: assessment.cashPressure === 'healthy' ? 'Maintain liquidity while selectively funding high-return opportunities.' : 'Improve liquidity resilience before increasing discretionary commitments.',
    tags: ['cash', 'working-capital', assessment.cashPressure],
  })
}
