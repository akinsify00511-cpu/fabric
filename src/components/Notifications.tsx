import { useState, useEffect, useRef } from 'react'
import { Bell, Check, CheckCheck, X, Mail, Clock, CreditCard, Users, AlertCircle, Sparkles, MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Link } from 'react-router-dom'

type NotificationCategory = 'onboarding' | 'task' | 'payment' | 'reminder' | 'marketing' | 'social' | 'system'

interface Notification {
  id: string
  title: string
  message: string
  category: NotificationCategory
  read: boolean
  created_at: string
  action_url?: string
  action_text?: string
}

const categoryConfig: Record<NotificationCategory, { icon: typeof Bell; color: string; bg: string }> = {
  onboarding: { icon: Sparkles, color: 'text-purple-500', bg: 'bg-purple-100' },
  task: { icon: Check, color: 'text-green-500', bg: 'bg-green-100' },
  payment: { icon: CreditCard, color: 'text-blue-500', bg: 'bg-blue-100' },
  reminder: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-100' },
  marketing: { icon: Sparkles, color: 'text-pink-500', bg: 'bg-pink-100' },
  social: { icon: Users, color: 'text-[#4285F4]', bg: 'bg-[#4285F4]/10' },
  system: { icon: AlertCircle, color: 'text-black', bg: 'bg-white' },
}

export default function NotificationBell() {
  const { staff } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (staff?.user_id) {
      loadNotifications()
      
      // Subscribe to new notifications
      const channel = supabase
        .channel('notifications')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${staff.user_id}`
        }, (payload) => {
          const newNotification = payload.new as Notification
          setNotifications(prev => [newNotification, ...prev])
          setUnreadCount(prev => prev + 1)
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [staff?.user_id])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadNotifications() {
    if (!staff?.user_id) return
    setLoading(true)
    
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', staff.user_id)
      .eq('sent', true)
      .order('created_at', { ascending: false })
      .limit(20)
    
    if (data) {
      setNotifications(data)
      setUnreadCount(data.filter(n => !n.read).length)
    }
    setLoading(false)
  }

  async function markAsRead(id: string) {
    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  async function markAllAsRead() {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return
    
    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .in('id', unreadIds)
    
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  function formatTime(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

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
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-black/10 transition"
      >
        <Bell size={20} className={unreadCount > 0 ? 'text-[var(--av-primary, #0891B2)]' : 'text-black'} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 md:w-96 bg-white rounded-2xl shadow-xl border border-black/[0.06] overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-black/[0.06]">
            <div>
              <h3 className="font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <p className="text-xs text-black">{unreadCount} unread</p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-[var(--av-primary, #0891B2)] hover:underline flex items-center gap-1"
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-black">
                <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full mx-auto" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell size={32} className="mx-auto text-black/50 mb-2" />
                <p className="text-sm text-black">No notifications yet</p>
                <p className="text-xs text-black mt-1">
                  We'll notify you when something important happens
                </p>
              </div>
            ) : (
              <div className="divide-y divide-black/[0.06]">
                {notifications.map((notification) => {
                  const config = categoryConfig[notification.category] || categoryConfig.system
                  const Icon = config.icon
                  
                  return (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-black/10 transition ${
                        !notification.read ? 'bg-[var(--av-primary, #0891B2)]/5' : ''
                      }`}
                      onClick={() => !notification.read && markAsRead(notification.id)}
                    >
                      <div className="flex gap-3">
                        <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center shrink-0`}>
                          <Icon size={18} className={config.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm ${!notification.read ? 'font-medium' : ''}`}>
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <span className="w-2 h-2 bg-[var(--av-primary, #0891B2)] rounded-full shrink-0 mt-1" />
                            )}
                          </div>
                          <p className="text-xs text-black mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-black">
                              {formatTime(notification.created_at)}
                            </span>
                            {notification.action_url && (
                              <Link
                                to={notification.action_url}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-[var(--av-primary, #0891B2)] hover:underline"
                              >
                                {notification.action_text || 'View'}
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-black/[0.06] text-center">
              <Link
                to="/app/notifications"
                onClick={() => setIsOpen(false)}
                className="text-xs text-[var(--av-primary, #0891B2)] hover:underline"
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
