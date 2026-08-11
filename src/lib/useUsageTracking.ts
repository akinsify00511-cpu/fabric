/**
 * Lightweight usage telemetry — logs which module/route a business opens.
 *
 * Purpose: tell the BUILDER empirically which of the 61 L2 modules deserve
 * the next sprint and which are dead weight. Independent of entitlements —
 * this is instrumentation, not a feature.
 *
 * Fire-and-forget: failures never block UX and are swallowed. The write is
 * open to authenticated via RLS (a business logs its own events).
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

// Route prefix → module key. Keep aligned with ROUTE_MODULE in Shell.tsx.
const ROUTE_MODULE: Record<string, string> = {
  '/app/crm': 'crm',
  '/app/leads': 'crm',
  '/app/finance': 'finance',
  '/app/payments': 'finance',
  '/app/payroll': 'finance',
  '/app/tasks': 'tasks',
  '/app/tickets': 'tasks',
  '/app/people': 'hr',
  '/app/projects': 'projects',
  '/app/inventory': 'inventory',
  '/app/knowledge': 'knowledge',
  '/app/approvals': 'approvals',
  '/app/calendar': 'calendar',
  '/app/legal': 'legal',
  '/app/procurement': 'procurement',
  '/app/intelligence': 'intelligence',
  '/app/market': 'market',
  '/app/memory': 'memory',
  '/app/reality-gap': 'reality_gap',
  '/app/self-audit': 'self_audit',
  '/app/cockpit': 'cockpit',
  '/app/wall': 'wall',
  '/app/reports': 'reports',
  '/app/automations': 'automations',
  '/app/settings': 'settings',
}

let sessionId: string | null = null

export function useUsageTracking() {
  const { staff } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (!staff?.business_id) return
    // Match the longest prefix that maps to a module (e.g. /app/crm/123 → crm)
    const path = location.pathname
    const match = Object.keys(ROUTE_MODULE)
      .filter(prefix => path.startsWith(prefix))
      .sort((a, b) => b.length - a.length)[0]
    const moduleKey = match ? ROUTE_MODULE[match] : null
    if (!moduleKey) return

    if (!sessionId) sessionId = crypto.randomUUID()

    // Fire-and-forget; never await, never throw on failure.
    supabase.from('usage_events').insert({
      business_id: staff.business_id,
      staff_id: staff.id,
      module_key: moduleKey,
      route: path,
      action: 'view',
      session_id: sessionId,
    }).then(undefined, () => { /* swallow — telemetry must never break UX */ })
  }, [staff?.business_id, staff?.id, location.pathname])
}
