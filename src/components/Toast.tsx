import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration: number
}

interface ToastContextType {
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

const DURATION_MS = 4000

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [progress, setProgress] = useState(100)
  const [paused, setPaused] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef(Date.now())
  const remainingRef = useRef(toast.duration)

  useEffect(() => {
    if (paused) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    const elapsed = Date.now() - startRef.current
    const remaining = remainingRef.current - elapsed
    if (remaining <= 0) { onRemove(); return }
    const pct = (remaining / toast.duration) * 100
    setProgress(pct)

    intervalRef.current = setInterval(() => {
      const now = Date.now()
      const elapsedTotal = now - startRef.current
      const rem = toast.duration - elapsedTotal
      if (rem <= 0) { onRemove(); return }
      setProgress((rem / toast.duration) * 100)
    }, 50)

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [paused, toast.duration, onRemove])

  const typeColors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-indigo-500',
  }

  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-3 pr-10 rounded-lg shadow-lg text-white overflow-hidden w-80 ${typeColors[toast.type]}`}
      style={{ animation: 'slide-in 0.25s ease-out' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => { startRef.current = Date.now(); remainingRef.current = toast.duration * (progress / 100); setPaused(false) }}
    >
      {toast.type === 'success' && <CheckCircle size={18} className="shrink-0" />}
      {toast.type === 'error' && <XCircle size={18} className="shrink-0" />}
      {toast.type === 'info' && <AlertCircle size={18} className="shrink-0" />}
      <span className="text-sm font-medium flex-1">{toast.message}</span>
      <button
        onClick={onRemove}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/20 transition-colors"
      >
        <X size={14} />
      </button>
      {/* Shrinking progress bar */}
      <div className="absolute bottom-0 left-0 h-0.5 bg-white/40 transition-none"
        style={{ width: `${progress}%`, transition: paused ? 'none' : 'width 50ms linear' }}
      />
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts(prev => [...prev, { id, type, message, duration: DURATION_MS }])
    setTimeout(() => removeToast(id), DURATION_MS)
  }, [removeToast])

  const success = useCallback((message: string) => showToast(message, 'success'), [showToast])
  const error = useCallback((message: string) => showToast(message, 'error'), [showToast])
  const info = useCallback((message: string) => showToast(message, 'info'), [showToast])

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      <div className="fixed bottom-20 md:bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
        ))}
      </div>
      <style>{`
        @keyframes slide-in {
          from { transform: translateX(110%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
