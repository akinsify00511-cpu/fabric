import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Search, Bell, Settings, HelpCircle } from 'lucide-react'

interface QuickActionButtonProps {
  actions: Array<{
    id: string
    label: string
    icon: React.ReactNode
    onClick: () => void
    shortcut?: string
  }>
  onQuickCreate?: () => void
}

export function QuickActionButton({ actions, onQuickCreate }: QuickActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true)
    } else {
      const timer = setTimeout(() => setIsAnimating(false), 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleAction = useCallback((action: () => void) => {
    action()
    setIsOpen(false)
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  if (!isAnimating && !isOpen) return null

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-fade-in"
          style={{ animationDuration: '150ms' }}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Menu */}
      <div className="fixed right-4 bottom-20 z-50">
        <div
          className={`flex flex-col gap-2 mb-3 ${
            isOpen ? 'animate-scale-in' : 'scale-0'
          }`}
          style={{
            transformOrigin: 'bottom right',
            animation: isOpen
              ? 'scale-in 0.2s cubic-bezier(0.2, 0, 0, 1)'
              : 'scale-out 0.15s ease-in forwards',
          }}
        >
          {actions.map((action, index) => (
            <button
              key={action.id}
              onClick={() => handleAction(action.onClick)}
              className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all"
              style={{
                animationDelay: `${index * 30}ms`,
              }}
            >
              <span className="p-1.5 rounded-lg bg-[#4285F4]/10 text-[#4285F4]">
                {action.icon}
              </span>
              <span className="text-sm font-medium text-gray-900">{action.label}</span>
              {action.shortcut && (
                <kbd className="ml-2 px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-500">
                  {action.shortcut}
                </kbd>
              )}
            </button>
          ))}
        </div>

        {/* Main button */}
        <button
          onClick={handleToggle}
          className="w-14 h-14 rounded-full bg-[#4285F4] text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center"
          style={{
            transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
          }}
          aria-label="Quick actions"
        >
          <Plus size={28} />
        </button>
      </div>

      <style>{`
        @keyframes scale-in {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes scale-out {
          from { transform: scale(1); opacity: 1; }
          to { transform: scale(0); opacity: 0; }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-scale-in { animation: scale-in 0.2s cubic-bezier(0.2, 0, 0, 1); }
        .animate-fade-in { animation: fade-in 0.15s ease-out; }
      `}</style>
    </>
  )
}

export function GlobalQuickActions() {
  const actions = [
    {
      id: 'search',
      label: 'Search',
      icon: <Search size={18} />,
      onClick: () => console.log('Open search'),
      shortcut: '⌘K',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell size={18} />,
      onClick: () => console.log('Open notifications'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings size={18} />,
      onClick: () => console.log('Open settings'),
    },
    {
      id: 'help',
      label: 'Help & Support',
      icon: <HelpCircle size={18} />,
      onClick: () => console.log('Open help'),
    },
  ]

  return (
    <QuickActionButton
      actions={actions}
      onQuickCreate={() => console.log('Quick create')}
    />
  )
}
