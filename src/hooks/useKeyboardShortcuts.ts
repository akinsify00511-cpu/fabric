import { useEffect, useCallback, useRef } from 'react'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  description?: string
  action: () => void
  preventDefault?: boolean
}

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean
  ignoreInputs?: boolean
}

const defaultIgnoreTags = ['INPUT', 'TEXTAREA', 'SELECT', 'CONTENTEDITABLE']

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true, ignoreInputs = true } = options
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      const target = event.target as HTMLElement
      if (ignoreInputs && defaultIgnoreTags.includes(target.tagName)) {
        return
      }

      for (const shortcut of shortcutsRef.current) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey
        const metaMatch = shortcut.meta ? event.metaKey : !event.metaKey
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey
        const altMatch = shortcut.alt ? event.altKey : !event.altKey

        if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault()
          }
          shortcut.action()
          return
        }
      }
    },
    [enabled, ignoreInputs]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

export const GLOBAL_SHORTCUTS = {
  SEARCH: { key: 'k', meta: true, description: 'Open search' },
  COMMAND: { key: '/', meta: true, description: 'Open command menu' },
  NOTIFICATIONS: { key: 'n', meta: true, description: 'Open notifications' },
  QUICK_CREATE: { key: 'c', meta: true, description: 'Quick create' },
  SETTINGS: { key: ',', meta: true, description: 'Open settings' },
  HELP: { key: '?', meta: true, description: 'Show help' },
  ESCAPE: { key: 'Escape', description: 'Close modal/dialog' },
  NEXT_TAB: { key: 'Tab', shift: true, description: 'Next tab' },
  PREV_TAB: { key: 'Tab', description: 'Previous tab' },
  REFRESH: { key: 'r', meta: true, description: 'Refresh data' },
} as const

export function formatShortcut(shortcut: Partial<KeyboardShortcut>): string {
  const parts: string[] = []
  if (shortcut.meta) parts.push('⌘')
  if (shortcut.ctrl) parts.push('^')
  if (shortcut.alt) parts.push('⌥')
  if (shortcut.shift) parts.push('⇧')
  parts.push(shortcut.key?.toUpperCase() || '')
  return parts.join('')
}
