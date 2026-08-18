export type IntelligenceKind = 'observation' | 'diagnosis' | 'prediction' | 'opportunity' | 'risk' | 'recommendation' | 'decision' | 'action' | 'outcome' | 'learning'
export type IntelligenceSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type IntelligenceEvidence = { source: string; metric?: string; value?: number; unit?: string; observedAt?: string; explanation?: string }
export type IntelligenceContext = { businessId: string; subsidiaryId?: string; marketKey?: string; countryCode?: string; currency?: string; role?: string; timeWindow?: { from: string; to: string } }
export type IntelligenceSignal = {
  id: string
  kind: IntelligenceKind
  title: string
  summary: string
  context: IntelligenceContext
  severity: IntelligenceSeverity
  confidence: number
  financialImpactMinor?: number
  riskExposureMinor?: number
  urgency: number
  evidence: IntelligenceEvidence[]
  recommendedAction?: string
  expectedOutcome?: string
  tags?: string[]
  createdAt: string
}
export type IntelligenceSnapshot = { generatedAt: string; context: IntelligenceContext; signals: IntelligenceSignal[] }
export type IntelligenceEngine = { name: string; analyze: (signals: IntelligenceSignal[], context: IntelligenceContext) => IntelligenceSignal[] }

export function clamp01(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) }

export function createSignal(input: Omit<IntelligenceSignal, 'confidence' | 'urgency'> & { confidence?: number; urgency?: number }): IntelligenceSignal {
  return { ...input, confidence: clamp01(input.confidence ?? 0.5), urgency: clamp01(input.urgency ?? 0.5) }
}

export function rankIntelligenceSignals(signals: IntelligenceSignal[]): IntelligenceSignal[] {
  const maxImpact = Math.max(1, ...signals.map((s) => Math.max(s.financialImpactMinor ?? 0, s.riskExposureMinor ?? 0)))
  const weight: Record<IntelligenceSeverity, number> = { info: 0.1, low: 0.25, medium: 0.5, high: 0.75, critical: 1 }
  const score = (s: IntelligenceSignal) => weight[s.severity] * 0.25 + clamp01(s.urgency) * 0.25 + clamp01(s.confidence) * 0.15 + (Math.max(s.financialImpactMinor ?? 0, s.riskExposureMinor ?? 0) / maxImpact) * 0.25 + (s.context.subsidiaryId ? 0.1 : 0)
  return [...signals].sort((a, b) => score(b) - score(a))
}

export function runIntelligenceCore(signals: IntelligenceSignal[], context: IntelligenceContext, engines: IntelligenceEngine[] = []): IntelligenceSnapshot {
  let current = signals.filter((s) => s.context.businessId === context.businessId)
  for (const engine of engines) current = engine.analyze(current, context)
  return { generatedAt: new Date().toISOString(), context, signals: rankIntelligenceSignals(current) }
}
