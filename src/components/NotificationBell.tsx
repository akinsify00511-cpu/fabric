import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Bell, Check, CheckCheck, X, MessageSquare, Users2, ShoppingCart, CheckSquare, CreditCard, Calendar, Trophy, AlertCircle } from 'lucide-react'

type Notification = {
  id: string
  type: string
  title: string
  body: string | null
  data: any
  read: boolean
  action_url: string | null
  icon: string | null
  priority: string
  created_at: string
}

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  chat_message: { icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50' },
  deal_assigned: { icon: Users2, color: 'text-purple-500', bg: 'bg-purple-50' },
  deal_won: { icon: ShoppingCart, color: 'text-green-500', bg: 'bg-green-50' },
  deal_lost: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50' },
  task_assigned: { icon: CheckSquare, color: 'text-cyan-500', bg: 'bg-cyan-50' },
  task_due: { icon: Calendar, color: 'text-orange-500', bg: 'bg-orange-50' },
  task_completed: { icon: CheckSquare, color: 'text-green-500', bg: 'bg-green-50' },
  invoice_paid: { icon: CreditCard, color: 'text-green-500', bg: 'bg-green-50' },
  achievement: { icon: Trophy, color: 'text-amber-500', bg: 'bg-amber-50' },
  system: { icon: Bell, color: 'text-gray-500', bg: 'bg-gray-50' },
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const loadNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    setNotifications((data as Notification[]) ?? [])
    setUnreadCount((data as Notification[])?.filter((n: Notification) => !n.read).length ?? 0)
  }

  useEffect(() => {
    loadNotifications()

    // Subscribe to new notifications
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
      }, () => {
        loadNotifications()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    loadNotifications()
  }

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) return

    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .in('id', unreadIds)
    loadNotifications()
  }

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 rounded-xl hover:bg-black/[0.05] transition-colors"
      >
        <Bell size={20} className="text-black/60" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl shadow-xl border border-black/[0.06] overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-black/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1.5 rounded-lg hover:bg-black/[0.05] text-black/40 hover:text-black/60"
                  title="Mark all as read"
                >
                  <CheckCheck size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-black/40">
                <Bell size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.system
                const Icon = config.icon

                return (
                  <button
                    key={notification.id}
                    onClick={() => !notification.read && markAsRead(notification.id)}
                    className={`w-full p-4 text-left border-b border-black/[0.04] last:border-0 hover:bg-black/[0.02] transition-colors ${
                      !notification.read ? 'bg-[var(--avenize-accent-end)]/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center shrink-0`}>
                        {notification.icon ? (
                          <span className="text-xl">{notification.icon}</span>
                        ) : (
                          <Icon size={18} className={config.color} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-medium ${!notification.read ? 'text-[var(--avenize-black)]' : 'text-black/70'}`}>
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <div className="w-2 h-2 rounded-full bg-[var(--avenize-accent-end)] shrink-0" />
                          )}
                        </div>
                        {notification.body && (
                          <p className="text-xs text-black/50 mt-0.5 line-clamp-2">
                            {notification.body}
                          </p>
                        )}
                        <p className="text-xs text-black/30 mt-1">
                          {getTimeAgo(notification.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-black/[0.06]">
            <button className="w-full text-center text-sm text-[var(--avenize-accent-end)] hover:underline">
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
