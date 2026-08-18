export type MetricObservation = {
  metric: string
  value: number
  observedAt: string
}

export type BusinessAnomaly = {
  metric: string
  observedValue: number
  baselineValue: number
  deviationRatio: number
  direction: 'up' | 'down'
  severity: 'watch' | 'high' | 'critical'
  message: string
}

export function detectMetricAnomaly(observation: MetricObservation, baselineValue: number, watchThreshold = 0.15, highThreshold = 0.3, criticalThreshold = 0.5): BusinessAnomaly | null {
  if (!Number.isFinite(observation.value) || !Number.isFinite(baselineValue) || baselineValue === 0) return null
  const deviationRatio = (observation.value - baselineValue) / Math.abs(baselineValue)
  const magnitude = Math.abs(deviationRatio)
  if (magnitude < watchThreshold) return null
  const severity: BusinessAnomaly['severity'] = magnitude >= criticalThreshold ? 'critical' : magnitude >= highThreshold ? 'high' : 'watch'
  const direction: BusinessAnomaly['direction'] = deviationRatio >= 0 ? 'up' : 'down'
  return {
    metric: observation.metric,
    observedValue: observation.value,
    baselineValue,
    deviationRatio,
    direction,
    severity,
    message: `${observation.metric} moved ${Math.round(magnitude * 100)}% ${direction} from its baseline.`,
  }
}

export function detectTrendChange(observations: MetricObservation[], minimumPeriods = 3): BusinessAnomaly | null {
  if (observations.length < minimumPeriods) return null
  const ordered = [...observations].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
  const values = ordered.map((item) => item.value)
  const direction = values.every((value, index) => index === 0 || value < values[index - 1]) ? 'down'
    : values.every((value, index) => index === 0 || value > values[index - 1]) ? 'up' : null
  if (!direction) return null
  return detectMetricAnomaly(ordered[ordered.length - 1], values[0], 0.1, 0.2, 0.35)
}
