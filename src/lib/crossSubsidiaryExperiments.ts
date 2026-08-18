export type ExperimentStatus = 'proposed' | 'approved' | 'running' | 'completed' | 'cancelled'

export type CrossSubsidiaryExperiment = {
  id: string
  sourceSubsidiaryId: string
  targetSubsidiaryId: string
  hypothesis: string
  patternKey: string
  metric: string
  baselineValue?: number
  targetValue?: number
  status: ExperimentStatus
  approvedBy?: string
  startedAt?: string
  completedAt?: string
  actualValue?: number
}

export type ExperimentLearning = {
  experimentId: string
  result: 'positive' | 'negative' | 'inconclusive'
  variance?: number
  learning: string
}

export function transitionExperiment(experiment: CrossSubsidiaryExperiment, next: ExperimentStatus, approverId?: string): CrossSubsidiaryExperiment {
  const allowed: Record<ExperimentStatus, ExperimentStatus[]> = {
    proposed: ['approved', 'cancelled'],
    approved: ['running', 'cancelled'],
    running: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  }
  if (!allowed[experiment.status].includes(next)) throw new Error(`Invalid experiment transition: ${experiment.status} -> ${next}`)
  const updated = { ...experiment, status: next }
  if (next === 'approved') updated.approvedBy = approverId
  if (next === 'running') updated.startedAt = new Date().toISOString()
  if (next === 'completed') updated.completedAt = new Date().toISOString()
  return updated
}

export function evaluateExperiment(experiment: CrossSubsidiaryExperiment): ExperimentLearning {
  if (experiment.actualValue === undefined || experiment.targetValue === undefined) {
    return { experimentId: experiment.id, result: 'inconclusive', learning: 'Insufficient outcome data to evaluate the hypothesis.' }
  }
  const variance = experiment.actualValue - experiment.targetValue
  const tolerance = Math.max(Math.abs(experiment.targetValue) * 0.05, 0.0001)
  if (Math.abs(variance) <= tolerance) return { experimentId: experiment.id, result: 'inconclusive', variance, learning: 'Outcome was within the expected tolerance band.' }
  if (variance > 0) return { experimentId: experiment.id, result: 'positive', variance, learning: 'The observed outcome exceeded the target; retain the result as evidence for future tests.' }
  return { experimentId: experiment.id, result: 'negative', variance, learning: 'The observed outcome missed the target; do not generalize the source pattern without further evidence.' }
}
