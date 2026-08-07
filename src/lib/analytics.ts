// Analytics & Metrics Utilities
// Helper functions for charts, metrics, and data analysis

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

// ============================================
// ANALYTICS TRACKING
// ============================================

export const ANALYTICS_EVENTS = {
  // Page Views
  PAGE_VIEW: 'page_view',
  
  // User Actions
  LOGIN: 'login',
  LOGOUT: 'logout',
  SIGNUP: 'signup',
  
  // CRM
  CONTACT_CREATED: 'contact_created',
  CONTACT_UPDATED: 'contact_updated',
  DEAL_CREATED: 'deal_created',
  DEAL_STAGE_CHANGED: 'deal_stage_changed',
  DEAL_WON: 'deal_won',
  DEAL_LOST: 'deal_lost',
  
  // Tasks & Projects
  TASK_CREATED: 'task_created',
  TASK_COMPLETED: 'task_completed',
  PROJECT_CREATED: 'project_created',
  
  // Invoices & Payments
  INVOICE_CREATED: 'invoice_created',
  INVOICE_SENT: 'invoice_sent',
  INVOICE_PAID: 'invoice_paid',
  PAYMENT_RECEIVED: 'payment_received',
  
  // Automation
  AUTOMATION_CREATED: 'automation_created',
  AUTOMATION_TRIGGERED: 'automation_triggered',
  
  // Settings
  SETTINGS_UPDATED: 'settings_updated',
  SETTINGS_SSO_VIEWED: 'settings_sso_viewed',
  SETTINGS_2FA_ENABLED: 'settings_2fa_enabled',
  INTEGRATION_CONNECTED: 'integration_connected',
  
  // Lead Capture
  LEAD_CAPTURED: 'lead_captured',
  LEAD_CONVERTED: 'lead_converted',
} as const

export type AnalyticsEvent = typeof ANALYTICS_EVENTS[keyof typeof ANALYTICS_EVENTS]

// Track analytics event
async function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, any>,
  userId?: string
) {
  try {
    // In production, send to analytics service (e.g., Mixpanel, Amplitude)
    console.log('[Analytics]', event, properties)
    
    // Also save to database for reports
    if (userId) {
      const { error } = await supabase.from('analytics_events').insert({
        event,
        properties,
        user_id: userId,
      })
      // Ignore errors - analytics should not break the app
      if (error) console.warn('Analytics insert failed:', error.message)
    }
  } catch (error) {
    console.error('Analytics tracking error:', error)
  }
}

// React hook for analytics
export function useAnalytics() {
  const [userId, setUserId] = useState<string | null>(null)
  
  useEffect(() => {
    // Get current user ID
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null)
    })
  }, [])

  const track = useCallback(
    (event: AnalyticsEvent, properties?: Record<string, any>) => {
      trackEvent(event, properties, userId || undefined)
    },
    [userId]
  )

  return { track }
}

// ============================================
// DATA AGGREGATION
// ============================================

export interface DateRange {
  start: Date
  end: Date
}

export interface Metric {
  label: string
  value: number
  change?: number
  format?: 'number' | 'currency' | 'percentage'
}

// Get date range presets
export function getDateRangePresets(): { label: string; value: DateRange }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  return [
    {
      label: 'Today',
      value: { start: today, end: now },
    },
    {
      label: 'Yesterday',
      value: {
        start: new Date(today.getTime() - 86400000),
        end: new Date(today.getTime() - 1),
      },
    },
    {
      label: 'Last 7 days',
      value: {
        start: new Date(today.getTime() - 7 * 86400000),
        end: now,
      },
    },
    {
      label: 'Last 30 days',
      value: {
        start: new Date(today.getTime() - 30 * 86400000),
        end: now,
      },
    },
    {
      label: 'This month',
      value: {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: now,
      },
    },
    {
      label: 'Last month',
      value: {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0),
      },
    },
    {
      label: 'This year',
      value: {
        start: new Date(now.getFullYear(), 0, 1),
        end: now,
      },
    },
  ]
}

// Group data by time period
export function groupByPeriod<T extends Record<string, any>>(
  data: T[],
  dateKey: string,
  period: 'day' | 'week' | 'month' | 'year'
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {}

  data.forEach(item => {
    const date = new Date(item[dateKey])
    let key: string

    switch (period) {
      case 'day':
        key = date.toISOString().split('T')[0]
        break
      case 'week':
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        key = weekStart.toISOString().split('T')[0]
        break
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        break
      case 'year':
        key = String(date.getFullYear())
        break
    }

    if (!grouped[key]) grouped[key] = []
    grouped[key].push(item)
  })

  return grouped
}

// Calculate percentage change
export function calculateChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

// Calculate running total
export function calculateRunningTotal(data: { value: number }[]): number[] {
  let total = 0
  return data.map(item => {
    total += item.value
    return total
  })
}

// ============================================
// CHART HELPERS
// ============================================

export interface ChartDataPoint {
  label: string
  value: number
  color?: string
}

export interface ChartDataset {
  label: string
  data: number[]
  color?: string
}

// Generate colors for charts
const CHART_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
]

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]
}

// Generate gradient colors
export function getChartGradient(startColor: string, endColor: string): string {
  return `linear-gradient(135deg, ${startColor}, ${endColor})`
}

// Format chart labels
export function formatChartLabel(date: Date, period: 'day' | 'week' | 'month' | 'year'): string {
  switch (period) {
    case 'day':
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    case 'week':
      return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    case 'month':
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    case 'year':
      return date.toLocaleDateString('en-US', { year: 'numeric' })
  }
}

// Generate time series data points
export function generateTimeSeriesData(
  startDate: Date,
  endDate: Date,
  period: 'day' | 'week' | 'month' | 'year'
): Date[] {
  const dates: Date[] = []
  const current = new Date(startDate)

  while (current <= endDate) {
    dates.push(new Date(current))
    
    switch (period) {
      case 'day':
        current.setDate(current.getDate() + 1)
        break
      case 'week':
        current.setDate(current.getDate() + 7)
        break
      case 'month':
        current.setMonth(current.getMonth() + 1)
        break
      case 'year':
        current.setFullYear(current.getFullYear() + 1)
        break
    }
  }

  return dates
}

// ============================================
// METRICS CALCULATIONS
// ============================================

export interface RevenueMetrics {
  total: number
  average: number
  growth: number
  projection: number
}

export function calculateRevenueMetrics(
  currentPeriod: number[],
  previousPeriod: number[]
): RevenueMetrics {
  const total = currentPeriod.reduce((a, b) => a + b, 0)
  const prevTotal = previousPeriod.reduce((a, b) => a + b, 0)
  const average = total / currentPeriod.length || 0
  const growth = calculateChange(total, prevTotal)
  
  // Simple projection based on average
  const projection = average * 30

  return { total, average, growth, projection }
}

export interface FunnelMetrics {
  stage: string
  count: number
  percentage: number
  dropoff: number
}

export function calculateFunnelMetrics(stages: { stage: string; count: number }[]): FunnelMetrics[] {
  const total = stages[0]?.count || 1
  
  return stages.map((item, index) => {
    const percentage = (item.count / total) * 100
    const previousCount = stages[index - 1]?.count || item.count
    const dropoff = ((previousCount - item.count) / previousCount) * 100
    
    return {
      stage: item.stage,
      count: item.count,
      percentage,
      dropoff: isNaN(dropoff) ? 0 : dropoff,
    }
  })
}

// ============================================
// ANALYTICS QUERIES
// ============================================

export interface AnalyticsFilters {
  businessId?: string
  dateRange?: DateRange
  groupBy?: 'day' | 'week' | 'month' | 'year'
}

export async function getRevenueAnalytics(filters: AnalyticsFilters) {
  const { businessId, dateRange, groupBy = 'day' } = filters
  
  if (!businessId) return []

  let query = supabase
    .from('invoices')
    .select('created_at, total, status')
    .eq('business_id', businessId)
    .eq('status', 'paid')

  if (dateRange) {
    query = query
      .gte('created_at', dateRange.start.toISOString())
      .lte('created_at', dateRange.end.toISOString())
  }

  const { data, error } = await query

  if (error || !data) return []

  // Group by period
  const grouped = groupByPeriod(data, 'created_at', groupBy)
  
  // Calculate totals per period
  return Object.entries(grouped).map(([key, items]) => ({
    period: key,
    revenue: items.reduce((sum, item) => sum + (item.total || 0), 0),
    count: items.length,
  }))
}

export async function getPipelineAnalytics(businessId: string) {
  const { data, error } = await supabase
    .from('deals')
    .select('stage, value')
    .eq('business_id', businessId)

  if (error || !data) return []

  const stages = ['lead', 'qualified', 'proposal', 'negotiation', 'won']
  const stageLabels: Record<string, string> = {
    lead: 'Leads',
    qualified: 'Qualified',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    won: 'Won',
  }

  return stages.map(stage => {
    const stageDeals = data.filter(d => d.stage === stage)
    return {
      stage: stageLabels[stage],
      count: stageDeals.length,
      value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
    }
  })
}

export async function getActivityAnalytics(businessId: string, days: number = 30) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const [tasks, events, contacts] = await Promise.all([
    supabase.from('tasks').select('created_at').eq('business_id', businessId).gte('created_at', startDate.toISOString()),
    supabase.from('events').select('created_at').eq('business_id', businessId).gte('created_at', startDate.toISOString()),
    supabase.from('contacts').select('created_at').eq('business_id', businessId).gte('created_at', startDate.toISOString()),
  ])

  return {
    tasks: tasks.data?.length || 0,
    events: events.data?.length || 0,
    contacts: contacts.data?.length || 0,
  }
}

// ============================================
// EXPORT TYPES
// ============================================

export type {
  CSVColumn,
} from './export'

export {
  exportToCSV,
  exportToPDF,
  Formatters,
} from './export'
