import { useEffect, useState } from 'react'
import { X, ChevronRight, Lightbulb } from 'lucide-react'
import { useToolOnboarding, TOOL_ONBOARDING_CONTENT } from '../lib/useToolOnboarding'

/**
 * A dismissible first-visit coachmark that explains what a tool does
 * and suggests a first action. Shows once per tool, per browser.
 */
export default function ToolOnboardingPopup({ toolKey }: { toolKey: string }) {
  const { shouldShow, markSeen } = useToolOnboarding(toolKey)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (shouldShow) {
      const t = setTimeout(() => setVisible(true), 400)
      return () => clearTimeout(t)
    }
  }, [shouldShow])

  if (!visible) return null

  const content = TOOL_ONBOARDING_CONTENT[toolKey]
  if (!content) return null

  const dismiss = () => {
    setVisible(false)
    setTimeout(markSeen, 200)
  }

  return (
    <div
      role="dialog"
      aria-label={`Onboarding: ${content.title}`}
      className="fixed bottom-6 right-6 z-50 max-w-sm animate-in slide-in-from-bottom-4 duration-300"
    >
      <div
        className="rounded-2xl p-5 shadow-lg"
        style={{
          background: 'var(--surface-primary, #FFFFFF)',
          boxShadow: 'var(--elevation-3, 0 4px 8px rgba(0,0,0,.1), 0 8px 16px rgba(0,0,0,.06))',
          border: '1px solid var(--border-light, #E8EAED)',
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--google-blue-light, rgba(66,133,244,0.08))' }}
          >
            <Lightbulb size={18} style={{ color: 'var(--google-blue, #4285F4)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary, #202124)' }}
            >
              {content.title}
            </h3>
            <p
              className="mt-1 text-sm leading-relaxed"
              style={{ color: 'var(--text-secondary, #5F6368)' }}
            >
              {content.body}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 rounded-full p-1 transition hover:bg-black/5"
            style={{ color: 'var(--text-tertiary, #9AA0A6)' }}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--text-tertiary, #9AA0A6)' }}>
            Shows once per tool
          </span>
          {content.cta && (
            <button
              onClick={dismiss}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition hover:opacity-90"
              style={{
                background: 'var(--google-blue, #4285F4)',
                color: '#FFFFFF',
              }}
            >
              {content.cta}
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
