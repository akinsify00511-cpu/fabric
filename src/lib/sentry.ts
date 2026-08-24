/**
 * Sentry error reporting — lazy, DSN-gated, never-blocking.
 *
 * The @sentry/react SDK (~45KB gzip) is loaded via dynamic import ONLY when
 * VITE_SENTRY_DSN is configured, and only during browser idle time, so the
 * initial page path never pays for it. Calls made before the SDK is ready are
 * queued (bounded) and flushed once init completes. Without a DSN every
 * function is an immediate no-op and the SDK is never fetched.
 *
 * This module must never throw: error reporting must not break the app.
 */

type SentryModule = typeof import('@sentry/react')

interface QueuedEvent {
  kind: 'exception' | 'message'
  error?: unknown
  message?: string
  context?: Record<string, unknown>
}

const MAX_QUEUED_EVENTS = 25

let sentry: SentryModule | null = null
let initStarted = false
let queue: QueuedEvent[] = []
let queuedUser: { id: string; email?: string } | null | undefined
let queuedTags: Record<string, string> = {}

function dsn(): string | undefined {
  const value = import.meta.env.VITE_SENTRY_DSN
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function enqueue(event: QueuedEvent): void {
  queue.push(event)
  if (queue.length > MAX_QUEUED_EVENTS) {
    queue = queue.slice(-MAX_QUEUED_EVENTS)
  }
}

function flushQueue(): void {
  if (!sentry) return
  if (queuedUser !== undefined) {
    sentry.setUser(queuedUser)
  }
  for (const [key, value] of Object.entries(queuedTags)) {
    sentry.setTag(key, value)
  }
  for (const event of queue) {
    if (event.kind === 'exception') {
      sentry.captureException(event.error, event.context ? { extra: event.context } : undefined)
    } else if (event.message) {
      sentry.captureMessage(event.message, 'error')
    }
  }
  queue = []
}

async function loadSdk(): Promise<void> {
  try {
    const mod = await import('@sentry/react')
    mod.init({
      dsn: dsn(),
      environment: import.meta.env.MODE,
      sendDefaultPii: false,
      // Errors already flow through errorCapture.ts (window.onerror /
      // unhandledrejection hooks + platform-ops feed); the SDK's own global
      // handlers would double-report, so we only capture explicit calls.
      defaultIntegrations: false,
    })
    sentry = mod
    flushQueue()
  } catch {
    // SDK failed to load (offline, blocked by an extension): stay silent.
  }
}

/**
 * Initialize Sentry if a DSN is configured. Call once from main.tsx.
 * Defers the SDK download to idle time so it never competes with first paint.
 */
export function initSentry(): void {
  if (initStarted) return
  if (!dsn()) return
  initStarted = true
  const start = () => { void loadSdk() }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 5000 })
  } else {
    setTimeout(start, 1500)
  }
}

/** Capture an exception. Queued until the SDK is ready; no-op without a DSN. */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!dsn()) return
  if (sentry) {
    sentry.captureException(error, context ? { extra: context } : undefined)
  } else {
    enqueue({ kind: 'exception', error, context })
  }
}

/** Capture a message. Queued until the SDK is ready; no-op without a DSN. */
export function captureMessage(message: string): void {
  if (!dsn()) return
  if (sentry) {
    sentry.captureMessage(message, 'error')
  } else {
    enqueue({ kind: 'message', message })
  }
}

/** Attach the signed-in user to future events. Pass null on sign-out. */
export function setSentryUser(user: { id: string; email?: string } | null): void {
  if (!dsn()) return
  queuedUser = user
  if (sentry) sentry.setUser(user)
}

/** Attach a tag to future events. */
export function setSentryTag(key: string, value: string): void {
  if (!dsn()) return
  queuedTags[key] = value
  if (sentry) sentry.setTag(key, value)
}
