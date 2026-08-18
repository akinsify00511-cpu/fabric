export type DecisionStatus = 'proposed' | 'approved' | 'rejected' | 'executing' | 'completed' | 'cancelled'

export type BusinessDecision = {
  id: string
  organizationId: string
  subsidiaryId: string
  title: string
  recommendation: string
  status: DecisionStatus
  expectedImpact?: { revenueMinor?: number; grossProfitMinor?: number; currency?: string }
  ownerId: string
  approvedAt?: string
  completedAt?: string
  actualImpact?: { revenueMinor?: number; grossProfitMinor?: number; currency?: string }
}

export type DecisionVariance = {
  decisionId: string
  revenueVarianceMinor?: number
  grossProfitVarianceMinor?: number
  currency?: string
}

export function transitionDecision(decision: BusinessDecision, nextStatus: DecisionStatus): BusinessDecision {
  const allowed: Record<DecisionStatus, DecisionStatus[]> = {
    proposed: ['approved', 'rejected', 'cancelled'],
    approved: ['executing', 'cancelled'],
    rejected: [],
    executing: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  }
  if (!allowed[decision.status].includes(nextStatus)) throw new Error(`Invalid decision transition: ${decision.status} -> ${nextStatus}`)
  const next = { ...decision, status: nextStatus }
  if (nextStatus === 'approved') next.approvedAt = new Date().toISOString()
  if (nextStatus === 'completed') next.completedAt = new Date().toISOString()
  return next
}

export function calculateDecisionVariance(decision: BusinessDecision): DecisionVariance {
  if (!decision.actualImpact || !decision.expectedImpact) return { decisionId: decision.id, currency: decision.actualImpact?.currency ?? decision.expectedImpact?.currency }
  return {
    decisionId: decision.id,
    currency: decision.actualImpact.currency ?? decision.expectedImpact.currency,
    revenueVarianceMinor: decision.actualImpact.revenueMinor !== undefined && decision.expectedImpact.revenueMinor !== undefined
      ? decision.actualImpact.revenueMinor - decision.expectedImpact.revenueMinor : undefined,
    grossProfitVarianceMinor: decision.actualImpact.grossProfitMinor !== undefined && decision.expectedImpact.grossProfitMinor !== undefined
      ? decision.actualImpact.grossProfitMinor - decision.expectedImpact.grossProfitMinor : undefined,
  }
}
