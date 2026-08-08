import { useState, useEffect } from 'react'
import {
  Shield, Clock, User, FileText, Plus, Edit2, Trash2,
  Download, Filter, ChevronDown, ChevronUp, Search, RefreshCw,
  ArrowUpDown, Eye, Settings, Activity, ArrowRight
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useAuditLogs, type AuditLog } from '../lib/auditLogger'
import { supabase } from '../lib/supabase'

// Visual Diff Component
function VisualDiff({ oldValues, newValues, changedFields }: { 
  oldValues: Record<string, any> 
  newValues: Record<string, any>
  changedFields: string[] 
}) {
  // Get all unique keys from both objects
  const allKeys = [...new Set([
    ...Object.keys(oldValues || {}),
    ...Object.keys(newValues || {}),
  ])]

  // Filter to only changed fields if available, otherwise show all
  const displayKeys = changedFields.length > 0 
    ? allKeys.filter(key => changedFields.includes(key))
    : allKeys

  if (displayKeys.length === 0) {
    return (
      <div className="text-center py-4 text-black">
        No field changes to display
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-black mb-3">Field Changes</div>
      {displayKeys.map(key => {
        const oldVal = oldValues?.[key]
        const newVal = newValues?.[key]
        const hasChanged = JSON.stringify(oldVal) !== JSON.stringify(newVal)
        
        // Format value for display
        const formatValue = (val: any): string => {
          if (val === null || val === undefined) return '—'
          if (typeof val === 'boolean') return val ? 'Yes' : 'No'
          if (typeof val === 'object') return JSON.stringify(val)
          return String(val)
        }

        return (
          <div 
            key={key} 
            className={`grid grid-cols-[1fr_auto_1fr] gap-3 items-center p-2 rounded-lg ${
              hasChanged ? 'bg-amber-50' : 'bg-black/[0.02]'
            }`}
          >
            {/* Old Value */}
            <div className="text-sm">
              <div className="text-xs text-black mb-0.5">{key}</div>
              <div className={`font-mono ${hasChanged ? 'text-red-600 line-through opacity-60' : 'text-black/70'}`}>
                {formatValue(oldVal)}
              </div>
            </div>
            
            {/* Arrow */}
            {hasChanged && (
              <ArrowRight size={16} className="text-amber-500 shrink-0" />
            )}
            
            {/* New Value */}
            <div className="text-sm">
              <div className="text-xs text-black mb-0.5">&nbsp;</div>
              <div className={`font-mono ${hasChanged ? 'text-green-600 font-medium' : 'text-black/70'}`}>
                {formatValue(newVal)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function useIsAdmin() {
  const { staff } = useAuth()
  return staff?.role === 'owner' || staff?.role === 'admin'
}

export default function AuditLogPage() {
  const { staff } = useAuth()
  const isAdmin = useIsAdmin()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<{
    action?: string
    entityType?: string
    userId?: string
    dateFrom?: string
    dateTo?: string
  }>({})
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadLogs()
  }, [staff?.business_id, filter])

  async function loadLogs() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (filter.action) {
        query = query.eq('action', filter.action)
      }
      if (filter.entityType) {
        query = query.eq('entity_type', filter.entityType)
      }
      if (filter.userId) {
        query = query.eq('user_id', filter.userId)
      }
      if (filter.dateFrom) {
        query = query.gte('created_at', filter.dateFrom)
      }
      if (filter.dateTo) {
        query = query.lte('created_at', filter.dateTo)
      }

      const { data } = await query
      setLogs(data || [])
    } catch (e) {
      console.error('Failed to load audit logs:', e)
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield size={48} className="text-amber-500 mb-4" />
        <h1 className="text-xl font-bold text-black mb-2">Access Restricted</h1>
        <p className="text-black">Only administrators can view audit logs.</p>
      </div>
    )
  }

  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      log.action.toLowerCase().includes(query) ||
      log.entity_type.toLowerCase().includes(query) ||
      log.entity_id?.toLowerCase().includes(query)
    )
  })

  const actionIcons: Record<string, any> = {
    create: Plus,
    update: Edit2,
    delete: Trash2,
    login: User,
    logout: User,
    export: Download,
    import: Download,
  }

  const actionColors: Record<string, string> = {
    create: 'bg-green-100 text-green-600',
    update: 'bg-blue-100 text-blue-600',
    delete: 'bg-red-100 text-red-600',
    login: 'bg-purple-100 text-purple-600',
    logout: 'bg-white text-black',
    export: 'bg-amber-100 text-amber-600',
    import: 'bg-teal-100 text-teal-600',
  }

  const entityTypes = [...new Set(logs.map(l => l.entity_type))]
  const users = [...new Set(logs.filter(l => l.user_id).map(l => l.user_id))]

  return (
    <div className="max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[var(--av-primary)] flex items-center justify-center">
            <Shield size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Audit Log</h1>
            <p className="text-sm text-black">Track all changes and activity</p>
          </div>
        </div>
        <button
          onClick={loadLogs}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-black/10 text-sm"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-black/10 text-sm"
              />
            </div>
          </div>

          {/* Action Filter */}
          <select
            value={filter.action || ''}
            onChange={(e) => setFilter({ ...filter, action: e.target.value || undefined })}
            className="px-3 py-2 rounded-lg border border-black/10 text-sm"
          >
            <option value="">All Actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="export">Export</option>
            <option value="import">Import</option>
          </select>

          {/* Entity Type Filter */}
          <select
            value={filter.entityType || ''}
            onChange={(e) => setFilter({ ...filter, entityType: e.target.value || undefined })}
            className="px-3 py-2 rounded-lg border border-black/10 text-sm"
          >
            <option value="">All Entities</option>
            {entityTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          {/* Date Range */}
          <input
            type="date"
            value={filter.dateFrom || ''}
            onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value || undefined })}
            className="px-3 py-2 rounded-lg border border-black/10 text-sm"
            placeholder="From"
          />
          <input
            type="date"
            value={filter.dateTo || ''}
            onChange={(e) => setFilter({ ...filter, dateTo: e.target.value || undefined })}
            className="px-3 py-2 rounded-lg border border-black/10 text-sm"
            placeholder="To"
          />

          {/* Clear Filters */}
          {(filter.action || filter.entityType || filter.dateFrom || filter.dateTo) && (
            <button
              onClick={() => setFilter({})}
              className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm hover:bg-red-100"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Logs"
          value={filteredLogs.length}
          icon={<Activity size={20} />}
          color="bg-blue-500"
        />
        <StatCard
          title="Creates"
          value={filteredLogs.filter(l => l.action === 'create').length}
          icon={<Plus size={20} />}
          color="bg-green-500"
        />
        <StatCard
          title="Updates"
          value={filteredLogs.filter(l => l.action === 'update').length}
          icon={<Edit2 size={20} />}
          color="bg-amber-500"
        />
        <StatCard
          title="Deletes"
          value={filteredLogs.filter(l => l.action === 'delete').length}
          icon={<Trash2 size={20} />}
          color="bg-red-500"
        />
      </div>

      {/* Log List */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-black/[0.02]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">Changes</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-black uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-black">
                    <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
                    Loading audit logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-black">
                    <Shield size={32} className="mx-auto mb-2" />
                    No audit logs found
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const Icon = actionIcons[log.action] || FileText
                  const colorClass = actionColors[log.action] || 'bg-white text-black'
                  const isExpanded = expandedLog === log.id
                  const changedFields = log.changed_fields || []

                  return (
                    <>
                      <tr key={log.id} className="hover:bg-black/10">
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-black" />
                            <span>{new Date(log.created_at).toLocaleString()}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
                            <Icon size={12} />
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div>
                            <div className="font-medium">{log.entity_type}</div>
                            <div className="text-xs text-black font-mono">
                              {log.entity_id?.slice(0, 8)}...
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {log.user_id ? (
                            <span className="flex items-center gap-1.5">
                              <User size={14} className="text-black" />
                              {log.user_name || log.user_id.slice(0, 8)}
                            </span>
                          ) : (
                            <span className="text-black">System</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-wrap gap-1">
                            {changedFields.slice(0, 3).map(field => (
                              <span key={field} className="px-2 py-0.5 bg-black/[0.05] rounded text-xs">
                                {field}
                              </span>
                            ))}
                            {changedFields.length > 3 && (
                              <span className="px-2 py-0.5 bg-black/[0.05] rounded text-xs">
                                +{changedFields.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(log.old_values || log.new_values) && (
                            <button
                              onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                              className="p-1.5 rounded-lg hover:bg-black/10"
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-black/[0.02]">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="bg-white rounded-xl border border-black/10 overflow-hidden">
                              <div className="bg-black/[0.02] px-4 py-2 border-b border-black/10">
                                <span className="text-sm font-medium">Changes Detail</span>
                              </div>
                              <div className="p-4">
                                <VisualDiff 
                                  oldValues={log.old_values} 
                                  newValues={log.new_values}
                                  changedFields={log.changed_fields || []}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-white`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold">{value.toLocaleString()}</div>
      <div className="text-sm text-black">{title}</div>
    </div>
  )
}
