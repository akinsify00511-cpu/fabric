/**
 * AVENIZE MOTION UTILITIES
 * 
 * Animation patterns built on the brand guide's physics:
 * - cubic-bezier(0.2, 0, 0, 1) for all easing
 * - 100/200/300ms durations
 * - No bounce, no spring physics
 * 
 * Reference: Avenize-Motion-Interaction-Design-Direction.md
 * 
 * Note: Uses native Web Animations API for broad compatibility.
 * For React component animations, import from 'motion/react' directly.
 */

// Duration tokens from brand guide (in ms)
export const DURATION = {
  fast: 100,
  normal: 200,
  slow: 300,
  enter: 250,
  exit: 200,
} as const

// Easing from brand guide
export const EASING = 'cubic-bezier(0.2, 0, 0, 1)'

// Reduced motion check
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Fade in animation
export function fadeIn(element: Element): Animation {
  return element.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    { duration: DURATION.normal, easing: EASING, fill: 'forwards' }
  )
}

// Fade out animation
export function fadeOut(element: Element): Animation {
  return element.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: DURATION.exit, easing: EASING, fill: 'forwards' }
  )
}

// Slide in from bottom
export function slideInFromBottom(element: Element): Animation {
  return element.animate(
    [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ],
    { duration: DURATION.enter, easing: EASING, fill: 'forwards' }
  )
}

// Scale in (modal/dialog style)
export function scaleIn(element: Element): Animation {
  return element.animate(
    [
      { opacity: 0, transform: 'scale(0.96)' },
      { opacity: 1, transform: 'scale(1)' }
    ],
    { duration: DURATION.normal, easing: EASING, fill: 'forwards' }
  )
}

// Staggered list animation
export function staggerFadeIn(
  elements: Element[],
  options: { staggerDelay?: number; maxItems?: number } = {}
): void {
  const { staggerDelay = 40, maxItems = 8 } = options
  
  if (prefersReducedMotion()) {
    elements.forEach(el => el.animate([{ opacity: 1 }], { duration: 0 }))
    return
  }
  
  elements.forEach((el, i) => {
    if (i < maxItems) {
      el.animate(
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ],
        { 
          duration: DURATION.enter, 
          easing: EASING, 
          fill: 'forwards',
          delay: i * (staggerDelay / 1000) 
        }
      )
    } else {
      el.animate([{ opacity: 1 }], { duration: 0 })
    }
  })
}

// Toast slide in from top-right
export function toastSlideIn(element: Element): Animation {
  return element.animate(
    [
      { opacity: 0, transform: 'translateX(16px)' },
      { opacity: 1, transform: 'translateX(0)' }
    ],
    { duration: DURATION.enter, easing: EASING, fill: 'forwards' }
  )
}

// Toast slide out
export function toastSlideOut(element: Element): Animation {
  return element.animate(
    [
      { opacity: 1, transform: 'translateX(0)' },
      { opacity: 0, transform: 'translateX(16px)' }
    ],
    { duration: DURATION.exit, easing: EASING, fill: 'forwards' }
  )
}

// Press effect helper (for button active state)
export function pressEffect(element: Element): Animation {
  return element.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(0.98)' },
      { transform: 'scale(1)' }
    ],
    { duration: DURATION.fast, easing: EASING }
  )
}

// Number tick animation (count up)
export function numberTick(
  element: HTMLElement,
  from: number,
  to: number,
  options: { duration?: number } = {}
): void {
  const { duration = 500 } = options
  
  if (prefersReducedMotion()) {
    element.textContent = to.toLocaleString()
    return
  }
  
  let startTime: number | null = null
  
  const animate = (time: number) => {
    if (!startTime) startTime = time
    const progress = Math.min((time - startTime) / duration, 1)
    const current = Math.round(from + (to - from) * progress)
    element.textContent = current.toLocaleString()
    if (progress < 1) requestAnimationFrame(animate)
  }
  
  requestAnimationFrame(animate)
}

// Skeleton pulse animation
export function skeletonPulse(element: Element): Animation {
  return element.animate(
    [
      { opacity: 0.7 },
      { opacity: 0.4 },
      { opacity: 0.7 }
    ],
    { duration: 1200, iterations: Infinity, easing: 'ease-in-out' }
  )
}

// Route cross-fade (for SPA navigation)
export function routeCrossFade(container: Element): Animation {
  return container.animate(
    [
      { opacity: 1 },
      { opacity: 0 },
      { opacity: 1 }
    ],
    { duration: DURATION.normal, easing: EASING }
  )
}

// Utility: animate children with stagger
export function animateChildren(
  parent: Element,
  options: {
    selector?: string
    staggerDelay?: number
    maxItems?: number
    animation?: 'fade' | 'slide-up' | 'scale'
  } = {}
): void {
  const { 
    selector = ':scope > *', 
    staggerDelay = 40, 
    maxItems = 8,
    animation = 'slide-up'
  } = options
  
  const children = Array.from(parent.querySelectorAll<Element>(selector))
  
  if (prefersReducedMotion()) {
    children.forEach(child => child.animate([{ opacity: 1 }], { duration: 0 }))
    return
  }
  
  children.forEach((child, i) => {
    if (i < maxItems) {
      let keyframes: Keyframe[]
      switch (animation) {
        case 'fade':
          keyframes = [{ opacity: 0 }, { opacity: 1 }]
          break
        case 'scale':
          keyframes = [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'scale(1)' }]
          break
        case 'slide-up':
        default:
          keyframes = [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }]
      }
      
      child.animate(keyframes, {
        duration: DURATION.enter,
        easing: EASING,
        fill: 'forwards',
        delay: i * (staggerDelay / 1000)
      })
    } else {
      child.animate([{ opacity: 1 }], { duration: 0 })
    }
  })
}
