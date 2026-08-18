import { ReactNode, ComponentType } from 'react'
import { Plus, Sparkles, ArrowRight } from 'lucide-react'

interface EmptyStateProps {
  icon?: ComponentType<{ size?: number; className?: string }> | ReactNode
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
  /**
   * §AC gamified empty state. When true (or when `gamified` fields are set),
   * the empty state becomes an encouraging "first step of a journey" surface:
   * a milestone label, a coaching hint, and a concrete tip — instead of a
   * flat "no data" notice. This makes an empty module feel like the START of
   * progress, not a dead end.
   */
  gamified?: boolean
  /** A short milestone label, e.g. "Your first deal". Defaults derived from title. */
  milestone?: string
  /** An encouraging coaching line that frames the action as progress. */
  hint?: string
  /** A concrete next step / tip shown as a chip. */
  tip?: string
}

function deriveMilestone(title: string): string {
  // Turn a flat "No deals yet" into an encouraging milestone label.
  const lower = title.toLowerCase()
  if (lower.startsWith('no ')) {
    const noun = lower.replace(/^no /, '').replace(/yet$/i, '').trim()
    return `Your first ${noun.replace(/s$/, '')}`
  }
  return title
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  secondary,
  gamified,
  milestone,
  hint,
  tip,
}: EmptyStateProps) {
  const isGamified = gamified || !!hint || !!tip || !!milestone
  const milestoneLabel = milestone ?? (isGamified ? deriveMilestone(title) : null)

  const renderIcon = () => {
    if (!icon) return null
    if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null)) {
      const IconComponent = icon as ComponentType<{ size?: number; className?: string }>
      return <IconComponent size={28} className="text-[var(--av-primary)]" />
    }
    return icon
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: 'var(--av-primary-soft)' }}>
        {icon ? (
          renderIcon()
        ) : (
          <Sparkles size={28} className="text-[var(--av-primary)]" />
        )}
      </div>

      {isGamified && milestoneLabel && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mb-3"
          style={{ backgroundColor: 'var(--av-success-soft)', color: 'var(--av-success)' }}>
          <Sparkles size={12} />
          {milestoneLabel}
        </div>
      )}

      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--av-text)' }}>{title}</h3>

      {description && (
        <p className="max-w-sm mb-3" style={{ color: 'var(--av-text-secondary)' }}>{description}</p>
      )}

      {isGamified && hint && (
        <p className="max-w-sm mb-4 text-sm" style={{ color: 'var(--av-text-muted)' }}>{hint}</p>
      )}

      {isGamified && tip && (
        <div className="flex justify-center mb-6 w-full">
          <span className="inline-flex items-start gap-2 px-3 py-2 rounded-xl text-xs max-w-sm text-left"
            style={{ backgroundColor: 'var(--av-surface-2)', color: 'var(--av-text-secondary)' }}>
            <span style={{ color: 'var(--av-primary)' }}>→</span>
            {tip}
          </span>
        </div>
      )}

      {!isGamified && <div className="mb-6" />}

      <div className="flex flex-col sm:flex-row gap-3">
        {action && (
          <button
            onClick={action.onClick}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white transition"
            style={{ backgroundColor: 'var(--av-primary)' }}
          >
            <Plus size={18} />
            {action.label}
          </button>
        )}
        {secondary && (
          <button
            onClick={secondary.onClick}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg font-medium transition"
            style={{ backgroundColor: 'var(--av-surface-2)', color: 'var(--av-text)' }}
          >
            {secondary.label}
          </button>
        )}
        {isGamified && !action && !secondary && (
          <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--av-text-muted)' }}>
            You're making progress <ArrowRight size={14} />
          </span>
        )}
      </div>
    </div>
  )
}
