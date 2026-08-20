import { describe, expect, it } from 'vitest'
import { matchesShortcut } from '../../../src/hooks/useKeyboardShortcuts'

// Lock the cross-platform "mod" binding: Cmd/Ctrl+K (and Cmd/Ctrl+/).
describe('matchesShortcut', () => {
  it('matches Ctrl+K on Windows/Linux using the mod modifier', () => {
    expect(matchesShortcut({ key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }, { key: 'k', mod: true, action: () => {} })).toBe(true)
  })
  it('matches Cmd+K on macOS using the mod modifier', () => {
    expect(matchesShortcut({ key: 'k', ctrlKey: false, metaKey: true, shiftKey: false, altKey: false }, { key: 'k', mod: true, action: () => {} })).toBe(true)
  })
  it('does not match a bare K press when a mod modifier is required', () => {
    expect(matchesShortcut({ key: 'k', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, { key: 'k', mod: true, action: () => {} })).toBe(false)
  })
  it('falls back to the strict meta/ctrl form when mod is not set', () => {
    const metaOnly = { key: 'k', meta: true, action: () => {} }
    expect(matchesShortcut({ key: 'k', ctrlKey: false, metaKey: true, shiftKey: false, altKey: false }, metaOnly)).toBe(true)
    expect(matchesShortcut({ key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }, metaOnly)).toBe(false)
  })
  it('respects strict shift/alt flags requested on the shortcut', () => {
    expect(matchesShortcut({ key: 'k', ctrlKey: false, metaKey: false, shiftKey: true, altKey: false }, { key: 'k', shift: true, action: () => {} })).toBe(true)
    expect(matchesShortcut({ key: 'k', ctrlKey: false, metaKey: false, shiftKey: true, altKey: true }, { key: 'k', shift: true, action: () => {} })).toBe(false)
  })
})


