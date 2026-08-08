import { useState, useEffect, useCallback, useRef } from 'react'

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}

export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 300
): [(...args: Parameters<T>) => void, boolean] {
  const [isDebouncing, setIsDebouncing] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)
  
  callbackRef.current = callback

  const debouncedFn = useCallback((...args: Parameters<T>) => {
    setIsDebouncing(true)
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args)
      setIsDebouncing(false)
    }, delay)
  }, [delay])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return [debouncedFn, isDebouncing]
}

export function useThrottle<T>(value: T, interval: number = 300): T {
  const [throttledValue, setThrottledValue] = useState<T>(value)
  const lastExecuted = useRef<number>(Date.now())

  useEffect(() => {
    const now = Date.now()
    const timeSinceLastExecution = now - lastExecuted.current

    if (timeSinceLastExecution >= interval) {
      lastExecuted.current = now
      setThrottledValue(value)
    } else {
      const timer = setTimeout(() => {
        lastExecuted.current = Date.now()
        setThrottledValue(value)
      }, interval - timeSinceLastExecution)

      return () => clearTimeout(timer)
    }
  }, [value, interval])

  return throttledValue
}

export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  interval: number = 300
): T {
  const [isThrottling, setIsThrottling] = useState(false)
  const lastExecuted = useRef<number>(0)
  const pendingArgs = useRef<Parameters<T> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)
  
  callbackRef.current = callback

  const throttledFn = useCallback((...args: Parameters<T>) => {
    const now = Date.now()
    const timeSinceLastExecution = now - lastExecuted.current

    if (timeSinceLastExecution >= interval) {
      lastExecuted.current = now
      callbackRef.current(...args)
      setIsThrottling(false)
    } else {
      pendingArgs.current = args
      setIsThrottling(true)

      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          if (pendingArgs.current !== null) {
            lastExecuted.current = Date.now()
            callbackRef.current(...pendingArgs.current)
            pendingArgs.current = null
          }
          setIsThrottling(false)
          timeoutRef.current = null
        }, interval - timeSinceLastExecution)
      }
    }
  }, [interval]) as T

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return throttledFn
}

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined)

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref.current
}

export function useFirstMount(): boolean {
  const isFirst = useRef<boolean>(true)

  if (isFirst.current) {
    isFirst.current = false
    return true
  }

  return false
}

export function useUpdateEffect(effect: React.EffectCallback, deps?: React.DependencyList) {
  const isFirstMount = useFirstMount()

  useEffect(() => {
    if (!isFirstMount) {
      return effect()
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

export function useAsyncMemo<T>(
  asyncFn: () => Promise<T>,
  deps: React.DependencyList = [],
  options: {
    initialValue?: T
    watch?: boolean
  } = {}
): {
  data: T | undefined
  error: Error | null
  isLoading: boolean
  refetch: () => Promise<void>
} {
  const { initialValue, watch = true } = options
  const [data, setData] = useState<T | undefined>(initialValue)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const mountedRef = useRef(true)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await asyncFn()
      if (mountedRef.current) {
        setData(result)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err as Error)
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    mountedRef.current = true
    if (watch) {
      fetch()
    }
    return () => {
      mountedRef.current = false
    }
  }, [fetch, watch])

  return { data, error, isLoading, refetch: fetch }
}
