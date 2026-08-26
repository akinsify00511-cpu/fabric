import { describe, it, expect, vi } from 'vitest'
import {
  isStorageCorruptionMessage,
  clearSupabaseLocalStorage,
  installStorageSelfHeal,
  deleteIndexedDatabase,
} from '../../../src/lib/sbStorageSelfHeal'

describe('sbStorageSelfHeal', () => {
  it('detects the production IndexedDB corruption signature', () => {
    expect(isStorageCorruptionMessage('Corruption: block checksum mismatch')).toBe(true)
    expect(isStorageCorruptionMessage('checksum mismatch')).toBe(true)
    expect(isStorageCorruptionMessage('some random error')).toBe(false)
    expect(isStorageCorruptionMessage('')).toBe(false)
  })

  it('clears only the supabase prefix from localStorage', () => {
    localStorage.setItem('sb-abc', '1')
    localStorage.setItem('sb-def', '2')
    localStorage.setItem('other-app', 'x')
    clearSupabaseLocalStorage('sb-')
    expect(localStorage.getItem('sb-abc')).toBeNull()
    expect(localStorage.getItem('sb-def')).toBeNull()
    expect(localStorage.getItem('other-app')).toBe('x')
    localStorage.clear()
  })

  it('triggers the heal sequence once on a matching error', () => {
    const fires = { cleared: 0, deleted: 0, healed: 0 }
    const detach = installStorageSelfHeal('sb', {
      clearFallback: () => { fires.cleared++ },
      deleteDatabases: () => { fires.deleted++ },
      onHealed: () => { fires.healed++ },
    })
    window.dispatchEvent(new ErrorEvent('error', { message: 'Corruption: block checksum mismatch' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'Corruption: block checksum mismatch' }))
    expect(fires.cleared).toBe(1)
    expect(fires.healed).toBe(1)
    detach()
  })

  it('ignores unrelated error events (extension noise)', () => {
    const healed = vi.fn()
    const detach = installStorageSelfHeal('sb', { onHealed: healed })
    window.dispatchEvent(new ErrorEvent('error', { message: 'Unchecked runtime.lastError' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'random inject.bundle.js error' }))
    expect(healed).not.toHaveBeenCalled()
    detach()
  })

  it('deleteIndexedDatabase never throws even when the API is unavailable', () => {
    expect(() => deleteIndexedDatabase('sb-test')).not.toThrow()
  })
})
