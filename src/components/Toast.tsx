import { createContext, useContext, useState, ReactNode, useCallback } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextType {
  toast: (type: ToastType, message: string) => void
  showToast: (message: string, type?: ToastType) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const toast = useCallback((type: ToastType, message: string) => {
    addToast(type, message)
  }, [addToast])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    // Handle old pattern: showToast(message, type) or showToast(type, message)
    const types: ToastType[] = ['success', 'error', 'info']
    if (types.includes(message as ToastType)) {
      addToast(message as ToastType, type)
    } else {
      addToast(type, message)
    }
  }, [addToast])

  const success = useCallback((message: string) => {
    addToast('success', message)
  }, [addToast])

  const error = useCallback((message: string) => {
    addToast('error', message)
  }, [addToast])

  const info = useCallback((message: string) => {
    addToast('info', message)
  }, [addToast])

  return (
    <ToastContext.Provider value={{ toast, showToast, success, error, info }}>
      {children}
      <div className="fixed bottom-20 md:bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slide-out {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes progress-shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
        .animate-slide-in { animation: slide-in 0.3s cubic-bezier(0.2, 0, 0, 1); }
        .animate-slide-out { animation: slide-out 0.2s ease-in forwards; }
        .toast-progress { animation: progress-shrink linear forwards; }
      `}</style>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const duration = toast.duration || 4000
  const [isExiting, setIsExiting] = useState(false)

  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(onDismiss, 200)
  }

  const typeStyles = {
    success: {
      bg: '#34A853',
      icon: <CheckCircle size={20} />,
    },
    error: {
      bg: '#EA4335',
      icon: <XCircle size={20} />,
    },
    info: {
      bg: '#4285F4',
      icon: <AlertCircle size={20} />,
    },
  }

  const { bg, icon } = typeStyles[toast.type]

  return (
    <div
      className={`relative overflow-hidden rounded-xl shadow-lg ${
        isExiting ? 'animate-slide-out' : 'animate-slide-in'
      }`}
      style={{ backgroundColor: bg, color: 'white' }}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {icon}
        <span className="text-sm font-medium flex-1">{toast.message}</span>
        <button
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-white/20 transition-colors"
          aria-label="Dismiss notification"
        >
          <X size={16} />
        </button>
      </div>
      <div
        className="absolute bottom-0 left-0 h-1 bg-white/30 toast-progress"
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  )
}
