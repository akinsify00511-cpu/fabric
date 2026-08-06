import { useState, useEffect, useRef } from 'react'
import { Bell, Check, CheckCheck, X, Clock, DollarSign, Users, AlertCircle, Star, MessageSquare, Calendar } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useNavigate } from 'react-router-dom'

type NotificationType = 'job_created' | 'job_assigned' | 'job_updated' | 'job_completed' |
  'deal_created' | 'deal_stage_changed' | 'deal_won' | 'deal_lost' |
  'invoice_created' | 'invoice_paid' | 'invoice_overdue' |
  'task_assigned' | 'task_completed' |
  'leave_request' | 'leave_approved' | 'leave_rejected' |
  'payment_received' | 'system' | 'mention' | 'approval_required'

interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read: boolean
  metadata: Record<string, any>
  created_at: string
}

const TYPE_CONFIG: Record<NotificationType, { icon: React.ReactNode; color: string; bg: string }> = {
  job_assigned: { icon: <Star size={14} />, color: 'text-orange-500', bg: 'bg-orange-50' },
  job_completed: { icon: <CheckCheck size={14} />, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  job_updated: { icon: <Clock size={14} />, color: 'text-blue-500', bg: 'bg-blue-50' },
  invoice_paid: { icon: <DollarSign size={14} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  invoice_overdue: { icon: <AlertCircle size={14} />, color: 'text-red-500', bg: 'bg-red-50' },
  deal_won: { icon: <Star size={14} />, color: 'text-amber-500', bg: 'bg-amber-50' },
  deal_lost: { icon: <X size={14} />, color: 'text-gray-400', bg: 'bg-gray-50' },
  leave_request: { icon: <Calendar size={14} />, color: 'text-violet-500', bg: 'bg-violet-50' },
  leave_approved: { icon: <Check size={14} />, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  leave_rejected: { icon: <X size={14} />, color: 'text-red-500', bg: 'bg-red-50' },
  payment_received: { icon: <DollarSign size={14} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  task_assigned: { icon: <Check size={14} />, color: 'text-blue-500', bg: 'bg-blue-50' },
  task_completed: { icon: <CheckCheck size={14} />, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  approval_required: { icon: <AlertCircle size={14} />, color: 'text-amber-500', bg: 'bg-amber-50' },
  system: { icon: <Bell size={14} />, color: 'text-gray-400', bg: 'bg-gray-50' },
  mention: { icon: <MessageSquare size={14} />, color: 'text-blue-500', bg: 'bg-blue-50' },
  // fallback
  deal_created: { icon: <Users size={14} />, color: 'text-purple-500', bg: 'bg-purple-50' },
  deal_stage_changed: { icon: <Star size={14} />, color: 'text-purple-500', bg: 'bg-purple-50' },
  invoice_created: { icon: <DollarSign size={14} />, color: 'text-blue-500', bg: 'bg-blue-50' },
  job_created: { icon: <Star size={14} />, color: 'text-orange-500', bg: 'bg-orange-50' },
}

const DEMO_NOTIFICATIONS: Notification[] = [
  { id: '1', type: 'job_assigned', title: 'New job assigned', body: 'AC Installation at Lekki Villa has been assigned to you', link: '/app/jobs', read: false, metadata: {}, created_at: new Date(Date.now() - 300000).toISOString() },
  { id: '2', type: 'invoice_paid', title: 'Payment received', body: 'Riverside Construction paid ₦2,687,500', link: '/app/finance', read: false, metadata: {}, created_at: new Date(Date.now() - 1800000).toISOString() },
  { id: '3', type: 'deal_won', title: 'Deal won', body: 'Enterprise CRM License — ₦2,500,000', link: '/app/crm', read: false, metadata: {}, created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: '4', type: 'leave_request', title: 'Leave request', body: 'Tunde Bakare requested 3 days leave (Oct 14-16)', link: '/app/hr', read: true, metadata: {}, created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: '5', type: 'job_completed', title: 'Job completed', body: 'Quarterly Maintenance — VI Restaurant marked as completed', link: '/app/jobs', read: true, metadata: {}, created_at: new Date(Date.now() - 172800000).toISOString() },
]

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function NotificationBell() {
  const { staff, isDemo } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const loadNotifications = async () => {
    if (isDemo) {
      setNotifications(DEMO_NOTIFICATIONS)
      setInitialLoaded(true)
      return
    }
    if (!staff?.user_id) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', staff.user_id)
        .order('created_at', { ascending: false })
        .limit(20)
      setNotifications(data || [])
    } catch (err) {
      console.error('Error loading notifications:', err)
    }
    setLoading(false)
    setInitialLoaded(true)
  }

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!staff?.user_id || isDemo) return

    loadNotifications()

    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${staff.user_id}`,
      }, (payload) => {
        setNotifications(prev => [payload.new as Notification, ...prev.slice(0, 19)])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [staff?.user_id, isDemo])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markAllRead = async () => {
    if (isDemo) {
      setNotifications(notifications.map(n => ({ ...n, read: true })))
      return
    }
    if (!staff?.user_id) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', staff.user_id).eq('read', false)
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  const markRead = async (id: string) => {
    if (isDemo) {
      setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n))
      return
    }
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const handleNotificationClick = (n: Notification) => {
    markRead(n.id)
    if (n.link) navigate(n.link)
    setOpen(false)
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setOpen(!open); if (!open) loadNotifications() }}
        className="relative p-2 rounded-xl hover:bg-black/5 transition-colors"
      >
        <Bell size={20} className="text-black/60" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-black/6 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/6">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-black/5">
                <X size={14} className="text-black/40" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {!initialLoaded ? (
              <div className="p-6 text-center text-xs text-black/30">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell size={24} className="text-black/10 mx-auto mb-2" />
                <p className="text-sm text-black/30">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => {
                const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.system
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-black/[0.03] transition text-left border-b border-black/4 ${
                      n.read ? 'opacity-60' : ''
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                      <span className={cfg.color}>{cfg.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--avenize-black)] leading-tight">{n.title}</p>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1" />}
                      </div>
                      {n.body && <p className="text-xs text-black/40 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-black/30 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-black/6 bg-black/[0.02]">
            <button onClick={() => { navigate('/notifications'); setOpen(false) }}
              className="w-full text-center text-xs text-blue-600 hover:text-blue-700 font-medium">
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
