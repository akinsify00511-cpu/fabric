import { useEffect, useCallback, useRef, type RefObject } from 'react'

const FOCUSABLE_ELEMENTS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ')

export function useFocusManagement() {
  const previousActiveElement = useRef<HTMLElement | null>(null)
  const focusTrapRef = useRef<HTMLElement | null>(null)

  const saveFocus = useCallback(() => {
    previousActiveElement.current = document.activeElement as HTMLElement
  }, [])

  const restoreFocus = useCallback(() => {
    if (previousActiveElement.current && previousActiveElement.current.focus) {
      previousActiveElement.current.focus()
    }
  }, [])

  const focusFirst = useCallback((container?: HTMLElement) => {
    const root = container || document
    const firstElement = root.querySelector(FOCUSABLE_ELEMENTS) as HTMLElement
    if (firstElement) {
      firstElement.focus()
      return true
    }
    return false
  }, [])

  const focusLast = useCallback((container?: HTMLElement) => {
    const root = container || document
    const focusable = Array.from(root.querySelectorAll(FOCUSABLE_ELEMENTS)) as HTMLElement[]
    if (focusable.length > 0) {
      focusable[focusable.length - 1].focus()
      return true
    }
    return false
  }, [])

  const trapFocus = useCallback((container: HTMLElement) => {
    focusTrapRef.current = container
    saveFocus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusable = Array.from(
        container.querySelectorAll(FOCUSABLE_ELEMENTS)
      ) as HTMLElement[]
      
      if (focusable.length === 0) return

      const firstElement = focusable[0]
      const lastElement = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault()
        lastElement.focus()
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault()
        firstElement.focus()
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [saveFocus])

  const releaseFocusTrap = useCallback(() => {
    focusTrapRef.current = null
    restoreFocus()
  }, [restoreFocus])

  return {
    saveFocus,
    restoreFocus,
    focusFirst,
    focusLast,
    trapFocus,
    releaseFocusTrap,
  }
}

export function useFocusOnMount<T extends HTMLElement = HTMLDivElement>(
  deps: any[] = []
): RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.focus()
    }
  }, deps)

  return ref
}

export function useAnnounceOnMount() {
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const announcement = document.createElement('div')
    announcement.setAttribute('role', 'status')
    announcement.setAttribute('aria-live', priority)
    announcement.setAttribute('aria-atomic', 'true')
    announcement.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `
    document.body.appendChild(announcement)
    
    setTimeout(() => {
      announcement.textContent = message
    }, 50)
    
    setTimeout(() => {
      document.body.removeChild(announcement)
    }, 1000)
  }, [])

  return announce
}

export function useKeyboardNavigation(
  options: {
    onEscape?: () => void
    onEnter?: () => void
    onArrowUp?: () => void
    onArrowDown?: () => void
    onArrowLeft?: () => void
    onArrowRight?: () => void
    onHome?: () => void
    onEnd?: () => void
  },
  deps: any[] = []
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          options.onEscape?.()
          break
        case 'Enter':
          if (!isInputFocused()) {
            e.preventDefault()
            options.onEnter?.()
          }
          break
        case 'ArrowUp':
          if (!isInputFocused() || e.altKey) {
            e.preventDefault()
            options.onArrowUp?.()
          }
          break
        case 'ArrowDown':
          if (!isInputFocused() || e.altKey) {
            e.preventDefault()
            options.onArrowDown?.()
          }
          break
        case 'ArrowLeft':
          if (!isInputFocused() || e.altKey) {
            options.onArrowLeft?.()
          }
          break
        case 'ArrowRight':
          if (!isInputFocused() || e.altKey) {
            options.onArrowRight?.()
          }
          break
        case 'Home':
          if (!isInputFocused() || e.ctrlKey) {
            e.preventDefault()
            options.onHome?.()
          }
          break
        case 'End':
          if (!isInputFocused() || e.ctrlKey) {
            e.preventDefault()
            options.onEnd?.()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, deps)
}

function isInputFocused(): boolean {
  const active = document.activeElement
  if (!active) return false
  const tagName = active.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || active.getAttribute('contenteditable') === 'true'
}

export function useRovingTabIndex(
  containerRef: React.RefObject<HTMLElement>,
  options: {
    selector?: string
    loop?: boolean
  } = {}
) {
  const { selector = '*', loop = false } = options
  const currentIndexRef = useRef(-1)

  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return []
    return Array.from(
      containerRef.current.querySelectorAll(selector)
    ).filter((el) => {
      const tabIndex = (el as HTMLElement).tabIndex
      return tabIndex >= 0 && !(el as HTMLElement).hasAttribute('disabled')
    }) as HTMLElement[]
  }, [containerRef, selector])

  const setFocus = useCallback(
    (index: number) => {
      const elements = getFocusableElements()
      if (elements.length === 0) return

      let targetIndex = index
      if (loop) {
        targetIndex = ((index % elements.length) + elements.length) % elements.length
      } else {
        targetIndex = Math.max(0, Math.min(index, elements.length - 1))
      }

      currentIndexRef.current = targetIndex
      elements[targetIndex]?.focus()
    },
    [getFocusableElements, loop]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const elements = getFocusableElements()
      if (elements.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault()
          setFocus(currentIndexRef.current + 1)
          break
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault()
          setFocus(currentIndexRef.current - 1)
          break
        case 'Home':
          e.preventDefault()
          setFocus(0)
          break
        case 'End':
          e.preventDefault()
          setFocus(elements.length - 1)
          break
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [containerRef, getFocusableElements, setFocus])

  return { setFocus }
}
