export type PresenceAction =
  | { id: string; kind: 'clock_in' | 'clock_out'; createdAt: string; payload: Record<string, unknown> }
  | { id: string; kind: 'start_visit' | 'complete_visit'; createdAt: string; payload: Record<string, unknown> }

const KEY = 'avenize:presence-queue:v1'

function readQueue(): PresenceAction[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeQueue(queue: PresenceAction[]) {
  localStorage.setItem(KEY, JSON.stringify(queue))
}

export function enqueuePresenceAction(action: Omit<PresenceAction, 'id' | 'createdAt'> & Partial<Pick<PresenceAction, 'id' | 'createdAt'>>) {
  const queue = readQueue()
  const next: PresenceAction = {
    ...action,
    id: action.id ?? crypto.randomUUID(),
    createdAt: action.createdAt ?? new Date().toISOString(),
  } as PresenceAction
  if (!queue.some(item => item.id === next.id)) {
    queue.push(next)
    writeQueue(queue)
  }
  return next
}

export function getPresenceQueue() {
  return readQueue()
}

export function removePresenceAction(id: string) {
  writeQueue(readQueue().filter(item => item.id !== id))
}

export function clearPresenceQueue() {
  localStorage.removeItem(KEY)
}

export function presenceNetworkState() {
  return typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline'
}
