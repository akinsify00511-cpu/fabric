import { describe, it, expect, vi, afterEach } from 'vitest'
import { initErrorCapture } from '../../../src/lib/errorCapture'

describe('errorCapture global handlers', () => {
  const originalOnError = window.onerror

  afterEach(() => {
    window.onerror = originalOnError
    vi.restoreAllMocks()
  })

  it('installs global handlers without throwing', () => {
    expect(() => initErrorCapture()).not.toThrow()
    expect(window.onerror).toBeDefined()
  })

  it('re-init is a no-op', () => {
    initErrorCapture()
    const first = window.onerror
    initErrorCapture()
    expect(window.onerror).toBe(first)
  })
})