import { IntelligenceContext, IntelligenceSignal, IntelligenceSnapshot, rankIntelligenceSignals } from './intelligenceCore'

export type IntelligenceSource = { name: string; signals: IntelligenceSignal[] }
export type CrossBusinessImpact = { signalId: string; affectedSubsidiaryIds: string[]; affectedMarkets: string[]; affectedKinds: string[]; impactScore: number }
export type ExecutiveIntelligenceSnapshot = IntelligenceSnapshot & { crossBusinessImpacts: CrossBusinessImpact[]; criticalCount: number; highPriorityCount: number }

const dedupe = (signals: IntelligenceSignal[]) => {
  const seen = new Set<string>()
  return signals.filter((signal) => {
    const key = [signal.context.businessId, signal.context.subsidiaryId ?? '', signal.context.marketKey ?? '', signal.kind, signal.title].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function aggregateIntelligence(sources: IntelligenceSource[], context: IntelligenceContext): ExecutiveIntelligenceSnapshot {
  const signals = dedupe(sources.flatMap((source) => source.signals).filter((signal) => signal.context.businessId === context.businessId))
  const ranked = rankIntelligenceSignals(signals)
  const impacts = ranked.map((signal) => {
    const related = ranked.filter((candidate) => candidate !== signal && (candidate.context.subsidiaryId === signal.context.subsidiaryId || candidate.context.marketKey === signal.context.marketKey || candidate.kind === signal.kind))
    const subsidiaries = [...new Set([signal.context.subsidiaryId, ...related.map((item) => item.context.subsidiaryId)].filter(Boolean) as string[])]
    const markets = [...new Set([signal.context.marketKey, ...related.map((item) => item.context.marketKey)].filter(Boolean) as string[])]
    const kinds = [...new Set([signal.kind, ...related.map((item) => item.kind)])]
    return { signalId: signal.id, affectedSubsidiaryIds: subsidiaries, affectedMarkets: markets, affectedKinds: kinds, impactScore: Math.min(1, (subsidiaries.length > 1 ? 0.4 : 0) + (markets.length > 1 ? 0.3 : 0) + (kinds.length > 1 ? 0.3 : 0)) }
  })
  return { generatedAt: new Date().toISOString(), context, signals: ranked, crossBusinessImpacts: impacts, criticalCount: ranked.filter((s) => s.severity === 'critical').length, highPriorityCount: ranked.filter((s) => s.severity === 'high' || s.severity === 'critical').length }
}
