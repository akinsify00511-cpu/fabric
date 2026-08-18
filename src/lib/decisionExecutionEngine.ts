export type DecisionAssignment = {
  role: string
  ownerId?: string
  action: string
  required?: boolean
}

export type DecisionExecution = {
  decisionId: string
  title: string
  subsidiaryIds: string[]
  status: 'proposed' | 'awaiting_approval' | 'approved' | 'executing' | 'blocked' | 'completed' | 'rejected'
  assignments: DecisionAssignment[]
  expectedImpactMinor?: number
  dueAt?: string
}

export function createDecisionExecution(input: Omit<DecisionExecution, 'status'> & { requiresApproval?: boolean }): DecisionExecution {
  return { ...input, status: input.requiresApproval ? 'awaiting_approval' : 'approved' }
}

export function advanceDecisionExecution(decision: DecisionExecution, next: DecisionExecution['status']): DecisionExecution {
  const allowed: Record<DecisionExecution['status'], DecisionExecution['status'][]> = {
    proposed: ['awaiting_approval', 'approved', 'rejected'], awaiting_approval: ['approved', 'rejected'], approved: ['executing', 'blocked'], executing: ['blocked', 'completed'], blocked: ['executing', 'rejected'], completed: [], rejected: [],
  }
  if (!allowed[decision.status].includes(next)) throw new Error(`Invalid decision transition: ${decision.status} -> ${next}`)
  return { ...decision, status: next }
}

export function requiredActionsComplete(decision: DecisionExecution, completedRoles: string[]): boolean {
  const done = new Set(completedRoles)
  return decision.assignments.filter((a) => a.required !== false).every((a) => done.has(a.role))
}
