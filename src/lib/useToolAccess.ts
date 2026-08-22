/**
 * Tool Access Hook
 * Checks if current staff member has access to a specific tool/module
 * Combines: plan entitlements + functional role access
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

// All available tools in the system. `description` is a short, plain-language
// summary of what the tool does — shown in onboarding + workspace settings so
// users understand what they're choosing (not just a label).
export const TOOLS = [
  { key: 'dashboard', label: 'Dashboard', category: 'core', description: 'Your workspace overview: what needs your attention right now.' },
  { key: 'crm', label: 'CRM', category: 'sales', description: 'Contacts, leads, and deals. Track your sales pipeline from first contact to close.' },
  { key: 'projects', label: 'Projects', category: 'ops', description: 'Plan and track project work with tasks, milestones, and progress.' },
  { key: 'finance', label: 'Finance', category: 'finance', description: 'Invoices, expenses, and revenue. The money side of your business.' },
  { key: 'quotes', label: 'Quotes', category: 'sales', description: 'Create and send price quotes to prospective customers.' },
  { key: 'payments', label: 'Payments', category: 'finance', description: 'Record payments and track what customers owe you.' },
  { key: 'accounting', label: 'Accounting', category: 'finance', description: 'Chart of accounts, journals, and financial reports.' },
  { key: 'people', label: 'People', category: 'hr', description: 'Your team: roles, profiles, and who does what.' },
  { key: 'inventory', label: 'Inventory', category: 'ops', description: 'Products, stock levels, and low-stock alerts.' },
  { key: 'reports', label: 'Reports', category: 'analytics', description: 'Build and run reports across your business data.' },
  { key: 'tasks', label: 'Tasks', category: 'ops', description: 'Your to-dos and deadlines. Assign work and track completion.' },
  { key: 'campaigns', label: 'Campaigns', category: 'marketing', description: 'Email marketing campaigns and their results.' },
  { key: 'social', label: 'Social Media', category: 'marketing', description: 'Schedule and manage social media posts.' },
  { key: 'automations', label: 'Automations', category: 'ops', description: 'Rules that run actions automatically when things happen.' },
  { key: 'tickets', label: 'Support', category: 'support', description: 'Customer support tickets and help requests.' },
  { key: 'chat', label: 'Chat', category: 'support', description: 'Internal team chat and conversations.' },
  { key: 'approvals', label: 'Approvals', category: 'hr', description: 'Requests that need a manager or owner to sign off.' },
  { key: 'requisitions', label: 'Requisitions', category: 'ops', description: 'Internal purchase requests before they become orders.' },
  { key: 'meetings', label: 'Meetings', category: 'ops', description: 'Schedule meetings and track outcomes.' },
  { key: 'knowledge', label: 'Knowledge', category: 'ops', description: 'A shared knowledge base of docs and how-tos.' },
  { key: 'calendar', label: 'Calendar', category: 'ops', description: 'Your schedule: events, deadlines, and appointments.' },
  { key: 'events', label: 'Events', category: 'ops', description: 'Company events and important dates.' },
  { key: 'time-tracking', label: 'Time Tracking', category: 'ops', description: 'Log hours worked on tasks and projects.' },
  { key: 'cashflow', label: 'Cash Flow', category: 'finance', description: 'Track money in and out, and forecast your cash position.' },
  { key: 'merit', label: 'Merit', category: 'hr', description: 'Recognize team members for good work.' },
  { key: 'social-recognition', label: 'Recognition', category: 'hr', description: 'Public recognition and kudos for your team.' },
  { key: 'api', label: 'API & Webhooks', category: 'settings', description: 'Programmatic access for developers.' },
  { key: 'branding', label: 'Branding', category: 'settings', description: 'Customize colors, logo, and appearance.' },
  { key: 'settings', label: 'Settings', category: 'settings', description: 'Account and workspace configuration.' },
] as const

export type ToolKey = typeof TOOLS[number]['key']

// Plan-based entitlements are sourced from the DATABASE (business_entitlements.features
// JSONB, the same source has_feature() and can_access_module() read), NOT from a
// hardcoded constant. Previously a hardcoded PLAN_ENTITLEMENTS defaulted every
// non-privileged user to the 'professional' tool set regardless of their actual
// plan — a parallel source of truth that could contradict the DB. The mapping
// below only translates feature-flag keys into the tool keys the nav uses; the
// entitlement decision itself is the DB's.
const FEATURE_TO_TOOLS: Record<string, ToolKey[]> = {
  crm: ['crm'], inventory: ['inventory'], projects: ['projects'],
  time_tracking: ['time-tracking'], invoicing: ['payments', 'accounting'],
  multi_currency: ['cashflow'], automations: ['automations'],
  campaigns: ['campaigns'], social_media: ['social'],
  support_tickets: ['tickets'], live_chat: ['chat'],
  knowledge_base: ['knowledge'], recognition: ['merit', 'social-recognition'],
  api_access: ['api'], custom_branding: ['branding'],
  advanced_analytics: ['reports'],
}

// Tools every plan (incl. free) gets — core chrome.
const BASE_TOOLS: ToolKey[] = ['dashboard', 'crm', 'people', 'tasks', 'settings', 'approvals', 'calendar', 'events', 'meetings']

// Derive the tool set a business is entitled to from its business_entitlements
// row (plan + features JSONB) — the single DB source of truth, the same one
// has_feature() and can_access_module() consult. Returns BASE_TOOLS plus every
// tool mapped from a feature flag that is true for this business.
function derivePlanTools(features: Record<string, boolean> | null | undefined): Set<ToolKey> {
  const set = new Set<ToolKey>(BASE_TOOLS)
  if (!features) return set
  for (const [feature, on] of Object.entries(features)) {
    if (on && feature in FEATURE_TO_TOOLS) {
      for (const t of FEATURE_TO_TOOLS[feature]) set.add(t)
    }
  }
  return set
}

// Staff role that bypasses functional role filtering (sees everything)
const PRIVILEGED_ROLES = ['owner', 'admin']

interface UseToolAccessResult {
  hasAccess: boolean
  loading: boolean
  error: string | null
}

// Helper type for Supabase nested query
type RoleToolAssignment = {
  functional_role_id: string
  functional_roles?: Array<{
    functional_role_tools?: Array<{ tool_key: string }>
  }>
}

export function useToolAccess(tool: ToolKey): UseToolAccessResult {
  const { staff } = useAuth()
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const checkAccess = useCallback(async () => {
    if (!staff) {
      setHasAccess(false)
      setLoading(false)
      return
    }

    // Owners and admins see everything
    if (PRIVILEGED_ROLES.includes(staff.role || '')) {
      setHasAccess(true)
      setLoading(false)
      return
    }

    try {
      // Load the business's ACTUAL entitlements from the DB (single source of
      // truth) instead of defaulting to the hardcoded professional set.
      const { data: ent } = await supabase
        .from('business_entitlements')
        .select('features')
        .eq('business_id', staff.business_id)
        .maybeSingle()
      const planTools = derivePlanTools(ent?.features as any)

      if (planTools.has(tool)) {
        // Plan allows this tool - check functional role
        const { data: roleData, error: roleError } = await supabase
          .from('staff_functional_roles')
          .select(`
            functional_role_id,
            functional_roles (
              functional_role_tools (tool_key)
            )
          `)
          .eq('staff_id', staff.id)

        if (roleError) {
          // Table might not exist yet - fall back to plan-only
          setHasAccess(true)
          setLoading(false)
          return
        }

        // Get union of all tools from all roles
        const allowedTools = new Set<string>()
        for (const assignment of (roleData || []) as RoleToolAssignment[]) {
          const roles = assignment.functional_roles || []
          for (const role of roles) {
            const frt = role.functional_role_tools || []
            for (const t of frt) {
              allowedTools.add(t.tool_key)
            }
          }
        }

        // If no functional roles assigned, fall back to plan
        if (allowedTools.size === 0) {
          setHasAccess(true)
        } else {
          setHasAccess(allowedTools.has(tool))
        }
      } else {
        // Plan doesn't include this tool
        setHasAccess(false)
      }
      
      setError(null)
    } catch (err) {
      console.error('Error checking tool access:', err)
      // On error, be permissive (staff can see tools) - safer for UX
      setHasAccess(true)
      setError('Failed to check tool access')
    } finally {
      setLoading(false)
    }
  }, [staff, tool])

  useEffect(() => {
    checkAccess()
  }, [checkAccess])

  return { hasAccess, loading, error }
}

// Hook to get all tools the current user can access
export function useAccessibleTools(): { tools: ToolKey[]; loading: boolean } {
  const { staff } = useAuth()
  const [tools, setTools] = useState<ToolKey[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!staff) {
      setTools([])
      setLoading(false)
      return
    }

    // Owners and admins see everything
    if (PRIVILEGED_ROLES.includes(staff.role || '')) {
      setTools(TOOLS.map(t => t.key))
      setLoading(false)
      return
    }

    // Load the business's ACTUAL entitlements from the DB (single source of
    // truth) before resolving functional-role tools.
    ;(async () => {
      const { data: ent } = await supabase
        .from('business_entitlements')
        .select('features')
        .eq('business_id', staff.business_id)
        .maybeSingle()
      const planTools = derivePlanTools(ent?.features as any)

      // Get functional role tools
      supabase
        .from('staff_functional_roles')
        .select(`
          functional_roles (
            functional_role_tools (tool_key)
          )
        `)
        .eq('staff_id', staff.id)
        .then(({ data, error }) => {
          if (error) {
            setTools(Array.from(planTools))
          } else {
            const allowedTools = new Set<ToolKey>(planTools)
            for (const assignment of (data || []) as RoleToolAssignment[]) {
              const roles = assignment.functional_roles || []
              for (const role of roles) {
                const frt = role.functional_role_tools || []
                for (const t of frt) {
                  allowedTools.add(t.tool_key as ToolKey)
                }
              }
            }
            setTools(Array.from(allowedTools))
          }
          setLoading(false)
        })
    })()
  }, [staff])

  return { tools, loading }
}
