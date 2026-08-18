export type DecisionCandidate = {
  decisionId: string
  subsidiaryId: string
  title: string
  financialImpactMinor: number
  urgency: number
  confidence: number
  crossBusinessImpact: number
  riskExposureMinor?: number
  deadlineAt?: string
  status?: 'open' | 'in_progress' | 'blocked'
}

export type PrioritizedDecision = DecisionCandidate & {
  priorityScore: number
  priority: 'critical' | 'high' | 'medium' | 'low'
  rationale: string[]
}

function priorityForScore(score: number): PrioritizedDecision['priority'] {
  if (score >= 75) return 'critical'
  if (score >= 55) return 'high'
  if (score >= 30) return 'medium'
  return 'low'
}

export function prioritizeDecisions(candidates: DecisionCandidate[], now = Date.now()): PrioritizedDecision[] {
  const maxImpact = Math.max(1, ...candidates.map((c) => Math.max(c.financialImpactMinor, c.riskExposureMinor ?? 0)))
  return candidates.map((candidate): PrioritizedDecision => {
    const impact = Math.max(candidate.financialImpactMinor, candidate.riskExposureMinor ?? 0) / maxImpact
    const deadlineUrgency = candidate.deadlineAt ? Math.max(0, Math.min(1, 1 - (Date.parse(candidate.deadlineAt) - now) / (7 * 86400000))) : 0.35
    const statusBoost = candidate.status === 'blocked' ? 0.15 : candidate.status === 'in_progress' ? 0.05 : 0
    const priorityScore = Math.min(100, 100 * (impact * 0.4 + candidate.urgency * 0.25 + candidate.confidence * 0.15 + candidate.crossBusinessImpact * 0.2 + deadlineUrgency * 0.15 + statusBoost))
    const priority = priorityForScore(priorityScore)
    const rationale: string[] = []
    if (impact >= 0.7) rationale.push('Large financial or risk exposure.')
    if (candidate.urgency >= 0.7) rationale.push('Time-sensitive business issue.')
    if (candidate.crossBusinessImpact >= 0.6) rationale.push('Can affect multiple businesses or functions.')
    if (candidate.status === 'blocked') rationale.push('Currently blocked and requires intervention.')
    return { ...candidate, priorityScore, priority, rationale }
  }).sort((a, b) => b.priorityScore - a.priorityScore)
}
