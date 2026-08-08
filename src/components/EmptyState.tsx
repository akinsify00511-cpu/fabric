import { ReactNode } from 'react'
import { Plus } from 'lucide-react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  secondary?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ 
  icon, 
  title, 
  description, 
  action,
  secondary 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon ? (
        <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mb-4 text-black">
          {icon}
        </div>
      ) : (
        <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
      )}
      
      <h3 className="text-lg font-semibold text-black mb-2">{title}</h3>
      
      {description && (
        <p className="text-black max-w-sm mb-6">{description}</p>
      )}
      
      <div className="flex flex-col sm:flex-row gap-3">
        {action && (
          <button
            onClick={action.onClick}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4285F4] text-white rounded-lg font-medium hover:bg-[#4285F4] transition"
          >
            <Plus size={18} />
            {action.label}
          </button>
        )}
        {secondary && (
          <button
            onClick={secondary.onClick}
            className="inline-flex items-center justify-center px-4 py-2.5 bg-white text-black rounded-lg font-medium hover:bg-white transition"
          >
            {secondary.label}
          </button>
        )}
      </div>
    </div>
  )
}
