import { type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <div key={location.pathname} className="av-page-transition" data-page={location.pathname}>
      {children}
    </div>
  )
}

export function MotionButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`av-motion-button ${className}`}
    >
      {children}
    </button>
  )
}

export function MotionCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`av-motion-card ${className}`}>{children}</div>
}

export function StatePulse({ active = true }: { active?: boolean }) {
  return <span className={`av-state-pulse ${active ? 'av-state-pulse-active' : ''}`} aria-hidden="true" />
}
