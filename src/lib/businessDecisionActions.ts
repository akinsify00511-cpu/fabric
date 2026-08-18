export type DecisionStatus = 'proposed' | 'approved' | 'in_progress' | 'completed' | 'rejected' | 'cancelled'

export type BusinessDecisionAction = {
  id: string
  organizationId: string
  subsidiaryId: string
  recommendationId: string
  title: string
  rationale: string
  status: DecisionStatus
  ownerId?: string
  dueAt?: string
  approvedAt?: string
  completedAt?: string
  outcome?: string
  outcomeValue?: number
}

export function approveDecision(action: BusinessDecisionAction, ownerId: string) {
  if (action.status !== 'proposed') throw new Error('Only proposed decisions can be approved')
  return { ...action, status: 'approved' as const, ownerId, approvedAt: new Date().toISOString() }
}

export function startDecision(action: BusinessDecisionAction) {
  if (action.status !== 'approved') throw new Error('Only approved decisions can be started')
  return { ...action, status: 'in_progress' as const }
}

export function completeDecision(action: BusinessDecisionAction, outcome: string, outcomeValue?: number) {
  if (action.status !== 'in_progress') throw new Error('Only in-progress decisions can be completed')
  return { ...action, status: 'completed' as const, outcome, outcomeValue, completedAt: new Date().toISOString() }
}

export function decisionRequiresFollowUp(action: BusinessDecisionAction) {
  return action.status === 'approved' || action.status === 'in_progress'
}
