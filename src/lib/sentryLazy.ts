/**
 * Lazy Sentry loader.
 *
 * @sentry/react is heavy (~140KB raw), so it is never part of the initial
 * bundle path: init is deferred to browser idle time, and every capture API
 * queues until the SDK arrives (bounded queue, so early errors are not lost).
 * Without VITE_SENTRY_DSN everything is a no-op.
 */

type SentryModule = typeof import('@sentry/react')

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
const MAX_QUEUED = 20

let loadPromise: Promise<SentryModule | null> | null = null
let latestUser: { id: string } | null | undefined
const pendingTags = new Map<string, string>()
const queuedExceptions: { error: unknown; extra?: Record<string, unknown> }[] = []

function beforeSend(event: import('@sentry/react').ErrorEvent) {
  event.tags = {
    ...event.tags,
    app_version: import.meta.env.VITE_GIT_SHA || 'unknown',
    app_env: import.meta.env.VITE_APP_ENV || 'development',
  }
  return event
}

async function load(): Promise<SentryModule | null> {
  if (!dsn) return null
  if (!loadPromise) {
    loadPromise = import('@sentry/react')
      .then((Sentry) => {
        Sentry.init({
          dsn,
          tracesSampleRate: 0.1,
          environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'development',
          release: import.meta.env.VITE_GIT_SHA || 'dev',
          beforeSend,
        })
        if (latestUser !== undefined) Sentry.setUser(latestUser)
        for (const [k, v] of pendingTags) Sentry.setTag(k, v)
        pendingTags.clear()
        for (const q of queuedExceptions) {
          Sentry.captureException(q.error, q.extra ? { extra: q.extra } : undefined)
        }
        queuedExceptions.length = 0
        return Sentry
      })
      .catch(() => null)
  }
  return loadPromise
}

/** Kick off the idle-time SDK load. Call once at app startup. */
export function initSentry(): void {
  if (!dsn || loadPromise) return
  const start = () => void load()
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    ;(window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
      .requestIdleCallback(start, { timeout: 3000 })
  } else {
    setTimeout(start, 1500)
  }
}

export function captureSentryException(error: unknown, extra?: Record<string, unknown>): void {
  if (!dsn) return
  if (loadPromise) {
    void loadPromise.then((Sentry) => {
      Sentry?.captureException(error, extra ? { extra } : undefined)
    })
    return
  }
  queuedExceptions.push({ error, extra })
  if (queuedExceptions.length > MAX_QUEUED) queuedExceptions.splice(0, queuedExceptions.length - MAX_QUEUED)
}

export function setSentryUser(user: { id: string } | null): void {
  latestUser = user
  if (loadPromise) void loadPromise.then((Sentry) => Sentry?.setUser(user))
}

export function setSentryTag(key: string, value: string): void {
  if (loadPromise) {
    void loadPromise.then((Sentry) => Sentry?.setTag(key, value))
  } else {
    pendingTags.set(key, value)
  }
}

export function captureSentryFeedback(params: {
  message: string
  tags: Record<string, string | undefined>
}): void {
  if (!dsn) return
  void load().then((Sentry) => {
    Sentry?.captureFeedback({
      message: params.message,
      tags: params.tags,
    })
  })
}
