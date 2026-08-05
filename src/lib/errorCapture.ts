/**
 * Console Error Capture
 * Global buffer that hooks into window.onerror and console.error
 * to capture context for bug reports
 */

import * as Sentry from '@sentry/react'

// Maximum number of errors to keep in buffer
const MAX_ERRORS = 10

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

    // Also let Sentry capture it
    Sentry.captureException(error || new Error(message as string), {
      extra: {
        source,
        lineno,
        colno,
      },
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

    // Also let Sentry capture it
    Sentry.captureException(error, {
      extra: {
        type: 'unhandledrejection',
      },
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
