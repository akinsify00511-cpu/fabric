/**
 * useWorkspaceSelection — the "selected" axis of the access model.
 *
 * Three intersecting gates decide what a user sees/uses:
 *   entitled  (plan)       — business_entitlements  [DB]
 *   role      (functional)  — staff_functional_roles [DB]
 *   selected  (user)       — user_workspace_selections [DB, this hook]
 *
 * "Selected" is a REMOVAL filter only. An empty selection (no row yet, or
 * selection_completed=false) means "show everything I'm authorized for".
 * The hook exposes `isToolSelected(tool)` which returns true when the user
 * has NOT curated (show all) OR the tool is in their selected set. It can
 * NEVER grant access to a tool the entitled+role gates deny — callers must
 * still AND this with the role/module checks (Shell.itemVisible does).
 *
 * Degrades gracefully: if the table is missing (deployment drift) or the
 * query errors, we treat it as "no curation made" and show all authorized
 * tools — identical to pre-migration behavior. We also keep a localStorage
 * optimistic cache so toggles feel instant and survive a DB hiccup.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'
import { logUsageEvent } from './useUsageTracking'

const STORAGE_KEY = (userId: string) => `avenize_workspace_selection_${userId}`

export interface WorkspaceSelectionState {
  /** The tools the user has chosen to keep visible (empty = show all authorized). */
  selectedTools: string[]
  /** Has the user explicitly finished curating their workspace? */
  selectionCompleted: boolean
  loading: boolean
  /** Toggle a tool in/out of the user's selected set. Persists to DB + cache. */
  toggleTool: (tool: string) => Promise<void>
  /** Replace the entire selected set (used by onboarding + the settings page). */
  setSelectedTools: (tools: string[], completed?: boolean) => Promise<void>
  /**
   * True if the tool should be shown to this user by the *selection* axis:
   * true when the user hasn't curated (show all), or the tool is selected.
   * Callers STILL must AND this with entitled + role gates.
   */
  isToolSelected: (tool: string) => boolean
}

function readCache(userId: string): { selectedTools: string[]; selectionCompleted: boolean } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return {
      selectedTools: Array.isArray(parsed.selectedTools) ? parsed.selectedTools : [],
      selectionCompleted: !!parsed.selectionCompleted,
    }
  } catch {
    return null
  }
}

function writeCache(userId: string, selectedTools: string[], selectionCompleted: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY(userId), JSON.stringify({ selectedTools, selectionCompleted }))
  } catch {
    /* ignore quota errors */
  }
}

export function useWorkspaceSelection(): WorkspaceSelectionState {
  const { staff } = useAuth()
  const userId = staff?.user_id || ''
  const [selectedTools, setSelectedToolsState] = useState<string[]>([])
  const [selectionCompleted, setSelectionCompleted] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load from DB (authoritative), seeded by localStorage cache for instant paint.
  useEffect(() => {
    if (!userId) {
      setSelectedToolsState([])
      setSelectionCompleted(false)
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const cached = readCache(userId)
      if (cached && !cancelled) {
        setSelectedToolsState(cached.selectedTools)
        setSelectionCompleted(cached.selectionCompleted)
      }
      try {
        const { data, error } = await supabase
          .from('user_workspace_selections')
          .select('selected_tools, selection_completed')
          .eq('user_id', userId)
          .maybeSingle()
        if (cancelled) return
        if (error) {
          // Table missing / drift: treat as "no curation" — keep cache (if any)
          // but never block. If no cache, show-all default applies.
          if (!cached) {
            setSelectedToolsState([])
            setSelectionCompleted(false)
          }
          setLoading(false)
          return
        }
        if (data) {
          const tools = Array.isArray(data.selected_tools) ? data.selected_tools : []
          const done = !!data.selection_completed
          setSelectedToolsState(tools)
          setSelectionCompleted(done)
          writeCache(userId, tools, done)
        } else {
          // No row yet — no curation made (show all authorized).
          setSelectedToolsState([])
          setSelectionCompleted(false)
          writeCache(userId, [], false)
        }
      } catch {
        if (!cancelled && !cached) {
          setSelectedToolsState([])
          setSelectionCompleted(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  const persist = useCallback(
    async (tools: string[], completed: boolean) => {
      if (!userId) return
      writeCache(userId, tools, completed)
      try {
        await supabase
          .from('user_workspace_selections')
          .upsert(
            { user_id: userId, business_id: staff?.business_id, selected_tools: tools, selection_completed: completed },
            { onConflict: 'user_id' },
          )
      } catch {
        /* DB may be unavailable (drift) — cache already updated, non-blocking */
      }
    },
    [userId, staff?.business_id],
  )

  const toggleTool = useCallback(
    async (tool: string) => {
      setSelectedToolsState((prev) => {
        const wasSelected = prev.includes(tool)
        const next = wasSelected ? prev.filter((t) => t !== tool) : [...prev, tool]
        persist(next, true) // any manual toggle marks curation as complete
        // #14 self-instrumentation: log select/deselect (fire-and-forget). The
        // quick_turnoff RPC pairs tool_select→tool_deselect within 7d to surface
        // "modules switched off quickly" (PRD #14 item 1).
        if (staff?.business_id) {
          logUsageEvent({
            businessId: staff.business_id,
            staffId: staff.id,
            moduleKey: 'workspace',
            action: wasSelected ? 'tool_deselect' : 'tool_select',
            context: { tool },
          })
        }
        return next
      })
    },
    [persist, staff?.business_id, staff?.id],
  )

  const setSelectedTools = useCallback(
    async (tools: string[], completed = true) => {
      setSelectedToolsState(tools)
      setSelectionCompleted(completed)
      await persist(tools, completed)
    },
    [persist],
  )

  const isToolSelected = useCallback(
    (tool: string) => {
      // No curation yet → show all (selection is a removal filter only).
      if (!selectionCompleted || selectedTools.length === 0) return true
      return selectedTools.includes(tool)
    },
    [selectedTools, selectionCompleted],
  )

  return { selectedTools, selectionCompleted, loading, toggleTool, setSelectedTools, isToolSelected }
}
