import { useState, useCallback, useRef, useEffect } from 'react'

export interface UseRetryOptions {
  maxAttempts?: number
  initialDelay?: number
  maxDelay?: number
  backoffMultiplier?: number
  shouldRetry?: (error: any, attempt: number) => boolean
  onRetry?: (error: any, attempt: number, delay: number) => void
}

export interface UseRetryReturn<T> {
  execute: (fn: () => Promise<T>) => Promise<T>
  executeSync: <TResult>(fn: () => TResult) => TResult
  isRetrying: boolean
  attempt: number
  error: Error | null
  reset: () => void
}

export function useRetry<T = any>(options: UseRetryOptions = {}): UseRetryReturn<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
    onRetry,
  } = options

  const [isRetrying, setIsRetrying] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sleep = useCallback((ms: number) => {
    return new Promise((resolve) => {
      timeoutRef.current = setTimeout(resolve, ms)
    })
  }, [])

  const calculateDelay = useCallback(
    (currentAttempt: number) => {
      const delay = Math.min(initialDelay * Math.pow(backoffMultiplier, currentAttempt - 1), maxDelay)
      return delay
    },
    [initialDelay, backoffMultiplier, maxDelay]
  )

  const execute = useCallback(
    async (fn: () => Promise<T>): Promise<T> => {
      setIsRetrying(true)
      setError(null)

      for (let currentAttempt = 1; currentAttempt <= maxAttempts; currentAttempt++) {
        setAttempt(currentAttempt)

        try {
          const result = await fn()
          setIsRetrying(false)
          return result
        } catch (err: any) {
          setError(err)
          
          if (currentAttempt === maxAttempts || !shouldRetry(err, currentAttempt)) {
            setIsRetrying(false)
            throw err
          }

          const delay = calculateDelay(currentAttempt)
          onRetry?.(err, currentAttempt, delay)
          await sleep(delay)
        }
      }

      setIsRetrying(false)
      throw error
    },
    [maxAttempts, shouldRetry, calculateDelay, sleep, onRetry, error]
  )

  const executeSync = useCallback(
    <TResult>(fn: () => TResult): TResult => {
      setIsRetrying(true)
      setError(null)

      for (let currentAttempt = 1; currentAttempt <= maxAttempts; currentAttempt++) {
        setAttempt(currentAttempt)

        try {
          const result = fn()
          setIsRetrying(false)
          return result
        } catch (err: any) {
          setError(err)

          if (currentAttempt === maxAttempts) {
            setIsRetrying(false)
            throw err
          }
        }
      }

      setIsRetrying(false)
      throw error
    },
    [maxAttempts, error]
  )

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsRetrying(false)
    setAttempt(0)
    setError(null)
  }, [])

  return {
    execute,
    executeSync,
    isRetrying,
    attempt,
    error,
    reset,
  }
}

export interface UsePollingOptions {
  enabled?: boolean
  interval?: number
  immediate?: boolean
  onError?: (error: Error) => void
}

export function usePolling<T>(
  fetchFn: () => Promise<T>,
  options: UsePollingOptions = {}
) {
  const { enabled = true, interval = 5000, immediate = true, onError } = options
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMountedRef = { current: true }

  const startPolling = useCallback(() => {
    if (intervalRef.current) return

    setIsPolling(true)
    
    intervalRef.current = setInterval(async () => {
      if (!isMountedRef.current) return
      
      try {
        setIsLoading(true)
        const result = await fetchFn()
        if (isMountedRef.current) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err as Error)
          onError?.(err as Error)
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false)
        }
      }
    }, interval)
  }, [fetchFn, interval, onError])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsPolling(false)
  }, [])

  const refetch = useCallback(async () => {
    try {
      setIsLoading(true)
      const result = await fetchFn()
      if (isMountedRef.current) {
        setData(result)
        setError(null)
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err as Error)
        onError?.(err as Error)
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [fetchFn, onError])

  useEffect(() => {
    isMountedRef.current = true
    
    if (enabled) {
      if (immediate) {
        refetch()
      }
      startPolling()
    }

    return () => {
      isMountedRef.current = false
      stopPolling()
    }
  }, [enabled, immediate, refetch, startPolling, stopPolling])

  return {
    data,
    error,
    isPolling,
    isLoading,
    refetch,
    startPolling,
    stopPolling,
  }
}
