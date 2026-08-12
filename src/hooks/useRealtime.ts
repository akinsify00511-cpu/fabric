import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export interface UseRealtimeOptions {
  table: string
  filter?: {
    column: string
    value: string | number
  }
  enabled?: boolean
}

export interface UseRealtimeReturn<T> {
  data: T[] | null
  error: Error | null
  isLoading: boolean
  isConnected: boolean
  insert: T | null
  update: T | null
  delete: T | null
}

export function useRealtime<T extends Record<string, any>>({
  table,
  filter,
  enabled = true,
}: UseRealtimeOptions): UseRealtimeReturn<T> {
  const [data, setData] = useState<T[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [insert, setInsert] = useState<T | null>(null)
  const [update, setUpdate] = useState<T | null>(null)
  const [deleteEvent, setDeleteEvent] = useState<T | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!enabled) return

    let query = supabase.from(table).select('*')
    
    if (filter) {
      query = query.eq(filter.column, filter.value)
    }

    const fetchInitialData = async () => {
      setIsLoading(true)
      try {
        const { data: initialData, error: fetchError } = await query
        
        if (fetchError) throw fetchError
        setData(initialData)
        setError(null)
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchInitialData()

    const channelName = filter 
      ? `realtime-${table}-${filter.column}-${filter.value}` 
      : `realtime-${table}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: filter ? `${filter.column}=eq.${filter.value}` : undefined,
        },
        (payload: RealtimePostgresChangesPayload<T>) => {
          handleRealtimeChange(payload)
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    function handleRealtimeChange(payload: RealtimePostgresChangesPayload<T>) {
      const { eventType, new: newRecord, old: oldRecord } = payload

      switch (eventType) {
        case 'INSERT':
          setInsert(newRecord as T)
          setData((prev) => (prev ? [...prev, newRecord as T] : [newRecord as T]))
          setTimeout(() => setInsert(null), 1000)
          break

        case 'UPDATE':
          setUpdate(newRecord as T)
          setData((prev) =>
            prev
              ? prev.map((item) => {
                  const id = (item as any).id
                  const updatedId = (newRecord as any).id
                  return id === updatedId ? newRecord : item
                })
              : prev
          )
          setTimeout(() => setUpdate(null), 1000)
          break

        case 'DELETE':
          setDeleteEvent(oldRecord as T)
          setData((prev) =>
            prev
              ? prev.filter((item) => (item as any).id !== (oldRecord as any).id)
              : prev
          )
          setTimeout(() => setDeleteEvent(null), 1000)
          break
      }
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [table, filter?.column, filter?.value, enabled])

  return {
    data,
    error,
    isLoading,
    isConnected,
    insert,
    update,
    delete: deleteEvent,
  }
}

export function useRealtimeSubscription(
  channelName: string,
  handlers: {
    onInsert?: (payload: any) => void
    onUpdate?: (payload: any) => void
    onDelete?: (payload: any) => void
  },
  dependencies: any[] = []
) {
  const channelRef = useRef<RealtimeChannel | null>(null)

  const subscribe = useCallback(() => {
    if (channelRef.current) return

    const channel = supabase.channel(channelName)

    if (handlers.onInsert) {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public' }, handlers.onInsert)
    }
    if (handlers.onUpdate) {
      channel.on('postgres_changes', { event: 'UPDATE', schema: 'public' }, handlers.onUpdate)
    }
    if (handlers.onDelete) {
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public' }, handlers.onDelete)
    }

    channel.subscribe()
    channelRef.current = channel
  }, [channelName, ...dependencies])

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
  }, [subscribe, unsubscribe])

  return { subscribe, unsubscribe }
}

export function usePresence(channelName: string) {
  const [presenceState, setPresenceState] = useState<Record<string, any[]>>({})
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const channel = supabase.channel(channelName, {
      config: { presence: { key: 'user' } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setPresenceState(state)
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: 'current_user',
            online_at: new Date().toISOString(),
          })
        }
      })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [channelName])

  const trackPresence = useCallback(async (state: Record<string, any>) => {
    if (channelRef.current) {
      await channelRef.current.track(state)
    }
  }, [])

  const untrackPresence = useCallback(async () => {
    if (channelRef.current) {
      await channelRef.current.untrack()
    }
  }, [])

  return {
    presenceState,
    trackPresence,
    untrackPresence,
  }
}

export function useBroadcast(channelName: string) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [lastMessage, setLastMessage] = useState<any>(null)

  useEffect(() => {
    const channel = supabase.channel(channelName)

    channel
      .on('broadcast', { event: '*' }, (payload) => {
        setLastMessage(payload)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [channelName])

  const sendBroadcast = useCallback(async (event: string, message: any) => {
    if (channelRef.current) {
      await channelRef.current.send({
        type: 'broadcast',
        event,
        payload: message,
      })
    }
  }, [])

  return { sendBroadcast, lastMessage }
}
