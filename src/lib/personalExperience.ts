import { supabase } from './supabase'

/**
 * Personal Experience Layer — client boundary for the canonical Personalization
 * Constitution (Product Constitution Art IX). The server-assembled `my_context()`
 * RPC is the SINGLE authoritative object every consumer derives from; this module
 * is the typed client view + the CRUD wrappers for the three genuinely-new stores
 * (pinned items, personal goals, personal AI memory).
 *
 * Boundaries (never violated):
 *   - RLS remains the only authorization boundary; these tables/pins/goals/memory
 *     are strictly own-rows (user_id = auth.uid()).
 *   - Personalization can never grant access: a pin surfaces only what the user's
 *     RLS already exposes. Writes never reach into other users'/businesses' data.
 *   - News/goal/ai-memory writes are best-effort (Article VI): a failed write never
 *     blocks the host workflow.
 */

export type PinEntityType =
  | 'module'
  | 'customer'
  | 'deal'
  | 'project'
  | 'report'
  | 'lead'
  | 'invoice'

export const PIN_ENTITY_TYPES: PinEntityType[] = [
  'module',
  'customer',
  'deal',
  'project',
  'report',
  'lead',
  'invoice',
]

export interface PinnedItem {
  entity_type: PinEntityType
  entity_id: string
  pin_label: string | null
  sort_order: number
}

// Function-home categories (mirrors functionHome.ts) — a goal may only belong to a
// function the user could plausibly hold, so a "sales" goal cannot be invented for
// a function with no sales scope.
export type GoalCategory =
  | 'general'
  | 'marketing'
  | 'sales'
  | 'finance'
  | 'hr'
  | 'operations'
  | 'projects'

export const GOAL_CATEGORIES: GoalCategory[] = [
  'general',
  'marketing',
  'sales',
  'finance',
  'hr',
  'operations',
  'projects',
]

export type GoalStatus = 'active' | 'at_risk' | 'paused' | 'achieved' | 'abandoned'
export type GoalProgressSource = 'metric' | 'user' | 'none'
export type GoalUnit =
  | 'currency'
  | 'number'
  | 'percent'
  | 'duration_days'
  | 'ratio'
  | 'boolean'

export interface PersonalGoal {
  id: string
  category: GoalCategory
  title: string
  description: string | null
  metric_key: string | null
  start_value: number | null
  target_value: number | null
  current_value: number | null
  unit: GoalUnit
  due_on: string | null
  status: GoalStatus
  progress_source: GoalProgressSource
}

/**
 * Progress 0..1 when a target exists (honest): if current is null there is no
 * measurable progress yet — return null, never a fake 0%. (Article V / §22.)
 */
export function goalProgress(g: Pick<PersonalGoal, 'current_value' | 'target_value'>): number | null {
  if (g.target_value === null || g.target_value === 0) return null
  if (g.current_value === null) return null
  const p = Number(g.current_value) / Number(g.target_value)
  return Math.max(0, Math.min(1, p))
}

/** Percent label for a goal with a target; null → "—" (honest insufficient-data). */
export function goalProgressLabel(g: Pick<PersonalGoal, 'current_value' | 'target_value'>): string | null {
  const p = goalProgress(g)
  return p === null ? null : `${Math.round(p * 100)}%`
}

export type AiMemoryKind = 'routine' | 'significant' | 'context'
export type AiMemorySource = 'system_captured' | 'ai_inferred' | 'user_entered' | 'user_confirmed'

export interface AiMemoryEntry {
  kind: AiMemoryKind
  payload: Record<string, unknown>
  source: AiMemorySource
}

// ---- my_context() canonical object -------------------------------

export interface MyIdentity {
  user_id: string
  staff_id: string
  name: string
  email: string | null
  bio: string | null
}

export interface MyMembership {
  staff_id: string
  business_id: string
  role: string
  active_role: string | null
  member_kind: string | null
  job_title: string | null
  department: string | null
  onboarding_completed: boolean | null
}

export interface MyResponsibilities {
  departments_headed: string[]
  teams_headed: string[]
  reports_to: string[]
  direct_reports: string[]
  secondary_roles: string[]
  department_memberships: string[]
}

export interface MyBusiness {
  business_name: string
  industry: string | null
  organization_id: string
  company_size: number
}

export interface MyWorkspaces {
  selected_tools: string[] | null
  selection_completed: boolean | null
  pinned_items: PinnedItem[]
}

export interface MyPersonal {
  locale: {
    language: string | null
    timezone: string | null
    date_format: string | null
    time_format: string | null
  }
  notification: {
    email_enabled: boolean | null
    push_enabled: boolean | null
    in_app_enabled: boolean | null
  }
}

export interface MyContext {
  identity: MyIdentity
  membership: MyMembership
  responsibilities: MyResponsibilities
  business: MyBusiness
  entitlements: { plan_code: string | null; features: Record<string, unknown> | null }
  workspaces: MyWorkspaces | null
  personal: MyPersonal | null
  ai_memory: AiMemoryEntry[]
  goals: PersonalGoal[]
}

/** fetchMyContext — the authoritative context object. Best-effort: null when the
 * RPC isn't deployed (deployment drift), never an error that breaks the host. */
export async function fetchMyContext(): Promise<MyContext | null> {
  const { data, error } = await supabase.rpc('my_context')
  if (error) return null
  return data as MyContext
}

/** fetchMyWorkspaceArrangement — lean wrapper for pins + selected tools. */
export async function fetchMyWorkspaceArrangement(): Promise<MyWorkspaces | null> {
  const { data, error } = await supabase.rpc('my_workspace_arrangement')
  if (error) return null
  return data as MyWorkspaces
}

// ---- pinned items CRUD (own rows only) ---------------------------

export async function listPinnedItems(businessId: string): Promise<PinnedItem[]> {
  const { data, error } = await supabase
    .from('user_pinned_items')
    .select('entity_type, entity_id, pin_label, sort_order')
    .eq('business_id', businessId)
    .order('sort_order', { ascending: true })
  if (error) return []
  return (data ?? []) as PinnedItem[]
}

export async function upsertPinnedItem(
  businessId: string,
  item: { entity_type: PinEntityType; entity_id: string; pin_label?: string; sort_order?: number },
): Promise<boolean> {
  const { error } = await supabase.from('user_pinned_items').upsert(
    {
      business_id: businessId,
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      pin_label: item.pin_label ?? null,
      sort_order: item.sort_order ?? 0,
    },
    { onConflict: 'user_id,entity_type,entity_id' },
  )
  return !error
}

export async function removePinnedItem(businessId: string, entityType: PinEntityType, entityId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_pinned_items')
    .delete()
    .eq('business_id', businessId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
  return !error
}

// ---- personal goals CRUD -----------------------------------------

export async function listGoals(businessId: string): Promise<PersonalGoal[]> {
  const { data, error } = await supabase
    .from('user_goals')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []) as PersonalGoal[]
}

export async function upsertGoal(
  businessId: string,
  goal: {
    title: string
    category: GoalCategory
    description?: string
    metric_key?: string | null
    target_value?: number | null
    current_value?: number | null
    unit?: GoalUnit
    due_on?: string | null
    status?: GoalStatus
  },
): Promise<boolean> {
  const { error } = await supabase.from('user_goals').upsert(
    {
      business_id: businessId,
      title: goal.title,
      category: goal.category,
      description: goal.description ?? null,
      metric_key: goal.metric_key ?? null,
      start_value: null,
      target_value: goal.target_value ?? null,
      current_value: goal.current_value ?? null,
      unit: goal.unit ?? 'number',
      due_on: goal.due_on ?? null,
      status: goal.status ?? 'active',
      progress_source: goal.current_value != null ? 'user' : 'none',
    },
    { onConflict: 'user_id,title' },
  )
  return !error
}

export async function updateGoalStatus(businessId: string, goalId: string, status: GoalStatus): Promise<boolean> {
  const { error } = await supabase
    .from('user_goals')
    .update({ status })
    .eq('business_id', businessId)
    .eq('id', goalId)
  return !error
}

export async function deleteGoal(businessId: string, goalId: string): Promise<boolean> {
  const { error } = await supabase.from('user_goals').delete().eq('business_id', businessId).eq('id', goalId)
  return !error
}

// ---- personal AI memory (own rows; honest source labels) ----------

export async function listAiMemory(businessId: string): Promise<AiMemoryEntry[]> {
  const { data, error } = await supabase
    .from('user_ai_memory')
    .select('kind, payload, source')
    .eq('business_id', businessId)
    .order('last_seen_at', { ascending: false })
  if (error) return []
  return (data ?? []) as AiMemoryEntry[]
}

export async function upsertAiMemory(
  businessId: string,
  entry: { kind: AiMemoryKind; payload: Record<string, unknown>; source: AiMemorySource },
): Promise<boolean> {
  const { error } = await supabase.from('user_ai_memory').insert({
    business_id: businessId,
    kind: entry.kind,
    payload: entry.payload,
    source: entry.source,
  })
  return !error
}