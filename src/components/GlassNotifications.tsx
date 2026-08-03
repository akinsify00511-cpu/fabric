// ============================================
// GLASSMORPHISM NOTIFICATION COMPONENT
// For Avenize App Dashboard
// ============================================

import { useState } from 'react'
import { X, Check, AlertCircle, Info, Bell, Clock, User, DollarSign, TrendingUp, MessageSquare, Calendar, FileText, Zap } from 'lucide-react'

// ============================================
// TYPES
// ============================================
export type NotificationType = 
  | 'deal' 
  | 'task' 
  | 'alert' 
  | 'info' 
  | 'payment' 
  | 'message' 
  | 'system'

export type NotificationColor = 'coral' | 'amber' | 'mint' | 'indigo' | 'violet' | 'sky' | 'teal' | 'rose'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  time?: string
  read?: boolean
  actionUrl?: string
  actions?: { label: string; onClick?: () => void }[]
  avatar?: { initials: string; image?: string }
  progress?: { value: number; color?: NotificationColor }
}

interface GlassNotificationProps {
  notification: Notification
  onDismiss?: (id: string) => void
  onAction?: (id: string, action: string) => void
  variant?: 'light' | 'dark' | 'colored'
}

// ============================================
// COLOR CONFIG
// ============================================
const COLOR_MAP: Record<NotificationColor, { bg: string; border: string; icon: string }> = {
  coral: { bg: 'rgba(255, 107, 107, 0.12)', border: 'rgba(255, 107, 107, 0.25)', icon: '#ff6b6b' },
  amber: { bg: 'rgba(255, 169, 77, 0.12)', border: 'rgba(255, 169, 77, 0.25)', icon: '#ffa94d' },
  mint: { bg: 'rgba(105, 219, 124, 0.12)', border: 'rgba(105, 219, 124, 0.25)', icon: '#69db7c' },
  indigo: { bg: 'rgba(116, 143, 252, 0.12)', border: 'rgba(116, 143, 252, 0.25)', icon: '#748ffc' },
  violet: { bg: 'rgba(218, 119, 242, 0.12)', border: 'rgba(218, 119, 242, 0.25)', icon: '#da77f2' },
  sky: { bg: 'rgba(77, 171, 247, 0.12)', border: 'rgba(77, 171, 247, 0.25)', icon: '#4dabf7' },
  teal: { bg: 'rgba(56, 217, 169, 0.12)', border: 'rgba(56, 217, 169, 0.25)', icon: '#38d9a9' },
  rose: { bg: 'rgba(248, 131, 172, 0.12)', border: 'rgba(248, 131, 172, 0.25)', icon: '#f783ac' },
}

const TYPE_ICON_MAP: Record<NotificationType, { icon: typeof Bell; color: NotificationColor }> = {
  deal: { icon: DollarSign, color: 'mint' },
  task: { icon: Check, color: 'indigo' },
  alert: { icon: AlertCircle, color: 'coral' },
  info: { icon: Info, color: 'sky' },
  payment: { icon: TrendingUp, color: 'mint' },
  message: { icon: MessageSquare, color: 'violet' },
  system: { icon: Zap, color: 'amber' },
}

// ============================================
// GLASS NOTIFICATION COMPONENT
// ============================================
export function GlassNotification({ 
  notification, 
  onDismiss, 
  onAction,
  variant = 'colored'
}: GlassNotificationProps) {
  const [dismissed, setDismissed] = useState(false)
  
  const typeConfig = TYPE_ICON_MAP[notification.type]
  const colorConfig = COLOR_MAP[typeConfig.color]
  const Icon = typeConfig.icon

  const handleDismiss = () => {
    setDismissed(true)
    setTimeout(() => onDismiss?.(notification.id), 300)
  }

  if (dismissed) return null

  const bgStyle = variant === 'dark' 
    ? 'rgba(10, 10, 15, 0.7)' 
    : variant === 'light'
    ? 'rgba(255, 255, 255, 0.7)'
    : colorConfig.bg

  const borderColor = variant === 'dark' 
    ? 'rgba(255, 255, 255, 0.1)' 
    : variant === 'light'
    ? 'rgba(255, 255, 255, 0.9)'
    : colorConfig.border

  return (
    <div
      className="group relative flex items-start gap-4 p-4 rounded-2xl cursor-pointer transition-all duration-300 hover:-translate-x-2"
      style={{
        background: bgStyle,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: `1px solid ${borderColor}`,
        boxShadow: variant === 'dark' 
          ? '0 8px 40px rgba(0, 0, 0, 0.4)' 
          : '0 4px 24px rgba(0, 0, 0, 0.06)',
        animation: 'slideIn 0.5s ease-out both',
      }}
    >
      {/* Unread Indicator */}
      {!notification.read && (
        <div 
          className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full animate-pulse"
          style={{ background: '#748ffc', boxShadow: '0 0 8px #748ffc' }}
        />
      )}

      {/* Avatar or Icon */}
      {notification.avatar ? (
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${colorConfig.icon} 0%, ${colorConfig.icon}80 100%)`,
          }}
        >
          {notification.avatar.image ? (
            <img src={notification.avatar.image} alt="" className="w-full h-full object-cover" />
          ) : (
            notification.avatar.initials
          )}
          {/* Highlight overlay */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%)' }}
          />
        </div>
      ) : (
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 relative"
          style={{ background: `${colorConfig.icon}20` }}
        >
          <Icon size={20} style={{ color: colorConfig.icon }} />
          {/* Glow effect */}
          <div 
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{ 
              background: `radial-gradient(circle, ${colorConfig.icon}30 0%, transparent 70%)`,
              filter: 'blur(8px)',
              opacity: 0.5
            }}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span 
            className="font-bold"
            style={{ 
              fontSize: '15px',
              color: variant === 'dark' ? 'white' : '#0a0a0f'
            }}
          >
            {notification.title}
          </span>
        </div>
        <p 
          className="text-sm mb-2"
          style={{ 
            opacity: 0.6,
            color: variant === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)'
          }}
        >
          {notification.message}
        </p>
        
        {/* Time */}
        {notification.time && (
          <span 
            className="text-xs"
            style={{ 
              opacity: 0.4,
              color: variant === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'
            }}
          >
            {notification.time}
          </span>
        )}

        {/* Actions */}
        {notification.actions && notification.actions.length > 0 && (
          <div className="flex gap-2 mt-3">
            {notification.actions.map((action, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation()
                  action.onClick?.()
                  onAction?.(notification.id, action.label)
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-105"
                style={{ background: '#748ffc' }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dismiss Button */}
      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDismiss()
          }}
          className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-black/10"
          style={{ color: variant === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}
        >
          <X size={14} />
        </button>
      )}

      {/* Progress Bar */}
      {notification.progress && (
        <div 
          className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.1)' }}
        >
          <div 
            className="h-full transition-all duration-300"
            style={{ 
              width: `${notification.progress.value}%`,
              background: COLOR_MAP[notification.progress.color || 'indigo'].icon,
              animation: notification.progress.value > 0 ? 'shrink 5s linear forwards' : 'none'
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  )
}

// ============================================
// NOTIFICATION GROUP COMPONENT
// ============================================
interface NotificationGroupProps {
  title: string
  count?: number
  icon?: string
  children: React.ReactNode
  variant?: 'light' | 'dark'
}

export function NotificationGroup({ title, count, icon, children, variant = 'light' }: NotificationGroupProps) {
  return (
    <div 
      className="p-4 rounded-2xl"
      style={{
        background: variant === 'dark' ? 'rgba(10, 10, 15, 0.6)' : 'rgba(255, 255, 255, 0.5)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${variant === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.8)'}`,
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)'
      }}
    >
      <div 
        className="flex items-center justify-between mb-4 pb-4"
        style={{ borderBottom: `1px solid ${variant === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg">{icon}</span>}
          <span className="font-bold" style={{ color: variant === 'dark' ? 'white' : '#0a0a0f' }}>
            {title}
          </span>
        </div>
        {count !== undefined && (
          <span 
            className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
            style={{ background: '#748ffc' }}
          >
            {count}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {children}
      </div>
    </div>
  )
}

// ============================================
// NOTIFICATION PANEL COMPONENT
// ============================================
interface NotificationPanelProps {
  notifications: Notification[]
  onDismiss?: (id: string) => void
  onMarkAllRead?: () => void
  onAction?: (id: string, action: string) => void
  emptyMessage?: string
}

export function NotificationPanel({
  notifications,
  onDismiss,
  onMarkAllRead,
  onAction,
  emptyMessage = "You're all caught up!"
}: NotificationPanelProps) {
  const unreadCount = notifications.filter(n => !n.read).length

  if (notifications.length === 0) {
    return (
      <div 
        className="p-8 text-center rounded-2xl"
        style={{
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
        }}
      >
        <div className="text-4xl mb-3">✨</div>
        <p className="font-semibold opacity-60">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2">
      {/* Header */}
      {unreadCount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold opacity-60">
            {unreadCount} new notification{unreadCount > 1 ? 's' : ''}
          </span>
          {onMarkAllRead && (
            <button 
              onClick={onMarkAllRead}
              className="text-xs font-semibold text-indigo-500 hover:text-indigo-600"
            >
              Mark all as read
            </button>
          )}
        </div>
      )}

      {/* Notifications */}
      {notifications.map((notif) => (
        <GlassNotification
          key={notif.id}
          notification={notif}
          onDismiss={onDismiss}
          onAction={onAction}
          variant="colored"
        />
      ))}
    </div>
  )
}

// ============================================
// DEMO / EXAMPLE USAGE
// ============================================
export function NotificationDemo() {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'deal',
      title: 'New Deal Closed!',
      message: 'Riverside Construction signed the ₦2.5M contract',
      time: '2 min ago',
      read: false,
      actions: [{ label: 'View' }, { label: 'Dismiss' }]
    },
    {
      id: '2',
      type: 'task',
      title: 'Task Completed',
      message: 'Q4 Report finalized by Chinedu',
      time: '15 min ago',
      read: false
    },
    {
      id: '3',
      type: 'alert',
      title: 'Invoice Overdue',
      message: 'Invoice #INV-2024-089 is 5 days past due',
      time: '1 hour ago',
      read: true,
      progress: { value: 100, color: 'coral' }
    },
    {
      id: '4',
      type: 'payment',
      title: 'Payment Received',
      message: '₦500,000 received from Tech Solutions Ltd',
      time: '2 hours ago',
      read: false,
      avatar: { initials: 'TS' }
    },
  ])

  const handleDismiss = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h2 className="text-xl font-bold mb-4">Notifications</h2>
      <NotificationPanel
        notifications={notifications}
        onDismiss={handleDismiss}
        onMarkAllRead={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
      />
    </div>
  )
}
