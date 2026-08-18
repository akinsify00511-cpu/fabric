import { supabase } from './supabase'
import { DEFAULT_CRM_STAGES } from './crmStageDefaults'

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

/** Create the default pipeline only when this subsidiary has none. */
export async function ensureSubsidiaryPipeline(businessId: string) {
  if (!businessId) throw new Error('A subsidiary/business id is required')

  const { data: existing, error: readError } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (readError) throw readError
  if (existing?.length) return

  const { error } = await supabase.from('crm_pipeline_stages').insert(
    DEFAULT_CRM_STAGES.map((stage) => ({
      business_id: businessId,
      stage_key: stage.key,
      name: stage.name,
      position: stage.sort_order,
      probability: stage.probability,
      color: stage.color,
      is_closed: stage.key === 'won' || stage.key === 'lost',
      is_won: stage.key === 'won',
    })),
  )

  if (error) throw error
}
