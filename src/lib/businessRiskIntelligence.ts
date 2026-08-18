export type RiskSignal = {
  key: string
  label: string
  direction: 'positive' | 'negative'
  severity: 'watch' | 'high' | 'critical'
  evidence: number
}

export type CompoundBusinessRisk = {
  riskKey: string
  severity: 'watch' | 'high' | 'critical'
  score: number
  signals: RiskSignal[]
  explanation: string
  recommendedResponse: string
}

const severityWeight = { watch: 1, high: 2, critical: 3 } as const

export function detectCompoundRisks(signals: RiskSignal[]): CompoundBusinessRisk[] {
  const risks: CompoundBusinessRisk[] = []
  const has = (key: string) => signals.find((signal) => signal.key === key)

  const commercialSignals = [has('revenue_decline'), has('pipeline_decline'), has('cac_increase')].filter(Boolean) as RiskSignal[]
  if (commercialSignals.length >= 2) {
    const score = commercialSignals.reduce((sum, signal) => sum + severityWeight[signal.severity] * Math.max(signal.evidence, 1), 0)
    risks.push({
      riskKey: 'commercial_pressure',
      severity: score >= 8 ? 'critical' : score >= 5 ? 'high' : 'watch',
      score,
      signals: commercialSignals,
      explanation: 'Multiple commercial indicators are deteriorating together.',
      recommendedResponse: 'Review acquisition efficiency, pipeline quality, pricing and market allocation before increasing spend.',
    })
  }

  const operatingSignals = [has('gross_margin_decline'), has('retention_decline'), has('operational_delay')].filter(Boolean) as RiskSignal[]
  if (operatingSignals.length >= 2) {
    const score = operatingSignals.reduce((sum, signal) => sum + severityWeight[signal.severity] * Math.max(signal.evidence, 1), 0)
    risks.push({
      riskKey: 'operational_health',
      severity: score >= 8 ? 'critical' : score >= 5 ? 'high' : 'watch',
      score,
      signals: operatingSignals,
      explanation: 'Customer, margin or operational signals indicate broader execution pressure.',
      recommendedResponse: 'Investigate root causes and protect customer experience and margin before scaling activity.',
    })
  }

  return risks.sort((a, b) => b.score - a.score)
}
