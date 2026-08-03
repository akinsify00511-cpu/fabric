/**
 * AVENIZE INTELLIGENT ALERT ENGINE
 * Data-driven alert system based on business logic, thresholds, and timing patterns.
 */

import { supabase } from './supabase'

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type AlertCategory = 'deadline' | 'inventory' | 'payment' | 'reporting' | 'performance' | 'compliance' | 'staff' | 'po' | 'meeting'

export interface Alert {
  id: string
  title: string
  description: string
  severity: AlertSeverity
  category: AlertCategory
  actionRequired: string
  actionUrl?: string
  createdAt: Date
  isRead: boolean
  metadata?: Record<string, any>
}

export interface PaymentDefaultSummary {
  clientId: string
  clientName: string
  industry?: string
  totalDefaults: number
  totalAmount: number
  oldestDefault: number
  category: 'critical' | 'serious' | 'warning'
}

export interface PODeliveryStatus {
  poId: string
  poNumber: string
  supplier: string
  expectedDate: Date
  daysOverdue: number
  severity: AlertSeverity
}

// Payment default categories by days
export const PAYMENT_CATEGORIES = {
  critical: { minDays: 60, label: 'Critical Default', color: 'red' },
  serious: { minDays: 30, label: 'Serious Default', color: 'orange' },
  warning: { minDays: 14, label: 'Warning', color: 'yellow' },
  watch: { minDays: 7, label: 'On Watch', color: 'blue' },
  ok: { minDays: 0, label: 'Current', color: 'green' }
}

function getPaymentCategory(daysOverdue: number): keyof typeof PAYMENT_CATEGORIES {
  if (daysOverdue >= 60) return 'critical'
  if (daysOverdue >= 30) return 'serious'
  if (daysOverdue >= 14) return 'warning'
  if (daysOverdue >= 7) return 'watch'
  return 'ok'
}

const THRESHOLDS = {
  paymentOverdueWarning: 7,
  paymentOverdueCritical: 14,
  paymentOverdueCritical2: 30,
  poOverdueDays: 7,
  poCriticalDays: 14,
  stockLowPercentage: 20,
  stockCriticalPercentage: 10,
  reorderLeadTimeDays: 3,
  reportStaleDays: 3,
  reportMissedDays: 7,
  taskOverdueDays: 1,
  taskCriticalDays: 3,
  leadStaleDays: 5,
  dealStaleDays: 10,
  cashBufferDays: 30,
  meetingReminderHours: 24,
  meetingStartBufferMinutes: 15
}

// ============================================
// PAYMENT DEFAULT TRACKING
// ============================================

export async function getPaymentDefaults(businessId: string): Promise<PaymentDefaultSummary[]> {
  const today = new Date()
  
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, clients(id, name, industry)')
    .eq('business_id', businessId)
    .in('status', ['sent', 'overdue'])

  if (!invoices) return []

  const defaultsByClient = new Map<string, PaymentDefaultSummary>()

  for (const invoice of invoices) {
    const dueDate = new Date(invoice.due_date)
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysOverdue > 0) {
      const clientId = invoice.client_id
      const existing = defaultsByClient.get(clientId)
      
      const category = getPaymentCategory(daysOverdue)
      
      if (existing) {
        existing.totalDefaults += 1
        existing.totalAmount += invoice.total || 0
        if (daysOverdue > existing.oldestDefault) {
          existing.oldestDefault = daysOverdue
        }
        if (category === 'critical') existing.category = 'critical'
        else if (category === 'serious' && existing.category !== 'critical') existing.category = 'serious'
      } else {
        defaultsByClient.set(clientId, {
          clientId,
          clientName: invoice.clients?.name || 'Unknown Client',
          industry: invoice.clients?.industry,
          totalDefaults: 1,
          totalAmount: invoice.total || 0,
          oldestDefault: daysOverdue,
          category: category as 'critical' | 'serious' | 'warning'
        })
      }
    }
  }

  return Array.from(defaultsByClient.values()).sort((a, b) => b.totalAmount - a.totalAmount)
}

export async function checkPurchaseOrderDeliveries(businessId: string): Promise<PODeliveryStatus[]> {
  const today = new Date()
  
  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('*, suppliers(name)')
    .eq('business_id', businessId)
    .in('status', ['approved', 'ordered', 'partial'])

  if (!pos) return []

  const overdue: PODeliveryStatus[] = []

  for (const po of pos) {
    const expectedDate = new Date(po.expected_delivery_date)
    const daysOverdue = Math.floor((today.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysOverdue > 0) {
      let severity: AlertSeverity = 'low'
      if (daysOverdue >= THRESHOLDS.poCriticalDays) severity = 'critical'
      else if (daysOverdue >= THRESHOLDS.poOverdueDays) severity = 'high'
      else severity = 'medium'

      overdue.push({
        poId: po.id,
        poNumber: po.po_number,
        supplier: po.suppliers?.name || 'Unknown',
        expectedDate: expectedDate,
        daysOverdue,
        severity
      })
    }
  }

  return overdue.sort((a, b) => b.daysOverdue - a.daysOverdue)
}

export async function checkUpcomingMeetings(businessId: string): Promise<Alert[]> {
  const alerts: Alert[] = []
  const now = new Date()
  const in24Hours = new Date(now.getTime() + (THRESHOLDS.meetingReminderHours * 60 * 60 * 1000))
  
  const { data: meetings } = await supabase
    .from('meetings')
    .select('*, staff(full_name)')
    .eq('business_id', businessId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', in24Hours.toISOString())

  if (meetings) {
    for (const meeting of meetings) {
      const scheduledAt = new Date(meeting.scheduled_at)
      alerts.push({
        id: `meeting-${meeting.id}`,
        title: `Meeting Reminder: ${meeting.title}`,
        description: `${meeting.type || 'General'} meeting in ${Math.round((scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60))} hours. ${meeting.agenda ? 'Agenda: ' + meeting.agenda.substring(0, 100) : ''}`,
        severity: 'info',
        category: 'meeting',
        actionRequired: `Join meeting: ${meeting.title}`,
        actionUrl: `/meetings/${meeting.id}`,
        createdAt: new Date(),
        isRead: false,
        metadata: { meetingId: meeting.id }
      })
    }
  }

  return alerts
}

// ============================================
// MAIN ALERT GENERATOR
// ============================================

export async function generateAlerts(businessId: string, userRole?: string): Promise<Alert[]> {
  const alerts: Alert[] = []
  const today = new Date()

  // Payment Alerts with categorization
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, clients(*, industry)')
    .eq('business_id', businessId)
    .in('status', ['sent', 'overdue'])

  if (invoices) {
    for (const invoice of invoices) {
      const dueDate = new Date(invoice.due_date)
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysOverdue > 0) {
        const category = getPaymentCategory(daysOverdue)
        let severity: AlertSeverity = 'low'
        
        if (category === 'critical') severity = 'critical'
        else if (category === 'serious') severity = 'high'
        else if (category === 'warning') severity = 'medium'

        alerts.push({
          id: `payment-${invoice.id}`,
          title: `[${PAYMENT_CATEGORIES[category].label}] ${invoice.invoice_number}`,
          description: `${invoice.clients?.name || 'Client'} - ${invoice.clients?.industry || 'N/A'} industry. N${invoice.total?.toLocaleString()} overdue by ${daysOverdue} days`,
          severity,
          category: 'payment',
          actionRequired: `Follow up with ${invoice.clients?.name}. ${category !== 'ok' ? `Escalate to ${category === 'critical' ? 'legal/recovery' : 'senior management'}` : ''}`,
          actionUrl: `/invoices/${invoice.id}`,
          createdAt: dueDate,
          isRead: false,
          metadata: { amount: invoice.total, daysOverdue, category, industry: invoice.clients?.industry }
        })
      }
    }
  }

  // PO Delivery Alerts
  const overduePOs = await checkPurchaseOrderDeliveries(businessId)
  for (const po of overduePOs) {
    alerts.push({
      id: `po-${po.poId}`,
      title: `PO Delivery Overdue: ${po.poNumber}`,
      description: `From ${po.supplier}. Expected ${new Date(po.expectedDate).toLocaleDateString()}. ${po.daysOverdue} days late.`,
      severity: po.severity,
      category: 'po',
      actionRequired: `Follow up with ${po.supplier} on delivery status.`,
      actionUrl: `/purchases/${po.poId}`,
      createdAt: po.expectedDate,
      isRead: false,
      metadata: { poId: po.poId, daysOverdue: po.daysOverdue }
    })
  }

  // Low Stock
  const { data: items } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('business_id', businessId)
    .eq('track_stock', true)

  if (items) {
    for (const item of items) {
      const currentStock = item.current_stock || 0
      const maxStock = item.max_stock || 100
      const reorderPoint = item.reorder_point || (maxStock * 0.2)
      
      if (currentStock <= reorderPoint) {
        let severity: AlertSeverity = 'medium'
        if (currentStock <= (maxStock * (THRESHOLDS.stockCriticalPercentage / 100))) severity = 'critical'
        else if (currentStock <= (maxStock * (THRESHOLDS.stockLowPercentage / 100))) severity = 'high'

        alerts.push({
          id: `stock-${item.id}`,
          title: `Low Stock: ${item.name}`,
          description: `Current: ${currentStock} ${item.unit || 'units'} (${Math.round((currentStock/maxStock)*100)}% of max). Below reorder point.`,
          severity,
          category: 'inventory',
          actionRequired: `Reorder ${item.name}. Suggested order: ${Math.ceil((maxStock - currentStock) * 1.5)} ${item.unit || 'units'}`,
          actionUrl: `/inventory/${item.id}`,
          createdAt: new Date(),
          isRead: false,
          metadata: { currentStock, maxStock, category: item.category }
        })
      }
    }
  }

  // Task Deadlines
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, staff(full_name)')
    .eq('business_id', businessId)
    .neq('status', 'completed')

  if (tasks) {
    for (const task of tasks) {
      const dueDate = new Date(task.due_date)
      const daysDiff = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysDiff < 0) {
        const daysOverdue = Math.abs(daysDiff)
        alerts.push({
          id: `task-${task.id}`,
          title: daysOverdue >= THRESHOLDS.taskCriticalDays ? `CRITICAL: Task Overdue` : `Task Overdue`,
          description: `"${task.title}" - ${task.staff?.full_name || 'Unassigned'} - ${daysOverdue} days overdue`,
          severity: daysOverdue >= THRESHOLDS.taskCriticalDays ? 'critical' : 'high',
          category: 'deadline',
          actionRequired: `Review and complete or reschedule: "${task.title}"`,
          actionUrl: `/tasks/${task.id}`,
          createdAt: dueDate,
          isRead: false,
          metadata: { taskId: task.id, daysOverdue, priority: task.priority }
        })
      } else if (daysDiff === 0) {
        alerts.push({
          id: `task-due-${task.id}`,
          title: `Due Today: ${task.title}`,
          description: `${task.staff?.full_name || 'Unassigned'}. Due by end of day.`,
          severity: 'medium',
          category: 'deadline',
          actionRequired: `Complete or update status for: "${task.title}"`,
          actionUrl: `/tasks/${task.id}`,
          createdAt: new Date(),
          isRead: false,
          metadata: { taskId: task.id }
        })
      }
    }
  }

  // Stale Leads
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('business_id', businessId)
    .eq('status', 'active')

  if (leads) {
    for (const lead of leads) {
      const lastActivity = new Date(lead.last_activity || lead.created_at)
      const daysSinceActivity = Math.floor((today.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysSinceActivity >= THRESHOLDS.leadStaleDays) {
        alerts.push({
          id: `lead-stale-${lead.id}`,
          title: `Stale Lead: ${lead.contact_name}`,
          description: `${lead.company_name || ''} - N${(lead.value || 0).toLocaleString()} value - ${daysSinceActivity} days inactive`,
          severity: daysSinceActivity >= THRESHOLDS.dealStaleDays ? 'high' : 'medium',
          category: 'performance',
          actionRequired: `Contact ${lead.contact_name} to reignite this lead.`,
          actionUrl: `/leads/${lead.id}`,
          createdAt: lastActivity,
          isRead: false,
          metadata: { leadId: lead.id, value: lead.value, source: lead.source }
        })
      }
    }
  }

  // Pending Leave
  const { data: leaveRequests } = await supabase
    .from('leave_requests')
    .select('*, staff(full_name)')
    .eq('business_id', businessId)
    .eq('status', 'pending')

  if (leaveRequests && leaveRequests.length > 0) {
    alerts.push({
      id: 'leave-pending',
      title: `${leaveRequests.length} Leave Request${leaveRequests.length > 1 ? 's' : ''} Pending`,
      description: `${leaveRequests.length} request${leaveRequests.length > 1 ? 's' : ''} awaiting your approval`,
      severity: 'medium',
      category: 'staff',
      actionRequired: 'Review and approve/deny pending leave requests.',
      actionUrl: '/people/leave',
      createdAt: new Date(),
      isRead: false,
      metadata: { count: leaveRequests.length }
    })
  }

  // Upcoming Meetings
  const meetingAlerts = await checkUpcomingMeetings(businessId)
  alerts.push(...meetingAlerts)

  // Sort by severity
  const severityOrder: Record<AlertSeverity, number> = {
    critical: 0, high: 1, medium: 2, low: 3, info: 4
  }

  return alerts.sort((a, b) => {
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity]
    }
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
}

export function getAlertSummary(alerts: Alert[]) {
  return {
    critical: alerts.filter(a => a.severity === 'critical').length,
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    low: alerts.filter(a => a.severity === 'low').length,
    info: alerts.filter(a => a.severity === 'info').length,
    total: alerts.length
  }
}

export function getSeverityColor(severity: AlertSeverity): string {
  const colors: Record<AlertSeverity, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-blue-500',
    info: 'bg-slate-500'
  }
  return colors[severity]
}

export function getSeverityTextColor(severity: AlertSeverity): string {
  const colors: Record<AlertSeverity, string> = {
    critical: 'text-red-600 bg-red-50',
    high: 'text-orange-600 bg-orange-50',
    medium: 'text-yellow-600 bg-yellow-50',
    low: 'text-blue-600 bg-blue-50',
    info: 'text-slate-600 bg-slate-50'
  }
  return colors[severity]
}
