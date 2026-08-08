import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, X, Check, MessageSquare, Calendar, AlertCircle, User, DollarSign } from 'lucide-react'

interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error' | 'message' | 'calendar' | 'payment' | 'mention'
  title: string
  message: string
  timestamp: Date
  read: boolean
  link?: string
}

const NOTIFICATION_ICONS = {
  info: AlertCircle,
  success: Check,
  warning: AlertCircle,
  error: AlertCircle,
  message: MessageSquare,
  calendar: Calendar,
  payment: DollarSign,
  mention: User,
}

const NOTIFICATION_COLORS = {
  info: 'text-blue-500 bg-blue-50',
  success: 'text-green-500 bg-green-50',
  warning: 'text-amber-500 bg-amber-50',
  error: 'text-red-500 bg-red-50',
  message: 'text-purple-500 bg-purple-50',
  calendar: 'text-indigo-500 bg-indigo-50',
  payment: 'text-emerald-500 bg-emerald-50',
  mention: 'text-pink-500 bg-pink-50',
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load notifications
  useEffect(() => {
    loadNotifications()
  }, [])

  const loadNotifications = async () => {
    setLoading(true)
    try {
      // Load from localStorage for demo
      const stored = localStorage.getItem('avenize-notifications')
      if (stored) {
        setNotifications(JSON.parse(stored))
      } else {
        // Demo notifications
        const demo: Notification[] = [
          {
            id: '1',
            type: 'message',
            title: 'New message',
            message: 'Sarah sent you a message about the project update',
            timestamp: new Date(Date.now() - 1000 * 60 * 5),
            read: false,
            link: '/app/chat',
          },
          {
            id: '2',
            type: 'calendar',
            title: 'Upcoming meeting',
            message: 'Team standup in 15 minutes',
            timestamp: new Date(Date.now() - 1000 * 60 * 30),
            read: false,
            link: '/app/calendar',
          },
          {
            id: '3',
            type: 'payment',
            title: 'Payment received',
            message: 'Invoice #1234 has been paid - ₦150,000',
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
            read: true,
            link: '/app/payments',
          },
        ]
        setNotifications(demo)
        localStorage.setItem('avenize-notifications', JSON.stringify(demo))
      }
    } catch (error) {
      console.error('Failed to load notifications:', error)
    }
    setLoading(false)
  }

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

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      localStorage.setItem('avenize-notifications', JSON.stringify(updated))
      return updated
    })
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }))
      localStorage.setItem('avenize-notifications', JSON.stringify(updated))
      return updated
    })
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.filter((n) => n.id !== id)
      localStorage.setItem('avenize-notifications', JSON.stringify(updated))
      return updated
    })
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - new Date(date).getTime()
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
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
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
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
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
                <Bell size={32} className="text-black/20 mx-auto mb-2" />
                <p className="text-sm text-black/50">No notifications</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = NOTIFICATION_ICONS[notification.type]
                const colorClass = NOTIFICATION_COLORS[notification.type]
                return (
                  <div
                    key={notification.id}
                    className={`flex gap-3 p-4 hover:bg-black/5 transition-colors cursor-pointer ${
                      !notification.read ? 'bg-blue-50/50' : ''
                    }`}
                    onClick={() => markAsRead(notification.id)}
                  >
                    <div className={`p-2 rounded-xl ${colorClass}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-black truncate">{notification.title}</p>
                        {!notification.read && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-black/50 line-clamp-2 mt-0.5">{notification.message}</p>
                      <p className="text-xs text-black/30 mt-1">{formatTime(notification.timestamp)}</p>
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
                  </div>
                )
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-black/5 text-center">
              <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                View all notifications
              </button>
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
