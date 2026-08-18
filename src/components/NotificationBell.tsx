import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, X, Check, MessageSquare, Calendar, AlertCircle, User, DollarSign, BellOff, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

interface Notification {
  id: string
  type: string
  title: string
  message: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

const NOTIFICATION_ICONS: Record<string, typeof Bell> = {
  chat_message: MessageSquare,
  meeting: Calendar,
  reminder: Calendar,
  task_assigned: Check,
  task_due: AlertCircle,
  task_completed: Check,
  invoice_paid: DollarSign,
  invoice_overdue: AlertCircle,
  payment: DollarSign,
  leave_approved: Check,
  leave_rejected: AlertCircle,
  mention: User,
  comment: MessageSquare,
  system: AlertCircle,
  achievement: Check,
  intelligence: Sparkles,
}

const NOTIFICATION_COLORS: Record<string, string> = {
  chat_message: 'text-blue-500 bg-[var(--av-primary-soft)]',
  meeting: 'text-indigo-500 bg-indigo-50',
  reminder: 'text-indigo-500 bg-indigo-50',
  task_assigned: 'text-[var(--av-success)] bg-[var(--av-success-soft)]',
  task_due: 'text-[var(--av-warning)] bg-[var(--av-warning-soft)]',
  task_completed: 'text-[var(--av-success)] bg-[var(--av-success-soft)]',
  invoice_paid: 'text-emerald-500 bg-emerald-50',
  invoice_overdue: 'text-[var(--av-danger)] bg-[var(--av-danger-soft)]',
  payment: 'text-emerald-500 bg-emerald-50',
  leave_approved: 'text-[var(--av-success)] bg-[var(--av-success-soft)]',
  leave_rejected: 'text-[var(--av-danger)] bg-[var(--av-danger-soft)]',
  mention: 'text-pink-500 bg-pink-50',
  comment: 'text-blue-500 bg-[var(--av-primary-soft)]',
  system: 'text-gray-500 bg-gray-50',
  achievement: 'text-purple-500 bg-purple-50',
  intelligence: 'text-violet-500 bg-violet-50',
}

function getIcon(type: string) {
  return NOTIFICATION_ICONS[type] || Bell
}

function getColor(type: string) {
  return NOTIFICATION_COLORS[type] || 'text-gray-500 bg-gray-50'
}

export default function NotificationBell() {
  const { staff } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const loadNotificationsRef = useRef<() => void>(() => {})

  const loadNotifications = useCallback(async () => {
    if (!staff?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, message, link, is_read, created_at')
        .or(`staff_id.eq.${staff.id},business_id.eq.${staff.business_id}`)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        console.error('Failed to load notifications:', error)
        setNotifications([])
      } else {
        setNotifications(data as Notification[])
      }
    } catch (err) {
      console.error('Failed to load notifications:', err)
      setNotifications([])
    }
    setLoading(false)
  }, [staff?.id, staff?.business_id])

  // Keep ref in sync so the realtime callback always calls the latest version
  // without forcing the realtime effect to re-subscribe.
  loadNotificationsRef.current = loadNotifications

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  // Realtime: listen for new notifications.
  // loadNotifications is intentionally excluded from the dep array — including
  // it causes the effect to tear down + re-create the channel on every identity
  // change, and since removeChannel() is async, the new .channel(sameName) can
  // return the still-subscribed channel object from Supabase's cache, causing
  // .on() to throw "cannot add callbacks after subscribe()" (crashes the page).
  useEffect(() => {
    if (!staff?.id && !staff?.business_id) return

    // Unique channel name per mount: Shell renders this component in BOTH the
    // desktop header and the mobile header simultaneously (CSS-hidden, not
    // unmounted), so two instances always subscribe. A shared static channel
    // name returns the same cached Supabase client channel object, and calling
    // .on().subscribe() on an already-subscribing channel throws
    // "cannot add callbacks after subscribe()", crashing the page. A per-mount
    // suffix keeps each instance on its own channel.
    const channel = supabase
      .channel(`notifications:realtime:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
      }, () => {
        loadNotificationsRef.current()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [staff?.id, staff?.business_id])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
    if (unreadIds.length === 0) return
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', unreadIds)
    } catch (err) {
      console.error('Failed to mark all as read:', err)
    }
  }, [notifications])

  const dismissNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    try {
      await supabase.from('notifications').delete().eq('id', id)
    } catch (err) {
      console.error('Failed to dismiss notification:', err)
    }
  }, [])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-black/10 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={20} className="text-black/60" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[var(--av-danger-soft)]0 text-white text-xs font-medium rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-black/5 z-50 animate-scale-in overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
            <h3 className="font-semibold text-black">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-[var(--av-primary)] hover:text-[var(--av-primary)] font-medium"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-black/5"
              >
                <X size={16} className="text-black/40" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <BellOff size={32} className="text-black/20 mx-auto mb-2" />
                <p className="text-sm text-black/50">No notifications yet</p>
                <p className="text-xs text-black/30 mt-1">You'll see meeting invites, task assignments, and payment updates here.</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = getIcon(notification.type)
                const colorClass = getColor(notification.type)
                const notifContent = (
                  <>
                    <div className={`p-2 rounded-xl ${colorClass}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-black truncate">{notification.title}</p>
                        {!notification.is_read && (
                          <span className="w-2 h-2 bg-[var(--av-primary-soft)]0 rounded-full flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      {notification.message && (
                        <p className="text-xs text-black/50 line-clamp-2 mt-0.5">{notification.message}</p>
                      )}
                      <p className="text-xs text-black/30 mt-1">{formatTime(notification.created_at)}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        dismissNotification(notification.id)
                      }}
                      className="p-1 rounded hover:bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={14} className="text-black/30" />
                    </button>
                  </>
                )
                return notification.link ? (
                  <Link
                    key={notification.id}
                    to={notification.link}
                    className={`flex gap-3 p-4 hover:bg-black/5 transition-colors cursor-pointer ${
                      !notification.is_read ? 'bg-[var(--av-primary-soft)]/50' : ''
                    }`}
                    onClick={() => markAsRead(notification.id)}
                  >
                    {notifContent}
                  </Link>
                ) : (
                  <div
                    key={notification.id}
                    className={`flex gap-3 p-4 hover:bg-black/5 transition-colors cursor-pointer ${
                      !notification.is_read ? 'bg-[var(--av-primary-soft)]/50' : ''
                    }`}
                    onClick={() => markAsRead(notification.id)}
                  >
                    {notifContent}
                  </div>
                )
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-black/5 text-center">
              <Link to="/app/notifications" className="text-sm text-[var(--av-primary)] hover:text-[var(--av-primary)] font-medium">
                View all notifications
              </Link>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in { animation: scale-in 0.15s cubic-bezier(0.2, 0, 0, 1); }
      `}</style>
    </div>
  )
}
