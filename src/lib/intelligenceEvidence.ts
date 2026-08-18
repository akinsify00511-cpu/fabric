import type { IntelligenceSignal } from './intelligenceCore'

export type IntelligenceEvidence = {
  id: string
  signalId: string
  sourceType: 'database' | 'crm' | 'marketing' | 'finance' | 'analytics' | 'manual' | 'system'
  sourceRef: string
  metric?: string
  observedValue?: number
  baselineValue?: number
  unit?: string
  observedAt: string
  reliability: number
  provenance: string
  metadata?: Record<string, unknown>
}

export type EvidenceAssessment = {
  signalId: string
  evidenceCount: number
  reliabilityScore: number
  corroborationScore: number
  traceable: boolean
  confidenceAdjustment: number
  summary: string
}

export function assessSignalEvidence(signal: IntelligenceSignal, evidence: IntelligenceEvidence[]): EvidenceAssessment {
  const related = evidence.filter((item) => item.signalId === signal.id)
  const reliabilityScore = related.length ? related.reduce((sum, item) => sum + Math.max(0, Math.min(1, item.reliability)), 0) / related.length : 0
  const sourceTypes = new Set(related.map((item) => item.sourceType))
  const corroborationScore = Math.min(1, sourceTypes.size / 3)
  const confidenceAdjustment = related.length === 0 ? -0.25 : Math.min(0.15, reliabilityScore * 0.1 + corroborationScore * 0.05)
  return {
    signalId: signal.id,
    evidenceCount: related.length,
    reliabilityScore,
    corroborationScore,
    traceable: related.every((item) => Boolean(item.sourceRef && item.observedAt && item.provenance)),
    confidenceAdjustment,
    summary: related.length === 0 ? 'No supporting evidence has been attached; treat this signal as low-confidence.' : `${related.length} evidence item(s) from ${sourceTypes.size} source type(s) support this signal.`,
  }
}
