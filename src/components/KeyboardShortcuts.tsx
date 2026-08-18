import { useEffect, useRef } from 'react'
import { X, Search, Home, MessageSquare, Bell, Settings, Keyboard } from 'lucide-react'

interface Shortcut {
  keys: string[]
  label: string
  description?: string
  category: string
}

const SHORTCUTS: Shortcut[] = [
  // Global
  { keys: ['⌘', 'K'], label: 'Command Palette', description: 'Quickly search and navigate', category: 'Global' },
  { keys: ['⌘', '/'], label: 'Show Shortcuts', description: 'View all keyboard shortcuts', category: 'Global' },
  { keys: ['⌘', 'N'], label: 'New Item', description: 'Create a new item', category: 'Global' },
  { keys: ['⌘', 'S'], label: 'Save', description: 'Save current changes', category: 'Global' },
  { keys: ['⌘', 'Shift', 'S'], label: 'Save As', description: 'Save with new name', category: 'Global' },
  { keys: ['Esc'], label: 'Close Dialog', description: 'Close any open dialog or panel', category: 'Global' },
  
  // Navigation
  { keys: ['G', 'D'], label: 'Go to Dashboard', description: 'Navigate to dashboard', category: 'Navigation' },
  { keys: ['G', 'C'], label: 'Go to Chat', description: 'Navigate to chat', category: 'Navigation' },
  { keys: ['G', 'S'], label: 'Go to Settings', description: 'Navigate to settings', category: 'Navigation' },
  { keys: ['G', 'H'], label: 'Go to Home', description: 'Navigate to home', category: 'Navigation' },
  
  // Editor
  { keys: ['⌘', 'B'], label: 'Bold', description: 'Make text bold', category: 'Editor' },
  { keys: ['⌘', 'I'], label: 'Italic', description: 'Make text italic', category: 'Editor' },
  { keys: ['⌘', 'Z'], label: 'Undo', description: 'Undo last action', category: 'Editor' },
  { keys: ['⌘', 'Shift', 'Z'], label: 'Redo', description: 'Redo last action', category: 'Editor' },
  { keys: ['⌘', 'Enter'], label: 'Submit', description: 'Submit form or message', category: 'Editor' },
]

interface KeyboardShortcutsProps {
  isOpen: boolean
  onClose: () => void
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const categories = [...new Set(SHORTCUTS.map((s) => s.category))]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Keyboard size={20} className="text-[var(--av-primary)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-black">Keyboard Shortcuts</h2>
              <p className="text-sm text-black/50">Press Esc to close</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-black/5 transition-colors"
          >
            <X size={20} className="text-black/50" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-6">
          {categories.map((category) => (
            <div key={category} className="mb-6 last:mb-0">
              <h3 className="text-xs font-semibold text-black/40 uppercase tracking-wider mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {SHORTCUTS.filter((s) => s.category === category).map((shortcut, index) => (
                  <div
                    key={`${shortcut.category}-${index}`}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-black/5"
                  >
                    <div>
                      <p className="text-sm font-medium text-black">{shortcut.label}</p>
                      {shortcut.description && (
                        <p className="text-xs text-black/50">{shortcut.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <kbd
                          key={keyIndex}
                          className="px-2 py-1 text-xs font-medium bg-black/5 rounded text-black/70"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/5 bg-black/2.5">
          <p className="text-xs text-black/50 text-center">
            Pro tip: Press <kbd className="px-1.5 py-0.5 bg-black/5 rounded text-black/70">⌘</kbd> + <kbd className="px-1.5 py-0.5 bg-black/5 rounded text-black/70">K</kbd> anywhere to open the command palette
          </p>
        </div>
      </div>

      <style>{`
        @keyframes scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in { animation: scale-in 0.15s cubic-bezier(0.2, 0, 0, 1); }
      `}</style>
    </div>
  )
}

export function ShortcutHint({ shortcut, label }: { shortcut: string[]; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-black/50">
      <span>{label}</span>
      <div className="flex items-center gap-0.5">
        {shortcut.map((key, index) => (
          <kbd
            key={index}
            className="px-1.5 py-0.5 text-xs font-medium bg-black/5 rounded text-black/60"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  )
}

// Mini shortcut indicator for tooltips
export function ShortcutBadge({ shortcut }: { shortcut: string[] }) {
  if (shortcut.length === 0) return null
  
  return (
    <div className="flex items-center gap-0.5">
      {shortcut.map((key, index) => (
        <kbd
          key={index}
          className="px-1.5 py-0.5 text-[10px] font-medium bg-black/10 rounded text-black/50"
        >
          {key}
        </kbd>
      ))}
    </div>
  )
}
