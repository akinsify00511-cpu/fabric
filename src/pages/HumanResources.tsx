import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Users, Calendar, Clock, Award, FileText, Briefcase,
  Plus, ChevronRight, Loader2, Check, X, AlertCircle,
  UserPlus, TrendingUp, Star, Heart, MapPin, Phone, Mail
} from 'lucide-react'

type HRTab = 'overview' | 'leave' | 'attendance' | 'performance' | 'recruitment' | 'contracts'

export default function HumanResources() {
  const { staff } = useAuth()
  const businessId = staff?.business_id
  const [activeTab, setActiveTab] = useState<HRTab>('overview')
  const { showToast } = useToast()

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'leave', label: 'Leave', icon: Calendar },
    { id: 'attendance', label: 'Attendance', icon: Clock },
    { id: 'performance', label: 'Reviews', icon: Award },
    { id: 'recruitment', label: 'Recruitment', icon: UserPlus },
    { id: 'contracts', label: 'Contracts', icon: FileText },
  ]

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--avenize-black)]">Human Resources</h1>
          <p className="text-sm text-black/50">Staff management & HR operations</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as HRTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
              activeTab === tab.id
                ? 'avenize-gradient text-white'
                : 'bg-white text-black/60 hover:bg-black/5'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab businessId={businessId} />}
      {activeTab === 'leave' && <LeaveTab businessId={businessId} staffId={staff?.id} />}
      {activeTab === 'attendance' && <AttendanceTab businessId={businessId} staffId={staff?.id} />}
      {activeTab === 'performance' && <PerformanceTab businessId={businessId} />}
      {activeTab === 'recruitment' && <RecruitmentTab businessId={businessId} />}
      {activeTab === 'contracts' && <ContractsTab businessId={businessId} />}
    </div>
  )
}

// Overview Tab
function OverviewTab({ businessId }: { businessId?: string }) {
  const [stats, setStats] = useState<any>({
    totalStaff: 0,
    onLeave: 0,
    pendingLeave: 0,
    openPositions: 0,
    activeContracts: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!businessId) return
    loadStats()
  }, [businessId])

  async function loadStats() {
    setLoading(true)
    try {
      const [staffRes, leaveRes, recruitmentRes, contractRes] = await Promise.all([
        supabase.from('staff').select('id', { count: 'exact' }).eq('business_id', businessId),
        supabase.from('leave_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('job_postings').select('id', { count: 'exact' }).eq('status', 'open').eq('business_id', businessId),
        supabase.from('staff_contracts').select('id', { count: 'exact' }).eq('status', 'active'),
      ])
      setStats({
        totalStaff: staffRes.count || 0,
        pendingLeave: leaveRes.count || 0,
        openPositions: recruitmentRes.count || 0,
        activeContracts: contractRes.count || 0,
      })
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-black/30" /></div>

  const cards = [
    { label: 'Total Staff', value: stats.totalStaff, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Pending Leave', value: stats.pendingLeave, icon: Calendar, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Open Positions', value: stats.openPositions, icon: Briefcase, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'Active Contracts', value: stats.activeContracts, icon: FileText, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
              <card.icon size={20} className={card.color} />
            </div>
            <div className="text-2xl font-semibold">{card.value}</div>
            <div className="text-sm text-black/50">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <h3 className="font-medium mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 text-left">
              <Calendar size={20} className="text-amber-500" />
              <span>Request Leave</span>
            </button>
            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 text-left">
              <Clock size={20} className="text-blue-500" />
              <span>Check In Today</span>
            </button>
            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 text-left">
              <Award size={20} className="text-purple-500" />
              <span>View My Reviews</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <h3 className="font-medium mb-3">Upcoming</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl">
              <Calendar size={20} className="text-amber-500" />
              <div>
                <div className="text-sm font-medium">Public Holiday</div>
                <div className="text-xs text-black/50">Tomorrow</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
              <Award size={20} className="text-blue-500" />
              <div>
                <div className="text-sm font-medium">Performance Review</div>
                <div className="text-xs text-black/50">Due in 5 days</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Leave Tab
function LeaveTab({ businessId, staffId }: { businessId?: string; staffId?: string }) {
  const [requests, setRequests] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    leave_type: 'annual',
    start_date: '',
    end_date: '',
    reason: '',
  })

  const leaveTypes = [
    { id: 'annual', label: 'Annual Leave', days: 21 },
    { id: 'sick', label: 'Sick Leave', days: 14 },
    { id: 'maternity', label: 'Maternity Leave', days: 84 },
    { id: 'paternity', label: 'Paternity Leave', days: 14 },
    { id: 'compassionate', label: 'Compassionate Leave', days: 5 },
  ]

  useEffect(() => {
    loadRequests()
  }, [])

  async function loadRequests() {
    setLoading(true)
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const start = new Date(form.start_date)
    const end = new Date(form.end_date)
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

    await supabase.from('leave_requests').insert({
      staff_id: staffId,
      leave_type_id: leaveTypes.find(l => l.id === form.leave_type)?.id || '',
      start_date: form.start_date,
      end_date: form.end_date,
      days_requested: days,
      reason: form.reason,
    })
    showToast('Leave request submitted!', 'success')
    setShowForm(false)
    setForm({ leave_type: 'annual', start_date: '', end_date: '', reason: '' })
    loadRequests()
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">My Leave Requests</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--avenize-primary)] text-white text-sm"
        >
          <Plus size={16} /> Request Leave
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Leave Type</label>
            <select
              value={form.leave_type}
              onChange={(e) => setForm({ ...form, leave_type: e.target.value })}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            >
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>{lt.label} ({lt.days} days)</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Reason</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              rows={3}
              placeholder="Brief reason for leave..."
            />
          </div>
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--avenize-primary)] text-white">
            Submit Request
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Calendar size={48} className="mx-auto text-black/20 mb-3" />
          <p className="text-black/50">No leave requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{leaveTypes.find(l => l.id === req.leave_type_id)?.label || 'Leave'}</span>
                  <p className="text-sm text-black/50">
                    {new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-black/40">{req.days_requested} day(s)</p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full ${statusColors[req.status]}`}>
                  {req.status}
                </span>
              </div>
              {req.reason && <p className="text-sm text-black/50 mt-2">{req.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Attendance Tab
function AttendanceTab({ businessId, staffId }: { businessId?: string; staffId?: string }) {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [checkingIn, setCheckingIn] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    loadRecords()
  }, [])

  async function loadRecords() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('staff_id', staffId)
      .order('date', { ascending: false })
      .limit(30)
    setRecords(data || [])
    setLoading(false)
  }

  async function handleCheckIn() {
    setCheckingIn(true)
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const time = now.toTimeString().split(' ')[0]

    await supabase.from('attendance_records').insert({
      staff_id: staffId,
      date: today,
      check_in: time,
      status: 'present',
    })
    showToast('Checked in successfully!', 'success')
    loadRecords()
    setCheckingIn(false)
  }

  async function handleCheckOut() {
    const now = new Date()
    const today = new Date().toISOString().split('T')[0]
    const time = now.toTimeString().split(' ')[0]

    const todayRecord = records.find(r => r.date === today)
    if (todayRecord) {
      await supabase.from('attendance_records').update({ check_out: time }).eq('id', todayRecord.id)
      showToast('Checked out successfully!', 'success')
      loadRecords()
    }
  }

  const todayRecord = records[0]
  const isCheckedIn = todayRecord?.date === new Date().toISOString().split('T')[0]
  const isCheckedOut = isCheckedIn && todayRecord?.check_out

  return (
    <div>
      {/* Quick Check In/Out */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6">
        <div className="text-center">
          <div className="text-4xl font-bold mb-2">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="text-black/50 mb-4">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          {!isCheckedIn ? (
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              className="px-8 py-3 rounded-xl avenize-gradient text-white font-medium disabled:opacity-50"
            >
              {checkingIn ? 'Checking in...' : 'Check In'}
            </button>
          ) : !isCheckedOut ? (
            <button
              onClick={handleCheckOut}
              className="px-8 py-3 rounded-xl bg-red-500 text-white font-medium"
            >
              Check Out
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full">
              <Check size={16} /> Done for today
            </div>
          )}
        </div>
      </div>

      {/* Today's Status */}
      {todayRecord && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-black/[0.06] p-4 text-center">
            <div className="text-sm text-black/50">Check In</div>
            <div className="text-lg font-semibold">{todayRecord.check_in || '--:--'}</div>
          </div>
          <div className="bg-white rounded-xl border border-black/[0.06] p-4 text-center">
            <div className="text-sm text-black/50">Check Out</div>
            <div className="text-lg font-semibold">{todayRecord.check_out || '--:--'}</div>
          </div>
          <div className="bg-white rounded-xl border border-black/[0.06] p-4 text-center">
            <div className="text-sm text-black/50">Status</div>
            <div className={`text-lg font-semibold capitalize ${
              todayRecord.status === 'present' ? 'text-green-600' :
              todayRecord.status === 'late' ? 'text-amber-600' :
              todayRecord.status === 'absent' ? 'text-red-600' : 'text-black/60'
            }`}>{todayRecord.status}</div>
          </div>
        </div>
      )}

      {/* Recent Records */}
      <h3 className="font-medium mb-3">Recent Attendance</h3>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
      ) : (
        <div className="space-y-2">
          {records.slice(0, 14).map((record) => (
            <div key={record.id} className="bg-white rounded-xl border border-black/[0.06] p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar size={16} className="text-black/30" />
                <span className="text-sm font-medium">{new Date(record.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-black/50">
                <span>In: {record.check_in || '--'}</span>
                <span>Out: {record.check_out || '--'}</span>
                <span className={`capitalize ${
                  record.status === 'present' ? 'text-green-600' :
                  record.status === 'late' ? 'text-amber-600' : 'text-red-600'
                }`}>{record.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Performance Tab
function PerformanceTab({ businessId }: { businessId?: string }) {
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReviews()
  }, [])

  async function loadReviews() {
    setLoading(true)
    const { data } = await supabase.from('performance_reviews').select('*').order('created_at', { ascending: false })
    setReviews(data || [])
    setLoading(false)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">My Performance Reviews</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Award size={48} className="mx-auto text-black/20 mb-3" />
          <p className="text-black/50">No performance reviews yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium">{review.review_period || 'Review'}</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={16} className={n <= (review.rating_overall || 0) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div className="bg-black/5 rounded-lg p-2">
                  <div className="text-xs text-black/50">Quality</div>
                  <div className="font-medium">{review.rating_quality || 0}/5</div>
                </div>
                <div className="bg-black/5 rounded-lg p-2">
                  <div className="text-xs text-black/50">Productivity</div>
                  <div className="font-medium">{review.rating_productivity || 0}/5</div>
                </div>
                <div className="bg-black/5 rounded-lg p-2">
                  <div className="text-xs text-black/50">Communication</div>
                  <div className="font-medium">{review.rating_communication || 0}/5</div>
                </div>
                <div className="bg-black/5 rounded-lg p-2">
                  <div className="text-xs text-black/50">Teamwork</div>
                  <div className="font-medium">{review.rating_teamwork || 0}/5</div>
                </div>
              </div>
              {review.strengths && (
                <div className="mb-2">
                  <div className="text-xs text-black/50 mb-1">Strengths</div>
                  <p className="text-sm text-black/70">{review.strengths}</p>
                </div>
              )}
              {review.improvements && (
                <div>
                  <div className="text-xs text-black/50 mb-1">Areas for Improvement</div>
                  <p className="text-sm text-black/70">{review.improvements}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Recruitment Tab
function RecruitmentTab({ businessId }: { businessId?: string }) {
  const [jobs, setJobs] = useState<any[]>([])
  const [applications, setApplications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showJobForm, setShowJobForm] = useState(false)
  const { showToast } = useToast()

  const [jobForm, setJobForm] = useState({
    title: '',
    department: '',
    location: '',
    employment_type: 'full_time',
    description: '',
    salary_range: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [jobsRes, appsRes] = await Promise.all([
      supabase.from('job_postings').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
      supabase.from('job_applications').select('*, job_postings(title)').order('created_at', { ascending: false }),
    ])
    setJobs(jobsRes.data || [])
    setApplications(appsRes.data || [])
    setLoading(false)
  }

  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('job_postings').insert({ ...jobForm, business_id: businessId })
    showToast('Job posting created!', 'success')
    setShowJobForm(false)
    setJobForm({ title: '', department: '', location: '', employment_type: 'full_time', description: '', salary_range: '' })
    loadData()
  }

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    screening: 'bg-amber-100 text-amber-700',
    interview: 'bg-purple-100 text-purple-700',
    offer: 'bg-green-100 text-green-700',
    hired: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Open Positions ({jobs.filter(j => j.status === 'open').length})</h2>
        <button
          onClick={() => setShowJobForm(!showJobForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--avenize-primary)] text-white text-sm"
        >
          <Plus size={16} /> Post Job
        </button>
      </div>

      {showJobForm && (
        <form onSubmit={handleCreateJob} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input
            type="text"
            placeholder="Job Title"
            value={jobForm.title}
            onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Department"
              value={jobForm.department}
              onChange={(e) => setJobForm({ ...jobForm, department: e.target.value })}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Location"
              value={jobForm.location}
              onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </div>
          <select
            value={jobForm.employment_type}
            onChange={(e) => setJobForm({ ...jobForm, employment_type: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
          >
            <option value="full_time">Full Time</option>
            <option value="part_time">Part Time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
          </select>
          <textarea
            placeholder="Job Description"
            value={jobForm.description}
            onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            rows={3}
          />
          <input
            type="text"
            placeholder="Salary Range (e.g. ₦200,000 - ₦400,000)"
            value={jobForm.salary_range}
            onChange={(e) => setJobForm({ ...jobForm, salary_range: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--avenize-primary)] text-white">
            Publish Job
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{job.title}</h3>
                  <p className="text-sm text-black/50">
                    {job.department && `${job.department} • `}{job.location}
                  </p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full ${job.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {job.status}
                </span>
              </div>
              {job.salary_range && <p className="text-sm text-green-600 mt-2">{job.salary_range}</p>}
            </div>
          ))}

          {applications.length > 0 && (
            <>
              <h3 className="font-medium mt-6 mb-3">Recent Applications ({applications.length})</h3>
              {applications.map((app) => (
                <div key={app.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{app.full_name}</h4>
                      <p className="text-sm text-black/50">{app.job_postings?.title || 'Position'}</p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full ${statusColors[app.status]}`}>
                      {app.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-black/40">
                    {app.email && <span>{app.email}</span>}
                    {app.phone && <span>{app.phone}</span>}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Contracts Tab
function ContractsTab({ businessId }: { businessId?: string }) {
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadContracts()
  }, [])

  async function loadContracts() {
    setLoading(true)
    const { data } = await supabase.from('staff_contracts').select('*').order('created_at', { ascending: false })
    setContracts(data || [])
    setLoading(false)
  }

  const typeColors: Record<string, string> = {
    permanent: 'bg-green-100 text-green-700',
    contract: 'bg-blue-100 text-blue-700',
    internship: 'bg-amber-100 text-amber-700',
    casual: 'bg-gray-100 text-gray-700',
  }

  return (
    <div>
      <h2 className="font-medium mb-4">My Contracts</h2>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <FileText size={48} className="mx-auto text-black/20 mb-3" />
          <p className="text-black/50">No contracts found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((contract) => (
            <div key={contract.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[contract.contract_type]}`}>
                    {contract.contract_type}
                  </span>
                  <p className="font-medium mt-2">
                    {new Date(contract.start_date).toLocaleDateString()} - {contract.end_date ? new Date(contract.end_date).toLocaleDateString() : 'Ongoing'}
                  </p>
                </div>
                {contract.salary_amount && (
                  <div className="text-right">
                    <div className="text-sm text-black/50">Salary</div>
                    <div className="font-semibold">₦{contract.salary_amount.toLocaleString()}/{contract.salary_frequency}</div>
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-center gap-4 text-sm text-black/50">
                <span>Probation: {contract.probation_months} months</span>
                <span>Notice: {contract.notice_period_days} days</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
