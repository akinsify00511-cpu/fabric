import { useEffect, useState } from 'react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  text?: string
  className?: string
}

export function LoadingSpinner({ size = 'md', text, className = '' }: LoadingSpinnerProps) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-3',
    xl: 'w-16 h-16 border-4',
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div
        className={`${sizes[size]} border-[#4285F4]/20 border-t-[#4285F4] rounded-full animate-spin`}
      />
      {text && <p className="text-sm text-gray-500">{text}</p>}
    </div>
  )
}

interface LoadingOverlayProps {
  isLoading: boolean
  children: React.ReactNode
  text?: string
  blur?: boolean
}

export function LoadingOverlay({ isLoading, children, text, blur = true }: LoadingOverlayProps) {
  if (!isLoading) return <>{children}</>

  return (
    <div className="relative">
      {children}
      <div
        className={`absolute inset-0 bg-white/50 flex items-center justify-center ${
          blur ? 'backdrop-blur-sm' : ''
        }`}
        style={{ borderRadius: 'inherit' }}
      >
        <LoadingSpinner text={text} />
      </div>
    </div>
  )
}

interface ProgressBarProps {
  progress: number
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  color?: string
  className?: string
}

export function ProgressBar({
  progress,
  showLabel = false,
  size = 'md',
  color = '#4285F4',
  className = '',
}: ProgressBarProps) {
  const heights = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  }

  const clampedProgress = Math.min(100, Math.max(0, progress))

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between mb-1 text-sm">
          <span className="text-gray-700">Progress</span>
          <span className="text-gray-500">{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${heights[size]}`}>
        <div
          className={`${heights[size]} rounded-full transition-all duration-300 ease-out`}
          style={{
            width: `${clampedProgress}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  )
}

interface DotsLoadingProps {
  color?: string
  size?: number
  className?: string
}

export function DotsLoading({ color = '#4285F4', size = 8, className = '' }: DotsLoadingProps) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-full animate-bounce"
          style={{
            width: size,
            height: size,
            backgroundColor: color,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  )
}

interface PulseLoadingProps {
  color?: string
  className?: string
}

export function PulseLoading({ color = '#4285F4', className = '' }: PulseLoadingProps) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <div className="relative">
        <div
          className="w-10 h-10 rounded-full animate-ping opacity-75"
          style={{ backgroundColor: color }}
        />
        <div
          className="absolute inset-0 w-10 h-10 rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export function PageLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <PulseLoading />
        <p className="mt-4 text-gray-500">Loading...</p>
      </div>
    </div>
  )
}

interface RefreshIndicatorProps {
  isRefreshing: boolean
  lastUpdated?: Date
}

export function RefreshIndicator({ isRefreshing, lastUpdated }: RefreshIndicatorProps) {
  const [showIndicator, setShowIndicator] = useState(false)

  useEffect(() => {
    if (isRefreshing) {
      setShowIndicator(true)
    } else {
      const timer = setTimeout(() => setShowIndicator(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [isRefreshing])

  if (!showIndicator && !lastUpdated) return null

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      {isRefreshing ? (
        <>
          <DotsLoading size={6} />
          <span>Updating...</span>
        </>
      ) : lastUpdated ? (
        <span>Updated {formatTimeAgo(lastUpdated)}</span>
      ) : null}
    </div>
  )
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
