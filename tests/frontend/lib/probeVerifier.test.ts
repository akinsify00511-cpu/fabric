import { describe, it, expect } from 'vitest'
import {
  isClockSkewError,
  describeProbeFailure,
  ClockSkewError,
} from '../../../src/lib/probeVerifier'

describe('probeVerifier clock-skew classification', () => {
  it('recognizes PGRST303 code as clock skew', () => {
    expect(isClockSkewError({ code: 'PGRST303' })).toBe(true)
  })

  it('recognizes "issued at future" message as clock skew', () => {
    expect(isClockSkewError({ message: 'JWT issued at future' })).toBe(true)
  })

  it('does not mark drift errors as clock skew', () => {
    expect(isClockSkewError({ code: 'PGRST202', message: 'no matches found' })).toBe(false)
    expect(isClockSkewError({ code: '42703', message: 'column does not exist' })).toBe(false)
  })

  it('null/empty errors are not clock skew', () => {
    expect(isClockSkewError(null)).toBe(false)
    expect(isClockSkewError(undefined)).toBe(false)
    expect(isClockSkewError({})).toBe(false)
  })

  it('describeProbeFailure yields a retry-safe message', () => {
    const verdict = describeProbeFailure({ code: 'PGRST303' })
    expect(verdict.kind).toBe('clock_skew')
    expect(verdict.userMessage).toContain('clock')
    const clear = describeProbeFailure({ code: 'PGRST202' })
    expect(clear.kind).toBe('clear')
  })

  it('ClockSkewError is an Error subtype for instanceof checks', () => {
    const e = new ClockSkewError()
    expect(e instanceof Error).toBe(true)
    expect(e.name).toBe('ClockSkewError')
  })
})
