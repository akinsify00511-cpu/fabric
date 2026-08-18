export type BusinessScope = {
  organizationId: string
  subsidiaryIds: string[]
}

export type BusinessEvent = {
  id: string
  organizationId: string
  subsidiaryId: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  summary: string
  occurredAt: string
  metadata?: Record<string, unknown>
}

export type BusinessInsight = {
  id: string
  subsidiaryId: string
  type: 'opportunity' | 'risk' | 'trend' | 'decision'
  title: string
  summary: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  sourceEventIds: string[]
  createdAt: string
}

export type DecisionAction = {
  id: string
  subsidiaryId: string
  title: string
  ownerId?: string
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed'
  dueAt?: string
  outcome?: string
}

/**
 * Pure grouping helpers for the owner/group intelligence layer.
 * Data access stays outside this module so every caller can enforce RLS.
 */
export function groupEventsBySubsidiary(events: BusinessEvent[]) {
  return events.reduce<Record<string, BusinessEvent[]>>((groups, event) => {
    ;(groups[event.subsidiaryId] ??= []).push(event)
    return groups
  }, {})
}

export function prioritizeInsights(insights: BusinessInsight[]) {
  const weight = { critical: 4, high: 3, medium: 2, low: 1 }
  return [...insights].sort((a, b) => weight[b.priority] - weight[a.priority])
}

export function pendingDecisionActions(actions: DecisionAction[]) {
  return actions.filter((action) => action.status === 'pending' || action.status === 'in_progress')
}
