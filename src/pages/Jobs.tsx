// ============================================
// JOBS PAGE - Field Service Management
// Core module for Nigerian field-service businesses
// ============================================

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import LoadingSkeleton from '../components/LoadingSkeleton'
import {
  Wrench, Hammer, Settings, Search, Plus, MapPin, Clock,
  Phone, Mail, MessageSquare, CheckCircle2, AlertCircle,
  User, ChevronRight, X, Loader2, Camera, Filter,
  MoreVertical, Truck, Edit3, Trash2, UserCheck,
  Calendar, ArrowRight, Send, Star, FilterX
} from 'lucide-react'

type JobStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
type JobPriority = 'low' | 'medium' | 'high' | 'urgent'

interface Job {
  id: string
  title: string
  description?: string | null
  client_name?: string | null
  client_phone?: string | null
  client_email?: string | null
  client_address?: string | null
  job_type: string
  status: JobStatus
  priority: JobPriority
  assigned_to?: string | null
  assigned_name?: string
  location_text?: string | null
  due_date?: string | null
  completed_at?: string | null
  estimated_hours?: number | null
  notes?: string
  tags?: string[]
  created_at: string
  updated_at: string
}

interface JobUpdate {
  id: string
  type: string
  content?: string | null
  photo_url?: string | null
  staff_name?: string
  created_at: string
}

interface StaffMember {
  id: string
  full_name: string
  role: string
}

const STATUS_CONFIG: Record<JobStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending: {
    label: 'Pending',
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200',
    icon: <Clock size={14} />,
  },
  assigned: {
    label: 'Assigned',
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
    icon: <UserCheck size={14} />,
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50 border-indigo-200',
    icon: <Settings size={14} />,
  },
  completed: {
    label: 'Completed',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 border-emerald-200',
    icon: <CheckCircle2 size={14} />,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'text-gray-500',
    bg: 'bg-gray-50 border-gray-200',
    icon: <X size={14} />,
  },
}

const PRIORITY_CONFIG: Record<JobPriority, { label: string; color: string; dot: string }> = {
  low: { label: 'Low', color: 'text-gray-400', dot: 'bg-gray-300' },
  medium: { label: 'Medium', color: 'text-blue-600', dot: 'bg-blue-400' },
  high: { label: 'High', color: 'text-orange-600', dot: 'bg-orange-400' },
  urgent: { label: 'Urgent', color: 'text-red-600', dot: 'bg-red-500' },
}

const JOB_TYPE_ICONS: Record<string, React.ReactNode> = {
  'Installation': <Wrench size={14} />,
  'Repair': <Hammer size={14} />,
  'Maintenance': <Settings size={14} />,
  'Inspection': <Search size={14} />,
  'Delivery': <Truck size={14} />,
  'Consultation': <MessageSquare size={14} />,
  'general': <Star size={14} />,
}

const FILTER_TABS = [
  { id: 'all', label: 'All Jobs' },
  { id: 'pending', label: 'Pending' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
]

// Demo jobs for demo mode
const DEMO_JOBS: Job[] = [
  {
    id: '1', title: 'AC Installation at Lekki Villa', description: 'Install 3-unit split AC in 4-bedroom duplex',
    client_name: 'Chief Adebayo', client_phone: '08031234567', client_address: '15 Lekki Phase 1, Lagos',
    job_type: 'Installation', status: 'in_progress', priority: 'high',
    assigned_to: 'demo-staff-1', assigned_name: 'Tunde Bakare',
    location_text: 'Lekki Phase 1', due_date: new Date(Date.now() + 86400000).toISOString(),
    completed_at: null, estimated_hours: 8, created_at: new Date(Date.now() - 172800000).toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: '2', title: 'Generator Repair — Ikoyi Office', description: 'Fix startup issue on 50kVA generator',
    client_name: 'Nexus Finance Ltd', client_phone: '08099876543', client_address: '23 Bourdillon Road, Ikoyi',
    job_type: 'Repair', status: 'pending', priority: 'urgent',
    assigned_to: null, location_text: 'Ikoyi', due_date: new Date(Date.now() + 43200000).toISOString(),
    completed_at: null, estimated_hours: 4, created_at: new Date(Date.now() - 86400000).toISOString(), updated_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: '3', title: 'Quarterly Maintenance — VI Restaurant', description: 'Preventive maintenance for 5 AC units',
    client_name: 'Taste of Lagos Restaurant', client_phone: '08055512345', client_address: '8 Adeola Odeku, Victoria Island',
    job_type: 'Maintenance', status: 'completed', priority: 'medium',
    assigned_to: 'demo-staff-2', assigned_name: 'Chidi Eze',
    location_text: 'Victoria Island', due_date: new Date(Date.now() - 43200000).toISOString(),
    completed_at: new Date(Date.now() - 43200000).toISOString(), estimated_hours: 3, created_at: new Date(Date.now() - 604800000).toISOString(), updated_at: new Date(Date.now() - 43200000).toISOString(),
  },
  {
    id: '4', title: 'Solar Inverter Installation — Ikeja GRA', description: 'Install 5kVA solar system with 8 batteries',
    client_name: 'Dr. Ngozi Okonkwo', client_phone: '08077788899', client_address: '5 Omole Phase 2, Ikeja',
    job_type: 'Installation', status: 'assigned', priority: 'high',
    assigned_to: 'demo-staff-1', assigned_name: 'Tunde Bakare',
    location_text: 'Ikeja GRA', due_date: new Date(Date.now() + 259200000).toISOString(),
    completed_at: null, estimated_hours: 12, created_at: new Date(Date.now() - 259200000).toISOString(), updated_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: '5', title: 'Fire Alarm Inspection — Surulere', description: 'Annual inspection of fire alarm system',
    client_name: 'City Mall', client_phone: '08044455566', client_address: '1 City Mall, Surulere',
    job_type: 'Inspection', status: 'pending', priority: 'medium',
    assigned_to: null, location_text: 'Surulere', due_date: new Date(Date.now() + 604800000).toISOString(),
    completed_at: null, estimated_hours: 2, created_at: new Date(Date.now() - 172800000).toISOString(), updated_at: new Date(Date.now() - 172800000).toISOString(),
  },
]

// ============================================
// MAIN COMPONENT
// ============================================
export default function Jobs() {
  const { staff, isDemo } = useAuth()
  const businessId = staff?.business_id
  const { showToast } = useToast()

  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [updates, setUpdates] = useState<JobUpdate[]>([])
  const [newUpdate, setNewUpdate] = useState('')
  const [addingUpdate, setAddingUpdate] = useState(false)

  useEffect(() => {
    if (!businessId && !isDemo) return
    loadJobs()
    loadStaff()
  }, [businessId, isDemo])

  const loadJobs = async () => {
    if (isDemo) {
      setJobs(DEMO_JOBS)
      setLoading(false)
      return
    }
    if (!businessId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select(`*, assigned_staff:assigned_to(full_name)`)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
      if (error) throw error
      const mapped = (data || []).map((j: any) => ({
        ...j,
        assigned_name: j.assigned_staff?.full_name,
      }))
      setJobs(mapped)
    } catch (err) {
      console.error('Error loading jobs:', err)
      showToast('Failed to load jobs', 'error')
      setJobs(DEMO_JOBS)
    }
    setLoading(false)
  }

  const loadStaff = async () => {
    if (!businessId) return
    const { data } = await supabase
      .from('staff')
      .select('id, full_name, role')
      .eq('business_id', businessId)
      .eq('active', true)
    setStaffList(data || [])
  }

  const loadUpdates = async (jobId: string) => {
    if (isDemo) {
      setUpdates([
        { id: '1', type: 'update', content: 'Arrived on site, beginning assessment', staff_name: 'Tunde Bakare', created_at: new Date(Date.now() - 3600000).toISOString() },
        { id: '2', type: 'photo', content: 'Existing wiring inspected — needs upgrade before AC install', photo_url: null, staff_name: 'Tunde Bakare', created_at: new Date(Date.now() - 1800000).toISOString() },
        { id: '3', type: 'status_change', content: 'Status changed to In Progress', staff_name: 'Tunde Bakare', created_at: new Date(Date.now() - 900000).toISOString() },
      ])
      return
    }
    const { data } = await supabase
      .from('job_updates')
      .select('*, staff:staff_id(full_name)')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })
    setUpdates((data || []).map((u: any) => ({ ...u, staff_name: u.staff?.full_name })))
  }

  const filteredJobs = jobs.filter(j => {
    if (filter !== 'all' && j.status !== filter) return false
    if (search && !j.title.toLowerCase().includes(search.toLowerCase()) &&
        !j.client_name?.toLowerCase().includes(search.toLowerCase()) &&
        !j.location_text?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const stats = {
    total: jobs.length,
    pending: jobs.filter(j => j.status === 'pending').length,
    inProgress: jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    urgent: jobs.filter(j => j.priority === 'urgent').length,
  }

  const handleOpenJob = async (job: Job) => {
    setSelectedJob(job)
    setShowDetailPanel(true)
    await loadUpdates(job.id)
  }

  const handleStatusChange = async (jobId: string, newStatus: JobStatus) => {
    if (isDemo) {
      setJobs(jobs.map(j => j.id === jobId ? { ...j, status: newStatus, updated_at: new Date().toISOString() } : j))
      setSelectedJob(selectedJob?.id === jobId ? { ...selectedJob!, status: newStatus, updated_at: new Date().toISOString() } : selectedJob)
      showToast(`Status updated to ${STATUS_CONFIG[newStatus].label}`, 'success')
      return
    }
    const { error } = await supabase.from('jobs').update({ status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null }).eq('id', jobId)
    if (error) { showToast('Failed to update status', 'error'); return }
    setJobs(jobs.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
    setSelectedJob(selectedJob?.id === jobId ? { ...selectedJob!, status: newStatus } : selectedJob)
    showToast(`Status updated to ${STATUS_CONFIG[newStatus].label}`, 'success')
  }

  const handleAssignJob = async (jobId: string, staffId: string) => {
    const staffMember = staffList.find(s => s.id === staffId)
    if (isDemo) {
      setJobs(jobs.map(j => j.id === jobId ? { ...j, assigned_to: staffId, assigned_name: staffMember?.full_name, status: 'assigned' } : j))
      setSelectedJob(selectedJob?.id === jobId ? { ...selectedJob!, assigned_to: staffId, assigned_name: staffMember?.full_name, status: 'assigned' } : selectedJob)
      showToast(`Assigned to ${staffMember?.full_name}`, 'success')
      return
    }
    const { error } = await supabase.from('jobs').update({ assigned_to: staffId, status: 'assigned' }).eq('id', jobId)
    if (error) { showToast('Failed to assign job', 'error'); return }
    setJobs(jobs.map(j => j.id === jobId ? { ...j, assigned_to: staffId, assigned_name: staffMember?.full_name, status: 'assigned' } : j))
    setSelectedJob(selectedJob?.id === jobId ? { ...selectedJob!, assigned_to: staffId, assigned_name: staffMember?.full_name, status: 'assigned' } : selectedJob)
    showToast(`Assigned to ${staffMember?.full_name}`, 'success')
  }

  const handleAddUpdate = async () => {
    if (!newUpdate.trim() || !selectedJob) return
    setAddingUpdate(true)
    if (isDemo) {
      const update: JobUpdate = { id: Date.now().toString(), type: 'update', content: newUpdate, staff_name: 'You', created_at: new Date().toISOString() }
      setUpdates([...updates, update])
      setNewUpdate('')
      setAddingUpdate(false)
      showToast('Update added', 'success')
      return
    }
    const { error } = await supabase.from('job_updates').insert({ job_id: selectedJob.id, staff_id: staff?.id, type: 'update', content: newUpdate })
    if (error) { showToast('Failed to add update', 'error'); setAddingUpdate(false); return }
    await loadUpdates(selectedJob.id)
    setNewUpdate('')
    setAddingUpdate(false)
    showToast('Update added', 'success')
  }

  const handleCreateJob = async (formData: Partial<Job>) => {
    if (!formData.title?.trim()) { showToast('Job title is required', 'error'); return }
    if (isDemo) {
      const newJob: Job = { id: Date.now().toString(), title: formData.title, description: formData.description || null, client_name: formData.client_name || null, client_phone: formData.client_phone || null, client_email: formData.client_email || null, client_address: formData.client_address || null, job_type: formData.job_type || 'general', status: 'pending', priority: (formData.priority as JobPriority) || 'medium', assigned_to: null, location_text: formData.location_text || null, due_date: formData.due_date || null, completed_at: null, estimated_hours: formData.estimated_hours || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      setJobs([newJob, ...jobs])
      setShowCreateModal(false)
      showToast('Job created', 'success')
      return
    }
    const { data, error } = await supabase.from('jobs').insert({ ...formData, business_id: businessId, created_by: staff?.id }).select().single()
    if (error) { showToast('Failed to create job', 'error'); return }
    await loadJobs()
    setShowCreateModal(false)
    showToast('Job created', 'success')
  }

  const formatDue = (dueDate: string | null | undefined) => {
    if (!dueDate) return null
    const date = new Date(dueDate)
    const now = new Date()
    const diff = date.getTime() - now.getTime()
    const days = Math.ceil(diff / 86400000)
    if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: 'text-red-600' }
    if (days === 0) return { label: 'Due today', color: 'text-orange-600' }
    if (days === 1) return { label: 'Due tomorrow', color: 'text-amber-600' }
    return { label: `Due in ${days}d`, color: 'text-gray-500' }
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--avenize-black)]">Jobs</h1>
          <p className="text-sm text-black/50">Field service management</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] text-white text-sm font-medium hover:bg-black/80 transition"
        >
          <Plus size={16} />
          New Job
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-700' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-600' },
          { label: 'In Progress', value: stats.inProgress, color: 'text-indigo-600' },
          { label: 'Completed', value: stats.completed, color: 'text-emerald-600' },
          { label: 'Urgent', value: stats.urgent, color: 'text-red-600' },
        ].map(s => (
          <button key={s.label} onClick={() => setFilter(filter === s.label.toLowerCase() ? 'all' : s.label.toLowerCase().replace('in progress', 'in_progress'))}
            className={`bg-white rounded-xl border border-black/6 p-3 text-center hover:border-black/12 transition ${filter === s.label.toLowerCase().replace('in progress', 'in_progress') ? 'border-black/20 bg-black/5' : ''}`}>
            <div className={`text-[20px] font-semibold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-black/40 mt-0.5">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs, client, location..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-black/6 text-sm focus:outline-none focus:border-black/20 transition"
          />
        </div>
        {filter !== 'all' && (
          <button onClick={() => setFilter('all')} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-black/5 text-xs font-medium text-black/50 hover:bg-black/10 transition">
            <FilterX size={14} /> Clear filter
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-3 mb-4 scrollbar-hide">
        {FILTER_TABS.map(tab => (
          <button key={tab.id} onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
              filter === tab.id ? 'bg-[#111111] text-white' : 'bg-white text-black/50 hover:bg-black/5 border border-black/6'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Jobs List */}
      {loading ? (
        <LoadingSkeleton type="card" count={5} />
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-black/5 flex items-center justify-center mx-auto mb-4">
            <Wrench size={24} className="text-black/20" />
          </div>
          <p className="text-black/40 text-sm font-medium">{search ? 'No jobs match your search' : filter !== 'all' ? `No ${filter.replace('_', ' ')} jobs` : 'No jobs yet'}</p>
          {!search && filter === 'all' && (
            <button onClick={() => setShowCreateModal(true)} className="mt-3 px-4 py-2 rounded-xl bg-[#111111] text-white text-sm font-medium">
              Create your first job
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredJobs.map(job => {
            const statusCfg = STATUS_CONFIG[job.status]
            const priorityCfg = PRIORITY_CONFIG[job.priority]
            const due = formatDue(job.due_date)
            return (
              <button key={job.id} onClick={() => handleOpenJob(job)}
                className="w-full text-left bg-white rounded-2xl border border-black/6 p-4 hover:border-black/12 hover:shadow-sm transition group">
                <div className="flex items-start gap-3">
                  {/* Job type icon */}
                  <div className="w-10 h-10 rounded-xl bg-black/5 flex items-center justify-center shrink-0 mt-0.5">
                    {JOB_TYPE_ICONS[job.job_type] || JOB_TYPE_ICONS['general']}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-medium text-[var(--avenize-black)] truncate group-hover:text-black">{job.title}</h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${statusCfg.bg} ${statusCfg.color}`}>
                          {statusCfg.icon} {statusCfg.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-black/40">
                      {job.client_name && <span>{job.client_name}</span>}
                      {job.location_text && <span className="flex items-center gap-1"><MapPin size={10} />{job.location_text}</span>}
                      {job.assigned_name && <span className="flex items-center gap-1"><User size={10} />{job.assigned_name}</span>}
                      <span className="ml-auto">{timeAgo(job.updated_at)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className={`flex items-center gap-1 text-xs ${priorityCfg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
                        {priorityCfg.label}
                      </span>
                      {due && <span className={`text-xs ${due.color}`}>{due.label}</span>}
                      {job.job_type !== 'general' && <span className="text-xs text-black/30">{job.job_type}</span>}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-black/20 shrink-0 mt-1" />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Job Detail Panel */}
      {showDetailPanel && selectedJob && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowDetailPanel(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-black/6 p-4 flex items-center justify-between z-10">
              <h2 className="text-base font-semibold">{selectedJob.title}</h2>
              <button onClick={() => setShowDetailPanel(false)} className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center hover:bg-black/10 transition">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-5">
              {/* Status + Priority */}
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border ${STATUS_CONFIG[selectedJob.status].bg} ${STATUS_CONFIG[selectedJob.status].color}`}>
                  {STATUS_CONFIG[selectedJob.status].icon} {STATUS_CONFIG[selectedJob.status].label}
                </span>
                <span className={`flex items-center gap-1 text-xs ${PRIORITY_CONFIG[selectedJob.priority].color}`}>
                  <span className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[selectedJob.priority].dot}`} />
                  {PRIORITY_CONFIG[selectedJob.priority].label} priority
                </span>
              </div>

              {/* Client Info */}
              {(selectedJob.client_name || selectedJob.client_phone || selectedJob.client_address) && (
                <div className="bg-black/[0.03] rounded-xl p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-black/40 uppercase tracking-wide mb-2">Client</h3>
                  {selectedJob.client_name && <div className="flex items-center gap-2 text-sm"><User size={14} className="text-black/30" />{selectedJob.client_name}</div>}
                  {selectedJob.client_phone && <a href={`tel:${selectedJob.client_phone}`} className="flex items-center gap-2 text-sm text-blue-600"><Phone size={14} />{selectedJob.client_phone}</a>}
                  {selectedJob.client_email && <a href={`mailto:${selectedJob.client_email}`} className="flex items-center gap-2 text-sm text-blue-600"><Mail size={14} />{selectedJob.client_email}</a>}
                  {selectedJob.client_address && <div className="flex items-start gap-2 text-sm text-black/60"><MapPin size={14} className="shrink-0 mt-0.5" />{selectedJob.client_address}</div>}
                </div>
              )}

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3">
                {selectedJob.job_type !== 'general' && (
                  <div className="bg-black/[0.03] rounded-xl p-3">
                    <div className="text-xs text-black/40 mb-1">Type</div>
                    <div className="text-sm font-medium">{selectedJob.job_type}</div>
                  </div>
                )}
                {selectedJob.location_text && (
                  <div className="bg-black/[0.03] rounded-xl p-3">
                    <div className="text-xs text-black/40 mb-1">Location</div>
                    <div className="text-sm font-medium">{selectedJob.location_text}</div>
                  </div>
                )}
                {selectedJob.due_date && (
                  <div className="bg-black/[0.03] rounded-xl p-3">
                    <div className="text-xs text-black/40 mb-1">Due Date</div>
                    <div className={`text-sm font-medium ${formatDue(selectedJob.due_date)?.color}`}>
                      {new Date(selectedJob.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                )}
                {selectedJob.assigned_name && (
                  <div className="bg-black/[0.03] rounded-xl p-3">
                    <div className="text-xs text-black/40 mb-1">Assigned To</div>
                    <div className="text-sm font-medium">{selectedJob.assigned_name}</div>
                  </div>
                )}
                {selectedJob.estimated_hours && (
                  <div className="bg-black/[0.03] rounded-xl p-3">
                    <div className="text-xs text-black/40 mb-1">Est. Hours</div>
                    <div className="text-sm font-medium">{selectedJob.estimated_hours}h</div>
                  </div>
                )}
              </div>

              {/* Description */}
              {selectedJob.description && (
                <div>
                  <h3 className="text-xs font-semibold text-black/40 uppercase tracking-wide mb-2">Description</h3>
                  <p className="text-sm text-black/60 leading-relaxed">{selectedJob.description}</p>
                </div>
              )}

              {/* Actions */}
              <div className="border-t border-black/6 pt-4">
                <h3 className="text-xs font-semibold text-black/40 uppercase tracking-wide mb-3">Actions</h3>
                <div className="space-y-2">
                  {/* Status Change */}
                  <div>
                    <p className="text-xs text-black/40 mb-1.5">Change Status</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(['pending', 'assigned', 'in_progress', 'completed', 'cancelled'] as JobStatus[]).map(s => (
                        <button key={s} onClick={() => handleStatusChange(selectedJob.id, s)}
                          disabled={s === selectedJob.status}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                            s === selectedJob.status ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].color} border-current opacity-60` : 'bg-white border-black/10 text-black/50 hover:border-black/20 hover:text-black'
                          }`}>
                          {STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Assign */}
                  {selectedJob.status !== 'completed' && (
                    <div>
                      <p className="text-xs text-black/40 mb-1.5">Assign To</p>
                      <select
                        value={selectedJob.assigned_to || ''}
                        onChange={e => handleAssignJob(selectedJob.id, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-black/10 text-sm focus:outline-none focus:border-black/20"
                      >
                        <option value="">Unassigned</option>
                        {staffList.map(s => (
                          <option key={s.id} value={s.id}>{s.full_name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Updates Timeline */}
              <div className="border-t border-black/6 pt-4">
                <h3 className="text-xs font-semibold text-black/40 uppercase tracking-wide mb-3">Field Updates</h3>
                <div className="space-y-3 mb-4">
                  {updates.length === 0 ? (
                    <p className="text-xs text-black/30 text-center py-4">No updates yet</p>
                  ) : (
                    updates.map(update => (
                      <div key={update.id} className="flex gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          update.type === 'photo' ? 'bg-blue-50 text-blue-500' :
                          update.type === 'status_change' ? 'bg-indigo-50 text-indigo-500' :
                          update.type === 'assignment' ? 'bg-emerald-50 text-emerald-500' :
                          'bg-black/5 text-black/40'
                        }`}>
                          {update.type === 'photo' ? <Camera size={12} /> :
                           update.type === 'status_change' ? <ArrowRight size={12} /> :
                           update.type === 'assignment' ? <UserCheck size={12} /> :
                           <MessageSquare size={12} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-black/60">{update.staff_name || 'Staff'}</span>
                            <span className="text-xs text-black/30">{timeAgo(update.created_at)}</span>
                          </div>
                          <p className="text-sm text-black/70">{update.content}</p>
                          {update.photo_url && (
                            <img src={update.photo_url} alt="Job photo" className="mt-2 rounded-lg w-full max-h-48 object-cover" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {/* Add Update */}
                {selectedJob.status !== 'completed' && selectedJob.status !== 'cancelled' && (
                  <div className="flex gap-2">
                    <input
                      value={newUpdate}
                      onChange={e => setNewUpdate(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddUpdate()}
                      placeholder="Add a field update..."
                      className="flex-1 px-3 py-2 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20"
                    />
                    <button onClick={handleAddUpdate} disabled={!newUpdate.trim() || addingUpdate}
                      className="w-10 h-10 rounded-xl bg-[#111111] text-white flex items-center justify-center hover:bg-black/80 disabled:opacity-40 transition">
                      {addingUpdate ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Job Modal */}
      {showCreateModal && (
        <CreateJobModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateJob}
          staffList={staffList}
        />
      )}
    </div>
  )
}

// ============================================
// CREATE JOB MODAL
// ============================================
function CreateJobModal({ onClose, onCreate, staffList }: {
  onClose: () => void
  onCreate: (data: Partial<Job>) => void
  staffList: StaffMember[]
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [jobType, setJobType] = useState('general')
  const [priority, setPriority] = useState<JobPriority>('medium')
  const [locationText, setLocationText] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [saving, setSaving] = useState(false)

  const JOB_TYPES = ['general', 'Installation', 'Repair', 'Maintenance', 'Inspection', 'Delivery', 'Consultation']

  const handleSubmit = async () => {
    setSaving(true)
    await onCreate({
      title, description: description || undefined,
      client_name: clientName || undefined, client_phone: clientPhone || undefined,
      client_email: clientEmail || undefined, client_address: clientAddress || undefined,
      job_type: jobType, priority, location_text: locationText || undefined,
      due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
      estimated_hours: estimatedHours ? parseFloat(estimatedHours) : undefined,
      assigned_to: assignedTo || undefined,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-black/6 p-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">New Job</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center hover:bg-black/10">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-black/50 mb-1.5">Job Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. AC Installation at Lekki Villa"
              className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-black/50 mb-1.5">Job Type</label>
              <select value={jobType} onChange={e => setJobType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20">
                {JOB_TYPES.map(t => <option key={t} value={t}>{t === 'general' ? 'General' : t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-black/50 mb-1.5">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as JobPriority)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-black/50 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Brief description of the job..."
              className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-black/40 uppercase tracking-wide mb-2">Client Info</label>
            <div className="space-y-2">
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name"
                className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
              <div className="grid grid-cols-2 gap-2">
                <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Phone"
                  className="px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
                <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="Email"
                  className="px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
              </div>
              <input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Address"
                className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-black/50 mb-1.5">Location</label>
              <input value={locationText} onChange={e => setLocationText(e.target.value)} placeholder="e.g. Lekki Phase 1"
                className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-black/50 mb-1.5">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-black/50 mb-1.5">Est. Hours</label>
              <input type="number" value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)} placeholder="e.g. 4"
                className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-black/50 mb-1.5">Assign To</label>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20">
                <option value="">Unassigned</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-black/6 p-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-medium hover:bg-black/5 transition">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!title.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-[#111111] text-white text-sm font-medium hover:bg-black/80 disabled:opacity-40 transition flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Create Job
          </button>
        </div>
      </div>
    </div>
  )
}
