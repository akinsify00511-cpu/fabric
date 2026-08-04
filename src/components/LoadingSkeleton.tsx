export default function LoadingSkeleton({ type = 'card', count = 1 }: { type?: 'card' | 'table' | 'detail' | 'list', count?: number }) {
  const SkeletonItem = () => (
    <div className="animate-pulse">
      {type === 'card' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-gray-200 rounded-lg" />
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded" />
            <div className="h-3 bg-gray-200 rounded w-5/6" />
          </div>
        </div>
      )}
      {type === 'table' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex gap-4">
              <div className="h-4 bg-gray-200 rounded w-24" />
              <div className="h-4 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-200 rounded w-24 ml-auto" />
            </div>
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 border-b border-gray-50 last:border-0">
              <div className="flex gap-4 items-center">
                <div className="w-8 h-8 bg-gray-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-3 bg-gray-200 rounded w-32 mb-1" />
                  <div className="h-2 bg-gray-200 rounded w-48" />
                </div>
                <div className="h-6 bg-gray-200 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      )}
      {type === 'detail' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gray-200 rounded-full" />
            <div>
              <div className="h-5 bg-gray-200 rounded w-40 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-24" />
            </div>
          </div>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <div className="h-3 bg-gray-200 rounded w-20 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-full" />
              </div>
            ))}
          </div>
        </div>
      )}
      {type === 'list' && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-1" />
                  <div className="h-3 bg-gray-200 rounded w-24" />
                </div>
                <div className="w-16 h-6 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {[...Array(count)].map((_, i) => (
        <SkeletonItem key={i} />
      ))}
    </div>
  )
}
