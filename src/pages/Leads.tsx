// Leads Management Page
// Internal page for sales team to manage leads

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { convertLeadToContact, getLeadStats, LEAD_SOURCES, PRODUCT_INTERESTS } from '../lib/crm'
import { useToast } from '../components/Toast'
import DemandActionCentre from '../components/DemandActionCentre'
import { fetchDemandFunnel, type DemandFunnel } from '../lib/demand'
import { 
  Search, Filter, UserPlus, Phone, Mail, Building2, 
  ChevronDown, ChevronRight, CheckCircle2, XCircle, 
  MoreHorizontal, ArrowRight, Users, TrendingUp, Clock,
  Upload, Download
} from 'lucide-react'

interface Lead {
  id: string
  full_name: string
  company_name?: string
  email: string
  phone?: string
  source?: string
  interested_in?: string
  message?: string
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
  assigned_to?: string
  created_at: string
  contacted_at?: string
  converted_at?: string
}

interface Staff {
  id: string
  full_name: string
}

const STATUS_CONFIG = {
  new: { label: 'New', color: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]', icon: Clock },
  contacted: { label: 'Contacted', color: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]', icon: Phone },
  qualified: { label: 'Qualified', color: 'bg-purple-100 text-purple-700', icon: CheckCircle2 },
  converted: { label: 'Converted', color: 'bg-[var(--av-success-soft)] text-[var(--av-success)]', icon: TrendingUp },
  lost: { label: 'Lost', color: 'bg-[var(--av-surface-2)] text-[var(--av-text-secondary)]', icon: XCircle },
}

const CSV_HEADERS = ['full_name', 'email', 'phone', 'company_name', 'source', 'interested_in', 'message', 'status'] as const

function escapeCsv(value: unknown) {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++ }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      values.push(value.trim())
      value = ''
    } else value += char
  }
  values.push(value.trim())
  return values
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())
  if (!lines.length) return []
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim())
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])) as Record<string, string>
  })
}

export default function LeadsPage() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const importInputRef = useRef<HTMLInputElement>(null)
  
  const [leads, setLeads] = useState<Lead[]>([])
  const [staffMembers, setStaffMembers] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [expandedLeads, setExpandedLeads] = useState<Set<string>>(new Set())
  const [convertingLead, setConvertingLead] = useState<string | null>(null)
  const [funnel, setFunnel] = useState<DemandFunnel | null>(null)
  
  const [stats, setStats] = useState({ total: 0, new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 })

  useEffect(() => {
    if (staff?.business_id) {
      fetchLeads()
      fetchStaff()
      fetchStats()
      fetchDemandFunnel(staff.business_id).then((f) => {
        if (f && f.authorized !== false) setFunnel(f)
      })
    }
  }, [staff?.business_id])

  async function fetchLeads() {
    if (!staff?.business_id) return
    try {
      setLoading(true)
      const { data, error } = await supabase.from('leads').select('*').eq('business_id', staff.business_id).order('created_at', { ascending: false })
      if (error) throw error
      setLeads(data || [])
    } catch (error) {
      console.error('Error fetching leads:', error)
      showToast('Failed to load leads', 'error')
    } finally { setLoading(false) }
  }

  async function fetchStaff() {
    if (!staff?.business_id) return
    const { data } = await supabase.from('staff').select('id, full_name').eq('business_id', staff.business_id).eq('active', true)
    setStaffMembers(data || [])
  }

  async function fetchStats() {
    if (!staff?.business_id) return
    setStats(await getLeadStats(staff.business_id))
  }

  const filteredLeads = useMemo(() => leads.filter(lead => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matches = lead.full_name.toLowerCase().includes(query) || lead.email.toLowerCase().includes(query) || lead.company_name?.toLowerCase().includes(query) || lead.phone?.includes(query)
      if (!matches) return false
    }
    if (statusFilter !== 'all' && lead.status !== statusFilter) return false
    if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false
    return true
  }), [leads, searchQuery, statusFilter, sourceFilter])

  function toggleExpanded(leadId: string) {
    const next = new Set(expandedLeads)
    if (next.has(leadId)) next.delete(leadId); else next.add(leadId)
    setExpandedLeads(next)
  }

  async function updateStatus(leadId: string, newStatus: string) {
    try {
      const { error } = await supabase.from('leads').update({ status: newStatus, contacted_at: newStatus === 'contacted' ? new Date().toISOString() : undefined }).eq('id', leadId)
      if (error) throw error
      setLeads(prev => prev.map(lead => lead.id === leadId ? { ...lead, status: newStatus as Lead['status'] } : lead))
      fetchStats(); showToast('Status updated', 'success')
    } catch (error) { console.error('Error updating status:', error); showToast('Failed to update status', 'error') }
  }

  async function assignLead(leadId: string, staffId: string | null) {
    try {
      const { error } = await supabase.from('leads').update({ assigned_to: staffId }).eq('id', leadId)
      if (error) throw error
      setLeads(prev => prev.map(lead => lead.id === leadId ? { ...lead, assigned_to: staffId || undefined } : lead))
      showToast('Lead assigned', 'success')
    } catch (error) { console.error('Error assigning lead:', error); showToast('Failed to assign lead', 'error') }
  }

  async function handleConvert(lead: Lead) {
    if (!staff?.business_id) return
    setConvertingLead(lead.id)
    try {
      const result = await convertLeadToContact(lead, staff.business_id, staff.id)
      if (result.success) {
        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'converted' as const } : l))
        fetchStats(); showToast('Lead converted to contact!', 'success')
      } else showToast(result.error || 'Failed to convert lead', 'error')
    } catch (error) { console.error('Error converting lead:', error); showToast('Failed to convert lead', 'error') }
    finally { setConvertingLead(null) }
  }

  function exportLeads() {
    if (!filteredLeads.length) { showToast('There are no leads to export with the current filters', 'info'); return }
    const rows = filteredLeads.map(lead => CSV_HEADERS.map(header => escapeCsv(lead[header])))
    const csv = [CSV_HEADERS.join(','), ...rows.map(row => row.join(','))].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `avenize-leads-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
    showToast(`${filteredLeads.length} lead${filteredLeads.length === 1 ? '' : 's'} exported`, 'success')
  }

  async function importLeads(file: File) {
    if (!staff?.business_id) return
    setImporting(true)
    try {
      const rows = parseCsv(await file.text())
      if (!rows.length) throw new Error('The CSV file is empty')
      const validStatuses = new Set(['new', 'contacted', 'qualified', 'converted', 'lost'])
      const payload = rows.map((row, index) => ({
        business_id: staff.business_id,
        full_name: row.full_name?.trim(),
        email: row.email?.trim(),
        phone: row.phone?.trim() || null,
        company_name: row.company_name?.trim() || null,
        source: row.source?.trim() || 'other',
        interested_in: row.interested_in?.trim() || null,
        message: row.message?.trim() || null,
        status: validStatuses.has(row.status?.trim()) ? row.status.trim() : 'new',
      }))
      const invalid = payload.findIndex(row => !row.full_name || !row.email)
      if (invalid >= 0) throw new Error(`Row ${invalid + 2} must include full_name and email`)
      const { error } = await supabase.from('leads').insert(payload)
      if (error) throw error
      await Promise.all([fetchLeads(), fetchStats()])
      showToast(`${payload.length} lead${payload.length === 1 ? '' : 's'} imported successfully`, 'success')
    } catch (error) {
      console.error('Error importing leads:', error)
      showToast(error instanceof Error ? error.message : 'Failed to import leads', 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  function downloadTemplate() {
    const csv = `${CSV_HEADERS.join(',')}\r\nJohn Doe,john@example.com,08000000000,Example Ltd,website,product,Interested in your service,new\r\n`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = 'avenize-leads-template.csv'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[var(--av-surface)] border-b border-[var(--av-border)] px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[var(--av-text)]">Leads</h1>
            <p className="text-sm text-[var(--av-text-muted)] mt-0.5">Manage and convert your sales leads</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) importLeads(file) }} />
            <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--av-border)] bg-[var(--av-surface-elevated)] text-sm font-medium text-[var(--av-text)] hover:bg-[var(--av-surface-2)]" title="Download CSV template">
              <Download className="w-4 h-4" /> Template
            </button>
            <button type="button" onClick={() => importInputRef.current?.click()} disabled={importing} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--av-border)] bg-[var(--av-surface-elevated)] text-sm font-medium text-[var(--av-text)] hover:bg-[var(--av-surface-2)] disabled:opacity-50">
              <Upload className="w-4 h-4" /> {importing ? 'Importing...' : 'Import Leads'}
            </button>
            <button type="button" onClick={exportLeads} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:opacity-90">
              <Download className="w-4 h-4" /> Export Leads
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { key: 'total', label: 'Total', icon: Users, color: 'gray' },
            { key: 'new', label: 'New', icon: Clock, color: 'blue' },
            { key: 'contacted', label: 'Contacted', icon: Phone, color: 'amber' },
            { key: 'qualified', label: 'Qualified', icon: CheckCircle2, color: 'purple' },
            { key: 'converted', label: 'Converted', icon: TrendingUp, color: 'green' },
          ].map(({ key, label, icon: Icon, color }) => (
            <div key={key} className="bg-[var(--av-surface-elevated)] rounded-xl p-4 border border-[var(--av-border)]">
              <div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-lg bg-${color}-100 flex items-center justify-center`}><Icon className={`w-5 h-5 text-${color}-600`} /></div><div><p className="text-2xl font-bold text-[var(--av-text)]">{stats[key as keyof typeof stats]}</p><p className="text-xs text-[var(--av-text-muted)]">{label}</p></div></div>
            </div>
          ))}
        </div>

        {funnel && (funnel.leads > 0 || funnel.requests > 0) && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--av-border)] bg-[var(--av-surface-elevated)] px-4 py-3">
            <span className="text-xs font-semibold uppercase text-[var(--av-text-muted)]">Funnel</span>
            <FunnelStep label="Leads" value={funnel.leads} /><FunnelArrow pct={funnel.request_from_lead_pct} />
            <FunnelStep label="Requests" value={funnel.requests} /><FunnelArrow pct={funnel.quote_from_request_pct} />
            <FunnelStep label="Quotes" value={funnel.quotes} /><FunnelArrow pct={funnel.order_from_quote_pct} />
            <FunnelStep label="Orders" value={funnel.orders} />
          </div>
        )}

        <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] mb-6">
          <div className="p-4 flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--av-text-disabled)]" /><input type="text" placeholder="Search leads..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="all">All Status</option><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="converted">Converted</option><option value="lost">Lost</option></select>
            <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="all">All Sources</option><option value="website">Website</option><option value="referral">Referral</option><option value="social">Social Media</option><option value="ad">Advertisement</option><option value="email">Email Campaign</option><option value="phone">Phone Call</option><option value="event">Event</option><option value="other">Other</option></select>
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] p-8 text-center"><div className="animate-spin w-8 h-8 border-2 border-[var(--av-primary)] border-t-transparent rounded-full mx-auto"></div><p className="text-[var(--av-text-muted)] mt-2">Loading leads...</p></div>
          ) : filteredLeads.length === 0 ? (
            <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] p-8 text-center"><Users className="w-12 h-12 text-[var(--av-text-disabled)] mx-auto" /><p className="text-[var(--av-text-muted)] mt-2">No leads found</p><p className="text-sm text-[var(--av-text-disabled)]">Try adjusting your filters</p></div>
          ) : filteredLeads.map(lead => {
            const isExpanded = expandedLeads.has(lead.id)
            const statusConfig = STATUS_CONFIG[lead.status]
            const StatusIcon = statusConfig.icon
            return (
              <div key={lead.id} className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] overflow-hidden">
                <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50" onClick={() => toggleExpanded(lead.id)}>
                  <button className="text-[var(--av-text-disabled)]">{isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}</button>
                  <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><h3 className="font-medium text-[var(--av-text)] truncate">{lead.full_name}</h3><span className={`px-2 py-0.5 text-xs rounded-full ${statusConfig.color}`}><StatusIcon className="w-3 h-3 inline mr-1" />{statusConfig.label}</span></div><div className="flex items-center gap-4 mt-1 text-sm text-[var(--av-text-muted)]">{lead.company_name && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{lead.company_name}</span>}<span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>{lead.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}</div></div>
                  <div className="text-right text-sm"><p className="text-[var(--av-text-muted)]">{LEAD_SOURCES[lead.source as keyof typeof LEAD_SOURCES]?.icon} {lead.source}</p><p className="text-[var(--av-text-disabled)] text-xs">{new Date(lead.created_at).toLocaleDateString()}</p></div>
                </div>
                {isExpanded && <div className="border-t border-[var(--av-border)] p-4 bg-gray-50"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="space-y-4"><div><h4 className="text-xs font-medium text-[var(--av-text-muted)] uppercase mb-2">Details</h4><div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-[var(--av-text-muted)]">Interested In:</span><span className="text-[var(--av-text)]">{PRODUCT_INTERESTS[lead.interested_in as keyof typeof PRODUCT_INTERESTS]?.label || lead.interested_in || '-'}</span></div><div className="flex justify-between"><span className="text-[var(--av-text-muted)]">Source:</span><span className="text-[var(--av-text)]">{LEAD_SOURCES[lead.source as keyof typeof LEAD_SOURCES]?.label || lead.source}</span></div><div className="flex justify-between"><span className="text-[var(--av-text-muted)]">Created:</span><span className="text-[var(--av-text)]">{new Date(lead.created_at).toLocaleString()}</span></div>{lead.contacted_at && <div className="flex justify-between"><span className="text-[var(--av-text-muted)]">Contacted:</span><span className="text-[var(--av-text)]">{new Date(lead.contacted_at).toLocaleString()}</span></div>}</div></div>{lead.message && <div><h4 className="text-xs font-medium text-[var(--av-text-muted)] uppercase mb-2">Message</h4><p className="text-sm text-[var(--av-text-secondary)] bg-[var(--av-surface)] p-3 rounded-lg border border-[var(--av-border)]">{lead.message}</p></div>}</div>
                  <div className="space-y-4"><div><h4 className="text-xs font-medium text-[var(--av-text-muted)] uppercase mb-2">Assign To</h4><select value={lead.assigned_to || ''} onChange={e => assignLead(lead.id, e.target.value || null)} className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" onClick={e => e.stopPropagation()}><option value="">Unassigned</option>{staffMembers.map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></div><div><h4 className="text-xs font-medium text-[var(--av-text-muted)] uppercase mb-2">Update Status</h4><div className="flex flex-wrap gap-2">{(['new', 'contacted', 'qualified', 'converted', 'lost'] as const).map(status => { const config = STATUS_CONFIG[status]; const isActive = lead.status === status; return <button key={status} onClick={e => { e.stopPropagation(); if (!isActive) updateStatus(lead.id, status) }} disabled={isActive} className={`px-3 py-1.5 text-xs rounded-lg border ${isActive ? `${config.color} border-transparent` : 'bg-[var(--av-surface)] border-[var(--av-border)] text-[var(--av-text-muted)] hover:border-[var(--av-border-strong)]'}`}>{config.label}</button> })}</div></div>{lead.status !== 'converted' && lead.status !== 'lost' && <div><button onClick={e => { e.stopPropagation(); handleConvert(lead) }} disabled={convertingLead === lead.id} className="w-full px-4 py-2 bg-[var(--av-success)] text-white rounded-lg text-sm font-medium hover:bg-[var(--av-success)] disabled:opacity-50 flex items-center justify-center gap-2">{convertingLead === lead.id ? <><div className="w-4 h-4 border-2 border-[var(--av-surface)] border-t-transparent rounded-full animate-spin"></div>Converting...</> : <><ArrowRight className="w-4 h-4" />Convert to Contact</>}</button></div>}</div></div><div className="mt-4" onClick={e => e.stopPropagation()}><DemandActionCentre leadId={lead.id} leadName={lead.full_name} onToast={(msg, type) => showToast(msg, type)} /></div></div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FunnelStep({ label, value }: { label: string; value: number }) {
  return <span className="flex items-center gap-1.5"><span className="text-base font-bold text-[var(--av-text)]">{value}</span><span className="text-xs text-[var(--av-text-muted)]">{label}</span></span>
}

function FunnelArrow({ pct }: { pct: number | null }) {
  return <span className="flex items-center gap-1 text-xs text-[var(--av-text-disabled)]"><ChevronRight className="w-3.5 h-3.5" />{pct == null ? '—' : `${pct}%`}</span>
}
