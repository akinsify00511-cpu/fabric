export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-black/5 rounded ${className}`} />
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] p-4 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
    </div>
  )
}

export function ListSkeleton({ items = 3 }: { items?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] divide-y divide-black/[0.06]">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="px-4 py-3 flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
