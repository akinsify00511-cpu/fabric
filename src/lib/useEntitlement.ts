/**
 * Entitlement Hook
 * Trial-first product access with plan-level gating after expiry.
 */

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

export const FEATURES = {
  time_tracking: { label: 'Time Tracking', category: 'productivity' },
  invoicing: { label: 'Invoicing & Payments', category: 'finance' },
  api_access: { label: 'API Access', category: 'integrations' },
  custom_branding: { label: 'Custom Branding', category: 'branding' },
  advanced_analytics: { label: 'Advanced Analytics', category: 'analytics' },
  unlimited_team: { label: 'Unlimited Team Members', category: 'team' },
  multi_currency: { label: 'Multi-Currency', category: 'finance' },
  automations: { label: 'Automations', category: 'productivity' },
  campaigns: { label: 'Campaigns', category: 'marketing' },
  social_media: { label: 'Social Media', category: 'marketing' },
  whatsapp: { label: 'WhatsApp', category: 'marketing' },
  sms: { label: 'SMS', category: 'marketing' },
  payments: { label: 'Payments', category: 'payments' },
  multi_bank: { label: 'Multi-Bank Transfers', category: 'payments' },
  inventory: { label: 'Inventory Management', category: 'ops' },
  projects: { label: 'Projects', category: 'ops' },
  crm: { label: 'CRM', category: 'sales' },
  support_tickets: { label: 'Support Tickets', category: 'support' },
  live_chat: { label: 'Live Chat', category: 'support' },
  knowledge_base: { label: 'Knowledge Base', category: 'ops' },
  recognition: { label: 'Team Recognition', category: 'hr' },
} as const

export type FeatureKey = keyof typeof FEATURES

export const PLANS = {
  free: { label: 'Free', tier: 0 },
  starter: { label: 'Starter', tier: 1 },
  professional: { label: 'Professional', tier: 2 },
  pro: { label: 'Pro', tier: 3 },
  enterprise: { label: 'Enterprise', tier: 4 },
} as const

export type PlanKey = keyof typeof PLANS

const PLAN_ALIASES: Record<string, PlanKey> = {
  pro: 'pro', Pro: 'pro', PRO: 'pro',
  starter: 'starter', Starter: 'starter',
  team: 'professional', Team: 'professional',
  growth: 'professional', Growth: 'professional',
  business: 'professional', Business: 'professional',
  scale: 'enterprise', Scale: 'enterprise',
}

function normalizePlan(plan?: string): PlanKey {
  if (!plan) return 'free'
  return PLAN_ALIASES[plan] || (plan in PLANS ? plan as PlanKey : 'free')
}

interface BusinessEntitlement {
  id: string
  business_id: string
  plan: string
  features: Partial<Record<FeatureKey, boolean>>
  team_limit: number
  storage_limit_mb: number
  trial_ends_at: string | null
  trial_started_at: string | null
}

const FREE_FEATURES: Partial<Record<FeatureKey, boolean>> = {
  crm: true,
  projects: true,
}

const PAID_FEATURES: Record<PlanKey, Partial<Record<FeatureKey, boolean>>> = {
  free: FREE_FEATURES,
  starter: { crm: true, projects: true, inventory: true, support_tickets: true, live_chat: true },
  professional: {
    crm: true, projects: true, inventory: true, time_tracking: true, invoicing: true,
    campaigns: false, social_media: false, payments: true, multi_bank: false,
    support_tickets: true, live_chat: true, knowledge_base: true, recognition: true,
  },
  pro: {
    crm: true, projects: true, inventory: true, time_tracking: true, invoicing: true,
    multi_currency: true, campaigns: true, social_media: true, payments: true,
    multi_bank: true, support_tickets: true, live_chat: true, knowledge_base: true,
    recognition: true, api_access: true, custom_branding: true, advanced_analytics: true,
    automations: true, whatsapp: true, sms: true,
  },
  enterprise: Object.keys(FEATURES).reduce((acc, key) => ({ ...acc, [key]: true }), {}) as Partial<Record<FeatureKey, boolean>>,
}

const ALL_TRIAL_FEATURES = Object.keys(FEATURES).reduce((acc, key) => ({ ...acc, [key]: true }), {}) as Partial<Record<FeatureKey, boolean>>

function trialIsActive(entitlement: BusinessEntitlement | null): boolean {
  return entitlement?.plan === 'free' && !!entitlement.trial_ends_at && new Date(entitlement.trial_ends_at).getTime() > Date.now()
}

function effectiveFeatures(entitlement: BusinessEntitlement | null) {
  if (!entitlement) return FREE_FEATURES
  if (trialIsActive(entitlement)) return ALL_TRIAL_FEATURES
  const plan = normalizePlan(entitlement.plan)
  if (plan === 'free') return FREE_FEATURES
  return { ...PAID_FEATURES[plan], ...entitlement.features }
}

export function useEntitlement(feature: FeatureKey) {
  const { staff } = useAuth()
  const [entitlement, setEntitlement] = useState<BusinessEntitlement | null>(null)
  const [teamCount, setTeamCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!staff?.business_id) { setLoading(false); return }
    let cancelled = false
    const load = async () => {
      try {
        const { data } = await supabase.from('business_entitlements').select('*').eq('business_id', staff.business_id).maybeSingle()
        const { count } = await supabase.from('staff').select('*', { count: 'exact', head: true }).eq('business_id', staff.business_id)
        if (!cancelled) { setEntitlement(data as BusinessEntitlement | null); setTeamCount(count || 0) }
      } catch (err) {
        console.warn('Entitlements not available:', (err as any)?.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [staff?.business_id])

  const plan = normalizePlan(entitlement?.plan)
  const features = effectiveFeatures(entitlement)
  const teamLimit = entitlement?.team_limit || 3

  return {
    hasAccess: features[feature] === true,
    loading,
    plan,
    features,
    teamLimit,
    currentTeamCount: teamCount,
    canAddTeamMember: teamCount < teamLimit,
  }
}

export function useTeamLimit() {
  const { staff } = useAuth()
  const [currentCount, setCurrentCount] = useState(0)
  const [limit, setLimit] = useState(3)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!staff?.business_id) { setLoading(false); return }
    Promise.all([
      supabase.from('business_entitlements').select('team_limit').eq('business_id', staff.business_id).maybeSingle(),
      supabase.from('staff').select('*', { count: 'exact', head: true }).eq('business_id', staff.business_id),
    ]).then(([ent, members]) => {
      if (ent.data?.team_limit) setLimit(ent.data.team_limit)
      setCurrentCount(members.count || 0)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [staff?.business_id])

  return { canAddMember: currentCount < limit, currentCount, limit, loading }
}

export function useEntitlements() {
  const { staff } = useAuth()
  const [entitlement, setEntitlement] = useState<BusinessEntitlement | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!staff?.business_id) { setLoading(false); return }
    let cancelled = false
    supabase.from('business_entitlements').select('*').eq('business_id', staff.business_id).maybeSingle().then(({ data, error }) => {
      if (!cancelled) {
        if (error) console.warn('Entitlements not available:', error.message)
        setEntitlement(data as BusinessEntitlement | null)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [staff?.business_id])

  const plan = normalizePlan(entitlement?.plan)
  const features = effectiveFeatures(entitlement)
  const trialEndsAt = entitlement?.trial_ends_at ?? null
  const inTrial = trialIsActive(entitlement)
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
    : 0

  return {
    plan,
    features,
    teamLimit: entitlement?.team_limit || 3,
    loading,
    trialEndsAt,
    trialDaysLeft,
    inTrial,
  }
}
