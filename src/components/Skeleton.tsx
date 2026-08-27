// GOOGLE STANDARD BRAND COLORS
const BRAND = {
  primary: 'var(--av-primary)',
  primarySoft: 'rgba(66, 133, 244, 0.08)',
  surface: '#F8F9FA',
  surfaceElevated: '#FFFFFF',
  text: '#202124',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
}

interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  animation?: 'pulse' | 'wave' | 'none'
}

export function Skeleton({
  className = '',
  width,
  height,
  variant = 'text',
  animation = 'wave',
}: SkeletonProps) {
  const baseStyles: React.CSSProperties = {
    width: width ? (typeof width === 'number' ? `${width}px` : width) : '100%',
    height: height ? (typeof height === 'number' ? `${height}px` : height) : '1em',
    backgroundColor: BRAND.surface,
  }

  const variantStyles: Record<string, React.CSSProperties> = {
    text: { borderRadius: '0.25rem' },
    circular: { borderRadius: '50%' },
    rectangular: { borderRadius: '0' },
    rounded: { borderRadius: '0.5rem' },
  }

  return (
    <div
      className={`${className} ${animation === 'pulse' ? 'animate-pulse' : ''}`}
      style={{
        ...baseStyles,
        ...variantStyles[variant],
        position: animation === 'wave' ? 'relative' : undefined,
        overflow: animation === 'wave' ? 'hidden' : undefined,
      }}
    >
      {animation === 'wave' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `linear-gradient(90deg, transparent, ${BRAND.surfaceElevated}, transparent)`,
            animation: 'skeleton-wave 1.5s ease-in-out infinite',
          }}
        />
      )}
      <style>{`
        @keyframes skeleton-wave {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}

export function SkeletonText({ lines = 3, _spacing = 4 }: { lines?: number; spacing?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={16}
          width={i === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ backgroundColor: BRAND.surfaceElevated }}
    >
      <Skeleton height={16} width="30%" />
      <Skeleton height={32} width="50%" />
      <SkeletonText lines={2} />
      <div className="flex gap-2">
        <Skeleton width={80} height={32} variant="rounded" />
        <Skeleton width={80} height={32} variant="rounded" />
      </div>
    </div>
  )
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: BRAND.surfaceElevated }}
    >
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className="px-4 py-3 flex items-center gap-3"
          style={{ borderTop: i > 0 ? `1px solid ${BRAND.border}` : undefined }}
        >
          <Skeleton variant="circular" width={40} height={40} />
          <div className="flex-1">
            <Skeleton height={14} width="40%" className="mb-1" />
            <Skeleton height={12} width="60%" />
          </div>
          <Skeleton height={24} width={60} variant="rounded" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${BRAND.border}` }}
    >
      <div className="flex gap-4 p-3" style={{ backgroundColor: BRAND.surface }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} height={16} className="flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-4 p-3"
          style={{
            borderTop: rowIndex > 0 ? `1px solid ${BRAND.border}` : undefined,
          }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} height={14} className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={100} variant="rounded" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton height={300} variant="rounded" />
        <Skeleton height={300} variant="rounded" />
      </div>
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div>
      <Skeleton height={32} width="40%" className="mb-6" />
      <DashboardSkeleton />
    </div>
  )
}

export function FormSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton height={14} width="25%" className="mb-2" />
        <Skeleton height={44} variant="rounded" />
      </div>
      <div>
        <Skeleton height={14} width="25%" className="mb-2" />
        <Skeleton height={44} variant="rounded" />
      </div>
      <div>
        <Skeleton height={14} width="25%" className="mb-2" />
        <Skeleton height={44} variant="rounded" />
      </div>
      <Skeleton height={44} width={120} variant="rounded" className="mt-6" />
    </div>
  )
}
