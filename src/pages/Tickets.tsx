import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import EntitlementGate from '../components/EntitlementGate'
import {
  Ticket, Plus, Search, Filter, Clock, User, AlertTriangle, CheckCircle2,
  MessageCircle, Tag, ChevronRight, ArrowLeft, Send, Lock, Inbox,
  RefreshCw, X, Eye, EyeOff
} from 'lucide-react'

type TicketType = {
  id: string
  subject: string
  description: string | null
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  category: string | null
  source: string
  customer_name: string | null
  customer_email: string | null
  assignee_id: string | null
  assignee_name?: string
  first_response_at: string | null
  created_at: string
  updated_at: string
}

type Reply = {
  id: string
  ticket_id: string
  sender_type: 'staff' | 'customer'
  sender_name: string
  content: string
  is_internal: boolean
  created_at: string
}

type StaffMember = {
  id: string
  full_name: string | null
  name: string
}

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]', icon: Inbox },
  in_progress: { label: 'In Progress', color: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]', icon: RefreshCw },
  waiting: { label: 'Waiting', color: 'bg-orange-100 text-orange-700', icon: Clock },
  resolved: { label: 'Resolved', color: 'bg-[var(--av-success-soft)] text-[var(--av-success)]', icon: CheckCircle2 },
  closed: { label: 'Closed', color: 'bg-[var(--av-surface)] text-[var(--av-text)]', icon: CheckCircle2 },
}

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'text-[var(--av-text)]' },
  medium: { label: 'Medium', color: 'text-[var(--av-primary)]' },
  high: { label: 'High', color: 'text-orange-500' },
  urgent: { label: 'Urgent', color: 'text-[var(--av-danger)]' },
}

export default function Tickets() {
  const { staff, session } = useAuth()
  const { showToast } = useToast()
  const [tickets, setTickets] = useState<TicketType[]>([])
  const [teamMembers, setTeamMembers] = useState<StaffMember[]>([])
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null)
  const [replies, setReplies] = useState<Reply[]>([])
  const [newReply, setNewReply] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState<TicketType['priority']>('medium')
  const [newCategory, setNewCategory] = useState('')
  const [showSidebar, setShowSidebar] = useState(true)

  const loadTickets = async () => {
    setLoading(true)
    
    try {
      const { data } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })

      // Enrich with assignee names
      const { data: staffData } = await supabase.from('staff').select('id, full_name, name')
      const staffMap = new Map((staffData ?? []).map((s: StaffMember) => [s.id, s.full_name ?? s.name]))

      if (data && data.length > 0) {
        const enriched = (data as TicketType[]).map((t) => ({
          ...t,
          assignee_name: t.assignee_id ? staffMap.get(t.assignee_id) : undefined,
        }))
        setTickets(enriched)
      } else {
        setTickets([])
      }
      setTeamMembers((staffData ?? []) as StaffMember[])
    } catch {
      setTickets([])
      setTeamMembers([])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadTickets()
  }, [])

  const loadTicketDetails = async (ticket: TicketType) => {
    setSelectedTicket(ticket)
    const { data } = await supabase
      .from('ticket_replies')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
    setReplies((data as Reply[]) ?? [])
  }

  const createTicket = async () => {
    if (!newSubject.trim()) {
      showToast('Enter a subject', 'error')
      return
    }
    const { error } = await supabase.from('tickets').insert({
      subject: newSubject,
      description: newDescription,
      priority: newPriority,
      category: newCategory || null,
      customer_name: staff?.full_name ?? staff?.name ?? 'Staff',
      customer_email: session?.user?.email ?? '',
      assignee_id: staff?.id,
    })
    if (error) {
      showToast('Failed to create ticket', 'error')
    } else {
      showToast('Ticket created!', 'success')
      setShowNewTicket(false)
      setNewSubject('')
      setNewDescription('')
      setNewPriority('medium')
      setNewCategory('')
      loadTickets()
    }
  }

  const sendReply = async () => {
    if (!newReply.trim() || !selectedTicket) return
    const { error } = await supabase.from('ticket_replies').insert({
      ticket_id: selectedTicket.id,
      sender_type: 'staff',
      sender_id: staff?.id,
      sender_name: staff?.full_name ?? staff?.name ?? 'Staff',
      content: newReply,
      is_internal: isInternal,
    })
    if (error) {
      showToast('Failed to send reply', 'error')
    } else {
      setNewReply('')
      setIsInternal(false)
      loadTicketDetails(selectedTicket)
      // Update ticket status to in_progress if open
      if (selectedTicket.status === 'open') {
        const { error: statusErr } = await supabase.from('tickets').update({ status: 'in_progress' }).eq('id', selectedTicket.id)
        if (statusErr) {
          showToast('Reply sent, but ticket status could not be updated', 'error')
        } else {
          setSelectedTicket({ ...selectedTicket, status: 'in_progress' })
          loadTickets()
        }
      }
    }
  }

  const updateStatus = async (ticketId: string, status: TicketType['status']) => {
    const { error } = await supabase.from('tickets').update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null }).eq('id', ticketId)
    if (error) {
      showToast('Failed to update status', 'error')
      return
    }
    showToast(`Status updated to ${STATUS_CONFIG[status].label}`, 'success')
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket({ ...selectedTicket, status })
    }
    loadTickets()
  }

  const assignTicket = async (ticketId: string, assigneeId: string) => {
    const { error } = await supabase.from('tickets').update({ assignee_id: assigneeId }).eq('id', ticketId)
    if (error) {
      showToast('Failed to assign ticket', 'error')
      return
    }
    showToast('Ticket assigned', 'success')
    loadTickets()
    if (selectedTicket?.id === ticketId) {
      const assignee = teamMembers.find((m) => m.id === assigneeId)
      setSelectedTicket({ ...selectedTicket, assignee_id: assigneeId, assignee_name: assignee?.full_name ?? assignee?.name })
    }
  }

  const filteredTickets = tickets.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (searchQuery && !t.subject.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const stats = {
    open: tickets.filter((t) => t.status === 'open').length,
    inProgress: tickets.filter((t) => t.status === 'in_progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length,
    urgent: tickets.filter((t) => t.priority === 'urgent' && !['resolved', 'closed'].includes(t.status)).length,
  }

  return (
    <EntitlementGate feature="support_tickets" modal={true}>
    <div className="flex h-[calc(100vh-140px)] md:h-[calc(100vh-80px)]">
      {/* Ticket List */}
      <div className={`${selectedTicket ? 'hidden md:flex' : 'flex'} w-full md:w-80 bg-[var(--av-surface)] border-r border-[var(--av-border-strong)]/[0.06] flex-col`}>
        {/* Header */}
        <div className="p-4 border-b border-[var(--av-border-strong)]/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--av-text)]">Tickets</h2>
            <button
              onClick={() => setShowNewTicket(true)}
              className="p-2 rounded-lg avenize-gradient text-white"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--av-text)]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tickets..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-[var(--av-border)]"
            />
          </div>
          {/* Status Filters */}
          <div className="flex gap-1 flex-wrap">
            {[
              { id: 'all', label: 'All', count: tickets.length },
              { id: 'open', label: 'Open', count: stats.open },
              { id: 'in_progress', label: 'Active', count: stats.inProgress },
              { id: 'resolved', label: 'Done', count: stats.resolved },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-2 py-1 rounded text-xs font-medium transition ${
                  statusFilter === f.id
                    ? 'avenize-gradient text-white'
                    : 'bg-black/[0.04] text-[var(--av-text)]/60'
                }`}
              >
                {f.label} {f.count}
              </button>
            ))}
          </div>
        </div>

        {/* Ticket List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-[var(--av-surface-3)] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-[var(--av-text)]">
              <Ticket size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No tickets found</p>
            </div>
          ) : (
            filteredTickets.map((ticket) => {
              const StatusIcon = STATUS_CONFIG[ticket.status].icon
              return (
                <button
                  key={ticket.id}
                  onClick={() => loadTicketDetails(ticket)}
                  className={`w-full p-4 text-left border-b border-[var(--av-border-strong)]/[0.04] transition ${
                    selectedTicket?.id === ticket.id
                      ? 'bg-[#8B5CF6]/5'
                      : 'hover:bg-[var(--av-surface-3)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[ticket.status].color}`}>
                      {STATUS_CONFIG[ticket.status].label}
                    </span>
                    {ticket.priority === 'urgent' && (
                      <AlertTriangle size={14} className="text-[var(--av-danger)]" />
                    )}
                  </div>
                  <p className="text-sm font-medium text-[var(--av-text)] line-clamp-1">{ticket.subject}</p>
                  <p className="text-xs text-[var(--av-text)] mt-1">
                    {ticket.customer_name ?? 'Unknown'} · {new Date(ticket.created_at).toLocaleDateString()}
                  </p>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Ticket Detail */}
      {selectedTicket ? (
        <div className="flex-1 flex flex-col min-w-0 bg-[#F8F9FA]">
          {/* Header */}
          <div className="px-4 py-3 bg-[var(--av-surface)] border-b border-[var(--av-border-strong)]/[0.06] flex items-center gap-3">
            <button
              onClick={() => setSelectedTicket(null)}
              className="md:hidden p-2 hover:bg-black/[0.05] rounded-lg"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="font-medium text-[var(--av-text)] truncate">{selectedTicket.subject}</h2>
              <p className="text-xs text-[var(--av-text)]">
                #{selectedTicket.id.slice(0, 8)} · {selectedTicket.customer_name ?? 'Unknown customer'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedTicket.status}
                onChange={(e) => updateStatus(selectedTicket.id, e.target.value as TicketType['status'])}
                className="text-xs rounded-lg border border-[var(--av-border)] px-2 py-1.5"
              >
                {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Replies */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Original Ticket */}
            <div className="bg-[var(--av-surface-elevated)] rounded-2xl p-4 border border-[var(--av-border-strong)]/[0.06]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-[var(--av-surface-3)] flex items-center justify-center text-sm font-medium">
                  {selectedTicket.customer_name?.charAt(0) ?? '?'}
                </div>
                <div>
                  <p className="text-sm font-medium">{selectedTicket.customer_name ?? 'Customer'}</p>
                  <p className="text-xs text-[var(--av-text)]">{new Date(selectedTicket.created_at).toLocaleString()}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_CONFIG[selectedTicket.priority].color} bg-current/10`}>
                    {PRIORITY_CONFIG[selectedTicket.priority].label}
                  </span>
                </div>
              </div>
              <p className="text-sm text-[var(--av-text)] whitespace-pre-wrap">{selectedTicket.description}</p>
            </div>

            {/* Replies */}
            {replies.map((reply) => (
              <div
                key={reply.id}
                className={`rounded-2xl p-4 border ${
                  reply.is_internal
                    ? 'bg-[var(--av-warning-soft)] border-[var(--av-warning-soft)]'
                    : 'bg-[var(--av-surface)] border-[var(--av-border-strong)]/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    reply.sender_type === 'staff' ? 'avenize-gradient text-white' : 'bg-[var(--av-surface-3)]'
                  }`}>
                    {reply.sender_name?.charAt(0) ?? '?'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {reply.sender_name}
                      {reply.is_internal && (
                        <span className="ml-2 text-xs bg-[var(--av-warning-soft)] text-[var(--av-warning)] px-1.5 py-0.5 rounded">Internal</span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--av-text)]">{new Date(reply.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <p className="text-sm text-[var(--av-text)] whitespace-pre-wrap">{reply.content}</p>
              </div>
            ))}
          </div>

          {/* Reply Composer */}
          <div className="p-4 bg-[var(--av-surface)] border-t border-[var(--av-border-strong)]/[0.06]">
            <div className="flex items-center gap-2 mb-2">
              <textarea
                value={newReply}
                onChange={(e) => setNewReply(e.target.value)}
                placeholder="Type your reply..."
                className="flex-1 resize-none rounded-xl border border-[var(--av-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) sendReply()
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-[var(--av-text)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="rounded"
                  />
                  <Lock size={12} />
                  Internal note
                </label>
              </div>
              <button
                onClick={sendReply}
                disabled={!newReply.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium disabled:opacity-50"
              >
                <Send size={14} />
                Send
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="hidden md:flex flex-1 items-center justify-center bg-[#F8F9FA]">
          <div className="text-center">
            <Ticket size={64} className="mx-auto mb-4 text-[var(--av-text)]/40" />
            <h2 className="text-lg font-medium text-[var(--av-text)]">Select a ticket</h2>
            <p className="text-sm text-[var(--av-text)] mt-1">Choose a ticket from the list to view details</p>
          </div>
        </div>
      )}

      {/* New Ticket Modal */}
      {showNewTicket && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl w-full max-w-lg shadow-xl">
            <div className="px-6 py-4 border-b border-[var(--av-border-strong)]/[0.06] flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Ticket</h2>
              <button onClick={() => setShowNewTicket(false)} className="p-2 hover:bg-black/[0.05] rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Subject</label>
                <input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Brief description of the issue"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--av-border)] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Description</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Detailed description..."
                  className="w-full px-4 py-3 rounded-xl border border-[var(--av-border)] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
                  rows={4}
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium block mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TicketType['priority'])}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--av-border)]"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium block mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--av-border)]"
                  >
                    <option value="">Select...</option>
                    <option value="bug">Bug</option>
                    <option value="feature">Feature Request</option>
                    <option value="billing">Billing</option>
                    <option value="support">Support</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--av-border-strong)]/[0.06] flex justify-end gap-3">
              <button
                onClick={() => setShowNewTicket(false)}
                className="px-4 py-2 rounded-lg border border-[var(--av-border)] text-sm hover:bg-[var(--av-surface-3)]"
              >
                Cancel
              </button>
              <button
                onClick={createTicket}
                className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
              >
                <Plus size={16} />
                Create Ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </EntitlementGate>
  )
}
