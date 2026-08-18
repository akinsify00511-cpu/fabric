import type { CRMStage } from './subsidiaryCRM'

export type CRMDealStage = {
  key: string
  label: string
  probability: number
  color: string | null
}

export function toDealStage(stage: CRMStage): CRMDealStage {
  return {
    key: stage.stage_key,
    label: stage.name,
    probability: stage.probability,
    color: stage.color,
  }
}

export function normalizeDealStage(stage: string | null | undefined, stages: CRMStage[]) {
  if (!stage) return stages[0]?.stage_key ?? null
  if (stages.some((item) => item.stage_key === stage)) return stage

  // Preserve legacy deals when possible by matching the old stage name/key.
  const legacyMap: Record<string, string> = {
    hot: 'hot',
    active: 'qualified',
    proposal: 'proposal',
    negotiation: 'negotiation',
    won: 'won',
    lost: 'lost',
  }
  const mapped = legacyMap[stage]
  if (mapped && stages.some((item) => item.stage_key === mapped)) return mapped

  return stages[0]?.stage_key ?? null
}
