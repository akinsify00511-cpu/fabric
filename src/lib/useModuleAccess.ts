// Two-flag module access gate (client half). The server is the single authority.
// can_access_module(business_id, module_key) returns can_access = entitled AND ready.
// Client failures must never grant access.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

export type ModuleKey =
  | 'finance' | 'chat' | 'crm' | 'tasks' | 'reports' | 'hr' | 'projects'
  | 'inventory' | 'knowledge' | 'approvals' | 'calendar' | 'legal'
  | 'procurement' | 'intelligence' | 'market' | 'memory' | 'reality_gap'
  | 'self_audit' | 'cockpit' | 'wall' | 'automations' | 'sso' | 'api'
  | 'multi_company' | 'security' | 'discovery'

interface ModuleAccess {
  can_access: boolean
  entitled: boolean
  ready: boolean
}

const CLOSED: ModuleAccess = { can_access: false, entitled: false, ready: false }
const cache = new Map<string, ModuleAccess>()

function isRpcMissing(error: any): boolean {
  if (!error) return false
  const code = error.code || ''
  const msg = (error.message || '').toLowerCase()
  return code === 'PGRST202' || code === '404' || msg.includes('could not find the function')
}

export function useModuleAccess(module: ModuleKey) {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const key = bid ? `${bid}:${module}` : ''
  const [access, setAccess] = useState<ModuleAccess>(key ? (cache.get(key) ?? CLOSED) : CLOSED)
  const [loading, setLoading] = useState(Boolean(bid && !cache.has(key)))

  useEffect(() => {
    if (!bid) { setLoading(false); setAccess(CLOSED); return }
    const cacheKey = `${bid}:${module}`
    const cached = cache.get(cacheKey)
    if (cached) { setAccess(cached); setLoading(false); return }
    let active = true
    setLoading(true)
    supabase.rpc('can_access_module', { p_business_id: bid, p_module_key: module })
      .then(({ data, error }) => {
        if (!active) return
        if (error || isRpcMissing(error)) {
          cache.set(cacheKey, CLOSED)
          setAccess(CLOSED)
          setLoading(false)
          return
        }
        const row = (Array.isArray(data) ? data[0] : data) as Partial<ModuleAccess> | null
        const next: ModuleAccess = {
          can_access: row?.can_access === true,
          entitled: row?.entitled === true,
          ready: row?.ready === true,
        }
        cache.set(cacheKey, next)
        setAccess(next)
        setLoading(false)
      }, () => {
        if (!active) return
        cache.set(cacheKey, CLOSED)
        setAccess(CLOSED)
        setLoading(false)
      })
    return () => { active = false }
  }, [bid, module])

  return { ...access, loading }
}

export function useAccessibleModules() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const [modules, setModules] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(Boolean(bid))

  useEffect(() => {
    if (!bid) { setModules(new Set()); setLoading(false); return }
    let active = true
    setLoading(true)
    supabase.rpc('list_accessible_modules', { p_business_id: bid })
      .then(({ data, error }) => {
        if (!active) return
        if (error || isRpcMissing(error)) {
          setModules(new Set())
          setLoading(false)
          return
        }
        const next = new Set<string>()
        ;(data as any[] | null)?.forEach?.((r: any) => {
          if (r?.can_access === true && r?.entitled === true && r?.ready === true) next.add(r.module_key)
        })
        setModules(next)
        setLoading(false)
      }, () => {
        if (!active) return
        setModules(new Set())
        setLoading(false)
      })
    return () => { active = false }
  }, [bid])

  return { modules, loading }
}

export function clearModuleAccessCache() { cache.clear() }
