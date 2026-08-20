import { describe, it, expect } from 'vitest'
import {
  isPermanentSchemaError,
  isSchemaAvailable,
  markSchemaUnavailable,
  tableGuard,
} from '../../../src/lib/schemaAvailability'

describe('schemaAvailability circuit breaker', () => {
  it('classifies permanent drift errors by PostgREST code', () => {
    expect(isPermanentSchemaError({ code: 'PGRST202' })).toBe(true)   // RPC missing
    expect(isPermanentSchemaError({ code: 'PGRST205' })).toBe(true)   // table missing
    expect(isPermanentSchemaError({ code: '42703' })).toBe(true)      // column missing
    expect(isPermanentSchemaError({ code: '42501' })).toBe(true)      // object denied
    expect(isPermanentSchemaError({ code: '42P01' })).toBe(true)      // undefined table
    expect(isPermanentSchemaError({ code: 'PGRST116' })).toBe(false)  // empty-result code is not drift
    expect(isPermanentSchemaError({ code: '23505' })).toBe(false)     // constraint violation is a real error
  })

  it('classifies permanent drift errors by message when code is absent', () => {
    expect(isPermanentSchemaError({ message: 'no matches found in the schema cache' })).toBe(true)
    expect(isPermanentSchemaError({ message: 'could not find the function public.foo' })).toBe(true)
    expect(isPermanentSchemaError({ message: "column staff.active does not exist" })).toBe(true)
    expect(isPermanentSchemaError({ message: 'permission denied for table leave_requests' })).toBe(true)
    expect(isPermanentSchemaError({ message: 'timeout' })).toBe(false)
  })

  it('never treats null/undefined input as drift', () => {
    expect(isPermanentSchemaError(null)).toBe(false)
    expect(isPermanentSchemaError(undefined)).toBe(false)
    expect(isPermanentSchemaError({})).toBe(false)
  })

  it('tableGuard passes through when the object answers', async () => {
    const key = `t-${Math.random()}`
    const out = await tableGuard(key, () => Promise.resolve({ data: ['row'], error: null }))
    expect(out.data).toEqual(['row'])
    expect(isSchemaAvailable(key)).toBe(true)
  })

  it('marks the object unavailable on a permanent error and skips future calls', async () => {
    const key = `t-${Math.random()}`
    let calls = 0
    const first = await tableGuard(key, () => {
      calls++
      return Promise.resolve({ data: null, error: { code: 'PGRST205' } })
    })
    expect(first.data).toBeNull()
    expect(calls).toBe(1)
    expect(isSchemaAvailable(key)).toBe(false)

    const second = await tableGuard(key, () => {
      calls++
      return Promise.resolve({ data: ['row'], error: null })
    })
    expect(second.data).toBeNull()   // skipped — the query never ran
    expect(calls).toBe(1)
  })

  it('transient errors do not trip the breaker', async () => {
    const key = `t-${Math.random()}`
    const out = await tableGuard(key, () =>
      Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }))
    expect(out.data).toBeNull()
    expect(isSchemaAvailable(key)).toBe(true)
  })
})
