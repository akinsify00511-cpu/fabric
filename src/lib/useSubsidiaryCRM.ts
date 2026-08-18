import { useCallback, useEffect, useState } from 'react'
import { getSubsidiaryCRMConfiguration, ensureSubsidiaryPipeline, type CRMConfiguration, type CRMStage } from './subsidiaryCRM'

export function useSubsidiaryCRM(businessId: string | null | undefined) {
  const [config, setConfig] = useState<CRMConfiguration | null>(null)
  const [stages, setStages] = useState<CRMStage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const reload = useCallback(async () => {
    if (!businessId) {
      setConfig(null)
      setStages([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      await ensureSubsidiaryPipeline(businessId)
      const result = await getSubsidiaryCRMConfiguration(businessId)
      setConfig(result.config)
      setStages(result.stages)
    } catch (cause) {
      const nextError = cause instanceof Error ? cause : new Error('Unable to load subsidiary CRM configuration')
      setError(nextError)
      setConfig(null)
      setStages([])
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { config, stages, loading, error, reload }
}
