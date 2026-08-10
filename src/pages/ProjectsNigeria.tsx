// ============================================
// PROJECTS PAGE - NIGERIAN CONSTRUCTION/REAL ESTATE/MANUFACTURING
// Based on client spec: Three-Thing Philosophy
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import {
  Plus, Search, Filter, MoreVertical, MapPin, Users, Clock,
  AlertTriangle, CheckCircle2, DollarSign, Package, Wrench,
  Home, Factory, ArrowRight, Camera, Phone, MessageSquare,
  ChevronDown, ChevronUp, Edit2, Trash2, FileText, Eye,
  Settings
} from 'lucide-react'
import { Link } from 'react-router-dom'

// Nigerian Construction Pipeline
type PipelineStage = 
  | 'enquiry' 
  | 'quoted' 
  | 'approved' 
  | 'materials_allocated' 
  | 'in_progress' 
  | 'inspection' 
  | 'completed' 
  | 'invoiced' 
  | 'paid'

interface Job {
  id: string
  job_number: string
  title: string
  client_name: string
  client_phone: string
  client_email?: string
  type: string // References job_types.id
  stage: PipelineStage
  value: number // In Naira
  location?: string
  gps_lat?: number
  gps_lng?: number
  start_date?: string
  end_date?: string
  materials?: JobMaterial[]
  labor?: LaborEntry[]
  milestones?: Milestone[]
  communications?: Communication[]
  variations?: Variation[]
  created_at: string
  staff_id: string
  business_id: string
}

interface JobMaterial {
  id: string
  name: string
  quantity: number
  unit: string // sheets, liters, kg, bags, gallons
  allocated: number
  used: number
  cost: number
}

interface LaborEntry {
  id: string
  name: string
  role: string
  hours: number
  rate: number
}

interface Milestone {
  id: string
  title: string
  date: string
  status: 'pending' | 'completed' | 'overdue'
  notes?: string
  photos?: string[]
}

interface Communication {
  id: string
  date: string
  type: 'call' | 'whatsapp' | 'email' | 'sms'
  summary: string
  follow_up?: string
}

interface Variation {
  id: string
  description: string
  amount: number
  approved: boolean
  date: string
}

const PIPELINE_STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: 'enquiry', label: 'Enquiry', color: 'blue' },
  { key: 'quoted', label: 'Quoted', color: 'yellow' },
  { key: 'approved', label: 'Approved', color: 'blue' },
  { key: 'materials_allocated', label: 'Materials Ready', color: 'indigo' },
  { key: 'in_progress', label: 'In Progress', color: 'purple' },
  { key: 'inspection', label: 'Inspection', color: 'orange' },
  { key: 'completed', label: 'Completed', color: 'green' },
  { key: 'invoiced', label: 'Invoiced', color: 'cyan' },
  { key: 'paid', label: 'Paid', color: 'emerald' },
]

// Fallback labels for when job_types table doesn't have data yet
const JOB_TYPE_FALLBACK: Record<string, string> = {
  general: 'General',
  restoration: 'Restoration',
  real_estate: 'Real Estate',
  paint_production: 'Paint Production',
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function ProjectsNigeria() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | 'all'>('all')
  const [jobTypes, setJobTypes] = useState<{ id: string; label: string; color: string }[]>([])
  const [stageFilter, setStageFilter] = useState<PipelineStage | 'all'>('all')
  const [showNewJob, setShowNewJob] = useState(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  
  // New job form
  const [newJob, setNewJob] = useState({
    title: '',
    client_name: '',
    client_phone: '',
    client_email: '',
    type: 'general', // Will be UUID from job_types table once created
    location: '',
    estimated_value: 0,
    start_date: '',
    end_date: '',
  })

  // Load job types from database (configurable per business)
  const loadJobTypes = useCallback(async () => {
    if (!staff?.business_id) return

    try {
      const { data, error } = await supabase
        .from('job_types')
        .select('id, label, color')
        .eq('business_id', staff.business_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) {
        console.warn('job_types table not available, using fallback labels')
        return
      }

      if (data && data.length > 0) {
        setJobTypes(data)
      }
    } catch (err) {
      console.warn('Failed to load job types:', err)
    }
  }, [staff?.business_id])

  // Helper function to get job type label
  const getJobTypeLabel = (typeId: string): string => {
    const found = jobTypes.find(jt => jt.id === typeId)
    if (found) return found.label
    // Fallback to old hardcoded values
    return JOB_TYPE_FALLBACK[typeId] || typeId
  }

  // Helper function to get job type color
  const getJobTypeColor = (typeId: string): string => {
    const found = jobTypes.find(jt => jt.id === typeId)
    if (found) return found.color
    return '#6366F1' // Default indigo
  }

  // Helper function to get job type color classes for badges
  const getJobTypeColorClass = (typeId: string): string => {
    const color = getJobTypeColor(typeId)
    // Map colors to Tailwind bg/text classes
    const colorMap: Record<string, string> = {
      '#6366F1': 'bg-[#4285F4]/10 text-[#4285F4]', // indigo
      '#10B981': 'bg-green-100 text-green-700',   // green
      '#F59E0B': 'bg-amber-100 text-amber-700',  // amber
      '#8B5CF6': 'bg-purple-100 text-purple-700', // purple
      '#EF4444': 'bg-red-100 text-red-700',       // red
      '#3B82F6': 'bg-blue-100 text-blue-700',     // blue
    }
    return colorMap[color] || 'bg-white text-black'
  }

  const loadJobs = useCallback(async () => {
    if (!staff?.business_id) return
    
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setJobs((data as Job[]) ?? [])
    } catch (err) {
      console.error('Failed to load jobs:', err)
      showToast('Failed to load jobs', 'error')
    } finally {
      setLoading(false)
    }
  }, [staff?.business_id, showToast])

  useEffect(() => {
    loadJobTypes()
    loadJobs()
  }, [loadJobTypes, loadJobs])

  const createJob = async () => {
    if (!staff?.business_id || !staff?.id) return
    if (!newJob.title || !newJob.client_name) {
      showToast('Please fill required fields', 'error')
      return
    }

    try {
      const jobNumber = `JOB-${Date.now().toString().slice(-6)}`
      
      const { data, error } = await supabase
        .from('jobs')
        .insert({
          job_number: jobNumber,
          title: newJob.title,
          client_name: newJob.client_name,
          client_phone: newJob.client_phone,
          client_email: newJob.client_email,
          type: newJob.type,
          location: newJob.location,
          value: newJob.estimated_value,
          stage: 'enquiry',
          start_date: newJob.start_date,
          end_date: newJob.end_date,
          staff_id: staff.id,
          business_id: staff.business_id,
        })
        .select()
        .single()

      if (error) throw error

      setJobs(prev => [data as Job, ...prev])
      setShowNewJob(false)
      setNewJob({
        title: '', client_name: '', client_phone: '', client_email: '',
        type: 'general', location: '', estimated_value: 0, start_date: '', end_date: '',
      })
      showToast('Job created!', 'success')
    } catch (err) {
      console.error('Failed to create job:', err)
      showToast('Failed to create job', 'error')
    }
  }

  const updateJobStage = async (job: Job, newStage: PipelineStage) => {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ stage: newStage })
        .eq('id', job.id)

      if (error) throw error

      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, stage: newStage } : j))
      if (selectedJob?.id === job.id) {
        setSelectedJob(prev => prev ? { ...prev, stage: newStage } : null)
      }
      showToast(`Job moved to ${PIPELINE_STAGES.find(s => s.key === newStage)?.label}`, 'success')
    } catch (err) {
      console.error('Failed to update job:', err)
      showToast('Failed to update job', 'error')
    }
  }

  const deleteJob = async (id: string) => {
    if (!confirm('Delete this job?')) return
    
    try {
      const { error } = await supabase.from('jobs').delete().eq('id', id)
      if (error) throw error

      setJobs(prev => prev.filter(j => j.id !== id))
      if (selectedJob?.id === id) setSelectedJob(null)
      showToast('Job deleted', 'success')
    } catch (err) {
      console.error('Failed to delete job:', err)
      showToast('Failed to delete job', 'error')
    }
  }

  const filteredJobs = jobs.filter(job => {
    if (typeFilter !== 'all' && job.type !== typeFilter) return false
    if (stageFilter !== 'all' && job.stage !== stageFilter) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        job.title.toLowerCase().includes(query) ||
        job.client_name.toLowerCase().includes(query) ||
        job.job_number.toLowerCase().includes(query) ||
        job.location?.toLowerCase().includes(query)
      )
    }
    return true
  })

  // Stats
  const stats = {
    total: jobs.length,
    active: jobs.filter(j => ['in_progress', 'materials_allocated', 'inspection'].includes(j.stage)).length,
    value: jobs.reduce((sum, j) => sum + j.value, 0),
    overdue: jobs.filter(j => {
      if (!j.end_date) return false
      return new Date(j.end_date) < new Date() && j.stage !== 'paid'
    }).length,
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">Jobs & Projects</h1>
          <p className="text-sm text-black">Track projects, restoration, real estate, and paint production</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/app/settings/projects"
            className="p-2 hover:bg-black/[0.05] rounded-lg text-black"
            title="Project Settings"
          >
            <Settings size={18} />
          </Link>
          <button
            onClick={() => setShowNewJob(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
          >
            <Plus size={16} />
            New Job
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <p className="text-xs text-black mb-1">Total Jobs</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <p className="text-xs text-black mb-1">Active</p>
          <p className="text-2xl font-bold text-purple-600">{stats.active}</p>
        </div>
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <p className="text-xs text-black mb-1">Total Value</p>
          <p className="text-lg font-bold text-[var(--av-primary, #4285F4)]">{formatCurrency(stats.value)}</p>
        </div>
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <p className="text-xs text-black mb-1">Overdue</p>
          <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
        </div>
      </div>

      {/* Pipeline Kanban */}
      <div className="mb-6 overflow-x-auto">
        <h2 className="font-medium mb-3">Pipeline</h2>
        <div className="flex gap-2 min-w-max pb-2">
          {PIPELINE_STAGES.map((stage) => {
            const count = jobs.filter(j => j.stage === stage.key).length
            return (
              <button
                key={stage.key}
                onClick={() => setStageFilter(stageFilter === stage.key ? 'all' : stage.key)}
                className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  stageFilter === stage.key
                    ? 'avenize-gradient text-white'
                    : 'bg-white text-black hover:bg-white'
                }`}
              >
                {stage.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search jobs, clients..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/10 text-sm bg-white"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-black/10 text-sm bg-white"
        >
          <option value="all">All Types</option>
          {jobTypes.length > 0 ? (
            jobTypes.map(jt => (
              <option key={jt.id} value={jt.id}>{jt.label}</option>
            ))
          ) : (
            // Fallback options
            <>
              <option value="general">General</option>
              <option value="restoration">Restoration</option>
              <option value="real_estate">Real Estate</option>
              <option value="paint_production">Paint Production</option>
            </>
          )}
        </select>
      </div>

      {/* Jobs List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-black/[0.06] p-4 animate-pulse">
              <div className="h-5 bg-black/10 rounded w-1/3 mb-2" />
              <div className="h-4 bg-black/10 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-[var(--av-primary, #4285F4)]/10 flex items-center justify-center mx-auto mb-4">
            <Wrench size={24} className="text-[var(--av-primary, #4285F4)]" />
          </div>
          <h3 className="font-semibold mb-2">No jobs found</h3>
          <p className="text-sm text-black mb-4">
            {searchQuery || typeFilter !== 'all' || stageFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create your first job to get started'}
          </p>
          {!searchQuery && typeFilter === 'all' && stageFilter === 'all' && (
            <button
              onClick={() => setShowNewJob(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl avenize-gradient text-white font-medium"
            >
              <Plus size={16} />
              Create Job
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="bg-white rounded-xl border border-black/[0.06] p-4 hover:border-[var(--av-primary, #4285F4)]/20 transition-colors cursor-pointer"
              onClick={() => setSelectedJob(job)}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-black">{job.job_number}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getJobTypeColorClass(job.type)}`}>
                      {getJobTypeLabel(job.type)}
                    </span>
                  </div>
                  <h3 className="font-medium">{job.title}</h3>
                  <p className="text-sm text-black">{job.client_name}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-[var(--av-primary, #4285F4)]">{formatCurrency(job.value)}</p>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mt-1 ${
                    PIPELINE_STAGES.find(s => s.key === job.stage)?.color === 'green' ? 'bg-green-100 text-green-700' :
                    PIPELINE_STAGES.find(s => s.key === job.stage)?.color === 'red' ? 'bg-red-100 text-red-700' :
                    PIPELINE_STAGES.find(s => s.key === job.stage)?.color === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-white text-black'
                  }`}>
                    {PIPELINE_STAGES.find(s => s.key === job.stage)?.label}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-xs text-black mt-3 pt-3 border-t border-black/5">
                {job.location && (
                  <span className="flex items-center gap-1">
                    <MapPin size={12} />
                    {job.location}
                  </span>
                )}
                {job.end_date && (
                  <span className={`flex items-center gap-1 ${
                    new Date(job.end_date) < new Date() && job.stage !== 'paid' ? 'text-red-600' : ''
                  }`}>
                    <Clock size={12} />
                    Due: {new Date(job.end_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Job Modal */}
      {showNewJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <h2 className="font-semibold">New Job</h2>
              <button onClick={() => setShowNewJob(false)} className="p-2 hover:bg-black/[0.05] rounded-lg">×</button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Job Type</label>
                <select
                  value={newJob.type}
                  onChange={(e) => setNewJob(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                >
                  {jobTypes.length > 0 ? (
                    jobTypes.map(jt => (
                      <option key={jt.id} value={jt.id}>{jt.label}</option>
                    ))
                  ) : (
                    // Fallback options
                    <>
                      <option value="general">General</option>
                      <option value="restoration">Restoration</option>
                      <option value="real_estate">Real Estate</option>
                      <option value="paint_production">Paint Production</option>
                    </>
                  )}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Job Title *</label>
                <input
                  type="text"
                  value={newJob.title}
                  onChange={(e) => setNewJob(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Roof replacement at 15 Admiralty Way"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Client Name *</label>
                <input
                  type="text"
                  value={newJob.client_name}
                  onChange={(e) => setNewJob(prev => ({ ...prev, client_name: e.target.value }))}
                  placeholder="Client or company name"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newJob.client_phone}
                    onChange={(e) => setNewJob(prev => ({ ...prev, client_phone: e.target.value }))}
                    placeholder="080XXXXXXXX"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={newJob.client_email}
                    onChange={(e) => setNewJob(prev => ({ ...prev, client_email: e.target.value }))}
                    placeholder="client@email.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <input
                  type="text"
                  value={newJob.location}
                  onChange={(e) => setNewJob(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="Site address"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Estimated Value (₦)</label>
                  <input
                    type="number"
                    value={newJob.estimated_value || ''}
                    onChange={(e) => setNewJob(prev => ({ ...prev, estimated_value: Number(e.target.value) }))}
                    placeholder="0"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Date</label>
                  <input
                    type="date"
                    value={newJob.end_date}
                    onChange={(e) => setNewJob(prev => ({ ...prev, end_date: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowNewJob(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-black/10 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={createJob}
                  className="flex-1 px-4 py-2.5 rounded-xl avenize-gradient text-white font-medium"
                >
                  Create Job
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-12 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl mb-8">
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <div>
                <span className="text-xs font-mono text-black">{selectedJob.job_number}</span>
                <h2 className="font-semibold text-lg">{selectedJob.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => deleteJob(selectedJob.id)}
                  className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="p-2 hover:bg-black/[0.05] rounded-lg"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-4">
              {/* Client Info */}
              <div className="bg-white rounded-xl p-4 mb-4">
                <h3 className="font-medium mb-2">Client</h3>
                <p className="font-medium">{selectedJob.client_name}</p>
                {selectedJob.client_phone && (
                  <p className="text-sm text-black/60 flex items-center gap-1">
                    <Phone size={14} />
                    {selectedJob.client_phone}
                  </p>
                )}
              </div>

              {/* Stage Pipeline */}
              <div className="mb-4">
                <h3 className="font-medium mb-2">Pipeline</h3>
                <div className="flex flex-wrap gap-2">
                  {PIPELINE_STAGES.map((stage, index) => {
                    const currentIndex = PIPELINE_STAGES.findIndex(s => s.key === selectedJob.stage)
                    const thisIndex = index
                    const isComplete = thisIndex <= currentIndex
                    const isCurrent = stage.key === selectedJob.stage
                    
                    return (
                      <button
                        key={stage.key}
                        onClick={() => updateJobStage(selectedJob, stage.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isCurrent
                            ? 'avenize-gradient text-white'
                            : isComplete
                            ? 'bg-green-100 text-green-700'
                            : 'bg-white text-black'
                        }`}
                      >
                        {stage.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Job Details */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white rounded-xl p-3">
                  <p className="text-xs text-black">Value</p>
                  <p className="font-semibold text-[var(--av-primary, #4285F4)]">{formatCurrency(selectedJob.value)}</p>
                </div>
                <div className="bg-white rounded-xl p-3">
                  <p className="text-xs text-black">Type</p>
                  <p className="font-medium">{getJobTypeLabel(selectedJob.type)}</p>
                </div>
                {selectedJob.location && (
                  <div className="bg-white rounded-xl p-3 col-span-2">
                    <p className="text-xs text-black">Location</p>
                    <p className="font-medium flex items-center gap-1">
                      <MapPin size={14} />
                      {selectedJob.location}
                    </p>
                  </div>
                )}
                {selectedJob.end_date && (
                  <div className="bg-white rounded-xl p-3">
                    <p className="text-xs text-black">Due Date</p>
                    <p className={`font-medium ${
                      new Date(selectedJob.end_date) < new Date() && selectedJob.stage !== 'paid'
                        ? 'text-red-600'
                        : ''
                    }`}>
                      {new Date(selectedJob.end_date).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
