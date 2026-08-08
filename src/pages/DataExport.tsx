import { useState, useEffect } from 'react'
import {
  Download, FileText, FileSpreadsheet, FileJson, File,
  Clock, CheckCircle, XCircle, RefreshCw, Trash2,
  Calendar, Filter, Plus, DownloadCloud, FileDown
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { getUserExports, type ExportOptions } from '../lib/auditLogger'
import { supabase } from '../lib/supabase'

interface ExportRecord {
  id: string
  export_type: string
  entity_type: string
  format: string
  status: string
  file_name: string
  record_count: number
  created_at: string
  completed_at: string
  download_count: number
  expires_at: string
}

const ENTITY_OPTIONS = [
  { value: 'contacts', label: 'Contacts', table: 'contacts' },
  { value: 'tasks', label: 'Tasks', table: 'tasks' },
  { value: 'staff', label: 'Staff', table: 'staff' },
  { value: 'invoices', label: 'Invoices', table: 'invoices' },
  { value: 'quotes', label: 'Quotes', table: 'quotes' },
  { value: 'projects', label: 'Projects', table: 'projects' },
  { value: 'payments', label: 'Payments', table: 'payments' },
  { value: 'inventory', label: 'Inventory', table: 'inventory_items' },
  { value: 'documents', label: 'Documents', table: 'documents' },
  { value: 'all', label: 'Full Backup', table: null },
]

const FORMAT_OPTIONS = [
  { value: 'csv', label: 'CSV', icon: FileSpreadsheet, desc: 'For Excel, Google Sheets' },
  { value: 'json', label: 'JSON', icon: FileJson, desc: 'For developers' },
]

// Convert data to CSV
function convertToCSV(data: Record<string, any>[]): string {
  if (data.length === 0) return ''
  
  const headers = Object.keys(data[0])
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header]
        // Escape quotes and wrap in quotes if contains comma
        if (value === null || value === undefined) return ''
        const str = String(value)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(',')
    )
  ]
  
  return csvRows.join('\n')
}

// Download file
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

export default function DataExportPage() {
  const { staff } = useAuth()
  const [exports, setExports] = useState<ExportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportForm, setExportForm] = useState<ExportOptions>({
    entityType: 'contacts',
    format: 'csv',
  })

  useEffect(() => {
    loadExports()
  }, [staff?.business_id])

  async function loadExports() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      const data = await getUserExports(50)
      setExports(data as ExportRecord[])
    } catch (e) {
      console.error('Failed to load exports:', e)
    } finally {
      setLoading(false)
    }
  }

  // Fetch data for export
  async function fetchExportData(entityType: string): Promise<Record<string, any>[]> {
    if (!staff?.business_id) return []
    
    const entityOption = ENTITY_OPTIONS.find(e => e.value === entityType)
    if (!entityOption?.table) return []

    try {
      const { data, error } = await supabase
        .from(entityOption.table)
        .select('*')
        .eq('business_id', staff.business_id)
        .limit(10000)

      if (error) throw error
      return data || []
    } catch (e) {
      console.error('Failed to fetch data:', e)
      return []
    }
  }

  // Handle download of completed export
  async function handleDownload(exportRecord: ExportRecord) {
    if (!staff?.business_id) return
    
    // Fetch fresh data for download
    const data = await fetchExportData(exportRecord.entity_type)
    
    if (data.length === 0) {
      alert('No data to export')
      return
    }

    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `${exportRecord.entity_type}_export_${timestamp}`
    
    if (exportRecord.export_type === 'csv') {
      const csv = convertToCSV(data)
      downloadFile(csv, `${filename}.csv`, 'text/csv')
    } else if (exportRecord.export_type === 'json') {
      const json = JSON.stringify(data, null, 2)
      downloadFile(json, `${filename}.json`, 'application/json')
    }
  }

  async function handleExport() {
    if (!staff?.business_id) return
    setExporting(true)

    try {
      // Create export record
      const { data, error } = await supabase
        .from('data_exports')
        .insert({
          business_id: staff.business_id,
          user_id: staff.user_id,
          export_type: exportForm.format,
          entity_type: exportForm.entityType,
          filters: exportForm.filters || {},
          status: 'processing',
        })
        .select('id')
        .single()

      if (error) throw error

      // Fetch the actual data
      const exportData = await fetchExportData(exportForm.entityType)
      
      // Update record with results
      const timestamp = new Date().toISOString().split('T')[0]
      const filename = `${exportForm.entityType}_export_${timestamp}`
      
      await supabase
        .from('data_exports')
        .update({
          status: 'completed',
          file_name: `${filename}.${exportForm.format}`,
          record_count: exportData.length,
          completed_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', data.id)

      // Auto-download for CSV/JSON
      if (exportForm.format === 'csv') {
        const csv = convertToCSV(exportData)
        downloadFile(csv, `${filename}.csv`, 'text/csv')
      } else if (exportForm.format === 'json') {
        const json = JSON.stringify(exportData, null, 2)
        downloadFile(json, `${filename}.json`, 'application/json')
      }

      setShowModal(false)
      loadExports()
    } catch (e) {
      console.error('Export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  const formatIcons: Record<string, any> = {
    csv: FileSpreadsheet,
    excel: FileSpreadsheet,
    json: FileJson,
    pdf: File,
  }

  const statusConfig: Record<string, { icon: any; color: string; text: string }> = {
    pending: { icon: Clock, color: 'text-amber-500 bg-amber-50', text: 'Pending' },
    processing: { icon: RefreshCw, color: 'text-blue-500 bg-blue-50', text: 'Processing' },
    completed: { icon: CheckCircle, color: 'text-green-500 bg-green-50', text: 'Completed' },
    failed: { icon: XCircle, color: 'text-red-500 bg-red-50', text: 'Failed' },
  }

  return (
    <div className="max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Download size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Data Export</h1>
            <p className="text-sm text-black">Export your data in various formats</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm"
        >
          <Plus size={16} />
          New Export
        </button>
      </div>

      {/* Quick Export Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {ENTITY_OPTIONS.slice(0, 4).map((entity) => (
          <button
            key={entity.value}
            onClick={() => {
              setExportForm({ ...exportForm, entityType: entity.value })
              setShowModal(true)
            }}
            className="p-4 bg-white rounded-xl hover:shadow-lg transition text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
              <DownloadCloud size={20} className="text-emerald-500" />
            </div>
            <div className="font-medium text-sm">{entity.label}</div>
            <div className="text-xs text-black mt-1">Quick export</div>
          </button>
        ))}
      </div>

      {/* Recent Exports */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        <div className="p-4 border-b border-black/[0.06]">
          <h2 className="font-semibold">Recent Exports</h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-black">
            <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
            Loading exports...
          </div>
        ) : exports.length === 0 ? (
          <div className="p-12 text-center text-black">
            <Download size={32} className="mx-auto mb-2" />
            <p>No exports yet</p>
            <p className="text-sm mt-1">Create your first export to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {exports.map((exp) => {
              const Icon = formatIcons[exp.export_type] || FileText
              const status = statusConfig[exp.status] || statusConfig.pending

              return (
                <div key={exp.id} className="p-4 hover:bg-black/10 transition">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                      <Icon size={24} className="text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{exp.entity_type}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${status.color}`}>
                          <status.icon size={12} className={exp.status === 'processing' ? 'animate-spin' : ''} />
                          {status.text}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-black">
                        <span className="uppercase">{exp.export_type}</span>
                        <span>•</span>
                        <span>{exp.record_count?.toLocaleString() || 0} records</span>
                        <span>•</span>
                        <span>{new Date(exp.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      {exp.status === 'completed' && (
                        <button 
                          onClick={() => handleDownload(exp)}
                          className="px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm flex items-center gap-2 hover:bg-[var(--av-primary, #4285F4)]/90 transition"
                        >
                          <Download size={16} />
                          Download
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Export Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="text-xl font-bold">Export Data</h2>
              <p className="text-sm text-black mt-1">Select what you want to export</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Entity Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">What to Export</label>
                <select
                  value={exportForm.entityType}
                  onChange={(e) => setExportForm({ ...exportForm, entityType: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                >
                  {ENTITY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Export Format</label>
                <div className="grid grid-cols-2 gap-3">
                  {FORMAT_OPTIONS.map(format => {
                    const Icon = format.icon
                    const isSelected = exportForm.format === format.value
                    return (
                      <button
                        key={format.value}
                        onClick={() => setExportForm({ ...exportForm, format: format.value as ExportOptions['format'] })}
                        className={`p-4 rounded-xl border-2 text-left transition ${
                          isSelected 
                            ? 'border-[var(--av-primary, #4285F4)] bg-[var(--av-primary, #4285F4)]/5' 
                            : 'border-black/10 hover:border-black/20'
                        }`}
                      >
                        <Icon size={24} className={isSelected ? 'text-[var(--av-primary, #4285F4)]' : 'text-black'} />
                        <div className="font-medium mt-2">{format.label}</div>
                        <div className="text-xs text-black mt-1">{format.desc}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Note */}
              <div className="p-4 bg-amber-50 rounded-xl">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Exports are stored for 7 days. Large exports may take a few minutes to process.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-black/[0.06] flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--av-primary, #4285F4)] text-white font-medium flex items-center justify-center gap-2"
              >
                {exporting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Export
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
