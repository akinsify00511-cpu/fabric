import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Building2, FileText, GitBranch, AlertTriangle, CheckCircle2, Plus, Loader2, Pin, Users, Briefcase, Shield, ScrollText, TrendingUp,
  AlertCircle, Bell, BookOpen, Scale, Archive, User, Calendar
} from 'lucide-react'

type OpsTab = 'overview' | 'announcements' | 'issues' | 'sops' | 'workflows' | 'compliance' | 'documents' | 'departments'

export default function Operations() {
  const { staff } = useAuth()
  const businessId = staff?.business_id
  const [activeTab, setActiveTab] = useState<OpsTab>('overview')
  

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'announcements', label: 'Announcements', icon: Bell },
    { id: 'issues', label: 'Issues', icon: AlertCircle },
    { id: 'sops', label: 'SOPs', icon: BookOpen },
    { id: 'workflows', label: 'Workflows', icon: GitBranch },
    { id: 'compliance', label: 'Compliance', icon: Scale },
    { id: 'documents', label: 'Documents', icon: Archive },
    { id: 'departments', label: 'Departments', icon: Building2 },
  ]

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-black">Operations</h1>
          <p className="text-sm text-black">Processes, compliance & organization</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as OpsTab)}
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

      {activeTab === 'overview' && <OverviewTab businessId={businessId} staff={staff} onNavigate={(t) => setActiveTab(t)} />}
      {activeTab === 'announcements' && <AnnouncementsTab businessId={businessId} staffId={staff?.id} />}
      {activeTab === 'issues' && <IssuesTab businessId={businessId} staffId={staff?.id} />}
      {activeTab === 'sops' && <SOPsTab businessId={businessId} />}
      {activeTab === 'workflows' && <WorkflowsTab businessId={businessId} />}
      {activeTab === 'compliance' && <ComplianceTab businessId={businessId} />}
      {activeTab === 'documents' && <DocumentsTab businessId={businessId} />}
      {activeTab === 'departments' && <DepartmentsTab businessId={businessId} />}
    </div>
  )
}

// Overview Tab
function OverviewTab({ businessId, onNavigate }: { businessId?: string; staff: any; onNavigate: (tab: OpsTab) => void }) {
  const [stats, setStats] = useState<any>({
    openIssues: 0,
    pendingCompliance: 0,
    activeSOPs: 0,
    pendingApprovals: 0,
  })
  const [recentAnnouncements, setRecentAnnouncements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!businessId) return
    loadStats()
  }, [businessId])

  async function loadStats() {
    setLoading(true)
    try {
      const [issuesRes, complianceRes, sopsRes, announcementsRes] = await Promise.all([
        supabase.from('issues').select('id', { count: 'exact' }).eq('status', 'open').eq('business_id', businessId),
        supabase.from('compliance_items').select('id', { count: 'exact' }).in('status', ['pending', 'non_compliant']).eq('business_id', businessId),
        supabase.from('standard_procedures').select('id', { count: 'exact' }).eq('status', 'active').eq('business_id', businessId),
        supabase.from('announcements').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(3),
      ])
      setStats({
        openIssues: issuesRes.count || 0,
        pendingCompliance: complianceRes.count || 0,
        activeSOPs: sopsRes.count || 0,
        pendingApprovals: 0,
      })
      setRecentAnnouncements(announcementsRes.data || [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-black" /></div>

  return (
    <div>
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[var(--av-danger-soft)]0/10 flex items-center justify-center">
              <AlertCircle size={20} className="text-[var(--av-danger)]" />
            </div>
            <div className="text-2xl font-bold">{stats.openIssues}</div>
          </div>
          <div className="text-sm text-black">Open Issues</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[var(--av-warning-soft)]0/10 flex items-center justify-center">
              <Scale size={20} className="text-[var(--av-warning)]" />
            </div>
            <div className="text-2xl font-bold">{stats.pendingCompliance}</div>
          </div>
          <div className="text-sm text-black">Compliance Items</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[var(--av-success-soft)]0/10 flex items-center justify-center">
              <BookOpen size={20} className="text-[var(--av-success)]" />
            </div>
            <div className="text-2xl font-bold">{stats.activeSOPs}</div>
          </div>
          <div className="text-sm text-black">Active SOPs</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[var(--av-primary-soft)]0/10 flex items-center justify-center">
              <GitBranch size={20} className="text-blue-500" />
            </div>
            <div className="text-2xl font-bold">{stats.pendingApprovals}</div>
          </div>
          <div className="text-sm text-black">Pending Approvals</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <h3 className="font-medium mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onNavigate('issues')} className="flex items-center gap-2 p-3 rounded-xl hover:bg-black/10 text-left">
              <Plus size={18} className="text-[var(--av-primary, #4285F4)]" />
              <span className="text-sm">Report Issue</span>
            </button>
            <button onClick={() => onNavigate('announcements')} className="flex items-center gap-2 p-3 rounded-xl hover:bg-black/10 text-left">
              <Bell size={18} className="text-[var(--av-primary, #4285F4)]" />
              <span className="text-sm">Announcement</span>
            </button>
            <button onClick={() => onNavigate('sops')} className="flex items-center gap-2 p-3 rounded-xl hover:bg-black/10 text-left">
              <FileText size={18} className="text-[var(--av-primary, #4285F4)]" />
              <span className="text-sm">New SOP</span>
            </button>
            <button onClick={() => onNavigate('compliance')} className="flex items-center gap-2 p-3 rounded-xl hover:bg-black/10 text-left">
              <ScrollText size={18} className="text-[var(--av-primary, #4285F4)]" />
              <span className="text-sm">Compliance</span>
            </button>
          </div>
        </div>

        {/* Recent Announcements */}
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <h3 className="font-medium mb-3">Recent Announcements</h3>
          {recentAnnouncements.length === 0 ? (
            <p className="text-sm text-black py-4 text-center">No announcements yet</p>
          ) : (
            <div className="space-y-3">
              {recentAnnouncements.map((ann) => (
                <div key={ann.id} className="p-3 bg-black/10 rounded-xl">
                  <div className="flex items-center gap-2">
                    {ann.priority === 'urgent' && <span className="text-xs bg-[var(--av-danger-soft)] text-[var(--av-danger)] px-2 py-0.5 rounded">Urgent</span>}
                    {ann.is_pinned && <Pin size={12} className="text-[var(--av-warning)]" />}
                  </div>
                  <p className="font-medium text-sm mt-1">{ann.title}</p>
                  <p className="text-xs text-black mt-1">{new Date(ann.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Announcements Tab
function AnnouncementsTab({ businessId, staffId }: { businessId?: string; staffId?: string }) {
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    title: '',
    content: '',
    category: 'general',
    priority: 'normal',
    is_pinned: false,
  })

  useEffect(() => {
    loadAnnouncements()
  }, [])

  async function loadAnnouncements() {
    setLoading(true)
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    setAnnouncements(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('announcements').insert({
      ...form,
      business_id: businessId,
      created_by: staffId,
    })
    showToast('Announcement published!', 'success')
    setShowForm(false)
    setForm({ title: '', content: '', category: 'general', priority: 'normal', is_pinned: false })
    loadAnnouncements()
  }

  const priorityColors: Record<string, string> = {
    low: 'bg-white text-black',
    normal: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]',
    high: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]',
    urgent: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Company Announcements</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm"
        >
          <Plus size={16} /> New Announcement
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input
            type="text"
            placeholder="Announcement Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            required
          />
          <textarea
            placeholder="Announcement content..."
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            rows={4}
            required
          />
          <div className="grid grid-cols-3 gap-3">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              <option value="general">General</option>
              <option value="hr">HR</option>
              <option value="finance">Finance</option>
              <option value="it">IT</option>
              <option value="security">Security</option>
              <option value="event">Event</option>
            </select>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              <option value="low">Low Priority</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_pinned} onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })} className="rounded" />
              Pin to top
            </label>
          </div>
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">
            Publish Announcement
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Bell size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No announcements yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => (
            <div key={ann.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {ann.is_pinned && <Pin size={14} className="text-[var(--av-warning)]" />}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[ann.priority]}`}>{ann.priority}</span>
                    <span className="text-xs bg-black/10 px-2 py-0.5 rounded-full text-black capitalize">{ann.category}</span>
                  </div>
                  <h3 className="font-medium">{ann.title}</h3>
                  <p className="text-sm text-black/60 mt-2">{ann.content}</p>
                  <p className="text-xs text-black mt-3">{new Date(ann.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Issues Tab
function IssuesTab({ businessId, staffId }: { businessId?: string; staffId?: string }) {
  const [issues, setIssues] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    title: '',
    description: '',
    issue_type: 'internal',
    priority: 'medium',
    category: '',
  })

  useEffect(() => {
    loadIssues()
  }, [])

  async function loadIssues() {
    setLoading(true)
    const { data } = await supabase.from('issues').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setIssues(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('issues').insert({ ...form, business_id: businessId, reported_by: staffId })
    showToast('Issue reported!', 'success')
    setShowForm(false)
    setForm({ title: '', description: '', issue_type: 'internal', priority: 'medium', category: '' })
    loadIssues()
  }

  const priorityColors: Record<string, string> = {
    low: 'bg-white text-black',
    medium: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]',
    high: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]',
    critical: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
  }

  const statusColors: Record<string, string> = {
    open: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
    acknowledged: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]',
    in_progress: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]',
    resolved: 'bg-[var(--av-success-soft)] text-[var(--av-success)]',
    closed: 'bg-white text-black',
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Issue Tracker</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-danger-soft)]0 text-white text-sm">
          <Plus size={16} /> Report Issue
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input type="text" placeholder="Issue title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <textarea placeholder="Describe the issue..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" rows={3} required />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.issue_type} onChange={(e) => setForm({ ...form, issue_type: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              <option value="internal">Internal</option>
              <option value="bug">Bug</option>
              <option value="process">Process</option>
              <option value="compliance">Compliance</option>
              <option value="safety">Safety</option>
              <option value="customer">Customer</option>
            </select>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-danger-soft)]0 text-white">Submit Issue</button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : issues.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <CheckCircle2 size={48} className="mx-auto text-[var(--av-success)] mb-3" />
          <p className="text-black">No open issues!</p>
          <p className="text-sm text-black mt-1">Everything is running smoothly</p>
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => (
            <div key={issue.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[issue.priority]}`}>{issue.priority}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[issue.status]}`}>{issue.status.replace('_', ' ')}</span>
                    <span className="text-xs text-black capitalize">{issue.issue_type}</span>
                  </div>
                  <h3 className="font-medium">{issue.title}</h3>
                  <p className="text-sm text-black/60 mt-1">{issue.description}</p>
                </div>
                <button onClick={async () => {
                  await supabase.from('issues').update({ status: 'resolved' }).eq('id', issue.id)
                  showToast('Issue resolved!', 'success')
                  loadIssues()
                }} className="text-sm text-[var(--av-success)] hover:underline">Resolve</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// SOPs Tab
function SOPsTab({ businessId }: { businessId?: string }) {
  const [sops, setSOPs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'operations',
    status: 'draft',
    version: '1.0',
  })

  useEffect(() => {
    loadSOPs()
  }, [])

  async function loadSOPs() {
    setLoading(true)
    const { data } = await supabase.from('standard_procedures').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setSOPs(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('standard_procedures').insert({
      ...form,
      business_id: businessId,
    })
    if (error) { showToast('Could not create the SOP.', 'error'); return }
    showToast('SOP created!', 'success')
    setShowForm(false)
    setForm({ title: '', description: '', category: 'operations', status: 'draft', version: '1.0' })
    loadSOPs()
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-white text-black',
    review: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]',
    approved: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]',
    active: 'bg-[var(--av-success-soft)] text-[var(--av-success)]',
    archived: 'bg-white text-black',
  }

  const categoryIcons: Record<string, any> = {
    hr: Users, finance: ScrollText, operations: Briefcase, sales: TrendingUp, it: Shield, safety: AlertCircle, compliance: Scale, other: BookOpen,
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Standard Operating Procedures</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm">
          <Plus size={16} /> New SOP
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input
            type="text"
            placeholder="SOP Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            required
          />
          <textarea
            placeholder="Describe this procedure..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            rows={3}
          />
          <div className="grid grid-cols-3 gap-3">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              <option value="hr">HR</option>
              <option value="finance">Finance</option>
              <option value="operations">Operations</option>
              <option value="sales">Sales</option>
              <option value="it">IT</option>
              <option value="safety">Safety</option>
              <option value="compliance">Compliance</option>
              <option value="other">Other</option>
            </select>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="approved">Approved</option>
              <option value="active">Active</option>
            </select>
            <input
              type="text"
              placeholder="Version"
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">
            Create SOP
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : sops.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <BookOpen size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No SOPs created yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sops.map((sop) => {
            const Icon = categoryIcons[sop.category] || BookOpen
            return (
              <div key={sop.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--av-primary-soft)]0/10 flex items-center justify-center">
                    <Icon size={20} className="text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs bg-black/10 px-2 py-0.5 rounded text-black capitalize">{sop.category}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[sop.status]}`}>{sop.status}</span>
                    </div>
                    <h3 className="font-medium">{sop.title}</h3>
                    {sop.description && <p className="text-sm text-black mt-1">{sop.description}</p>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Workflows Tab
function WorkflowsTab({ businessId }: { businessId?: string }) {
  const [workflows, setWorkflows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    name: '',
    description: '',
    workflow_type: 'custom',
    is_active: true,
  })

  useEffect(() => {
    loadWorkflows()
  }, [])

  async function loadWorkflows() {
    setLoading(true)
    const { data } = await supabase.from('process_workflows').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setWorkflows(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('process_workflows').insert({
      ...form,
      business_id: businessId,
      steps: [],
    })
    if (error) { showToast('Could not create the workflow.', 'error'); return }
    showToast('Workflow created!', 'success')
    setShowForm(false)
    setForm({ name: '', description: '', workflow_type: 'custom', is_active: true })
    loadWorkflows()
  }

  const typeIcons: Record<string, any> = {
    approval: CheckCircle2, onboarding: Users, offboarding: User, purchase: ScrollText, leave: Calendar, reimbursement: ScrollText, escalation: AlertTriangle, incident: AlertCircle, custom: GitBranch,
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Process Workflows</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm">
          <Plus size={16} /> New Workflow
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input
            type="text"
            placeholder="Workflow Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            required
          />
          <textarea
            placeholder="Describe when this workflow runs..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            rows={3}
          />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.workflow_type} onChange={(e) => setForm({ ...form, workflow_type: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              <option value="approval">Approval</option>
              <option value="onboarding">Onboarding</option>
              <option value="offboarding">Offboarding</option>
              <option value="purchase">Purchase</option>
              <option value="leave">Leave</option>
              <option value="reimbursement">Reimbursement</option>
              <option value="escalation">Escalation</option>
              <option value="incident">Incident</option>
              <option value="custom">Custom</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
              Active
            </label>
          </div>
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">
            Create Workflow
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : workflows.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <GitBranch size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No workflows created</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflows.map((wf) => {
            const Icon = typeIcons[wf.workflow_type] || GitBranch
            return (
              <div key={wf.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Icon size={20} className="text-purple-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs bg-black/10 px-2 py-0.5 rounded text-black capitalize">{wf.workflow_type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${wf.is_active ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]' : 'bg-white text-black'}`}>{wf.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <h3 className="font-medium mt-1">{wf.name}</h3>
                    {wf.description && <p className="text-sm text-black mt-1">{wf.description}</p>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Compliance Tab
function ComplianceTab({ businessId }: { businessId?: string }) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    requirement: '',
    regulation: '',
    compliance_type: 'other',
    frequency: 'annually',
    due_date: '',
    status: 'pending',
    notes: '',
  })

  useEffect(() => {
    loadItems()
  }, [])

  async function loadItems() {
    setLoading(true)
    const { data } = await supabase.from('compliance_items').select('*').eq('business_id', businessId).order('due_date', { ascending: true })
    setItems(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('compliance_items').insert({
      ...form,
      business_id: businessId,
      due_date: form.due_date || null,
    })
    if (error) { showToast('Could not create the compliance item.', 'error'); return }
    showToast('Compliance item added!', 'success')
    setShowForm(false)
    setForm({ requirement: '', regulation: '', compliance_type: 'other', frequency: 'annually', due_date: '', status: 'pending', notes: '' })
    loadItems()
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]',
    in_progress: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]',
    compliant: 'bg-[var(--av-success-soft)] text-[var(--av-success)]',
    non_compliant: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Compliance Tracking</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm">
          <Plus size={16} /> Add Requirement
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input
            type="text"
            placeholder="Compliance requirement"
            value={form.requirement}
            onChange={(e) => setForm({ ...form, requirement: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Regulation (e.g. NDPR, FIRS)"
              value={form.regulation}
              onChange={(e) => setForm({ ...form, regulation: e.target.value })}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={form.compliance_type} onChange={(e) => setForm({ ...form, compliance_type: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              <option value="data_protection">Data Protection</option>
              <option value="tax">Tax</option>
              <option value="labor">Labor</option>
              <option value="safety">Safety</option>
              <option value="environmental">Environmental</option>
              <option value="financial">Financial</option>
              <option value="other">Other</option>
            </select>
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              <option value="one_time">One Time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
          </div>
          <textarea
            placeholder="Notes..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            rows={2}
          />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">
            Add Compliance Item
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Scale size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No compliance items</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-black/10 px-2 py-0.5 rounded text-black capitalize">{item.compliance_type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[item.status]}`}>{item.status.replace('_', ' ')}</span>
                    {item.regulation && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{item.regulation}</span>}
                  </div>
                  <h3 className="font-medium">{item.requirement}</h3>
                  {item.due_date && <p className="text-sm text-black mt-1">Due: {new Date(item.due_date).toLocaleDateString()}</p>}
                </div>
                <button onClick={async () => {
                  await supabase.from('compliance_items').update({ status: 'compliant', reviewed_at: new Date().toISOString() }).eq('id', item.id)
                  showToast('Marked as compliant!', 'success')
                  loadItems()
                }} className="text-sm text-[var(--av-success)] hover:underline">Mark Compliant</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Documents Tab
function DocumentsTab({ businessId }: { businessId?: string }) {
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    title: '',
    document_type: 'policy',
    description: '',
    version: '1.0',
  })
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    loadDocuments()
  }, [])

  async function loadDocuments() {
    setLoading(true)
    const { data } = await supabase.from('company_documents').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setDocuments(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { showToast('Choose a file to upload.', 'error'); return }
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${businessId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { cacheControl: '3600' })
    if (upErr) { showToast('Upload failed.', 'error'); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
    const { error } = await supabase.from('company_documents').insert({
      title: form.title,
      document_type: form.document_type,
      description: form.description,
      version: form.version,
      file_url: publicUrl,
      file_size: file.size,
      mime_type: file.type,
      business_id: businessId,
    })
    setUploading(false)
    if (error) { showToast('Could not save the document record.', 'error'); return }
    showToast('Document uploaded!', 'success')
    setShowForm(false)
    setForm({ title: '', document_type: 'policy', description: '', version: '1.0' })
    setFile(null)
    loadDocuments()
  }

  const typeColors: Record<string, string> = {
    policy: 'bg-[var(--av-danger-soft)]0/10 text-[var(--av-danger)]',
    procedure: 'bg-[var(--av-primary-soft)]0/10 text-blue-500',
    contract: 'bg-purple-500/10 text-purple-500',
    template: 'bg-[var(--av-warning-soft)]0/10 text-[var(--av-warning)]',
    report: 'bg-[var(--av-success-soft)]0/10 text-[var(--av-success)]',
    legal: 'bg-black/10 text-black',
    training: 'bg-teal-500/10 text-teal-500',
    other: 'bg-black/10 text-black',
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Company Documents</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm">
          <Plus size={16} /> Upload Document
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input
            type="text"
            placeholder="Document Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            required
          />
          <textarea
            placeholder="Description..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            rows={2}
          />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.document_type} onChange={(e) => setForm({ ...form, document_type: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              <option value="policy">Policy</option>
              <option value="procedure">Procedure</option>
              <option value="contract">Contract</option>
              <option value="template">Template</option>
              <option value="report">Report</option>
              <option value="legal">Legal</option>
              <option value="training">Training</option>
              <option value="other">Other</option>
            </select>
            <input
              type="text"
              placeholder="Version"
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </div>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm"
            required
          />
          <button type="submit" disabled={uploading} className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Archive size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No documents uploaded</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--av-primary-soft)]0/10 flex items-center justify-center">
                  <ScrollText size={20} className="text-blue-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${typeColors[doc.document_type]}`}>{doc.document_type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${doc.status === 'active' ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]' : 'bg-white text-black'}`}>v{doc.version}</span>
                  </div>
                  <h3 className="font-medium">{doc.title}</h3>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Departments Tab
function DepartmentsTab({ businessId }: { businessId?: string }) {
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    color: '#4285F4',
  })

  useEffect(() => {
    loadDepartments()
  }, [])

  async function loadDepartments() {
    setLoading(true)
    const { data } = await supabase.from('departments').select('*').eq('business_id', businessId).order('name')
    setDepartments(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('departments').insert({
      ...form,
      business_id: businessId,
    })
    if (error) { showToast('Could not create the department.', 'error'); return }
    showToast('Department added!', 'success')
    setShowForm(false)
    setForm({ name: '', code: '', description: '', color: '#4285F4' })
    loadDepartments()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Departments</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm">
          <Plus size={16} /> Add Department
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Department Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm"
              required
            />
            <input
              type="text"
              placeholder="Code (e.g. ENG)"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </div>
          <textarea
            placeholder="Description..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            rows={2}
          />
          <div className="flex items-center gap-2 text-sm">
            <label className="text-black">Color</label>
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="w-8 h-8 rounded border border-black/10"
            />
          </div>
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">
            Add Department
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : departments.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Building2 size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No departments created</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <div key={dept.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${dept.color}20` }}>
                  <Building2 size={20} style={{ color: dept.color }} />
                </div>
                <div>
                  <h3 className="font-medium">{dept.name}</h3>
                  {dept.code && <p className="text-xs text-black">{dept.code}</p>}
                </div>
              </div>
              {dept.description && <p className="text-sm text-black">{dept.description}</p>}
              <div className="flex items-center gap-4 mt-3 text-sm text-black">
                {dept.headcount > 0 && <span>{dept.headcount} staff</span>}
                {dept.budget && <span>₦{dept.budget.toLocaleString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
