import { useState, useEffect } from 'react'
import {
  Bell, Check, CheckCheck, Trash2, Clock, FileText,
  DollarSign, Calendar, User, MessageSquare, AlertTriangle,
  ChevronRight, Settings, Filter, RefreshCw, Eye
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { WhatsAppWeb } from '../lib/whatsappService'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  priority: string
  is_read: boolean
  read_at: string
  link: string
  created_at: string
  icon: string
  color: string
}

const notificationIcons: Record<string, any> = {
  invoice: DollarSign,
  payment: DollarSign,
  leave: Calendar,
  task: FileText,
  mention: MessageSquare,
  reminder: Clock,
  alert: AlertTriangle,
  staff: User,
}

const notificationColors: Record<string, string> = {
  invoice: 'bg-blue-500',
  payment: 'bg-green-500',
  leave: 'bg-purple-500',
  task: 'bg-amber-500',
  mention: 'bg-indigo-500',
  reminder: 'bg-cyan-500',
  alert: 'bg-red-500',
  staff: 'bg-pink-500',
}

export default function NotificationsCenterPage() {
  const { staff } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [filterType, setFilterType] = useState<string>('all')

  useEffect(() => {
    loadNotifications()
  }, [staff?.id])

  async function loadNotifications() {
    if (!staff?.id) return
    setLoading(true)

    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('staff_id', staff.id)
        .order('created_at', { ascending: false })
        .limit(100)

      setNotifications(data || [])
    } catch (e) {
      console.error('Failed to load:', e)
    } finally {
      setLoading(false)
    }
  }

  async function markAsRead(id: string) {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
      loadNotifications()
    } catch (e) {
      console.error('Failed to mark as read:', e)
    }
  }

  async function markAllAsRead() {
    if (!staff?.id) return
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('staff_id', staff.id)
        .eq('is_read', false)
      loadNotifications()
    } catch (e) {
      console.error('Failed to mark all as read:', e)
    }
  }

  async function deleteNotification(id: string) {
    try {
      await supabase.from('notifications').delete().eq('id', id)
      loadNotifications()
    } catch (e) {
      console.error('Failed to delete:', e)
    }
  }

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread' && n.is_read) return false
    if (filterType !== 'all' && n.type !== filterType) return false
    return true
  })

  const unreadCount = notifications.filter(n => !n.is_read).length
  const types = [...new Set(notifications.map(n => n.type))]

  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Bell size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Notifications</h1>
            <p className="text-sm text-black/50">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#4285F4] text-white text-sm"
            >
              <CheckCheck size={16} />
              Mark all read
            </button>
          )}
          <button className="p-2 rounded-lg hover:bg-black/5">
            <Settings size={20} className="text-black/50" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            filter === 'all' ? 'bg-[#4285F4] text-white' : 'bg-white border border-black/10'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            filter === 'unread' ? 'bg-[#4285F4] text-white' : 'bg-white border border-black/10'
          }`}
        >
          Unread {unreadCount > 0 && `(${unreadCount})`}
        </button>
        <div className="h-8 w-px bg-black/10" />
        {types.map(type => (
          <button
            key={type}
            onClick={() => setFilterType(filterType === type ? 'all' : type)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
              filterType === type ? 'bg-[#4285F4] text-white' : 'bg-white border border-black/10'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-black/40">
            <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
            Loading...
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-12 text-center text-black/40">
            <Bell size={48} className="mx-auto mb-4 text-black/20" />
            <p className="font-medium mb-2">No notifications</p>
            <p className="text-sm">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {filteredNotifications.map(notification => {
              const Icon = notificationIcons[notification.type] || Bell
              const color = notificationColors[notification.type] || 'bg-white0'

              return (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-black/[0.02] transition ${
                    !notification.is_read ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center shrink-0`}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-medium ${!notification.is_read ? 'text-black' : 'text-black/70'}`}>
                          {notification.title}
                        </span>
                        {!notification.is_read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                        )}
                      </div>
                      {notification.message && (
                        <p className="text-sm text-black/60 line-clamp-2">{notification.message}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-black/40">
                        <Clock size={12} />
                        {new Date(notification.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!notification.is_read && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="p-2 hover:bg-black/5 rounded-lg"
                          title="Mark as read"
                        >
                          <Check size={16} className="text-black/50" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(notification.id)}
                        className="p-2 hover:bg-red-50 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 size={16} className="text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// NOTIFICATION BADGE COMPONENT
// For header use
// ============================================

export function NotificationBadge({ className = '' }: { className?: string }) {
  const { staff } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!staff?.id) return
    
    const loadCount = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id', { count: 'exact' })
        .eq('staff_id', staff.id)
        .eq('is_read', false)
      
      setUnreadCount(data?.length || 0)
    }

    loadCount()

    // Subscribe to changes
    const channel = supabase
      .channel('notifications_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `staff_id=eq.${staff.id}`,
      }, () => {
        loadCount()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [staff?.id])

  if (unreadCount === 0) return null

  return (
    <div className={`relative ${className}`}>
      <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
        <span className="text-[10px] text-white font-bold">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      </div>
    </div>
  )
}

// ============================================
// IN-APP NOTIFICATION TOAST
// ============================================

export function useNotifications() {
  const { staff } = useAuth()

  async function showNotification(notification: {
    type: string
    title: string
    message?: string
    priority?: string
    link?: string
  }) {
    if (!staff?.id) return

    try {
      await supabase.from('notifications').insert({
        staff_id: staff.id,
        business_id: staff.business_id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        priority: notification.priority || 'normal',
        link: notification.link,
      })
    } catch (e) {
      console.error('Failed to show notification:', e)
    }
  }

  return { showNotification }
}
