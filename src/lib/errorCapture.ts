/**
 * Console Error Capture
 * Global buffer that hooks into window.onerror and console.error
 * to capture context for bug reports
 */

import { captureException } from './sentry'

// Maximum number of errors to keep in buffer
const MAX_ERRORS = 10

// Throttle platform-ops ingest: at most one log per error signature per 30s,
// so a runaway error loop doesn't flood the ops feed (and stays cheap).
const recentSignatures = new Map<string, number>()
const LOG_THROTTLE_MS = 30000

function shouldLogPlatform(message: string): boolean {
  const key = (message || '').slice(0, 200)
  const now = Date.now()
  const last = recentSignatures.get(key) ?? 0
  if (now - last < LOG_THROTTLE_MS) return false
  recentSignatures.set(key, now)
  // Trim the map so it can't grow unbounded across a long session.
  if (recentSignatures.size > 200) {
    for (const [k, t] of recentSignatures) {
      if (now - t > LOG_THROTTLE_MS) recentSignatures.delete(k)
    }
  }
  return true
}

/**
 * Fire-and-forget ingest to the Riverwayse ops dashboard. NEVER throws, NEVER
 * blocks — logging must not break a user's request path or an edge flow.
 * Dynamic import avoids a circular dep with businessOS (which imports supabase).
 * Only fires when the supabase client has a session (the RPC requires auth).
 */
function logToPlatformOps(params: {
  message: string
  stack?: string
  severity?: string
}): void {
  if (!shouldLogPlatform(params.message)) return
  // Dynamic import: keeps this module dependency-free at load time.
  import('./businessOS')
    .then(({ logPlatformError }) => {
      logPlatformError({
        source: 'frontend',
        severity: params.severity ?? 'error',
        message: params.message?.slice(0, 1000),
        stack: params.stack?.slice(0, 4000),
      })
    })
    .catch(() => {
      // Swallowed: logging is best-effort.
    })
}

interface CapturedError {
  message: string
  stack?: string
  timestamp: number
  type: 'error' | 'unhandled'
}

// Global error buffer
let capturedErrors: CapturedError[] = []
let isInitialized = false

/**
 * Initialize error capture - call once in main.tsx
 */
export function initErrorCapture(): void {
  if (isInitialized) return
  isInitialized = true

  // Capture unhandled errors
  window.onerror = (message, source, lineno, colno, error) => {
    const errorObj: CapturedError = {
      message: message as string,
      stack: error?.stack,
      timestamp: Date.now(),
      type: 'unhandled',
    }

    capturedErrors.push(errorObj)

    // Trim to max size
    if (capturedErrors.length > MAX_ERRORS) {
      capturedErrors = capturedErrors.slice(-MAX_ERRORS)
    }

    // Fire-and-forget ingest to the ops dashboard (non-blocking).
    logToPlatformOps({
      message: message as string,
      stack: error?.stack,
      severity: 'error',
    })

    // Sentry (no-op unless VITE_SENTRY_DSN is configured).
    captureException(error ?? new Error(String(message)), {
      source: 'window.onerror',
      filename: source,
      lineno,
      colno,
    })

    return false // Let default handler run too
  }

  // Capture unhandled promise rejections
  window.onunhandledrejection = (event) => {
    const error = event.reason
    const errorObj: CapturedError = {
      message: error?.message || String(error),
      stack: error?.stack,
      timestamp: Date.now(),
      type: 'unhandled',
    }

    capturedErrors.push(errorObj)

    // Trim to max size
    if (capturedErrors.length > MAX_ERRORS) {
      capturedErrors = capturedErrors.slice(-MAX_ERRORS)
    }

    // Fire-and-forget ingest to the ops dashboard (non-blocking).
    logToPlatformOps({
      message: error?.message || String(error),
      stack: error?.stack,
      severity: 'error',
    })

    // Sentry (no-op unless VITE_SENTRY_DSN is configured).
    captureException(error instanceof Error ? error : new Error(String(error)), {
      source: 'unhandledrejection',
    })
  }

  // Capture console.error calls
  const originalConsoleError = console.error
  console.error = (...args: unknown[]) => {
    const message = args
      .map((arg) => {
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack}`
        }
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg)
          } catch {
            return String(arg)
          }
        }
        return String(arg)
      })
      .join(' ')

    const errorObj: CapturedError = {
      message,
      timestamp: Date.now(),
      type: 'error',
    }

    capturedErrors.push(errorObj)

    // Trim to max size
    if (capturedErrors.length > MAX_ERRORS) {
      capturedErrors = capturedErrors.slice(-MAX_ERRORS)
    }

    // Call original
    originalConsoleError.apply(console, args)
  }
}

/**
 * Get all captured errors
 */
export function getCapturedErrors(): CapturedError[] {
  return [...capturedErrors]
}

/**
 * Clear captured errors (e.g., after submitting feedback)
 */
export function clearCapturedErrors(): void {
  capturedErrors = []
}

/**
 * Get captured errors as JSON string
 */
export function getCapturedErrorsJSON(): string {
  return JSON.stringify(capturedErrors.slice(-MAX_ERRORS))
}

/**
 * Format errors for display in feedback form
 */
export function formatErrorsForDisplay(): string {
  if (capturedErrors.length === 0) {
    return 'No console errors captured'
  }

  return capturedErrors
    .slice(-5)
    .map((e, i) => {
      const time = new Date(e.timestamp).toLocaleTimeString()
      return `[${time}] ${e.type}: ${e.message}`
    })
    .join('\n\n')
}
