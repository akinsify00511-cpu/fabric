export type DecisionRecord = {
  decisionId: string
  subsidiaryId: string
  decisionType: string
  madeAt: string
  expectedMetric: string
  expectedValue: number
  actualValue?: number
  confidence?: number
}

export type DecisionLearning = {
  decisionId: string
  variance?: number
  variancePct?: number
  outcome: 'better_than_expected' | 'on_target' | 'below_expected' | 'pending'
  confidenceCalibration?: 'overconfident' | 'well_calibrated' | 'underconfident'
  learning: string
}

export function evaluateDecisionOutcomes(records: DecisionRecord[]): DecisionLearning[] {
  return records.map((record) => {
    if (record.actualValue === undefined) return { decisionId: record.decisionId, outcome: 'pending', learning: 'Awaiting observed outcome.' }
    const variance = record.actualValue - record.expectedValue
    const variancePct = record.expectedValue !== 0 ? variance / Math.abs(record.expectedValue) : undefined
    const outcome = variancePct !== undefined && variancePct > 0.1 ? 'better_than_expected' : variancePct !== undefined && variancePct < -0.1 ? 'below_expected' : 'on_target'
    let confidenceCalibration: DecisionLearning['confidenceCalibration']
    if (record.confidence !== undefined && variancePct !== undefined) {
      if (record.confidence >= 0.8 && variancePct < -0.1) confidenceCalibration = 'overconfident'
      else if (record.confidence <= 0.4 && variancePct > 0.1) confidenceCalibration = 'underconfident'
      else confidenceCalibration = 'well_calibrated'
    }
    const learning = outcome === 'below_expected'
      ? `Expected ${record.expectedMetric} was ${record.expectedValue}, actual was ${record.actualValue}; review assumptions behind ${record.decisionType}.`
      : outcome === 'better_than_expected'
        ? `Actual ${record.expectedMetric} exceeded the expected value; preserve the assumptions and conditions that contributed to ${record.decisionType}.`
        : `Actual ${record.expectedMetric} was within the expected range for ${record.decisionType}.`
    return { decisionId: record.decisionId, variance, variancePct, outcome, confidenceCalibration, learning }
  })
}
