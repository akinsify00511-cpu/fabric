import { createSignal, rankIntelligenceSignals, type IntelligenceContext, type IntelligenceEngine, type IntelligenceSignal, type IntelligenceSnapshot } from './intelligenceCore'

export type IntelligenceQuery = { context: IntelligenceContext; signals: IntelligenceSignal[]; engines?: IntelligenceEngine[]; limit?: number; kinds?: IntelligenceSignal['kind'][]; severities?: IntelligenceSignal['severity'][] }
export type IntelligenceDecisionBrief = { generatedAt: string; context: IntelligenceContext; topSignals: IntelligenceSignal[]; counts: Record<IntelligenceSignal['severity'], number>; financialImpactMinor: number; riskExposureMinor: number; recommendedActions: string[] }

export function buildIntelligenceSnapshot(query: IntelligenceQuery): IntelligenceSnapshot {
  let signals = query.signals.filter((s) => s.context.businessId === query.context.businessId).filter((s) => !query.context.subsidiaryId || s.context.subsidiaryId === query.context.subsidiaryId).filter((s) => !query.context.marketKey || s.context.marketKey === query.context.marketKey).filter((s) => !query.kinds?.length || query.kinds.includes(s.kind)).filter((s) => !query.severities?.length || query.severities.includes(s.severity)).map((s) => createSignal(s))
  for (const engine of query.engines ?? []) signals = engine.analyze(signals, query.context)
  signals = rankIntelligenceSignals(signals)
  return { generatedAt: new Date().toISOString(), context: query.context, signals: typeof query.limit === 'number' ? signals.slice(0, Math.max(0, query.limit)) : signals }
}

export function buildDecisionBrief(snapshot: IntelligenceSnapshot): IntelligenceDecisionBrief {
  const counts: Record<IntelligenceSignal['severity'], number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 }
  let financialImpactMinor = 0
  let riskExposureMinor = 0
  const recommendedActions: string[] = []
  for (const signal of snapshot.signals) {
    counts[signal.severity] += 1
    financialImpactMinor += Math.max(0, signal.financialImpactMinor ?? 0)
    riskExposureMinor += Math.max(0, signal.riskExposureMinor ?? 0)
    if (signal.recommendedAction && !recommendedActions.includes(signal.recommendedAction)) recommendedActions.push(signal.recommendedAction)
  }
  return { generatedAt: snapshot.generatedAt, context: snapshot.context, topSignals: snapshot.signals.slice(0, 5), counts, financialImpactMinor, riskExposureMinor, recommendedActions: recommendedActions.slice(0, 10) }
}
