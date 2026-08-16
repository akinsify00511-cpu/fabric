import { useMemo, useState } from 'react'
import { Check, RotateCcw, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { TOOLS, type ToolKey, useAccessibleTools } from '../lib/useToolAccess'
import { useWorkspaceSelection } from '../lib/useWorkspaceSelection'

const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core',
  sales: 'Customers & Sales',
  finance: 'Money',
  hr: 'People',
  ops: 'Operations',
  marketing: 'Marketing',
  support: 'Communication & Support',
  analytics: 'Insights',
  settings: 'Admin & Connections',
}

const CATEGORY_ORDER = ['core', 'sales', 'finance', 'hr', 'ops', 'marketing', 'support', 'analytics', 'settings']

export default function WorkspacePreferences() {
  const navigate = useNavigate()
  const { tools: availableTools, loading: accessLoading } = useAccessibleTools()
  const { selectedTools, loading: selectionLoading, saving, saveSelection } = useWorkspaceSelection(availableTools)
  const [draft, setDraft] = useState<Set<ToolKey> | null>(null)
  const [saved, setSaved] = useState(false)

  const effectiveSelection = draft ?? selectedTools ?? new Set(availableTools)
  const groups = useMemo(() => {
    const allowed = new Set(availableTools)
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      tools: TOOLS.filter((tool) => tool.category === category && allowed.has(tool.key)),
    })).filter((group) => group.tools.length > 0)
  }, [availableTools])

  const toggle = (key: ToolKey) => {
    setSaved(false)
    setDraft((current) => {
      const next = new Set(current ?? effectiveSelection)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const setCategory = (keys: ToolKey[], enabled: boolean) => {
    setSaved(false)
    setDraft((current) => {
      const next = new Set(current ?? effectiveSelection)
      keys.forEach((key) => enabled ? next.add(key) : next.delete(key))
      return next
    })
  }

  const save = async () => {
    const ok = await saveSelection(draft ?? effectiveSelection)
    if (ok) {
      setDraft(null)
      setSaved(true)
    }
  }

  const showAll = () => {
    setDraft(new Set(availableTools))
    setSaved(false)
  }

  const selectedCount = effectiveSelection.size

  return (
    <div className="max-w-5xl mx-auto pb-24">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-[var(--av-primary)] text-sm font-medium mb-2">
            <Sparkles size={16} />
            Make Avenize yours
          </div>
          <h1 className="text-2xl font-semibold text-[var(--av-text)]">Choose what you want to see</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--av-text-secondary)]">
            Your role and organization permissions decide what you can use. You decide which of those tools belong on your workspace. Keep only what helps you do your job.
          </p>
        </div>
        <button
          onClick={showAll}
          className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-2)]"
        >
          <RotateCcw size={15} />
          Show all available
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)] p-4 md:p-5 mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--av-text)]">Your workspace</p>
            <p className="text-xs text-[var(--av-text-muted)] mt-1">{selectedCount} tools selected</p>
          </div>
          <div className="h-2 w-40 rounded-full bg-[var(--av-surface-3)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--av-primary)] transition-all"
              style={{ width: `${availableTools.length ? Math.round((selectedCount / availableTools.length) * 100) : 0}%` }}
            />
          </div>
        </div>
      </div>

      {(accessLoading || selectionLoading) ? (
        <div className="rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)] p-8 text-sm text-[var(--av-text-muted)]">
          Loading the tools available to your role…
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            const keys = group.tools.map((tool) => tool.key)
            const allSelected = keys.every((key) => effectiveSelection.has(key))
            return (
              <section key={group.category} className="rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--av-border)]">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--av-text)]">{group.label}</h2>
                    <p className="text-xs text-[var(--av-text-muted)] mt-0.5">Choose the tools that matter to your work.</p>
                  </div>
                  <button
                    onClick={() => setCategory(keys, !allSelected)}
                    className="text-xs font-medium text-[var(--av-primary)] hover:underline"
                  >
                    {allSelected ? 'Clear' : 'Select all'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
                  {group.tools.map((tool) => {
                    const checked = effectiveSelection.has(tool.key)
                    return (
                      <button
                        key={tool.key}
                        onClick={() => toggle(tool.key)}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                          checked
                            ? 'border-[var(--av-primary)] bg-[var(--av-primary-soft)]'
                            : 'border-[var(--av-border)] hover:bg-[var(--av-surface-2)]'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                          checked ? 'bg-[var(--av-primary)] border-[var(--av-primary)] text-white' : 'border-[var(--av-border-strong)]'
                        }`}>
                          {checked && <Check size={13} strokeWidth={3} />}
                        </span>
                        <span className="text-sm font-medium text-[var(--av-text)]">{tool.label}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-3 rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)]/95 backdrop-blur p-3 shadow-[var(--av-shadow-lg)]">
        <p className="text-xs text-[var(--av-text-secondary)]">
          {saved ? 'Saved. Your sidebar now reflects your choices.' : 'You can change this any time.'}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/app')} className="px-4 py-2 rounded-lg text-sm text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-2)]">
            Done
          </button>
          <button
            onClick={save}
            disabled={saving || accessLoading || selectionLoading}
            className="px-5 py-2 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save workspace'}
          </button>
        </div>
      </div>
    </div>
  )
}
