// Leads Management Page
// Internal page for sales team to manage leads

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { convertLeadToContact, getLeadStats, LEAD_SOURCES, PRODUCT_INTERESTS } from '../lib/crm'
import { useToast } from '../components/Toast'
import { 
  Search, Filter, UserPlus, Phone, Mail, Building2, 
  ChevronDown, ChevronRight, CheckCircle2, XCircle, 
  MoreHorizontal, ArrowRight, Users, TrendingUp, Clock
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
  new: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: Clock },
  contacted: { label: 'Contacted', color: 'bg-amber-100 text-amber-700', icon: Phone },
  qualified: { label: 'Qualified', color: 'bg-purple-100 text-purple-700', icon: CheckCircle2 },
  converted: { label: 'Converted', color: 'bg-green-100 text-green-700', icon: TrendingUp },
  lost: { label: 'Lost', color: 'bg-gray-100 text-gray-700', icon: XCircle },
}

export default function LeadsPage() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  
  const [leads, setLeads] = useState<Lead[]>([])
  const [staffMembers, setStaffMembers] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [expandedLeads, setExpandedLeads] = useState<Set<string>>(new Set())
  const [convertingLead, setConvertingLead] = useState<string | null>(null)
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    converted: 0,
    lost: 0,
  })

  // Fetch leads
  useEffect(() => {
    if (staff?.business_id) {
      fetchLeads()
      fetchStaff()
      fetchStats()
    }
  }, [staff?.business_id])

  async function fetchLeads() {
    if (!staff?.business_id) return
    
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setLeads(data || [])
    } catch (error) {
      console.error('Error fetching leads:', error)
      showToast('Failed to load leads', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function fetchStaff() {
    if (!staff?.business_id) return
    
    const { data } = await supabase
      .from('staff')
      .select('id, full_name')
      .eq('business_id', staff.business_id)
      .eq('active', true)
    
    setStaffMembers(data || [])
  }

  async function fetchStats() {
    if (!staff?.business_id) return
    const leadStats = await getLeadStats(staff.business_id)
    setStats(leadStats)
  }

  // Filter leads
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch = 
          lead.full_name.toLowerCase().includes(query) ||
          lead.email.toLowerCase().includes(query) ||
          lead.company_name?.toLowerCase().includes(query) ||
          lead.phone?.includes(query)
        if (!matchesSearch) return false
      }
      
      // Status filter
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false
      
      // Source filter
      if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false
      
      return true
    })
  }, [leads, searchQuery, statusFilter, sourceFilter])

  // Group leads by status
  const leadsByStatus = useMemo(() => {
    const groups: Record<string, Lead[]> = {
      new: [],
      contacted: [],
      qualified: [],
      converted: [],
      lost: [],
    }
    
    filteredLeads.forEach(lead => {
      if (groups[lead.status]) {
        groups[lead.status].push(lead)
      }
    })
    
    return groups
  }, [filteredLeads])

  // Toggle expanded
  function toggleExpanded(leadId: string) {
    const newExpanded = new Set(expandedLeads)
    if (newExpanded.has(leadId)) {
      newExpanded.delete(leadId)
    } else {
      newExpanded.add(leadId)
    }
    setExpandedLeads(newExpanded)
  }

  // Update lead status
  async function updateStatus(leadId: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('leads')
        .update({ 
          status: newStatus,
          contacted_at: newStatus === 'contacted' ? new Date().toISOString() : undefined,
        })
        .eq('id', leadId)

      if (error) throw error

      // Update local state
      setLeads(prev => prev.map(lead => 
        lead.id === leadId ? { ...lead, status: newStatus as Lead['status'] } : lead
      ))
      fetchStats()
      showToast('Status updated', 'success')
    } catch (error) {
      console.error('Error updating status:', error)
      showToast('Failed to update status', 'error')
    }
  }

  // Assign lead
  async function assignLead(leadId: string, staffId: string | null) {
    try {
      const { error } = await supabase
        .from('leads')
        .update({ assigned_to: staffId })
        .eq('id', leadId)

      if (error) throw error

      setLeads(prev => prev.map(lead => 
        lead.id === leadId ? { ...lead, assigned_to: staffId || undefined } : lead
      ))
      showToast('Lead assigned', 'success')
    } catch (error) {
      console.error('Error assigning lead:', error)
      showToast('Failed to assign lead', 'error')
    }
  }

  // Convert lead to contact
  async function handleConvert(lead: Lead) {
    if (!staff?.business_id) return

    setConvertingLead(lead.id)
    try {
      const result = await convertLeadToContact(lead, staff.business_id, staff.id)
      
      if (result.success) {
        // Update local state
        setLeads(prev => prev.map(l => 
          l.id === lead.id ? { ...l, status: 'converted' as const } : l
        ))
        fetchStats()
        showToast('Lead converted to contact!', 'success')
      } else {
        showToast(result.error || 'Failed to convert lead', 'error')
      }
    } catch (error) {
      console.error('Error converting lead:', error)
      showToast('Failed to convert lead', 'error')
    } finally {
      setConvertingLead(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Leads</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage and convert your sales leads
            </p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { key: 'total', label: 'Total', icon: Users, color: 'gray' },
            { key: 'new', label: 'New', icon: Clock, color: 'blue' },
            { key: 'contacted', label: 'Contacted', icon: Phone, color: 'amber' },
            { key: 'qualified', label: 'Qualified', icon: CheckCircle2, color: 'purple' },
            { key: 'converted', label: 'Converted', icon: TrendingUp, color: 'green' },
          ].map(({ key, label, icon: Icon, color }) => (
            <div key={key} className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg bg-${color}-100 flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 text-${color}-600`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats[key as keyof typeof stats]}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="p-4 flex flex-wrap gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="converted">Converted</option>
              <option value="lost">Lost</option>
            </select>

            {/* Source Filter */}
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Sources</option>
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="social">Social Media</option>
              <option value="ad">Advertisement</option>
              <option value="email">Email Campaign</option>
              <option value="phone">Phone Call</option>
              <option value="event">Event</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {/* Leads List */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading leads...</p>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="text-gray-500 mt-2">No leads found</p>
              <p className="text-sm text-gray-400">Try adjusting your filters</p>
            </div>
          ) : (
            filteredLeads.map((lead) => {
              const isExpanded = expandedLeads.has(lead.id)
              const statusConfig = STATUS_CONFIG[lead.status]
              const StatusIcon = statusConfig.icon
              
              return (
                <div key={lead.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Lead Row */}
                  <div 
                    className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleExpanded(lead.id)}
                  >
                    <button className="text-gray-400">
                      {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900 truncate">{lead.full_name}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${statusConfig.color}`}>
                          <StatusIcon className="w-3 h-3 inline mr-1" />
                          {statusConfig.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        {lead.company_name && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {lead.company_name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </span>
                        {lead.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {lead.phone}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right text-sm">
                      <p className="text-gray-500">
                        {LEAD_SOURCES[lead.source as keyof typeof LEAD_SOURCES]?.icon} {lead.source}
                      </p>
                      <p className="text-gray-400 text-xs">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Left Column */}
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Details</h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-500">Interested In:</span>
                                <span className="text-gray-900">
                                  {PRODUCT_INTERESTS[lead.interested_in as keyof typeof PRODUCT_INTERESTS]?.label || lead.interested_in || '-'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Source:</span>
                                <span className="text-gray-900">
                                  {LEAD_SOURCES[lead.source as keyof typeof LEAD_SOURCES]?.label || lead.source}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Created:</span>
                                <span className="text-gray-900">{new Date(lead.created_at).toLocaleString()}</span>
                              </div>
                              {lead.contacted_at && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Contacted:</span>
                                  <span className="text-gray-900">{new Date(lead.contacted_at).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {lead.message && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Message</h4>
                              <p className="text-sm text-gray-700 bg-white p-3 rounded-lg border border-gray-200">
                                {lead.message}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Right Column - Actions */}
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Assign To</h4>
                            <select
                              value={lead.assigned_to || ''}
                              onChange={(e) => assignLead(lead.id, e.target.value || null)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">Unassigned</option>
                              {staffMembers.map(member => (
                                <option key={member.id} value={member.id}>{member.full_name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Update Status</h4>
                            <div className="flex flex-wrap gap-2">
                              {(['new', 'contacted', 'qualified', 'converted', 'lost'] as const).map(status => {
                                const config = STATUS_CONFIG[status]
                                const isActive = lead.status === status
                                return (
                                  <button
                                    key={status}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (!isActive) updateStatus(lead.id, status)
                                    }}
                                    disabled={isActive}
                                    className={`px-3 py-1.5 text-xs rounded-lg border ${
                                      isActive 
                                        ? `${config.color} border-transparent` 
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}
                                  >
                                    {config.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {lead.status !== 'converted' && lead.status !== 'lost' && (
                            <div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleConvert(lead)
                                }}
                                disabled={convertingLead === lead.id}
                                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {convertingLead === lead.id ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Converting...
                                  </>
                                ) : (
                                  <>
                                    <ArrowRight className="w-4 h-4" />
                                    Convert to Contact
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
