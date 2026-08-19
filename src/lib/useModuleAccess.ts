// Two-flag module access gate (client half). The server is the single
// authority — can_access_module(business_id, module_key) returns
// can_access = entitled AND ready. This hook just calls it and caches.
//
// Why server-side: client-only hiding (a nav item filtered out) is NOT a
// gate. A hidden nav item with an unprotected route behind it lets any
// user reach /api/automations/run directly. The route layer enforces the
// same server check (see RequireModule in App.tsx).

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

const NOT_READY_FALLBACK: ModuleAccess = { can_access: false, entitled: false, ready: false }
// When the RPC itself doesn't exist (migration not applied, PGRST202/404),
// fall back to permissive so the app is usable. RLS + client permissions
// remain the real security boundary. Only the RPC's authoritative response
// (can_access: false) genuinely blocks a module.
const PERMISSIVE_FALLBACK: ModuleAccess = { can_access: true, entitled: true, ready: true }

function isRpcMissing(error: any): boolean {
  if (!error) return false
  const code = error.code || ''
  const msg = (error.message || '').toLowerCase()
  // PGRST202 = function not found in schema cache; 404 = not found
  return code === 'PGRST202' || code === '404' || msg.includes('could not find the function')
}

// Per-module cache so a route guard + the sidebar don't each re-call.
const cache = new Map<string, ModuleAccess>()

export function useModuleAccess(module: ModuleKey) {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const [access, setAccess] = useState<ModuleAccess>(cache.get(module) ?? NOT_READY_FALLBACK)
  const [loading, setLoading] = useState(!cache.has(module))

  useEffect(() => {
    if (!bid) { setLoading(false); return }
    const key = `${bid}:${module}`
    if (cache.has(key)) { setAccess(cache.get(key)!); setLoading(false); return }
    let active = true
    setLoading(true)
    supabase.rpc('can_access_module', { p_business_id: bid, p_module_key: module })
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          // If the RPC doesn't exist (migration not applied), be permissive.
          // Otherwise keep the safe-closed default for network/other errors.
          const fallback = isRpcMissing(error) ? PERMISSIVE_FALLBACK : NOT_READY_FALLBACK
          cache.set(key, fallback); setAccess(fallback); setLoading(false); return
        }
        const a: ModuleAccess = data ?? NOT_READY_FALLBACK
        cache.set(key, a); setAccess(a); setLoading(false)
      })
    return () => { active = false }
  }, [bid, module])

  return { ...access, loading }
}

// Batch: which modules can this business access? One call drives the whole
// sidebar instead of N per-module calls.
export function useAccessibleModules() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const [modules, setModules] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) { setLoading(false); return }
    let active = true
    supabase.rpc('list_accessible_modules', { p_business_id: bid })
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          // RPC not applied → show all gated modules (RLS is the real gate).
          // Network/other errors → safe-closed default (empty set).
          if (isRpcMissing(error)) {
            // Permissive: include all known module keys
            setModules(new Set([
              'finance','chat','crm','tasks','reports','hr','projects',
              'inventory','knowledge','approvals','calendar','legal',
              'procurement','intelligence','market','memory','reality_gap',
              'self_audit','cockpit','wall','automations','sso','api',
              'multi_company','security'
            ]))
          }
          setLoading(false); return
        }
        const set = new Set<string>()
        ;(data as any[])?.forEach?.((r: any) => { if (r.can_access ?? (r.ready && r.entitled)) set.add(r.module_key) })
        setModules(set); setLoading(false)
      })
    return () => { active = false }
  }, [bid])

  return { modules, loading }
}

// Clear cache on sign-out / business switch.
export function clearModuleAccessCache() { cache.clear() }
