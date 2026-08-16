import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'
import type { ToolKey } from './useToolAccess'

const PREFERENCE_KEY = 'selectedTools'

type DashboardPreferences = Record<string, unknown> & {
  selectedTools?: string[]
}

/**
 * Presentation preference only. Authorization still comes from plan/module/
 * functional-role gates; this hook only decides which authorized tools appear
 * in the user's navigation.
 */
export function useWorkspaceSelection(availableTools: ToolKey[]) {
  const { staff } = useAuth()
  const [selectedTools, setSelectedTools] = useState<Set<ToolKey> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState<DashboardPreferences>({})

  const availableSet = useMemo(() => new Set(availableTools), [availableTools])

  const load = useCallback(async () => {
    if (!staff?.user_id) {
      setSelectedTools(null)
      setPreferences({})
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('user_preferences')
      .select('dashboard_view_preferences')
      .eq('user_id', staff.user_id)
      .maybeSingle()

    if (error) {
      console.error('[Avenize] Failed to load workspace preferences:', error)
      setSelectedTools(null)
      setLoading(false)
      return
    }

    const prefs = (data?.dashboard_view_preferences || {}) as DashboardPreferences
    setPreferences(prefs)

    const saved = Array.isArray(prefs[PREFERENCE_KEY])
      ? prefs[PREFERENCE_KEY].filter((key): key is ToolKey => typeof key === 'string' && availableSet.has(key as ToolKey))
      : null

    setSelectedTools(saved ? new Set(saved) : null)
    setLoading(false)
  }, [staff?.user_id, availableSet])

  useEffect(() => {
    void load()
  }, [load])

  const saveSelection = useCallback(async (next: Iterable<ToolKey>) => {
    if (!staff?.user_id) return false

    const safeSelection = Array.from(new Set(next)).filter((key) => availableSet.has(key))
    setSaving(true)

    const nextPreferences: DashboardPreferences = {
      ...preferences,
      [PREFERENCE_KEY]: safeSelection,
    }

    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: staff.user_id,
        dashboard_view_preferences: nextPreferences,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    setSaving(false)
    if (error) {
      console.error('[Avenize] Failed to save workspace preferences:', error)
      return false
    }

    setPreferences(nextPreferences)
    setSelectedTools(new Set(safeSelection))
    return true
  }, [staff?.user_id, availableSet, preferences])

  return { selectedTools, loading, saving, saveSelection, reload: load }
}
