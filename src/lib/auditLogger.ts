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
  private cachedUserId: string | null = null
  private cachedBusinessId: string | null = null
  private identityResolved = false

  constructor() {
    this.startBatchProcessor()
    
    // Track before unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush())
    }
  }

  // Lazily resolve the current user and their business_id from auth,
  // instead of relying on window globals that were never set.
  private async resolveIdentity(): Promise<void> {
    if (this.identityResolved) return
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
      // leave nulls — audit logs recorded without attribution
    }
    this.identityResolved = true
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

    await this.resolveIdentity()

    const entries = [...this.queue]
    this.queue = []

    try {
      for (const entry of entries) {
        await supabase.rpc('record_audit', {
          p_business_id: this.cachedBusinessId,
          p_user_id: this.cachedUserId,
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
// Search Service with Fuzzy Matching & Autocomplete
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

export interface SearchSuggestion {
  text: string
  type: 'recent' | 'popular' | 'entity'
  entityType?: string
}

// Fuzzy match score (simple Levenshtein-inspired)
function fuzzyMatch(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  
  // Exact match
  if (t.includes(q)) return 1.0
  
  // Starts with
  if (t.startsWith(q)) return 0.9
  
  // Word starts with
  const words = t.split(/\s+/)
  for (const word of words) {
    if (word.startsWith(q)) return 0.8
  }
  
  // Contains characters in order
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  if (qi === q.length) return 0.5
  
  // Fuzzy character match
  const matchRatio = qi / q.length
  if (matchRatio > 0.5) return matchRatio * 0.4
  
  return 0
}

// Sort by relevance score
function sortByRelevance<T extends { title: string; content?: string }>(
  items: T[],
  query: string
): T[] {
  return items
    .map(item => ({
      item,
      score: Math.max(
        fuzzyMatch(query, item.title),
        item.content ? fuzzyMatch(query, item.content) * 0.7 : 0
      )
    }))
    .filter(({ score }) => score > 0.2)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}

// Highlight matching text
export function highlightMatch(text: string, query: string): { before: string; match: string; after: string } | null {
  if (!query.trim()) return null
  
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)
  
  if (index === -1) return null
  
  return {
    before: text.slice(0, index),
    match: text.slice(index, index + query.length),
    after: text.slice(index + query.length)
  }
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
      .limit(limit * 2) // Get more for client-side fuzzy filtering

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
        .limit(limit * 2)

      const results = (fallbackData || []) as SearchResult[]
      // Apply fuzzy matching and re-sort
      const sorted = sortByRelevance(results, query)
      return sorted.slice(0, limit)
    }

    const results = (data || []) as SearchResult[]
    // Apply fuzzy matching and re-sort
    const sorted = sortByRelevance(results, query)
    return sorted.slice(0, limit)
  } catch {
    return []
  }
}

// Autocomplete suggestions
export async function getSearchSuggestions(query: string, limit = 5): Promise<SearchSuggestion[]> {
  if (!query.trim() || query.length < 2) return []

  const suggestions: SearchSuggestion[] = []
  
  try {
    // Search for matching entity names
    const { data: entities } = await supabase
      .from('search_indexes')
      .select('title, entity_type')
      .ilike('title', `${query}%`)
      .limit(limit)
    
    if (entities) {
      for (const entity of entities) {
        suggestions.push({
          text: entity.title,
          type: 'entity',
          entityType: entity.entity_type
        })
      }
    }
    
    return suggestions.slice(0, limit)
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
