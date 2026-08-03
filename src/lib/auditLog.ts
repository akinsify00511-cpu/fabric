/**
 * AVENIZE AUDIT LOGGING SYSTEM
 * Track all user actions for compliance and security
 */

import { supabase } from './supabase'

export type AuditAction = 
  | 'create' | 'read' | 'update' | 'delete'
  | 'login' | 'logout' | 'failed_login'
  | 'invite_sent' | 'invite_accepted' | 'invite_revoked'
  | 'password_change' | 'password_reset' | '2fa_enabled' | '2fa_disabled'
  | 'settings_change' | 'role_change' | 'permission_change'
  | 'export' | 'import' | 'approve' | 'reject'
  | 'email_sent' | 'sms_sent' | 'notification_sent'
  | 'api_call' | 'webhook_triggered'

export type AuditEntity =
  | 'user' | 'staff' | 'business' | 'client' | 'lead' | 'deal'
  | 'invoice' | 'expense' | 'inventory' | 'task' | 'project'
  | 'meeting' | 'document' | 'leave' | 'payroll'
  | 'purchase_order' | 'approval' | 'report' | 'settings'
  | 'auth' | 'billing' | 'integration'

export interface AuditLogEntry {
  id?: string
  business_id: string
  user_id: string
  user_email?: string
  user_role?: string
  action: AuditAction
  entity_type: AuditEntity
  entity_id?: string
  entity_name?: string
  ip_address?: string
  user_agent?: string
  metadata?: Record<string, any>
  old_values?: Record<string, any>
  new_values?: Record<string, any>
  created_at?: string
}

// NDPR Compliance: Data that can be exported for data subject requests
export interface DataExportRequest {
  id: string
  user_id: string
  business_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  requested_at: string
  completed_at?: string
  download_url?: string
  expires_at?: string
}

// Log an audit entry
export async function logAuditEvent(entry: Omit<AuditLogEntry, 'id' | 'created_at'>): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      business_id: entry.business_id,
      user_id: entry.user_id,
      user_email: entry.user_email,
      user_role: entry.user_role,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      entity_name: entry.entity_name,
      ip_address: entry.ip_address,
      user_agent: entry.user_agent,
      metadata: entry.metadata,
      old_values: entry.old_values,
      new_values: entry.new_values,
    })
  } catch (error) {
    console.error('Failed to log audit event:', error)
  }
}

// Get audit logs for a business
export async function getAuditLogs(
  businessId: string,
  options: {
    userId?: string
    action?: AuditAction
    entityType?: AuditEntity
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  } = {}
) {
  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })

  if (options.userId) query = query.eq('user_id', options.userId)
  if (options.action) query = query.eq('action', options.action)
  if (options.entityType) query = query.eq('entity_type', options.entityType)
  if (options.startDate) query = query.gte('created_at', options.startDate)
  if (options.endDate) query = query.lte('created_at', options.endDate)
  if (options.limit) query = query.limit(options.limit)
  if (options.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1)

  const { data, error, count } = await query

  if (error) throw error
  return { logs: data, total: count || 0 }
}

// Get audit trail for a specific entity
export async function getEntityAuditTrail(entityType: AuditEntity, entityId: string) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

// Security event logging
export async function logSecurityEvent(
  businessId: string,
  userId: string,
  event: 'failed_login' | 'suspicious_activity' | 'permission_denied' | 'data_breach_attempt',
  metadata?: Record<string, any>
) {
  await logAuditEvent({
    business_id: businessId,
    user_id: userId,
    action: event === 'failed_login' ? 'failed_login' : 'api_call',
    entity_type: 'auth',
    metadata: { security_event: event, ...metadata },
  })
}

// Export audit logs (for compliance)
export async function exportAuditLogs(businessId: string, startDate: string, endDate: string) {
  const { logs } = await getAuditLogs(businessId, { startDate, endDate, limit: 10000 })
  return logs
}

// Data retention: Get logs older than retention period
export async function getLogsForDeletion(retentionDays: number = 365) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
  
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id')
    .lt('created_at', cutoffDate.toISOString())
    .limit(1000)

  if (error) throw error
  return data
}

// Delete old logs (compliance)
export async function deleteOldAuditLogs(retentionDays: number = 365) {
  const logsToDelete = await getLogsForDeletion(retentionDays)
  if (logsToDelete.length === 0) return 0

  const { error } = await supabase
    .from('audit_logs')
    .delete()
    .in('id', logsToDelete.map(l => l.id))

  if (error) throw error
  return logsToDelete.length
}

// Action labels for UI display
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Created',
  read: 'Viewed',
  update: 'Updated',
  delete: 'Deleted',
  login: 'Logged in',
  logout: 'Logged out',
  failed_login: 'Failed login attempt',
  invite_sent: 'Invitation sent',
  invite_accepted: 'Invitation accepted',
  invite_revoked: 'Invitation revoked',
  password_change: 'Password changed',
  password_reset: 'Password reset requested',
  '2fa_enabled': '2FA enabled',
  '2fa_disabled': '2FA disabled',
  settings_change: 'Settings changed',
  role_change: 'Role changed',
  permission_change: 'Permission changed',
  export: 'Data exported',
  import: 'Data imported',
  approve: 'Approved',
  reject: 'Rejected',
  email_sent: 'Email sent',
  sms_sent: 'SMS sent',
  notification_sent: 'Notification sent',
  api_call: 'API call made',
  webhook_triggered: 'Webhook triggered',
}

export const ENTITY_LABELS: Record<AuditEntity, string> = {
  user: 'User',
  staff: 'Staff Member',
  business: 'Business',
  client: 'Client',
  lead: 'Lead',
  deal: 'Deal',
  invoice: 'Invoice',
  expense: 'Expense',
  inventory: 'Inventory Item',
  task: 'Task',
  project: 'Project',
  meeting: 'Meeting',
  document: 'Document',
  leave: 'Leave Request',
  payroll: 'Payroll',
  purchase_order: 'Purchase Order',
  approval: 'Approval Request',
  report: 'Report',
  settings: 'Settings',
  auth: 'Authentication',
  billing: 'Billing',
  integration: 'Integration',
}

// Format audit log for display
export function formatAuditLogEntry(entry: AuditLogEntry): string {
  const action = AUDIT_ACTION_LABELS[entry.action] || entry.action
  const entity = ENTITY_LABELS[entry.entity_type] || entry.entity_type
  
  if (entry.entity_name) {
    return `${action} ${entity.toLowerCase()}: ${entry.entity_name}`
  }
  return `${action} ${entity.toLowerCase()}`
}
