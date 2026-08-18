import type { NotificationPriority } from './businessNotifications'

export type NotificationStatus = 'unread' | 'acknowledged' | 'actioned' | 'resolved' | 'dismissed'

export type NotificationRecord = {
  id: string
  recipientId: string
  organizationId: string
  subsidiaryId: string
  priority: NotificationPriority
  status: NotificationStatus
  createdAt: string
  acknowledgedAt?: string
  actionedAt?: string
  resolvedAt?: string
  escalatedAt?: string
  escalationLevel: number
  actionRequired?: boolean
}

const priorityRank: Record<NotificationPriority, number> = { low: 1, normal: 2, high: 3, critical: 4 }

const allowed: Record<NotificationStatus, NotificationStatus[]> = {
  unread: ['acknowledged', 'actioned', 'dismissed'],
  acknowledged: ['actioned', 'resolved', 'dismissed'],
  actioned: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
}

export function transitionNotification(record: NotificationRecord, next: NotificationStatus): NotificationRecord {
  if (!allowed[record.status].includes(next)) throw new Error(`Invalid notification transition: ${record.status} -> ${next}`)
  const now = new Date().toISOString()
  const updated = { ...record, status: next }
  if (next === 'acknowledged') updated.acknowledgedAt = now
  if (next === 'actioned') updated.actionedAt = now
  if (next === 'resolved') updated.resolvedAt = now
  return updated
}

export function shouldEscalate(record: NotificationRecord, now = Date.now(), acknowledgementWindowMinutes = 60) {
  if (!record.actionRequired || record.status !== 'unread') return false
  const ageMinutes = (now - Date.parse(record.createdAt)) / 60000
  const requiredMinutes = priorityRank[record.priority] >= 4 ? acknowledgementWindowMinutes / 4 : record.priority === 'high' ? acknowledgementWindowMinutes : acknowledgementWindowMinutes * 2
  return ageMinutes >= requiredMinutes
}

export function escalateNotification(record: NotificationRecord): NotificationRecord {
  if (!shouldEscalate(record)) return record
  return { ...record, escalationLevel: record.escalationLevel + 1, escalatedAt: new Date().toISOString() }
}
