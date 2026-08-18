import type { BusinessEvent } from './businessEventBus'
import type { NotificationPriority } from './businessNotifications'

export type BusinessRole = 'owner' | 'subsidiary_admin' | 'sales_manager' | 'marketing_manager' | 'finance_manager' | 'analyst'

export type NotificationRecipient = {
  userId: string
  organizationId: string
  subsidiaryIds: string[]
  roles: BusinessRole[]
  enabledTypes?: BusinessEvent['type'][]
  minimumPriority?: NotificationPriority
}

const priorityRank: Record<NotificationPriority, number> = { low: 1, normal: 2, high: 3, critical: 4 }

const roleRouting: Partial<Record<BusinessEvent['type'], BusinessRole[]>> = {
  'kpi.deteriorated': ['owner', 'subsidiary_admin', 'analyst'],
  'market.signal.detected': ['owner', 'sales_manager', 'marketing_manager', 'analyst'],
  'opportunity.discovered': ['owner', 'subsidiary_admin', 'sales_manager', 'marketing_manager'],
  'decision.approved': ['owner', 'subsidiary_admin'],
  'decision.completed': ['owner', 'subsidiary_admin', 'analyst'],
  'experiment.completed': ['owner', 'subsidiary_admin', 'marketing_manager', 'analyst'],
  'revenue.received': ['owner', 'finance_manager'],
}

export function routeBusinessEvent(event: BusinessEvent, recipients: NotificationRecipient[], priority: NotificationPriority = 'normal') {
  const roles = roleRouting[event.type] ?? ['owner', 'subsidiary_admin']
  return recipients.filter((recipient) => {
    const hasOrgAccess = recipient.organizationId === event.organizationId
    const hasSubsidiaryAccess = recipient.roles.includes('owner') || recipient.subsidiaryIds.includes(event.subsidiaryId)
    const hasRole = recipient.roles.some((role) => roles.includes(role))
    const typeEnabled = !recipient.enabledTypes || recipient.enabledTypes.includes(event.type)
    const minPriority = recipient.minimumPriority ?? 'low'
    return hasOrgAccess && hasSubsidiaryAccess && hasRole && typeEnabled && priorityRank[priority] >= priorityRank[minPriority]
  })
}
