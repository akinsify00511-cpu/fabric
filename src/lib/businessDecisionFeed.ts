import type { BusinessEvent, BusinessInsight, DecisionAction } from './businessIntelligence'

export type OwnerDecisionItem = {
  subsidiaryId: string
  severity: BusinessEvent['severity']
  priority: BusinessInsight['priority']
  title: string
  summary: string
  action?: DecisionAction
  occurredAt: string
}

const severityWeight = { critical: 4, warning: 3, info: 1 }
const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 }

/** Build a deterministic owner-level decision feed from already-authorized data. */
export function buildOwnerDecisionFeed(
  events: BusinessEvent[],
  insights: BusinessInsight[],
  actions: DecisionAction[],
): OwnerDecisionItem[] {
  const insightsByEvent = new Map<string, BusinessInsight[]>()
  for (const insight of insights) {
    for (const eventId of insight.sourceEventIds) {
      const list = insightsByEvent.get(eventId) ?? []
      list.push(insight)
      insightsByEvent.set(eventId, list)
    }
  }

  const actionsBySubsidiary = new Map<string, DecisionAction[]>()
  for (const action of actions) {
    const list = actionsBySubsidiary.get(action.subsidiaryId) ?? []
    list.push(action)
    actionsBySubsidiary.set(action.subsidiaryId, list)
  }

  return events
    .flatMap((event) => {
      const relatedInsights = insightsByEvent.get(event.id) ?? []
      const bestInsight = [...relatedInsights].sort(
        (a, b) => priorityWeight[b.priority] - priorityWeight[a.priority],
      )[0]
      const action = actionsBySubsidiary.get(event.subsidiaryId)?.find((item) =>
        bestInsight ? item.title.toLowerCase().includes(bestInsight.title.toLowerCase()) : false,
      )

      return [{
        subsidiaryId: event.subsidiaryId,
        severity: event.severity,
        priority: bestInsight?.priority ?? (event.severity === 'critical' ? 'critical' : event.severity === 'warning' ? 'high' : 'low'),
        title: bestInsight?.title ?? event.title,
        summary: bestInsight?.summary ?? event.summary,
        action,
        occurredAt: event.occurredAt,
      }]
    })
    .sort((a, b) => {
      const priorityDiff = priorityWeight[b.priority] - priorityWeight[a.priority]
      if (priorityDiff !== 0) return priorityDiff
      return severityWeight[b.severity] - severityWeight[a.severity]
    })
}
