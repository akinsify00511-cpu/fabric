import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKeyboardShortcuts, formatShortcut, type KeyboardShortcut } from '../hooks/useKeyboardShortcuts'
import { useAuth } from '../lib/AuthContext'
import { businessSearch, type BusinessSearchHit, type SearchEntityType } from '../lib/businessOS'

// GOOGLE STANDARD BRAND COLORS
const BRAND = {
  primary: 'var(--av-primary)',
  primaryHover: 'var(--av-primary-hover)',
  primarySoft: 'rgba(66, 133, 244, 0.08)',
  surface: '#F8F9FA',
  surfaceElevated: '#FFFFFF',
  text: '#202124',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
}

export interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  shortcut?: Partial<KeyboardShortcut>
  category?: string
  action: () => void
  disabled?: boolean
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  items: CommandItem[]
}

// Map a search entity type to a short glyph used as the result icon.
const TYPE_ICON: Record<SearchEntityType, string> = {
  staff: '👤', contact: '👥', lead: '✨', meeting: '📹', objective: '🎯',
  quote: '💬', order: '📦', task: '✅', activity: '⚡',
}
const TYPE_CATEGORY: Record<SearchEntityType, string> = {
  staff: 'People', contact: 'Contacts', lead: 'Leads', meeting: 'Meetings',
  objective: 'Objectives', quote: 'Quotes', order: 'Orders', task: 'Tasks',
  activity: 'Activity',
}

export default function CommandPalette({ isOpen, onClose, items }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchHits, setSearchHits] = useState<BusinessSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const searchSeq = useRef(0)

  // Debounced unified business search (best-effort; navigation search still works
  // when the RPC is not deployed). Results are dropped if a newer query started.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setSearchHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    const seq = ++searchSeq.current
    const t = setTimeout(async () => {
      const res = await businessSearch(q)
      if (seq !== searchSeq.current) return // a newer query superseded this one
      setSearching(false)
      setSearchHits(res && res.authorized ? res.results : [])
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  const searchItems = useMemo<CommandItem[]>(
    () =>
      searchHits.map((hit) => ({
        id: `search-${hit.type}-${hit.id}`,
        label: hit.title,
        description: [hit.subtitle, hit.detail].filter(Boolean).join(' · ') || undefined,
        category: TYPE_CATEGORY[hit.type] ?? 'Results',
        icon: <span aria-hidden>{TYPE_ICON[hit.type] ?? '🔎'}</span>,
        action: () => navigate(hit.route),
      })),
    [searchHits, navigate]
  )

  const filteredItems = useMemo(() => {
    const lowerQuery = query.toLowerCase()
    const navMatches = !query
      ? items
      : items.filter(
          (item) =>
            item.label.toLowerCase().includes(lowerQuery) ||
            item.description?.toLowerCase().includes(lowerQuery) ||
            item.category?.toLowerCase().includes(lowerQuery)
        )
    // Business records first (the actual search), then matching navigation/actions.
    return [...searchItems, ...navMatches]
  }, [items, query, searchItems])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  const executeCommand = useCallback(
    (item: CommandItem) => {
      if (item.disabled) return
      item.action()
      onClose()
    },
    [onClose]
  )

  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'ArrowDown',
      action: () => setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1)),
    },
    {
      key: 'ArrowUp',
      action: () => setSelectedIndex((i) => Math.max(i - 1, 0)),
    },
    {
      key: 'Enter',
      action: () => {
        if (filteredItems[selectedIndex]) {
          executeCommand(filteredItems[selectedIndex])
        }
      },
    },
    {
      key: 'Escape',
      action: onClose,
    },
  ]

  useKeyboardShortcuts(shortcuts, { enabled: isOpen })

  if (!isOpen) return null

  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = item.category || 'Actions'
    if (!acc[category]) acc[category] = []
    acc[category].push(item)
    return acc
  }, {} as Record<string, CommandItem[]>)

  let globalIndex = -1

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        style={{ animationDuration: '150ms' }}
      />
      <div
        className="relative w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
        style={{
          backgroundColor: BRAND.surfaceElevated,
          animationDuration: '150ms',
          animationTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 border-b" style={{ borderColor: BRAND.border }}>
          <svg
            className="w-5 h-5 mr-3"
            style={{ color: BRAND.textMuted }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 py-4 text-base bg-transparent outline-none"
            style={{ color: BRAND.text }}
          />
          <kbd
            className="hidden sm:inline-flex items-center px-2 py-1 text-xs rounded"
            style={{ backgroundColor: BRAND.surface, color: BRAND.textMuted }}
          >
            ESC
          </kbd>
        </div>

        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto py-2"
        >
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center" style={{ color: BRAND.textMuted }}>
              {searching
                ? `Searching your business for "${query}"…`
                : `No results found for "${query}"`}
            </div>
          ) : (
            Object.entries(groupedItems).map(([category, categoryItems]) => (
              <div key={category}>
                <div
                  className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: BRAND.textMuted }}
                >
                  {category}
                </div>
                {categoryItems.map((item) => {
                  globalIndex++
                  const index = globalIndex
                  return (
                    <button
                      key={item.id}
                      className="w-full flex items-center px-4 py-2.5 text-left transition-colors"
                      style={{
                        backgroundColor: index === selectedIndex ? BRAND.primarySoft : 'transparent',
                      }}
                      onClick={() => executeCommand(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      {item.icon && (
                        <span className="mr-3" style={{ color: BRAND.textMuted }}>
                          {item.icon}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-medium truncate"
                          style={{
                            color: item.disabled ? BRAND.textMuted : BRAND.text,
                          }}
                        >
                          {item.label}
                        </div>
                        {item.description && (
                          <div
                            className="text-sm truncate"
                            style={{ color: BRAND.textMuted }}
                          >
                            {item.description}
                          </div>
                        )}
                      </div>
                      {item.shortcut && (
                        <kbd
                          className="ml-2 px-2 py-1 text-xs rounded"
                          style={{
                            backgroundColor: BRAND.surface,
                            color: BRAND.textMuted,
                          }}
                        >
                          {formatShortcut(item.shortcut)}
                        </kbd>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div
          className="flex items-center justify-between px-4 py-2 text-xs border-t"
          style={{
            borderColor: BRAND.border,
            color: BRAND.textMuted,
          }}
        >
          <div className="flex items-center gap-4">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <div>
            Avenize Command Palette
          </div>
        </div>
      </div>
    </div>
  )
}

export function useCommandPalette(items: CommandItem[]) {
  const [isOpen, setIsOpen] = useState(false)

  const openPalette = useCallback(() => setIsOpen(true), [])
  const closePalette = useCallback(() => setIsOpen(false), [])

  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'k',
      mod: true,
      description: 'Open command palette',
      action: () => setIsOpen((prev) => !prev),
    },
    {
      key: '/',
      description: 'Open command palette',
      action: () => setIsOpen((prev) => !prev),
      preventDefault: false,
    },
  ]

  useKeyboardShortcuts(shortcuts)

  return {
    isOpen,
    openPalette,
    closePalette,
    CommandPaletteComponent: () => (
      <CommandPalette isOpen={isOpen} onClose={closePalette} items={items} />
    ),
  }
}

export function useGlobalCommands(): CommandItem[] {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  return useMemo(
    () => [
      {
        id: 'nav-dashboard',
        label: 'Go to Dashboard',
        category: 'Navigation',
        shortcut: { key: 'd', meta: true },
        action: () => navigate('/app/dashboard'),
      },
      {
        id: 'nav-crm',
        label: 'Go to CRM',
        category: 'Navigation',
        action: () => navigate('/app/crm'),
      },
      {
        id: 'nav-hr',
        label: 'Go to Human Resources',
        category: 'Navigation',
        action: () => navigate('/app/hr'),
      },
      {
        id: 'nav-finance',
        label: 'Go to Finance',
        category: 'Navigation',
        action: () => navigate('/app/finance'),
      },
      {
        id: 'nav-projects',
        label: 'Go to Projects',
        category: 'Navigation',
        action: () => navigate('/app/projects'),
      },
      {
        id: 'nav-chat',
        label: 'Open Chat',
        category: 'Navigation',
        shortcut: { key: 'j', meta: true },
        action: () => navigate('/app/chat'),
      },
      {
        id: 'nav-calendar',
        label: 'Open Calendar',
        category: 'Navigation',
        action: () => navigate('/app/calendar'),
      },
      {
        id: 'nav-profile',
        label: 'View Profile',
        category: 'Account',
        action: () => navigate('/app/profile'),
      },
      {
        id: 'nav-settings',
        label: 'Open Settings',
        category: 'Account',
        shortcut: { key: ',', meta: true },
        action: () => navigate('/app/settings'),
      },
      {
        id: 'action-signout',
        label: 'Sign Out',
        category: 'Account',
        action: () => signOut(),
      },
    ],
    [navigate, signOut]
  )
}
