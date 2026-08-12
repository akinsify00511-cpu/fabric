// Recruitment Page
// Manage job postings and applications pipeline

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { hasPermission } from '../lib/permissions'
import {
  Briefcase, Users, Plus, Search, Filter, ChevronDown, ChevronUp,
  Mail, Phone, Calendar, MapPin, DollarSign, Building2,
  FileText, ExternalLink, CheckCircle2, Clock, XCircle,
  Edit2, Trash2, Eye, MoreHorizontal, Send, UserPlus
} from 'lucide-react'

interface JobPosting {
  id: string
  title: string
  department?: string
  location?: string
  employment_type: 'full_time' | 'part_time' | 'contract' | 'internship'
  description?: string
  requirements?: string
  salary_range?: string
  status: 'draft' | 'open' | 'closed' | 'filled'
  created_by?: string
  created_at: string
  applications_count?: number
}

interface JobApplication {
  id: string
  job_id: string
  stage_id?: string
  full_name: string
  email: string
  phone?: string
  cv_url?: string
  cover_letter?: string
  linkedin_url?: string
  status: 'new' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected'
  notes?: string
  created_at: string
  job_title?: string
  stage_name?: string
}

interface RecruitmentStage {
  id: string
  name: string
  stage_order: number
}

const EMPLOYMENT_TYPES = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-red-100 text-red-600',
  filled: 'bg-blue-100 text-blue-700',
}

const APPLICATION_STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700',
  screening: 'bg-amber-100 text-amber-700',
  interview: 'bg-purple-100 text-purple-700',
  offer: 'bg-teal-100 text-teal-700',
  hired: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
}

export default function RecruitmentPage() {
  const { staff } = useAuth()
  const { showToast } = useToast()

  const [activeTab, setActiveTab] = useState<'postings' | 'applications'>('postings')
  const [postings, setPostings] = useState<JobPosting[]>([])
  const [applications, setApplications] = useState<JobApplication[]>([])
  const [stages, setStages] = useState<RecruitmentStage[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingPosting, setEditingPosting] = useState<JobPosting | null>(null)
  const [expandedPosting, setExpandedPosting] = useState<string | null>(null)
  const [expandedApplication, setExpandedApplication] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    department: '',
    location: '',
    employment_type: 'full_time' as JobPosting['employment_type'],
    description: '',
    requirements: '',
    salary_range: '',
    status: 'draft' as JobPosting['status'],
  })

  const canManage = staff ? hasPermission(staff.role || 'staff', 'staff', 'manage') : false

  useEffect(() => {
    if (staff?.business_id) {
      fetchPostings()
      fetchApplications()
      fetchStages()
    }
  }, [staff?.business_id])

  async function fetchPostings() {
    if (!staff?.business_id) return

    try {
      const { data, error } = await supabase
        .from('job_postings')
        .select(`
          *,
          job_applications(count)
        `)
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const postingsWithCount = (data || []).map(posting => ({
        ...posting,
        applications_count: posting.job_applications?.[0]?.count || 0,
      }))

      setPostings(postingsWithCount)
    } catch (error) {
      console.error('Error fetching postings:', error)
      showToast('Failed to load job postings', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function fetchApplications() {
    if (!staff?.business_id) return

    try {
      const { data, error } = await supabase
        .from('job_applications')
        .select(`
          *,
          job_postings(title)
        `)
        .eq('job_postings.business_id', staff.business_id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const appsWithJobTitle = (data || []).map(app => ({
        ...app,
        job_title: app.job_postings?.title,
      }))

      setApplications(appsWithJobTitle)
    } catch (error) {
      console.error('Error fetching applications:', error)
    }
  }

  async function fetchStages() {
    if (!staff?.business_id) return

    try {
      const { data } = await supabase
        .from('recruitment_stages')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('stage_order')

      if (data) setStages(data)
    } catch (error) {
      console.error('Error fetching stages:', error)
    }
  }

  // Filter postings
  const filteredPostings = useMemo(() => {
    return postings.filter(posting => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!posting.title.toLowerCase().includes(query) &&
            !posting.department?.toLowerCase().includes(query)) {
          return false
        }
      }
      if (statusFilter !== 'all' && posting.status !== statusFilter) return false
      return true
    })
  }, [postings, searchQuery, statusFilter])

  // Filter applications
  const filteredApplications = useMemo(() => {
    return applications.filter(app => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!app.full_name.toLowerCase().includes(query) &&
            !app.email.toLowerCase().includes(query) &&
            !app.job_title?.toLowerCase().includes(query)) {
          return false
        }
      }
      if (statusFilter !== 'all' && app.status !== statusFilter) return false
      return true
    })
  }, [applications, searchQuery, statusFilter])

  // Stats
  const stats = useMemo(() => ({
    totalPostings: postings.length,
    openPostings: postings.filter(p => p.status === 'open').length,
    totalApplications: applications.length,
    newApplications: applications.filter(a => a.status === 'new').length,
    interviews: applications.filter(a => a.status === 'interview').length,
    hired: applications.filter(a => a.status === 'hired').length,
  }), [postings, applications])

  function openModal(posting?: JobPosting) {
    if (posting) {
      setEditingPosting(posting)
      setFormData({
        title: posting.title,
        department: posting.department || '',
        location: posting.location || '',
        employment_type: posting.employment_type as JobPosting['employment_type'],
        description: posting.description || '',
        requirements: posting.requirements || '',
        salary_range: posting.salary_range || '',
        status: posting.status as JobPosting['status'],
      })
    } else {
      setEditingPosting(null)
      setFormData({
        title: '',
        department: '',
        location: '',
        employment_type: 'full_time',
        description: '',
        requirements: '',
        salary_range: '',
        status: 'draft',
      })
    }
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id) return

    try {
      if (editingPosting) {
        const { error } = await supabase
          .from('job_postings')
          .update(formData)
          .eq('id', editingPosting.id)

        if (error) throw error
        showToast('Job posting updated', 'success')
      } else {
        const { error } = await supabase
          .from('job_postings')
          .insert({
            ...formData,
            business_id: staff.business_id,
            created_by: staff.id,
          })

        if (error) throw error
        showToast('Job posting created', 'success')
      }

      setShowModal(false)
      fetchPostings()
    } catch (error) {
      console.error('Error saving posting:', error)
      showToast('Failed to save job posting', 'error')
    }
  }

  async function deletePosting(id: string) {
    if (!confirm('Are you sure you want to delete this job posting?')) return

    try {
      const { error } = await supabase
        .from('job_postings')
        .delete()
        .eq('id', id)

      if (error) throw error
      showToast('Job posting deleted', 'success')
      fetchPostings()
    } catch (error) {
      console.error('Error deleting posting:', error)
      showToast('Failed to delete posting', 'error')
    }
  }

  async function updateApplicationStatus(id: string, status: string) {
    try {
      const { error } = await supabase
        .from('job_applications')
        .update({ status })
        .eq('id', id)

      if (error) throw error
      showToast('Status updated', 'success')
      fetchApplications()
    } catch (error) {
      console.error('Error updating application:', error)
      showToast('Failed to update status', 'error')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Recruitment</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage job postings and track applicants
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => openModal()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Job Posting
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Open Positions', value: stats.openPostings, color: 'blue' },
            { label: 'Total Applications', value: stats.totalApplications, color: 'gray' },
            { label: 'New Applications', value: stats.newApplications, color: 'amber' },
            { label: 'Hired', value: stats.hired, color: 'green' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('postings')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'postings'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Job Postings
              </button>
              <button
                onClick={() => setActiveTab('applications')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'applications'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Applications
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Search ${activeTab}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {activeTab === 'postings' ? (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="filled">Filled</option>
              </select>
            ) : (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="new">New</option>
                <option value="screening">Screening</option>
                <option value="interview">Interview</option>
                <option value="offer">Offer</option>
                <option value="hired">Hired</option>
                <option value="rejected">Rejected</option>
              </select>
            )}
          </div>
        </div>

        {/* Content */}
        {activeTab === 'postings' ? (
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : filteredPostings.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <Briefcase className="w-12 h-12 text-gray-300 mx-auto" />
                <p className="text-gray-500 mt-2">No job postings found</p>
                {canManage && (
                  <button
                    onClick={() => openModal()}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    Create First Posting
                  </button>
                )}
              </div>
            ) : (
              filteredPostings.map((posting) => (
                <div key={posting.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div
                    className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedPosting(expandedPosting === posting.id ? null : posting.id)}
                  >
                    <div className={`p-2 rounded-lg ${
                      posting.status === 'open' ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <Briefcase className={`w-5 h-5 ${
                        posting.status === 'open' ? 'text-green-600' : 'text-gray-500'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900">{posting.title}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[posting.status]}`}>
                          {posting.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        {posting.department && <span>{posting.department}</span>}
                        {posting.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{posting.location}</span>}
                        <span>{EMPLOYMENT_TYPES[posting.employment_type]}</span>
                        {posting.applications_count !== undefined && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />{posting.applications_count} applicants
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">
                        {new Date(posting.created_at).toLocaleDateString()}
                      </span>
                      {expandedPosting === posting.id ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {expandedPosting === posting.id && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          {posting.description && (
                            <div className="mb-4">
                              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Description</h4>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{posting.description}</p>
                            </div>
                          )}
                          {posting.requirements && (
                            <div className="mb-4">
                              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Requirements</h4>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{posting.requirements}</p>
                            </div>
                          )}
                          {posting.salary_range && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Salary Range</h4>
                              <p className="text-sm text-gray-700">{posting.salary_range}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          {canManage && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); openModal(posting) }}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                              >
                                <Edit2 className="w-4 h-4" /> Edit Posting
                              </button>
                              {posting.status !== 'open' && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    const { error } = await supabase.from('job_postings').update({ status: 'open' }).eq('id', posting.id)
                                    if (error) { showToast('Failed to publish posting', 'error'); return }
                                    showToast('Posting published', 'success')
                                    fetchPostings()
                                  }}
                                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                                >
                                  <CheckCircle2 className="w-4 h-4" /> Publish
                                </button>
                              )}
                              {posting.status === 'open' && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    const { error } = await supabase.from('job_postings').update({ status: 'closed' }).eq('id', posting.id)
                                    if (error) { showToast('Failed to close posting', 'error'); return }
                                    showToast('Posting closed', 'success')
                                    fetchPostings()
                                  }}
                                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700"
                                >
                                  <XCircle className="w-4 h-4" /> Close
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); deletePosting(posting.id) }}
                                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100"
                              >
                                <Trash2 className="w-4 h-4" /> Delete
                              </button>
                            </>
                          )}
                          <a
                            href={`/app/leads?source=recruitment&job=${posting.id}`}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-sm hover:bg-blue-100"
                          >
                            <Users className="w-4 h-4" /> View Applications
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredApplications.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <Users className="w-12 h-12 text-gray-300 mx-auto" />
                <p className="text-gray-500 mt-2">No applications found</p>
              </div>
            ) : (
              filteredApplications.map((app) => (
                <div key={app.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div
                    className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedApplication(expandedApplication === app.id ? null : app.id)}
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
                      {app.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900">{app.full_name}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${APPLICATION_STATUS_COLORS[app.status]}`}>
                          {app.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        {app.job_title && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{app.job_title}</span>}
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{app.email}</span>
                        {app.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{app.phone}</span>}
                      </div>
                    </div>
                    <span className="text-sm text-gray-400">
                      {new Date(app.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {expandedApplication === app.id && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-4">
                          {app.cover_letter && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Cover Letter</h4>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{app.cover_letter}</p>
                            </div>
                          )}
                          {app.linkedin_url && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">LinkedIn</h4>
                              <a href={app.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" /> View Profile
                              </a>
                            </div>
                          )}
                          {app.cv_url && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">CV/Resume</h4>
                              <a href={app.cv_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                <FileText className="w-3 h-3" /> View CV
                              </a>
                            </div>
                          )}
                        </div>
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Update Status</h4>
                          <div className="flex flex-wrap gap-2">
                            {(['new', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const).map(status => (
                              <button
                                key={status}
                                onClick={() => updateApplicationStatus(app.id, status)}
                                disabled={app.status === status}
                                className={`px-3 py-1.5 text-xs rounded-lg border ${
                                  app.status === status
                                    ? `${APPLICATION_STATUS_COLORS[status]} border-transparent`
                                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                                }`}
                              >
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">
                {editingPosting ? 'Edit Job Posting' : 'Create Job Posting'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Senior Software Engineer"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Engineering"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Lagos, Nigeria"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                  <select
                    value={formData.employment_type}
                    onChange={(e) => setFormData({ ...formData, employment_type: e.target.value as JobPosting['employment_type'] })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Salary Range</label>
                  <input
                    type="text"
                    value={formData.salary_range}
                    onChange={(e) => setFormData({ ...formData, salary_range: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., ₦500,000 - ₦800,000"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe the role, responsibilities, and what you're looking for..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Requirements</label>
                <textarea
                  rows={4}
                  value={formData.requirements}
                  onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="List the qualifications, skills, and experience needed..."
                />
              </div>
              {editingPosting && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as JobPosting['status'] })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="filled">Filled</option>
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  {editingPosting ? 'Save Changes' : 'Create Posting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
