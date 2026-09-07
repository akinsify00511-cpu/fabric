import { describe, it, expect } from 'vitest'
import { classifyError } from '../../../src/lib/errorClassification'

describe('classifyError — structured runtime-error taxonomy', () => {
  it('classifies auth failures as expected auth errors', () => {
    expect(classifyError(new Error('Invalid login credentials')).category).toBe('auth')
    expect(classifyError('Too many failed attempts. Try again in 5 minutes').expected).toBe(true)
    expect(classifyError('Unauthorized').category).toBe('auth')
  })

  it('classifies payment errors as expected payment errors', () => {
    expect(classifyError('Paystack checkout failed').category).toBe('payment')
    expect(classifyError('Insufficient funds on the card').expected).toBe(true)
  })

  it('classifies Supabase/PostgREST errors', () => {
    expect(classifyError('PGRST202: no matches found in the schema cache').category).toBe('supabase')
    expect(classifyError('PostgREST error: relation does not exist').expected).toBe(true)
  })

  it('classifies network errors as expected', () => {
    expect(classifyError('fetch failed').category).toBe('network')
    expect(classifyError('NetworkError when attempting to fetch resource').expected).toBe(true)
    expect(classifyError('The request timed out').expected).toBe(true)
  })

  it('classifies validation and user-input errors', () => {
    expect(classifyError('Validation failed: amount required').category).toBe('validation')
    expect(classifyError('Field name is required').category).toBe('user')
    expect(classifyError('Please provide a valid email').expected).toBe(true)
  })

  it('treats known benign app states as expected', () => {
    expect(classifyError('User already belongs to a business').category).toBe('auth')
    expect(classifyError('No data yet').expected).toBe(true)
  })

  it('flags unknown errors as unexpected engineering-attention errors', () => {
    const cls = classifyError('ReferenceError: boom is not defined')
    expect(cls.category).toBe('unexpected')
    expect(cls.expected).toBe(false)
    expect(cls.reason).toMatch(/no matching/)
  })

  it('handles arbitrary non-Error input without throwing', () => {
    expect(classifyError(null).expected).toBe(false)
    expect(() => classifyError(undefined)).not.toThrow()
    expect(classifyError({ code: 500, custom: true }).category).toBe('unexpected')
  })
})