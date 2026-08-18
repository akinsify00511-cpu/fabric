export type BusinessLearningSignal = {
  subsidiaryId: string
  patternKey: string
  metric: string
  value: number
  unit: string
  evidenceCount: number
  observedAt: string
}

export type TransferCandidate = {
  sourceSubsidiaryId: string
  targetSubsidiaryId: string
  patternKey: string
  metric: string
  sourceValue: number
  targetValue?: number
  evidenceCount: number
  recommendation: 'test' | 'watch'
}

export function findTransferCandidates(signals: BusinessLearningSignal[]): TransferCandidate[] {
  const candidates: TransferCandidate[] = []
  for (const source of signals) {
    for (const target of signals) {
      if (source.subsidiaryId === target.subsidiaryId || source.patternKey !== target.patternKey || source.metric !== target.metric) continue
      if (source.evidenceCount < 10 || source.value <= target.value) continue
      candidates.push({
        sourceSubsidiaryId: source.subsidiaryId,
        targetSubsidiaryId: target.subsidiaryId,
        patternKey: source.patternKey,
        metric: source.metric,
        sourceValue: source.value,
        targetValue: target.value,
        evidenceCount: source.evidenceCount,
        recommendation: source.evidenceCount >= 50 ? 'test' : 'watch',
      })
    }
  }
  return candidates
}
