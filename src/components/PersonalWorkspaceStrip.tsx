import { Link } from 'react-router-dom'
import { Pin, Goal, Loader2 } from 'lucide-react'
import { usePersonalContext } from '../lib/usePersonalContext'
import { goalProgressLabel, type PinnedItem } from '../lib/personalExperience'

/**
 * PersonalWorkspaceStrip — the "My Avenize" personal surface: the user's pinned
 * items + personal goals, from the canonical my_context() object. Purely personal,
 * own-rows, best-effort (Article VI): when the context isn't available yet it renders
 * a thin placeholder, never an error. Personalization never grants access — a pinned
 * item is just a deep-link the user's own permissions already expose.
 */

const PIN_ROUTES: Record<string, string> = {
  module: '/app',
  customer: '/app/crm',
  deal: '/app/crm',
  project: '/app/projects',
  report: '/app/reports',
  lead: '/app/leads',
  invoice: '/app/finance',
}

function pinTarget(p: PinnedItem): string {
  const base = PIN_ROUTES[p.entity_type] ?? '/app'
  // module pins use the module key as the route; entity pins use their id as the
  // likely route param where a detail route exists.
  return p.entity_type === 'module' ? `${base}?tab=${encodeURIComponent(p.entity_id ?? '')}` : `${base}?q=${encodeURIComponent(p.entity_id ?? '')}`
}

export default function PersonalWorkspaceStrip() {
  const { pins, goals, loading } = usePersonalContext()

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm mb-6" style={{ color: 'var(--av-text-muted)' }}>
        <Loader2 size={14} className="animate-spin" /> Building your workspace…
      </div>
    )
  }

  const hasContent = pins.length > 0 || goals.length > 0
  if (!hasContent) return null

  return (
    <section className="mb-8">
      {pins.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--av-text-muted)' }}>
            Your workspace
          </p>
          <div className="flex flex-wrap gap-2">
            {pins.map((p) => (
              <Link
                key={`${p.entity_type}:${p.entity_id}`}
                to={pinTarget(p)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm"
                style={{ background: 'var(--av-glass-bg-strong)', color: 'var(--av-primary)', border: '1px solid var(--av-glass-border)' }}
              >
                <Pin size={13} /> {p.pin_label ?? p.entity_id}
              </Link>
            ))}
          </div>
        </div>
      )}

      {goals.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--av-text-muted)' }}>
            My goals
          </p>
          <div className="space-y-2">
            {goals.slice(0, 4).map((g) => {
              const pct = goalProgressLabel(g)
              return (
                <div key={g.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'var(--av-glass-bg-strong)', border: '1px solid var(--av-glass-border)' }}>
                  <Goal size={15} style={{ color: 'var(--av-primary)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--av-text)' }}>{g.title}</span>
                      <span className="text-xs shrink-0" style={{ color: pct === null ? 'var(--av-text-muted)' : 'var(--av-text-secondary)' }}>
                        {pct === null ? 'No progress measured yet' : `${pct} of goal`}
                      </span>
                    </div>
                    {pct !== null && (
                      <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--av-primary-soft)' }}>
                        <div style={{ width: pct, background: 'var(--av-primary)', height: '100%', borderRadius: '9999px' }} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}