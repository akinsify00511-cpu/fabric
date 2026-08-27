/**
 * Quality Control System
 * Internal tools for monitoring, debugging, and maintaining app health
 */

import { supabase } from './supabase'

// ============================================
// Types
// ============================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical'

export interface QCLog {
  id: string
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, any>
  userId?: string
  businessId?: string
  page?: string
  component?: string
  error?: {
    name: string
    message: string
    stack?: string
  }
}

export interface HealthStatus {
  api: boolean
  database: boolean
  auth: boolean
  realtime: boolean
  storage: boolean
  lastChecked: string
  responseTime?: number
}

export interface PerformanceMetric {
  name: string
  value: number
  unit: string
  timestamp: string
}

export interface QCReport {
  id: string
  type: 'bug' | 'performance' | 'ux' | 'data' | 'security'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  context: Record<string, any>
  status: 'open' | 'investigating' | 'fixed' | 'wontfix'
  createdAt: string
  resolvedAt?: string
  assignee?: string
}

// ============================================
// Configuration
// ============================================

const QC_CONFIG = {
  enabled: import.meta.env.DEV || import.meta.env.VITE_QC_MODE === 'true',
  logRetention: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxLocalLogs: 1000,
  performanceThreshold: {
    api: 3000, // 3s
    pageLoad: 5000, // 5s
    interaction: 500, // 500ms
  },
}

// ============================================
// Logger
// ============================================

class QCConsumer {
  private logs: QCLog[] = []
  private listeners: ((log: QCLog) => void)[] = []
  private cachedUserId: string | null = null
  private cachedBusinessId: string | null = null
  private identityResolved = false

  constructor() {
    this.loadFromStorage()
    this.resolveIdentity()
  }

  // Lazily resolve the current user and their business_id from auth,
  // instead of relying on window globals that were never set.
  private async resolveIdentity(): Promise<void> {
    if (this.identityResolved) return
    this.identityResolved = true
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        this.cachedUserId = user.id
        const { data: staff } = await supabase
          .from('staff')
          .select('business_id')
          .eq('user_id', user.id)
          .maybeSingle()
        this.cachedBusinessId = staff?.business_id ?? null
      }
    } catch {
      // leave nulls — QC logs recorded without attribution
    }
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem('qc_logs')
      if (stored) {
        const parsed = JSON.parse(stored)
        this.logs = parsed.filter((log: QCLog) => 
          Date.now() - new Date(log.timestamp).getTime() < QC_CONFIG.logRetention
        )
      }
    } catch (e) {
      console.error('Failed to load QC logs:', e)
    }
  }

  private saveToStorage() {
    try {
      const toSave = this.logs.slice(-QC_CONFIG.maxLocalLogs)
      localStorage.setItem('qc_logs', JSON.stringify(toSave))
    } catch (e) {
      console.error('Failed to save QC logs:', e)
    }
  }

  private createLog(level: LogLevel, message: string, context?: Record<string, any>): QCLog {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      page: window.location.pathname,
      userId: this.cachedUserId ?? undefined,
      businessId: this.cachedBusinessId ?? undefined,
    }
  }

  log(level: LogLevel, message: string, context?: Record<string, any>) {
    if (!QC_CONFIG.enabled) return

    const logEntry = this.createLog(level, message, context)
    
    if (context?.error) {
      logEntry.error = {
        name: context.error.name || 'Error',
        message: context.error.message || String(context.error),
        stack: context.error.stack,
      }
    }

    this.logs.push(logEntry)
    this.saveToStorage()
    
    // Notify listeners
    this.listeners.forEach(listener => listener(logEntry))

    // Console output with styling
    const styles: Record<LogLevel, string> = {
      debug: 'color: gray',
      info: 'color: blue',
      warn: 'color: orange',
      error: 'color: red',
      critical: 'color: red; font-weight: bold; background: yellow',
    }
    
    console.log(`%c[QC:${level.toUpperCase()}]`, styles[level], message, context || '')
  }

  debug(message: string, context?: Record<string, any>) {
    this.log('debug', message, context)
  }

  info(message: string, context?: Record<string, any>) {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context)
  }

  error(message: string, context?: Record<string, any>) {
    this.log('error', message, context)
  }

  critical(message: string, context?: Record<string, any>) {
    this.log('critical', message, context)
    // Could trigger alerts here
  }

  getLogs(level?: LogLevel, limit = 100): QCLog[] {
    let filtered = this.logs
    if (level) {
      filtered = filtered.filter(l => l.level === level)
    }
    return filtered.slice(-limit).reverse()
  }

  getLogsByContext(key: string, value: any): QCLog[] {
    return this.logs.filter(l => l.context?.[key] === value)
  }

  clearLogs() {
    this.logs = []
    localStorage.removeItem('qc_logs')
  }

  subscribe(listener: (log: QCLog) => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  getStats() {
    const now = Date.now()
    const hourAgo = now - 3600000
    const dayAgo = now - 86400000

    return {
      total: this.logs.length,
      byLevel: {
        debug: this.logs.filter(l => l.level === 'debug').length,
        info: this.logs.filter(l => l.level === 'info').length,
        warn: this.logs.filter(l => l.level === 'warn').length,
        error: this.logs.filter(l => l.level === 'error').length,
        critical: this.logs.filter(l => l.level === 'critical').length,
      },
      lastHour: this.logs.filter(l => new Date(l.timestamp).getTime() > hourAgo).length,
      lastDay: this.logs.filter(l => new Date(l.timestamp).getTime() > dayAgo).length,
    }
  }
}

export const qcLogger = new QCConsumer()

// ============================================
// Performance Monitor
// ============================================

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = []
  private observers: Map<string, PerformanceObserver> = new Map()

  constructor() {
    this.loadFromStorage()
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem('qc_metrics')
      if (stored) {
        this.metrics = JSON.parse(stored)
      }
    } catch (e) {
      console.error('Failed to load QC metrics:', e)
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem('qc_metrics', JSON.stringify(this.metrics.slice(-500)))
    } catch (e) {
      console.error('Failed to save QC metrics:', e)
    }
  }

  recordMetric(name: string, value: number, unit = 'ms') {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: new Date().toISOString(),
    }
    
    this.metrics.push(metric)
    this.saveToStorage()

    // Check thresholds
    const threshold = QC_CONFIG.performanceThreshold[name as keyof typeof QC_CONFIG.performanceThreshold]
    if (threshold && value > threshold) {
      qcLogger.warn(`Performance threshold exceeded: ${name}`, { value, threshold, unit })
    }

    return metric
  }

  async measureApiCall(name: string, fn: () => Promise<any>): Promise<any> {
    const start = performance.now()
    try {
      const result = await fn()
      const duration = performance.now() - start
      this.recordMetric(`${name}_api`, duration)
      return result
    } catch (error) {
      const duration = performance.now() - start
      this.recordMetric(`${name}_api_error`, duration)
      throw error
    }
  }

  measureRender(name: string, fn: () => void) {
    const start = performance.now()
    fn()
    const duration = performance.now() - start
    this.recordMetric(`${name}_render`, duration)
    return duration
  }

  getMetrics(name?: string, limit = 100): PerformanceMetric[] {
    let filtered = this.metrics
    if (name) {
      filtered = filtered.filter(m => m.name.includes(name))
    }
    return filtered.slice(-limit).reverse()
  }

  getAverage(name: string, since?: number): number {
    let filtered = this.metrics.filter(m => m.name === name)
    if (since) {
      filtered = filtered.filter(m => new Date(m.timestamp).getTime() > since)
    }
    if (filtered.length === 0) return 0
    return filtered.reduce((sum, m) => sum + m.value, 0) / filtered.length
  }

  getStats(name: string) {
    const relevant = this.metrics.filter(m => m.name.includes(name))
    if (relevant.length === 0) return null

    const values = relevant.map(m => m.value).sort((a, b) => a - b)
    return {
      count: values.length,
      min: values[0],
      max: values[values.length - 1],
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
    }
  }

  clearMetrics() {
    this.metrics = []
    localStorage.removeItem('qc_metrics')
  }
}

export const performanceMonitor = new PerformanceMonitor()

// ============================================
// Health Checker
// ============================================

class HealthChecker {
  private status: HealthStatus = {
    api: false,
    database: false,
    auth: false,
    realtime: false,
    storage: false,
    lastChecked: new Date().toISOString(),
  }

  async checkAll(): Promise<HealthStatus> {
    qcLogger.info('Running health check...')

    const results = await Promise.allSettled([
      this.checkAPI(),
      this.checkDatabase(),
      this.checkAuth(),
      this.checkRealtime(),
      this.checkStorage(),
    ])

    this.status = {
      api: results[0].status === 'fulfilled' ? results[0].value : false,
      database: results[1].status === 'fulfilled' ? results[1].value : false,
      auth: results[2].status === 'fulfilled' ? results[2].value : false,
      realtime: results[3].status === 'fulfilled' ? results[3].value : false,
      storage: results[4].status === 'fulfilled' ? results[4].value : false,
      lastChecked: new Date().toISOString(),
    }

    // Log overall health
    const healthy = Object.entries(this.status)
      .filter(([key]) => key !== 'lastChecked' && key !== 'responseTime')
      .filter(([, value]) => typeof value === 'boolean')
      .every(([, value]) => value === true)

    if (healthy) {
      qcLogger.info('All systems healthy')
    } else {
      const unhealthy = Object.entries(this.status)
        .filter(([key, value]) => key !== 'lastChecked' && key !== 'responseTime' && value === false)
        .map(([key]) => key)
      qcLogger.warn(`Unhealthy systems: ${unhealthy.join(', ')}`)
    }

    return this.status
  }

  private async measureHealthCheck(fn: () => Promise<boolean>): Promise<boolean> {
    const start = performance.now()
    try {
      const result = await fn()
      this.status.responseTime = performance.now() - start
      return result
    } catch {
      this.status.responseTime = performance.now() - start
      return false
    }
  }

  private async checkAPI(): Promise<boolean> {
    return this.measureHealthCheck(async () => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
        method: 'HEAD',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      })
      return response.ok
    })
  }

  private async checkDatabase(): Promise<boolean> {
    return this.measureHealthCheck(async () => {
      const { error } = await supabase.from('businesses').select('id').limit(1)
      return !error
    })
  }

  private async checkAuth(): Promise<boolean> {
    return this.measureHealthCheck(async () => {
      await supabase.auth.getSession()
      return true // Auth is healthy even if no session
    })
  }

  private async checkRealtime(): Promise<boolean> {
    return this.measureHealthCheck(async () => {
      const channel = supabase.channel('health-check')
      const promise = new Promise<boolean>((resolve) => {
        channel.on('presence', { event: 'sync' }, () => {
          resolve(true)
        })
        channel.subscribe((status) => {
          if (String(status) === 'subscribed' || status === 'SUBSCRIBED') {
            channel.track({ status: 'ok' })
          }
          if (String(status) === 'closed' || status === 'CLOSED') {
            resolve(false)
          }
        })
      })

      const result = await Promise.race([
        promise,
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
      ])

      supabase.removeChannel(channel)
      return result
    })
  }

  private async checkStorage(): Promise<boolean> {
    return this.measureHealthCheck(async () => {
      const { data, error } = await supabase.storage.listBuckets()
      return !error && data !== null
    })
  }

  getStatus(): HealthStatus {
    return this.status
  }
}

export const healthChecker = new HealthChecker()

// ============================================
// Issue Reporter
// ============================================

class IssueReporter {
  async reportIssue(report: Omit<QCReport, 'id' | 'createdAt' | 'status'>): Promise<string | null> {
    const fullReport: QCReport = {
      ...report,
      id: crypto.randomUUID(),
      status: 'open',
      createdAt: new Date().toISOString(),
    }

    qcLogger.info('Issue reported', fullReport)

    // Store locally
    try {
      const stored = localStorage.getItem('qc_reports') || '[]'
      const reports = JSON.parse(stored) as QCReport[]
      reports.push(fullReport)
      localStorage.setItem('qc_reports', JSON.stringify(reports.slice(-100)))
    } catch (e) {
      qcLogger.error('Failed to store report locally', { error: e })
    }

    return fullReport.id
  }

  async reportBug(title: string, description: string, context: Record<string, any>): Promise<string | null> {
    return this.reportIssue({
      type: 'bug',
      severity: 'medium',
      title,
      description,
      context,
    })
  }

  async reportPerformanceIssue(title: string, metrics: Record<string, number>): Promise<string | null> {
    const severity = Object.values(metrics).some(v => v > 10000) ? 'critical' : 
                    Object.values(metrics).some(v => v > 5000) ? 'high' : 'medium'
    return this.reportIssue({
      type: 'performance',
      severity,
      title,
      description: `Performance issue detected: ${JSON.stringify(metrics)}`,
      context: { metrics },
    })
  }

  getReports(status?: QCReport['status']): QCReport[] {
    try {
      const stored = localStorage.getItem('qc_reports') || '[]'
      const reports = JSON.parse(stored) as QCReport[]
      if (status) {
        return reports.filter(r => r.status === status)
      }
      return reports
    } catch {
      return []
    }
  }

  clearReports() {
    localStorage.removeItem('qc_reports')
  }
}

export const issueReporter = new IssueReporter()

// ============================================
// Global Error Handler Setup
// ============================================

export function setupGlobalErrorHandlers() {
  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    qcLogger.error('Unhandled Promise Rejection', {
      reason: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
    })
  })

  // Capture global errors
  window.addEventListener('error', (event) => {
    qcLogger.error('Global Error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    })
  })

  qcLogger.info('Global error handlers initialized')
}

// ============================================
// Dev Tools Access
// ============================================

declare global {
  interface Window {
    __QC__?: {
      logger: typeof qcLogger
      performance: typeof performanceMonitor
      health: typeof healthChecker
      reporter: typeof issueReporter
      config: typeof QC_CONFIG
      clearAll: () => void
    }
  }
}

// Expose to window in dev mode
if (QC_CONFIG.enabled && typeof window !== 'undefined') {
  window.__QC__ = {
    logger: qcLogger,
    performance: performanceMonitor,
    health: healthChecker,
    reporter: issueReporter,
    config: QC_CONFIG,
    clearAll: () => {
      qcLogger.clearLogs()
      performanceMonitor.clearMetrics()
      issueReporter.clearReports()
    },
  }

  console.log('%c🛠️ Quality Control System Initialized', 'color: #4F46E5; font-weight: bold')
  console.log('Access QC tools via: window.__QC__')
}

export default {
  qcLogger,
  performanceMonitor,
  healthChecker,
  issueReporter,
  setupGlobalErrorHandlers,
  QC_CONFIG,
}
