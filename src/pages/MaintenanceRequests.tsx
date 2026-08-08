import { useState, useEffect } from 'react'
import { 
  Wrench, Plus, Search, Filter, AlertTriangle, Clock, 
  CheckCircle, User, Building2, ChevronDown, Edit, Trash2,
  X, Check, AlertCircle, Calendar
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'

interface MaintenanceRequest {
  id: string
  property_id: string
  property?: {
    title: string
    address: string
    city: string
  }
  lease_id: string
  reported_by: string
  reporter?: {
    name: string
  }
  assigned_to: string
  assignee?: {
    name: string
  }
  category: 'plumbing' | 'electrical' | 'structural' | 'hvac' | 'appliances' |
            'pest_control' | 'cleaning' | 'landscaping' | 'security' | 'other'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  title: string
  description: string
  status: 'reported' | 'assigned' | 'in_progress' | 'pending_parts' | 'completed' | 'cancelled'
  resolution_notes: string
  completed_at: string
  cost: number
  created_at: string
}

const CATEGORY_ICONS: Record<string, string> = {
  plumbing: '🚿',
  electrical: '💡',
  structural: '🏗️',
  hvac: '❄️',
  appliances: '🔧',
  pest_control: '🐜',
  cleaning: '🧹',
  landscaping: '🌳',
  security: '🔒',
  other: '📋',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-[#9AA0A6]/10 text-[#9AA0A6]',
  medium: 'bg-[var(--av-primary)]/10 text-[var(--av-primary)]',
  high: 'bg-[var(--av-warning)]/10 text-[var(--av-warning)]',
  urgent: 'bg-[var(--av-danger)]/10 text-[var(--av-danger)]',
}

const STATUS_COLORS: Record<string, string> = {
  reported: 'bg-[var(--av-danger)]/10 text-[var(--av-danger)]',
  assigned: 'bg-[var(--av-primary)]/10 text-[var(--av-primary)]',
  in_progress: 'bg-[var(--av-warning)]/10 text-[var(--av-warning)]',
  pending_parts: 'bg-[var(--av-accent)]/10 text-[var(--av-accent)]',
  completed: 'bg-[var(--av-success)]/10 text-[var(--av-success)]',
  cancelled: 'bg-[#9AA0A6]/10 text-[#9AA0A6]',
}

export default function MaintenanceRequests() {
  const { staff } = useAuth()
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null)

  const [formData, setFormData] = useState({
    property_id: '',
    category: 'other' as MaintenanceRequest['category'],
    priority: 'medium' as MaintenanceRequest['priority'],
    title: '',
    description: '',
    assigned_to: '',
  })

  useEffect(() => {
    fetchRequests()
  }, [staff])

  const fetchRequests = async () => {
    if (!staff?.business_id) return
    
    try {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select(`
          *,
          property:properties(title, address, city),
          reporter:clients(name),
          assignee:staff(name)
        `)
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setRequests(data || [])
    } catch (error) {
      console.error('Error fetching requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staff?.business_id) return

    try {
      const { error } = await supabase
        .from('maintenance_requests')
        .insert([{
          ...formData,
          business_id: staff.business_id,
          reported_by: staff.id,
          status: 'reported',
        }])

      if (error) throw error

      setShowModal(false)
      resetForm()
      fetchRequests()
    } catch (error) {
      console.error('Error creating request:', error)
    }
  }

  const updateStatus = async (id: string, status: MaintenanceRequest['status']) => {
    try {
      const updates: Partial<MaintenanceRequest> = { status }
      if (status === 'completed') {
        updates.completed_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('maintenance_requests')
        .update(updates)
        .eq('id', id)

      if (error) throw error
      fetchRequests()
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      property_id: '',
      category: 'other',
      priority: 'medium',
      title: '',
      description: '',
      assigned_to: '',
    })
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const filteredRequests = requests.filter(request => {
    const matchesSearch = 
      request.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.property?.title.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesPriority = filterPriority === 'all' || request.priority === filterPriority
    const matchesStatus = filterStatus === 'all' || request.status === filterStatus

    return matchesSearch && matchesPriority && matchesStatus
  })

  const stats = {
    total: requests.length,
    urgent: requests.filter(r => r.priority === 'urgent' && r.status !== 'completed').length,
    inProgress: requests.filter(r => r.status === 'in_progress' || r.status === 'assigned').length,
    completed: requests.filter(r => r.status === 'completed').length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[var(--av-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Maintenance Requests</h1>
          <p className="text-sm text-black/60 mt-1">
            Track and manage property maintenance issues
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition"
        >
          <Plus size={18} />
          New Request
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--av-primary)]/10 flex items-center justify-center">
              <Wrench size={20} className="text-[var(--av-primary)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-black/60">Total Requests</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--av-danger)]/10 flex items-center justify-center">
              <AlertTriangle size={20} className="text-[var(--av-danger)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.urgent}</p>
              <p className="text-xs text-black/60">Urgent</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--av-warning)]/10 flex items-center justify-center">
              <Clock size={20} className="text-[var(--av-warning)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.inProgress}</p>
              <p className="text-xs text-black/60">In Progress</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--av-success)]/10 flex items-center justify-center">
              <CheckCircle size={20} className="text-[var(--av-success)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-xs text-black/60">Completed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
            <input
              type="text"
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[var(--av-primary)] transition"
            />
          </div>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[var(--av-primary)] transition"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[var(--av-primary)] transition"
          >
            <option value="all">All Status</option>
            <option value="reported">Reported</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="pending_parts">Pending Parts</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No maintenance requests"
          description={searchQuery || filterPriority !== 'all' || filterStatus !== 'all'
            ? "Try adjusting your filters"
            : "Create your first maintenance request"
          }
          action={{
            label: "New Request",
            onClick: () => setShowModal(true)
          }}
        />
      ) : (
        <div className="space-y-4">
          {filteredRequests.map(request => (
            <div key={request.id} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#F8F9FA] flex items-center justify-center text-2xl">
                    {CATEGORY_ICONS[request.category]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-black">{request.title}</h3>
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${PRIORITY_COLORS[request.priority]}`}>
                        {request.priority}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${STATUS_COLORS[request.status]}`}>
                        {request.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-black/60 mb-2">{request.description}</p>
                    <div className="flex items-center gap-4 text-xs text-black/50">
                      <span className="flex items-center gap-1">
                        <Building2 size={12} />
                        {request.property?.title || 'N/A'}
                      </span>
                      <span className="flex items-center gap-1">
                        <User size={12} />
                        {request.reporter?.name || 'Staff'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(request.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {request.status === 'reported' && (
                    <button
                      onClick={() => updateStatus(request.id, 'assigned')}
                      className="px-3 py-1.5 bg-[var(--av-primary)]/10 text-[var(--av-primary)] rounded-lg text-sm font-medium hover:bg-[var(--av-primary)]/20 transition"
                    >
                      Assign
                    </button>
                  )}
                  {request.status === 'assigned' && (
                    <button
                      onClick={() => updateStatus(request.id, 'in_progress')}
                      className="px-3 py-1.5 bg-[var(--av-warning)]/10 text-[var(--av-warning)] rounded-lg text-sm font-medium hover:bg-[var(--av-warning)]/20 transition"
                    >
                      Start Work
                    </button>
                  )}
                  {(request.status === 'in_progress' || request.status === 'pending_parts') && (
                    <button
                      onClick={() => updateStatus(request.id, 'completed')}
                      className="px-3 py-1.5 bg-[var(--av-success)]/10 text-[var(--av-success)] rounded-lg text-sm font-medium hover:bg-[var(--av-success)]/20 transition"
                    >
                      Mark Complete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Request Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          resetForm()
        }}
        title="Report Maintenance Issue"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Property *</label>
            <select
              required
              value={formData.property_id}
              onChange={(e) => setFormData({ ...formData, property_id: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
            >
              <option value="">Select Property</option>
              <option value="demo-property-1">3 Bedroom Flat - Victoria Island</option>
              <option value="demo-property-2">Office Space - Lekki</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category *</label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as MaintenanceRequest['category'] })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              >
                <option value="plumbing">Plumbing</option>
                <option value="electrical">Electrical</option>
                <option value="structural">Structural</option>
                <option value="hvac">HVAC</option>
                <option value="appliances">Appliances</option>
                <option value="pest_control">Pest Control</option>
                <option value="cleaning">Cleaning</option>
                <option value="landscaping">Landscaping</option>
                <option value="security">Security</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Priority *</label>
              <select
                required
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as MaintenanceRequest['priority'] })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Issue Title *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              placeholder="Brief description of the issue"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Detailed Description *</label>
            <textarea
              required
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              placeholder="Provide detailed information about the issue..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setShowModal(false)
                resetForm()
              }}
              className="flex-1 px-4 py-2 border border-black/10 rounded-xl font-medium hover:bg-black/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition"
            >
              Submit Request
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
