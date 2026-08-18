import { createMetricAdapterSignal, type IntelligenceAdapter, type IntelligenceMetric } from './intelligenceAdapters'
import type { IntelligenceContext, IntelligenceSignal } from './intelligenceCore'
import { buildSalesPipelineInsights, type SalesPipelineEvent } from './salesPipelineIntelligence'

export const salesIntelligenceAdapter: IntelligenceAdapter = {
  name: 'sales-pipeline',
  domain: 'sales',
  toSignals(metrics: IntelligenceMetric[], context: IntelligenceContext): IntelligenceSignal[] {
    return metrics.map((metric) => createMetricAdapterSignal(metric, context, {
      kind: metric.metric.toLowerCase().includes('risk') ? 'risk' : 'observation',
      title: `${metric.metric} sales signal`,
      summary: `${metric.metric} is ${metric.value}${metric.unit ? ` ${metric.unit}` : ''}.`,
      tags: ['sales', 'pipeline'],
    }))
  },
}

export function salesPipelineToSignals(events: SalesPipelineEvent[], context: IntelligenceContext): IntelligenceSignal[] {
  return buildSalesPipelineInsights(events).map((insight) => {
    const pipelineCoverage = insight.pipelineMinor > 0 ? insight.weightedPipelineMinor / insight.pipelineMinor : 0
    const forecastRisk = pipelineCoverage < 0.25 || insight.winRate < 0.2
    const bottleneck = insight.bottleneckStage ? ` Bottleneck: ${insight.bottleneckStage}.` : ''
    return createMetricAdapterSignal({ source: 'sales-pipeline', metric: 'weightedPipeline', value: insight.weightedPipelineMinor, observedAt: new Date().toISOString() }, context, {
      kind: forecastRisk ? 'risk' : 'prediction',
      severity: forecastRisk ? 'high' : 'info',
      title: forecastRisk ? 'Sales forecast is at risk' : 'Sales pipeline supports forecast',
      summary: `Weighted pipeline is ${(pipelineCoverage * 100).toFixed(0)}% of active pipeline with ${(insight.winRate * 100).toFixed(0)}% historical win rate.${bottleneck}`,
      financialImpactMinor: insight.weightedPipelineMinor,
      recommendedAction: forecastRisk ? 'inspect_pipeline_bottleneck' : 'maintain_pipeline_velocity',
      expectedOutcome: forecastRisk ? 'Recover stalled opportunities and improve forecast reliability.' : 'Protect conversion and pipeline velocity to preserve expected revenue.',
      tags: ['sales', 'forecast', insight.bottleneckStage ?? 'no-bottleneck'],
    })
  })
}
