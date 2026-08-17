import { useState } from 'react'
import { Check, RotateCcw, Loader2 } from 'lucide-react'
import { useWorkspaceSelection } from '../lib/useWorkspaceSelection'
import { useExperienceContext, TOOLS } from '../lib/useExperienceContext'
import type { ToolKey } from '../lib/useToolAccess'

// Category display order + labels, so tools are grouped (not one flat list of
// 20+ toggles — overwhelming). Grouping by category makes the catalog scannable.
const CATEGORY_ORDER = ['core', 'sales', 'finance', 'hr', 'ops', 'marketing', 'support', 'analytics', 'settings'] as const
const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core', sales: 'Sell', finance: 'Money', hr: 'People',
  ops: 'Work & Operations', marketing: 'Marketing', support: 'Support',
  analytics: 'Insights', settings: 'Settings',
}

/**
 * WorkspaceSettings — let a user revise which tools surface in their sidebar
 * and dashboard. This is the "selected" axis: a REMOVAL filter only. Tools the
 * user is not entitled/role-allowed to see are shown as locked and cannot be
 * toggled on (selection can never grant access). Toggling persists to the DB
 * (user_workspace_selections) + a localStorage optimistic cache.
 */
export default function WorkspaceSettings() {
  const { isToolAuthorized, loading: ctxLoading } = useExperienceContext()
  const { selectedTools, selectionCompleted, toggleTool, setSelectedTools, loading: selLoading } =
    useWorkspaceSelection()
  const [saved, setSaved] = useState(false)

  // Tools that are curatable: exclude settings/admin chrome (always available).
  // Privileged users see all tools as toggleable; everyone else sees only what
  // they're authorized for (the rest are locked so they understand the boundary).
  const curatable = TOOLS.filter((t) => t.key !== 'settings')

  const isSelected = (key: string) =>
    !selectionCompleted || selectedTools.length === 0 ? true : selectedTools.includes(key as ToolKey)
  const isAuthorized = (key: string) => isToolAuthorized(key as ToolKey)

  const handleToggle = async (key: string) => {
    await toggleTool(key as ToolKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const handleReset = async () => {
    // Clear curation → show all authorized tools again.
    await setSelectedTools([], false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  // Group curatable tools by category (ordered) so the page is scannable, not
  // a flat 20-item grid.
  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, tools: curatable.filter((t) => t.category === cat) }))
    .filter((g) => g.tools.length > 0)

  if (ctxLoading || selLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-[var(--av-primary,#0891B2)]" size={28} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--av-text,#202124)]">Your Workspace</h1>
        <p className="text-sm text-[var(--av-text-muted,#5F6368)] mt-1">
          Choose which tools appear in your sidebar and dashboard. You can change this anytime.
          Tools you don't select stay available by direct link, just out of your way.
        </p>
      </div>

      {saved && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-700 flex items-center gap-2">
          <Check size={16} /> Saved.
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(({ cat, tools }) => (
          <section key={cat}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--av-text-muted,#5F6368)]">
              {CATEGORY_LABELS[cat] || cat}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tools.map((tool) => {
                const authorized = isAuthorized(tool.key)
                const selected = isSelected(tool.key)
                const locked = !authorized
                return (
                  <button
                    key={tool.key}
                    type="button"
                    disabled={locked}
                    onClick={() => handleToggle(tool.key)}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                      locked
                        ? 'border-[var(--av-border,#E8EAED)] bg-[var(--av-surface,#F8F9FA)] opacity-60 cursor-not-allowed'
                        : selected
                          ? 'border-[var(--av-primary,#0891B2)] bg-[var(--av-primary-soft,rgba(8,145,178,0.08))]'
                          : 'border-[var(--av-border,#E8EAED)] hover:border-[var(--av-border-strong,#DADCE0)]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${
                        selected && !locked
                          ? 'bg-[var(--av-primary,#0891B2)] text-white'
                          : 'bg-black/5 text-transparent'
                      }`}
                    >
                      <Check size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--av-text,#202124)]">{tool.label}</p>
                        {locked && <span className="text-[10px] uppercase tracking-wide text-[var(--av-text-muted,#9AA0A6)]">Not in your plan</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--av-text-muted,#5F6368)] leading-snug">{tool.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-[var(--av-text-muted,#5F6368)]">
          {selectionCompleted && selectedTools.length > 0
            ? `${selectedTools.length} tools pinned to your workspace.`
            : "Showing all tools you're authorized for."}
        </p>
        {selectionCompleted && selectedTools.length > 0 && (
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--av-primary,#0891B2)] hover:underline"
          >
            <RotateCcw size={14} /> Reset to all
          </button>
        )}
      </div>
    </div>
  )
}
