import { createContext, useContext, useState, ReactNode, useCallback } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
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
      <div className="fixed bottom-20 md:bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg animate-slide-in ${
              t.type === 'success' ? 'bg-green-500 text-white' :
              t.type === 'error' ? 'bg-red-500 text-white' :
              'bg-indigo-500 text-white'
            }`}
          >
            {t.type === 'success' && <CheckCircle size={20} />}
            {t.type === 'error' && <XCircle size={20} />}
            {t.type === 'info' && <AlertCircle size={20} />}
            <span className="text-sm font-medium">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-2 hover:opacity-70"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>
    </ToastContext.Provider>
  )
}
