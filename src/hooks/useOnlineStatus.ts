import { useState, useEffect, useCallback } from 'react'

export interface UseOnlineStatusReturn {
  isOnline: boolean
  isOffline: boolean
  wasOffline: boolean
  wentOnline: () => void
  wentOffline: () => void
}

export function useOnlineStatus(): UseOnlineStatusReturn {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [wasOffline, setWasOffline] = useState(false)

  const wentOnline = useCallback(() => {
    setIsOnline(true)
  }, [])

  const wentOffline = useCallback(() => {
    setIsOnline(false)
    setWasOffline(true)
  }, [])

  useEffect(() => {
    const handleOnline = () => wentOnline()
    const handleOffline = () => wentOffline()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [wentOnline, wentOffline])

  return {
    isOnline,
    isOffline: !isOnline,
    wasOffline,
    wentOnline,
    wentOffline,
  }
}

export function useNetworkQuality() {
  const { isOnline } = useOnlineStatus()
  const [effectiveType, setEffectiveType] = useState<string | null>(null)
  const [downlink, setDownlink] = useState<number | null>(null)

  useEffect(() => {
    if (!isOnline) return

    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection

    if (!connection) return

    const updateConnectionInfo = () => {
      setEffectiveType(connection.effectiveType || null)
      setDownlink(connection.downlink || null)
    }

    updateConnectionInfo()
    connection.addEventListener('change', updateConnectionInfo)

    return () => {
      connection.removeEventListener('change', updateConnectionInfo)
    }
  }, [isOnline])

  const isSlowConnection = effectiveType === '2g' || effectiveType === 'slow-2g'

  return {
    isOnline,
    effectiveType,
    downlink,
    isSlowConnection,
  }
}
