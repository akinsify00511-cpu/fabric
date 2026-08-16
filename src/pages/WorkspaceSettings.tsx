import { useState } from 'react'
import { Check, RotateCcw, Loader2 } from 'lucide-react'
import { useWorkspaceSelection } from '../lib/useWorkspaceSelection'
import { useExperienceContext, TOOLS } from '../lib/useExperienceContext'

/**
 * WorkspaceSettings — let a user revise which tools surface in their sidebar
 * and dashboard. This is the "selected" axis: a REMOVAL filter only. Tools the
 * user is not entitled/role-allowed to see are shown as locked and cannot be
 * toggled on (selection can never grant access). Toggling persists to the DB
 * (user_workspace_selections) + a localStorage optimistic cache.
 */
export default function WorkspaceSettings() {
  const { isPrivileged, isToolAuthorized, loading: ctxLoading } = useExperienceContext()
  const { selectedTools, selectionCompleted, toggleTool, setSelectedTools, loading: selLoading } =
    useWorkspaceSelection()
  const [saved, setSaved] = useState(false)

  // Tools that are curatable: exclude settings/admin chrome (always available).
  // Privileged users see all tools as toggleable; everyone else sees only what
  // they're authorized for (the rest are locked so they understand the boundary).
  const curatable = TOOLS.filter((t) => t.key !== 'settings')

  const isSelected = (key: string) =>
    !selectionCompleted || selectedTools.length === 0 ? true : selectedTools.includes(key)
  const isAuthorized = (key: string) => isToolAuthorized(key as any)

  const handleToggle = async (key: string) => {
    await toggleTool(key)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const handleReset = async () => {
    // Clear curation → show all authorized tools again.
    await setSelectedTools([], false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {curatable.map((tool) => {
          const authorized = isAuthorized(tool.key)
          const selected = isSelected(tool.key)
          const locked = !authorized
          return (
            <button
              key={tool.key}
              type="button"
              disabled={locked}
              onClick={() => handleToggle(tool.key)}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                locked
                  ? 'border-[var(--av-border,#E8EAED)] bg-[var(--av-surface,#F8F9FA)] opacity-60 cursor-not-allowed'
                  : selected
                    ? 'border-[var(--av-primary,#0891B2)] bg-[var(--av-primary-soft,rgba(8,145,178,0.08))]'
                    : 'border-[var(--av-border,#E8EAED)] hover:border-[var(--av-border-strong,#DADCE0)]'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded flex-shrink-0 ${
                  selected && !locked
                    ? 'bg-[var(--av-primary,#0891B2)] text-white'
                    : 'bg-black/5 text-transparent'
                }`}
              >
                <Check size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--av-text,#202124)]">{tool.label}</p>
                <p className="text-xs capitalize text-[var(--av-text-muted,#5F6368)]">{tool.category}</p>
              </div>
              {locked && <span className="text-[10px] uppercase tracking-wide text-[var(--av-text-muted,#9AA0A6)]">Not in your plan</span>}
            </button>
          )
        })}
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
