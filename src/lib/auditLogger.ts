/**
 * Audit Logger Service
 * Records all changes for compliance and debugging
 */

import { supabase } from './supabase'

interface AuditLogEntry {
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'export' | 'import'
  entityType: string
  entityId?: string
  oldValues?: Record<string, any>
  newValues?: Record<string, any>
  metadata?: Record<string, any>
}

class AuditLogger {
  private queue: AuditLogEntry[] = []
  private flushTimeout: ReturnType<typeof setTimeout> | null = null
  private readonly BATCH_SIZE = 10
  private readonly FLUSH_INTERVAL = 3000

  constructor() {
    this.startBatchProcessor()
    
    // Track before unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush())
    }
  }

  async log(entry: AuditLogEntry) {
    this.queue.push(entry)

    if (this.queue.length >= this.BATCH_SIZE) {
      await this.flush()
    }
  }

  // Convenience methods
  async logCreate(entityType: string, entityId: string, newValues: Record<string, any>) {
    return this.log({
      action: 'create',
      entityType,
      entityId,
      newValues,
    })
  }

  async logUpdate(entityType: string, entityId: string, oldValues: Record<string, any>, newValues: Record<string, any>) {
    return this.log({
      action: 'update',
      entityType,
      entityId,
      oldValues,
      newValues,
    })
  }

  async logDelete(entityType: string, entityId: string, oldValues: Record<string, any>) {
    return this.log({
      action: 'delete',
      entityType,
      entityId,
      oldValues,
    })
  }

  async logAction(action: AuditLogEntry['action'], entityType: string, entityId?: string, metadata?: Record<string, any>) {
    return this.log({
      action,
      entityType,
      entityId,
      metadata,
    })
  }

  async flush() {
    if (this.queue.length === 0) return

    const entries = [...this.queue]
    this.queue = []

    try {
      for (const entry of entries) {
        await supabase.rpc('record_audit', {
          p_business_id: (window as any).__businessId__ || null,
          p_user_id: (window as any).__userId__ || null,
          p_action: entry.action,
          p_entity_type: entry.entityType,
          p_entity_id: entry.entityId,
          p_old_values: entry.oldValues || null,
          p_new_values: entry.newValues || null,
        })
      }
    } catch (e) {
      console.error('Failed to flush audit logs:', e)
      this.queue.unshift(...entries)
    }
  }

  private startBatchProcessor() {
    this.flushTimeout = setInterval(() => {
      this.flush()
    }, this.FLUSH_INTERVAL)
  }
}

export const auditLogger = new AuditLogger()

// ============================================
// Audit Log Viewer Hook
// ============================================

import { useState, useEffect, useCallback } from 'react'

export interface AuditLog {
  id: string
  action: string
  entity_type: string
  entity_id: string
  old_values: Record<string, any>
  new_values: Record<string, any>
  changed_fields: string[]
  user_id: string
  user_name?: string
  created_at: string
  metadata: Record<string, any>
}

export function useAuditLogs(entityType?: string, entityId?: string, limit = 50) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (entityType) {
        query = query.eq('entity_type', entityType)
      }
      if (entityId) {
        query = query.eq('entity_id', entityId)
      }

      const { data, error } = await query

      if (error) throw error
      setLogs(data || [])
    } catch (e: any) {
      setError(e.message || 'Failed to fetch audit logs')
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId, limit])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  return { logs, loading, error, refetch: fetchLogs }
}

// ============================================
// Export Service
// ============================================

export interface ExportOptions {
  entityType: string
  format: 'csv' | 'excel' | 'json' | 'pdf'
  filters?: Record<string, any>
  dateRange?: { start: string; end: string }
  columns?: string[]
}

export async function requestExport(options: ExportOptions): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('data_exports')
      .insert({
        export_type: options.format,
        entity_type: options.entityType,
        filters: options.filters || {},
        date_range: options.dateRange || null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) throw error
    return data.id
  } catch (e) {
    console.error('Failed to request export:', e)
    return null
  }
}

export async function getExportStatus(exportId: string) {
  try {
    const { data } = await supabase
      .from('data_exports')
      .select('*')
      .eq('id', exportId)
      .single()
    return data
  } catch {
    return null
  }
}

export async function getUserExports(limit = 20) {
  try {
    const { data } = await supabase
      .from('data_exports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    return data || []
  } catch {
    return []
  }
}

// ============================================
// Search Service
// ============================================

export interface SearchResult {
  id: string
  entityType: string
  entityId: string
  title: string
  content: string
  rank: number
  metadata: Record<string, any>
}

export async function search(query: string, entityTypes?: string[], limit = 20): Promise<SearchResult[]> {
  if (!query.trim()) return []

  try {
    // Use Supabase text search
    let dbQuery = supabase
      .from('search_indexes')
      .select('*')
      .textSearch('search_vector', query.split(' ').join(' | '))
      .order('rank', { ascending: false })
      .limit(limit)

    if (entityTypes && entityTypes.length > 0) {
      dbQuery = dbQuery.in('entity_type', entityTypes)
    }

    const { data, error } = await dbQuery

    if (error) {
      // Fallback to ILIKE search
      const { data: fallbackData } = await supabase
        .from('search_indexes')
        .select('*')
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .limit(limit)

      return (fallbackData || []) as SearchResult[]
    }

    return (data || []) as SearchResult[]
  } catch {
    return []
  }
}

export async function indexEntity(
  entityType: string,
  entityId: string,
  title: string,
  content: string,
  metadata: Record<string, any> = {}
) {
  try {
    const searchVector = `${title} ${content}`
    
    await supabase.from('search_indexes').upsert({
      entity_type: entityType,
      entity_id: entityId,
      title,
      content,
      metadata,
      search_vector: searchVector,
    }, {
      onConflict: 'business_id,entity_type,entity_id',
    })
  } catch (e) {
    console.error('Failed to index entity:', e)
  }
}

// ============================================
// Saved Searches
// ============================================

export interface SavedSearch {
  id: string
  name: string
  entity_type: string
  filters: Record<string, any>
  use_count: number
}

export async function saveSearch(
  name: string,
  entityType: string,
  filters: Record<string, any>
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('saved_searches')
      .insert({
        name,
        entity_type: entityType,
        filters,
      })
      .select('id')
      .single()

    if (error) throw error
    return data.id
  } catch {
    return null
  }
}

export async function getSavedSearches(entityType?: string): Promise<SavedSearch[]> {
  try {
    let query = supabase
      .from('saved_searches')
      .select('*')
      .order('use_count', { ascending: false })

    if (entityType) {
      query = query.eq('entity_type', entityType)
    }

    const { data } = await query
    return data || []
  } catch {
    return []
  }
}

export async function incrementSearchUsage(searchId: string) {
  try {
    await supabase.rpc('increment_saved_search_use', { p_search_id: searchId })
  } catch {
    // Fallback - get current and increment manually
    const { data } = await supabase
      .from('saved_searches')
      .select('use_count')
      .eq('id', searchId)
      .single()
    
    if (data) {
      await supabase
        .from('saved_searches')
        .update({ use_count: (data.use_count || 0) + 1 })
        .eq('id', searchId)
    }
  }
}

// ============================================
// Currency Conversion
// ============================================

export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  if (fromCurrency === toCurrency) return amount

  try {
    const { data } = await supabase.rpc('convert_currency', {
      p_amount: amount,
      p_from_currency: fromCurrency,
      p_to_currency: toCurrency,
    })
    return data || amount
  } catch {
    return amount
  }
}

export async function getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
  if (fromCurrency === toCurrency) return 1

  try {
    const { data } = await supabase.rpc('get_exchange_rate', {
      p_from_currency: fromCurrency,
      p_to_currency: toCurrency,
    })
    return data || 1
  } catch {
    return 1
  }
}

export default {
  auditLogger,
  useAuditLogs,
  requestExport,
  getExportStatus,
  getUserExports,
  search,
  indexEntity,
  saveSearch,
  getSavedSearches,
  convertCurrency,
  getExchangeRate,
}
