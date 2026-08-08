import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Users, Calendar, Clock, Award, FileText, Briefcase,
  Plus, ChevronRight, Loader2, Check, X, AlertCircle,
  UserPlus, TrendingUp, Star, Heart, MapPin, Phone, Mail,
  Wallet, Download, GraduationCap, Gift
} from 'lucide-react'

type HRTab = 'overview' | 'employees' | 'leave' | 'attendance' | 'payroll' | 'performance' | 'recruitment' | 'contracts' | 'benefits' | 'training'

export default function HumanResources() {
  const { staff } = useAuth()
  const businessId = staff?.business_id
  const [activeTab, setActiveTab] = useState<HRTab>('overview')
  const { showToast } = useToast()

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'employees', label: 'Employees', icon: Users },
    { id: 'leave', label: 'Leave', icon: Calendar },
    { id: 'attendance', label: 'Attendance', icon: Clock },
    { id: 'payroll', label: 'Payroll', icon: Wallet },
    { id: 'performance', label: 'Appraisal', icon: Award },
    { id: 'recruitment', label: 'Recruitment', icon: UserPlus },
    { id: 'contracts', label: 'Contracts', icon: FileText },
    { id: 'benefits', label: 'Benefits', icon: Gift },
    { id: 'training', label: 'Training', icon: GraduationCap },
  ]

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-black">Human Resources</h1>
          <p className="text-sm text-black">Staff management & HR operations</p>
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
                : 'bg-white text-black/60 hover:bg-black/10'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab businessId={businessId} />}
      {activeTab === 'employees' && <EmployeesTab businessId={businessId} staff={staff} />}
      {activeTab === 'leave' && <LeaveTab businessId={businessId} staffId={staff?.id} />}
      {activeTab === 'attendance' && <AttendanceTab businessId={businessId} staffId={staff?.id} />}
      {activeTab === 'payroll' && <PayrollTab businessId={businessId} staffId={staff?.id} />}
      {activeTab === 'performance' && <PerformanceTab businessId={businessId} />}
      {activeTab === 'recruitment' && <RecruitmentTab businessId={businessId} />}
      {activeTab === 'contracts' && <ContractsTab businessId={businessId} />}
      {activeTab === 'benefits' && <BenefitsTab businessId={businessId} staffId={staff?.id} />}
      {activeTab === 'training' && <TrainingTab businessId={businessId} />}
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-black" /></div>

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
            <div className="text-sm text-black">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <h3 className="font-medium mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/10 text-left">
              <Calendar size={20} className="text-amber-500" />
              <span>Request Leave</span>
            </button>
            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/10 text-left">
              <Clock size={20} className="text-blue-500" />
              <span>Check In Today</span>
            </button>
            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/10 text-left">
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
                <div className="text-xs text-black">Tomorrow</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
              <Award size={20} className="text-blue-500" />
              <div>
                <div className="text-sm font-medium">Performance Review</div>
                <div className="text-xs text-black">Due in 5 days</div>
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
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm"
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
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">
            Submit Request
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Calendar size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No leave requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{leaveTypes.find(l => l.id === req.leave_type_id)?.label || 'Leave'}</span>
                  <p className="text-sm text-black">
                    {new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-black">{req.days_requested} day(s)</p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full ${statusColors[req.status]}`}>
                  {req.status}
                </span>
              </div>
              {req.reason && <p className="text-sm text-black mt-2">{req.reason}</p>}
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
          <div className="text-black mb-4">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
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
            <div className="text-sm text-black">Check In</div>
            <div className="text-lg font-semibold">{todayRecord.check_in || '--:--'}</div>
          </div>
          <div className="bg-white rounded-xl border border-black/[0.06] p-4 text-center">
            <div className="text-sm text-black">Check Out</div>
            <div className="text-lg font-semibold">{todayRecord.check_out || '--:--'}</div>
          </div>
          <div className="bg-white rounded-xl border border-black/[0.06] p-4 text-center">
            <div className="text-sm text-black">Status</div>
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
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : (
        <div className="space-y-2">
          {records.slice(0, 14).map((record) => (
            <div key={record.id} className="bg-white rounded-xl border border-black/[0.06] p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar size={16} className="text-black" />
                <span className="text-sm font-medium">{new Date(record.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-black">
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
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Award size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No performance reviews yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium">{review.review_period || 'Review'}</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={16} className={n <= (review.rating_overall || 0) ? 'text-amber-400 fill-amber-400' : 'text-white'} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div className="bg-black/10 rounded-lg p-2">
                  <div className="text-xs text-black">Quality</div>
                  <div className="font-medium">{review.rating_quality || 0}/5</div>
                </div>
                <div className="bg-black/10 rounded-lg p-2">
                  <div className="text-xs text-black">Productivity</div>
                  <div className="font-medium">{review.rating_productivity || 0}/5</div>
                </div>
                <div className="bg-black/10 rounded-lg p-2">
                  <div className="text-xs text-black">Communication</div>
                  <div className="font-medium">{review.rating_communication || 0}/5</div>
                </div>
                <div className="bg-black/10 rounded-lg p-2">
                  <div className="text-xs text-black">Teamwork</div>
                  <div className="font-medium">{review.rating_teamwork || 0}/5</div>
                </div>
              </div>
              {review.strengths && (
                <div className="mb-2">
                  <div className="text-xs text-black mb-1">Strengths</div>
                  <p className="text-sm text-black/70">{review.strengths}</p>
                </div>
              )}
              {review.improvements && (
                <div>
                  <div className="text-xs text-black mb-1">Areas for Improvement</div>
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
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm"
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
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">
            Publish Job
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{job.title}</h3>
                  <p className="text-sm text-black">
                    {job.department && `${job.department} • `}{job.location}
                  </p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full ${job.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-white text-black'}`}>
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
                      <p className="text-sm text-black">{app.job_postings?.title || 'Position'}</p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full ${statusColors[app.status]}`}>
                      {app.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-black">
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
    casual: 'bg-white text-black',
  }

  return (
    <div>
      <h2 className="font-medium mb-4">My Contracts</h2>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <FileText size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No contracts found</p>
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
                    <div className="text-sm text-black">Salary</div>
                    <div className="font-semibold">₦{contract.salary_amount.toLocaleString()}/{contract.salary_frequency}</div>
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-center gap-4 text-sm text-black">
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

// Employees Tab
function EmployeesTab({ businessId, staff }: { businessId?: string; staff?: any }) {
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEmployees()
  }, [])

  async function loadEmployees() {
    setLoading(true)
    const { data } = await supabase
      .from('staff')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    setEmployees(data || [])
    setLoading(false)
  }

  const departmentStats = employees.reduce((acc: any, emp) => {
    const dept = emp.department || 'Unassigned'
    acc[dept] = (acc[dept] || 0) + 1
    return acc
  }, {})

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">All Employees ({employees.length})</h2>
      </div>

      {/* Department Distribution */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(departmentStats).map(([dept, count]) => (
          <div key={dept} className="bg-white rounded-xl border border-black/[0.06] p-3">
            <div className="text-xs text-black">{dept}</div>
            <div className="text-xl font-semibold">{count as number}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : employees.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Users size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No employees found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {employees.map((emp) => (
            <div key={emp.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[var(--av-primary, #4285F4)] flex items-center justify-center text-white font-semibold">
                  {(emp.full_name || emp.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{emp.full_name || emp.name}</div>
                  <div className="text-sm text-black">{emp.department || 'No department'} • {emp.role}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{emp.email}</div>
                  {emp.phone && <div className="text-xs text-black">{emp.phone}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Payroll Tab
function PayrollTab({ businessId, staffId }: { businessId?: string; staffId?: string }) {
  const [payslips, setPayslips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null)

  useEffect(() => {
    loadPayslips()
  }, [])

  async function loadPayslips() {
    setLoading(true)
    const { data } = await supabase
      .from('payroll_records')
      .select('*')
      .eq('staff_id', staffId)
      .order('pay_period', { ascending: false })
    setPayslips(data || [])
    setLoading(false)
  }

  const formatCurrency = (amount: number) => `₦${(amount || 0).toLocaleString()}`

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">My Payslips</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : payslips.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Wallet size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No payslips available</p>
          <p className="text-sm text-black mt-1">Payslips will appear after payroll processing</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payslips.map((payslip) => (
            <div 
              key={payslip.id} 
              className="bg-white rounded-2xl border border-black/[0.06] p-4 cursor-pointer hover:bg-black/10"
              onClick={() => setSelectedPayslip(payslip)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{new Date(payslip.pay_period).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                  <div className="text-sm text-black">
                    Basic: {formatCurrency(payslip.basic_salary)} • Net: {formatCurrency(payslip.net_pay)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-3 py-1 rounded-full ${
                    payslip.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {payslip.status}
                  </span>
                  <Download size={16} className="text-black" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payslip Detail Modal */}
      {selectedPayslip && (
        <div className="fixed inset-0 bg-black/100 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-auto">
            <div className="p-4 border-b border-black/[0.06] flex items-center justify-between">
              <h3 className="font-semibold">Payslip - {new Date(selectedPayslip.pay_period).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
              <button onClick={() => setSelectedPayslip(null)} className="p-1 hover:bg-black/10 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Earnings */}
              <div>
                <h4 className="text-sm font-medium text-black mb-2">EARNINGS</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Basic Salary</span>
                    <span className="font-medium">{formatCurrency(selectedPayslip.basic_salary)}</span>
                  </div>
                  {selectedPayslip.housing_allowance > 0 && (
                    <div className="flex justify-between">
                      <span>Housing Allowance</span>
                      <span>{formatCurrency(selectedPayslip.housing_allowance)}</span>
                    </div>
                  )}
                  {selectedPayslip.transport_allowance > 0 && (
                    <div className="flex justify-between">
                      <span>Transport Allowance</span>
                      <span>{formatCurrency(selectedPayslip.transport_allowance)}</span>
                    </div>
                  )}
                  {selectedPayslip.other_allowances > 0 && (
                    <div className="flex justify-between">
                      <span>Other Allowances</span>
                      <span>{formatCurrency(selectedPayslip.other_allowances)}</span>
                    </div>
                  )}
                  {selectedPayslip.bonus > 0 && (
                    <div className="flex justify-between">
                      <span>Bonus</span>
                      <span className="text-green-600">{formatCurrency(selectedPayslip.bonus)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t border-black/10 pt-2">
                    <span>Gross Pay</span>
                    <span>{formatCurrency(selectedPayslip.gross_pay)}</span>
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div>
                <h4 className="text-sm font-medium text-black mb-2">DEDUCTIONS</h4>
                <div className="space-y-2">
                  {selectedPayslip.tax_deduction > 0 && (
                    <div className="flex justify-between">
                      <span>PAYE Tax</span>
                      <span className="text-red-600">-{formatCurrency(selectedPayslip.tax_deduction)}</span>
                    </div>
                  )}
                  {selectedPayslip.pension_deduction > 0 && (
                    <div className="flex justify-between">
                      <span>Pension (Employee)</span>
                      <span className="text-red-600">-{formatCurrency(selectedPayslip.pension_deduction)}</span>
                    </div>
                  )}
                  {selectedPayslip.health_insurance > 0 && (
                    <div className="flex justify-between">
                      <span>Health Insurance</span>
                      <span className="text-red-600">-{formatCurrency(selectedPayslip.health_insurance)}</span>
                    </div>
                  )}
                  {selectedPayslip.other_deductions > 0 && (
                    <div className="flex justify-between">
                      <span>Other Deductions</span>
                      <span className="text-red-600">-{formatCurrency(selectedPayslip.other_deductions)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t border-black/10 pt-2">
                    <span>Total Deductions</span>
                    <span className="text-red-600">-{formatCurrency(selectedPayslip.total_deductions)}</span>
                  </div>
                </div>
              </div>

              {/* Net Pay */}
              <div className="bg-green-50 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">NET PAY</span>
                  <span className="text-2xl font-bold text-green-600">{formatCurrency(selectedPayslip.net_pay)}</span>
                </div>
              </div>

              {/* Download Button */}
              <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--av-primary, #4285F4)] text-white font-medium">
                <Download size={18} />
                Download Payslip PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Benefits Tab
function BenefitsTab({ businessId, staffId }: { businessId?: string; staffId?: string }) {
  const [benefits, setBenefits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const defaultBenefits = [
    { id: 'health', name: 'Health Insurance', provider: 'National Health Insurance', status: 'active', coverage: 'Family Coverage' },
    { id: 'pension', name: 'Pension Scheme', provider: 'PENCOM Compliant', status: 'active', coverage: '8% Employee + 10% Employer' },
    { id: 'transport', name: 'Transport Allowance', provider: 'Monthly Stipend', status: 'active', coverage: '₦15,000/month' },
    { id: 'communication', name: 'Communication Allowance', provider: 'Monthly Stipend', status: 'active', coverage: '₦5,000/month' },
  ]

  useEffect(() => {
    loadBenefits()
  }, [])

  async function loadBenefits() {
    setLoading(true)
    const { data } = await supabase.from('staff_benefits').select('*').eq('staff_id', staffId)
    setBenefits(data?.length ? data : defaultBenefits)
    setLoading(false)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Employee Benefits</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {benefits.map((benefit) => (
          <div key={benefit.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                benefit.id === 'health' ? 'bg-red-100 text-red-500' :
                benefit.id === 'pension' ? 'bg-blue-100 text-blue-500' :
                'bg-green-100 text-green-500'
              }`}>
                {benefit.id === 'health' ? <Heart size={20} /> :
                 benefit.id === 'pension' ? <Wallet size={20} /> :
                 <Gift size={20} />}
              </div>
              <div>
                <div className="font-medium">{benefit.name}</div>
                <div className="text-xs text-black">{benefit.provider}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs px-2 py-0.5 rounded-full ${benefit.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-white text-black'}`}>
                {benefit.status}
              </span>
              <span className="text-sm font-medium">{benefit.coverage}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-amber-50 rounded-2xl p-4">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertCircle size={20} />
          <span className="font-medium">Benefits Enrollment</span>
        </div>
        <p className="text-sm text-amber-600 mt-2">
          Contact HR to enroll in additional benefit schemes or make changes to your existing coverage.
        </p>
      </div>
    </div>
  )
}

// Training Tab
function TrainingTab({ businessId }: { businessId?: string }) {
  const [trainings, setTrainings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    title: '',
    type: 'internal',
    provider: '',
    start_date: '',
    end_date: '',
    status: 'completed',
    certificate: '',
  })

  useEffect(() => {
    loadTrainings()
  }, [])

  async function loadTrainings() {
    setLoading(true)
    const { data } = await supabase.from('training_records').select('*').order('created_at', { ascending: false })
    setTrainings(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('training_records').insert(form)
    showToast('Training record added!', 'success')
    setShowForm(false)
    loadTrainings()
  }

  const typeColors: Record<string, string> = {
    internal: 'bg-blue-100 text-blue-700',
    external: 'bg-purple-100 text-purple-700',
    certification: 'bg-amber-100 text-amber-700',
    workshop: 'bg-green-100 text-green-700',
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Training & Development</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm"
        >
          <Plus size={16} /> Add Training
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input
            type="text"
            placeholder="Training Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            >
              <option value="internal">Internal Training</option>
              <option value="external">External Course</option>
              <option value="certification">Certification</option>
              <option value="workshop">Workshop</option>
            </select>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            >
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Provider/Organizer"
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </div>
          <input
            type="text"
            placeholder="Certificate (if obtained)"
            value={form.certificate}
            onChange={(e) => setForm({ ...form, certificate: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">
            Save Training
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : trainings.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <GraduationCap size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No training records</p>
          <p className="text-sm text-black mt-1">Add your completed trainings and certifications</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trainings.map((training) => (
            <div key={training.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <GraduationCap size={20} className="text-black" />
                  <div>
                    <div className="font-medium">{training.title}</div>
                    <div className="text-sm text-black">{training.provider}</div>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[training.type]}`}>
                  {training.type}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-black">
                  {training.start_date && new Date(training.start_date).toLocaleDateString()}
                  {training.end_date && ` - ${new Date(training.end_date).toLocaleDateString()}`}
                </span>
                {training.certificate && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    ✓ {training.certificate}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
