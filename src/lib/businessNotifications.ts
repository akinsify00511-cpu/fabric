import type { BusinessEvent } from './businessEventBus'

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low'

export type BusinessNotification = {
  id: string
  recipientId: string
  organizationId: string
  subsidiaryId: string
  priority: NotificationPriority
  title: string
  message: string
  eventId: string
  eventType: BusinessEvent['type']
  createdAt: string
  readAt?: string
  actionRequired?: boolean
}

export function notificationFromEvent(event: BusinessEvent, recipientId: string): BusinessNotification | null {
  const templates: Partial<Record<BusinessEvent['type'], { priority: NotificationPriority; title: string; actionRequired?: boolean }>> = {
    'kpi.deteriorated': { priority: 'high', title: 'KPI deterioration detected', actionRequired: true },
    'market.signal.detected': { priority: 'normal', title: 'New market intelligence detected' },
    'opportunity.discovered': { priority: 'high', title: 'Business opportunity discovered', actionRequired: true },
    'decision.approved': { priority: 'normal', title: 'Business decision approved' },
    'decision.completed': { priority: 'normal', title: 'Business decision completed' },
    'experiment.completed': { priority: 'normal', title: 'Business experiment completed' },
    'revenue.received': { priority: 'low', title: 'Revenue event recorded' },
  }
  const template = templates[event.type]
  if (!template) return null
  const payload = event.payload as Record<string, unknown>
  return {
    id: crypto.randomUUID(),
    recipientId,
    organizationId: event.organizationId,
    subsidiaryId: event.subsidiaryId,
    priority: template.priority,
    title: template.title,
    message: typeof payload.message === 'string' ? payload.message : `Fabric detected ${event.type}.`,
    eventId: event.id,
    eventType: event.type,
    createdAt: new Date().toISOString(),
    actionRequired: template.actionRequired,
  }
}
