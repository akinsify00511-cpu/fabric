import { supabase } from './supabase'

export interface CRMStage {
  id: string
  business_id: string
  name: string
  stage_key: string
  position: number
  probability: number
  color: string | null
  is_closed: boolean
  is_won: boolean
}

export interface CRMConfiguration {
  business_id: string
  lead_sources: string[]
  customer_types: string[]
  custom_fields: Record<string, unknown>
  automation_rules: Record<string, unknown>[]
}

/**
 * Load the CRM operating configuration for one subsidiary.
 * The subsidiary id is explicit so callers cannot accidentally fall back to
 * a group-wide CRM configuration.
 */
export async function getSubsidiaryCRMConfiguration(businessId: string) {
  if (!businessId) throw new Error('A subsidiary/business id is required')

  const [configResult, stagesResult] = await Promise.all([
    supabase
      .from('crm_configurations')
      .select('business_id, lead_sources, customer_types, custom_fields, automation_rules')
      .eq('business_id', businessId)
      .maybeSingle(),
    supabase
      .from('crm_pipeline_stages')
      .select('id, business_id, name, stage_key, position, probability, color, is_closed, is_won')
      .eq('business_id', businessId)
      .order('position', { ascending: true }),
  ])

  if (configResult.error) throw configResult.error
  if (stagesResult.error) throw stagesResult.error

  return {
    config: (configResult.data ?? {
      business_id: businessId,
      lead_sources: [],
      customer_types: [],
      custom_fields: {},
      automation_rules: [],
    }) as CRMConfiguration,
    stages: (stagesResult.data ?? []) as CRMStage[],
  }
}

/**
 * Create a sensible pipeline only when a subsidiary has none. This keeps
 * provisioning idempotent and prevents the CRM from silently overwriting a
 * business owner's custom sales process.
 */
export async function ensureSubsidiaryPipeline(businessId: string) {
  if (!businessId) throw new Error('A subsidiary/business id is required')

  const { data: existing, error: readError } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (readError) throw readError
  if (existing?.length) return

  const defaults = [
    ['new', 'New Lead', 0, 10, false, false],
    ['qualified', 'Qualified', 1, 30, false, false],
    ['proposal', 'Proposal', 2, 60, false, false],
    ['negotiation', 'Negotiation', 3, 80, false, false],
    ['won', 'Won', 4, 100, true, true],
    ['lost', 'Lost', 5, 0, true, false],
  ]

  const { error } = await supabase.from('crm_pipeline_stages').insert(
    defaults.map(([stage_key, name, position, probability, is_closed, is_won]) => ({
      business_id: businessId,
      stage_key,
      name,
      position,
      probability,
      is_closed,
      is_won,
    })),
  )

  if (error) throw error
}
