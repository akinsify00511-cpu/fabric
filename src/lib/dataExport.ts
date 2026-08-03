/**
 * AVENIZE DATA EXPORT UTILITY
 * Export data to CSV/PDF formats
 */

import { supabase } from './supabase'
import { canExport } from './permissions'
import type { Role } from './permissions'

type ExportFormat = 'csv' | 'json'
type ExportEntity = 'invoices' | 'expenses' | 'clients' | 'leads' | 'tasks' | 'staff' | 'inventory' | 'reports'

interface ExportOptions {
  businessId: string
  userRole: Role
  entity: ExportEntity
  format: ExportFormat
  filters?: Record<string, any>
}

// Convert data to CSV format
function arrayToCSV(data: Record<string, any>[]): string {
  if (data.length === 0) return ''
  
  const headers = Object.keys(data[0])
  const csvRows = [headers.join(',')]
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header]
      // Escape quotes and wrap in quotes if contains comma or newline
      const stringValue = value !== null && value !== undefined ? String(value) : ''
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }
      return stringValue
    })
    csvRows.push(values.join(','))
  }
  
  return csvRows.join('\n')
}

// Download file helper
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Export data
export async function exportData(options: ExportOptions): Promise<void> {
  const { businessId, userRole, entity, format, filters } = options

  // Check permission
  if (!canExport(userRole, entity as any)) {
    throw new Error('You do not have permission to export this data')
  }

  let query = supabase.from(entity).select('*').eq('business_id', businessId)
  
  // Apply filters
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value)
      }
    })
  }

  const { data, error } = await query
  
  if (error) throw error
  if (!data) throw new Error('No data to export')

  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `${entity}_export_${timestamp}`

  if (format === 'csv') {
    const csv = arrayToCSV(data)
    downloadFile(csv, `${filename}.csv`, 'text/csv')
  } else {
    downloadFile(JSON.stringify(data, null, 2), `${filename}.json`, 'application/json')
  }
}

// Export single record with audit log
export async function exportSingleRecord(
  businessId: string,
  userId: string,
  userRole: Role,
  entity: ExportEntity,
  recordId: string
): Promise<any> {
  if (!canExport(userRole, entity as any)) {
    throw new Error('You do not have permission to export this data')
  }

  const { data, error } = await supabase
    .from(entity)
    .select('*')
    .eq('business_id', businessId)
    .eq('id', recordId)
    .single()

  if (error) throw error
  return data
}

// Generate export report (for NDPR compliance)
export async function generateDataExportReport(businessId: string, userId: string) {
  const entities: ExportEntity[] = ['invoices', 'expenses', 'clients', 'leads', 'tasks', 'staff', 'inventory']
  const report: Record<string, { count: number; lastExport?: string }> = {}

  for (const entity of entities) {
    const { count } = await supabase
      .from(entity)
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
    
    report[entity] = { count: count || 0 }
  }

  return report
}

// Format currency
function formatCurrency(amount: number, currency: string = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
  }).format(amount)
}

// Format date
function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ============================================
// REPORT GENERATORS
// ============================================

export interface InvoiceReportRow {
  invoice_number: string
  client: string
  amount: string
  status: string
  issue_date: string
  due_date: string
  days_overdue: number
}

export async function generateInvoiceReport(businessId: string, dateRange?: { start: string; end: string }) {
  let query = supabase
    .from('invoices')
    .select('*, clients(name)')
    .eq('business_id', businessId)

  if (dateRange) {
    query = query.gte('issue_date', dateRange.start).lte('issue_date', dateRange.end)
  }

  const { data, error } = await query
  if (error) throw error

  const today = new Date()
  
  return (data || []).map((inv: any): InvoiceReportRow => {
    const dueDate = new Date(inv.due_date)
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    
    return {
      invoice_number: inv.invoice_number,
      client: inv.clients?.name || 'Unknown',
      amount: formatCurrency(inv.total || 0),
      status: inv.status,
      issue_date: formatDate(inv.issue_date),
      due_date: formatDate(inv.due_date),
      days_overdue: daysOverdue > 0 ? daysOverdue : 0,
    }
  })
}

export interface ExpenseReportRow {
  date: string
  description: string
  category: string
  amount: string
  vendor: string
  status: string
}

export async function generateExpenseReport(businessId: string, dateRange?: { start: string; end: string }) {
  let query = supabase
    .from('expenses')
    .select('*')
    .eq('business_id', businessId)

  if (dateRange) {
    query = query.gte('date', dateRange.start).lte('date', dateRange.end)
  }

  const { data, error } = await query
  if (error) throw error

  return (data || []).map((exp): ExpenseReportRow => ({
    date: formatDate(exp.date),
    description: exp.description,
    category: exp.category || 'Uncategorized',
    amount: formatCurrency(exp.amount || 0),
    vendor: exp.vendor || '-',
    status: exp.status,
  }))
}

export interface ClientReportRow {
  name: string
  email: string
  phone: string
  total_invoices: number
  total_revenue: string
  outstanding: string
  last_activity: string
}

export async function generateClientReport(businessId: string) {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('*')
    .eq('business_id', businessId)
  
  if (error) throw error

  const report: ClientReportRow[] = []
  
  for (const client of clients || []) {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('total, status')
      .eq('business_id', businessId)
      .eq('client_id', client.id)

    const totalInvoices = invoices?.length || 0
    const totalRevenue = invoices?.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.total || 0), 0) || 0
    const outstanding = invoices?.filter(i => i.status !== 'paid').reduce((sum, i) => sum + (i.total || 0), 0) || 0

    report.push({
      name: client.name,
      email: client.email || '-',
      phone: client.phone || '-',
      total_invoices: totalInvoices,
      total_revenue: formatCurrency(totalRevenue),
      outstanding: formatCurrency(outstanding),
      last_activity: client.updated_at ? formatDate(client.updated_at) : '-',
    })
  }

  return report
}

// Download report as CSV
export async function downloadReport(
  businessId: string,
  reportType: 'invoices' | 'expenses' | 'clients',
  dateRange?: { start: string; end: string }
) {
  let data: any[]
  
  switch (reportType) {
    case 'invoices':
      data = await generateInvoiceReport(businessId, dateRange)
      break
    case 'expenses':
      data = await generateExpenseReport(businessId, dateRange)
      break
    case 'clients':
      data = await generateClientReport(businessId)
      break
    default:
      throw new Error('Unknown report type')
  }

  const csv = arrayToCSV(data)
  const timestamp = new Date().toISOString().split('T')[0]
  downloadFile(csv, `${reportType}_report_${timestamp}.csv`, 'text/csv')
}
