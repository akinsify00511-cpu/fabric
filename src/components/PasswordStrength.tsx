import { useMemo } from 'react'
import { Check, X } from 'lucide-react'

type PasswordStrengthProps = {
  password: string
  showDetails?: boolean
}

export default function PasswordStrength({ password, showDetails = true }: PasswordStrengthProps) {
  const { score, label, color, requirements } = useMemo(() => {
    const reqs = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    }
    
    const passedCount = Object.values(reqs).filter(Boolean).length
    
    let score: number
    let label: string
    let color: string
    
    if (password.length === 0) {
      score = 0
      label = ''
      color = 'slate'
    } else if (passedCount <= 2) {
      score = 1
      label = 'Weak'
      color = 'red'
    } else if (passedCount === 3) {
      score = 2
      label = 'Fair'
      color = 'yellow'
    } else if (passedCount === 4) {
      score = 3
      label = 'Good'
      color = 'blue'
    } else {
      score = 4
      label = 'Strong'
      color = 'green'
    }
    
    return { score, label, color, requirements: reqs }
  }, [password])

  if (!showDetails || password.length === 0) {
    return null
  }

  const colorClasses: Record<string, string> = {
    gray: 'bg-white',
    red: 'bg-[var(--av-danger-soft)]0',
    yellow: 'bg-[var(--av-warning-soft)]0',
    blue: 'bg-[var(--av-primary-soft)]0',
    green: 'bg-[var(--av-success-soft)]0',
  }

  const textClasses: Record<string, string> = {
    gray: 'text-black',
    red: 'text-[var(--av-danger)]',
    yellow: 'text-[var(--av-warning)]',
    blue: 'text-[var(--av-primary)]',
    green: 'text-[var(--av-success)]',
  }

  const requirementItems = [
    { key: 'length', label: 'At least 8 characters' },
    { key: 'uppercase', label: 'One uppercase letter' },
    { key: 'lowercase', label: 'One lowercase letter' },
    { key: 'number', label: 'One number' },
    { key: 'special', label: 'One special character' },
  ]

  return (
    <div className="space-y-2">
      {/* Strength Bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${colorClasses[color]}`}
            style={{ width: `${(score / 4) * 100}%` }}
          />
        </div>
        {label && (
          <span className={`text-xs font-medium ${textClasses[color]}`}>
            {label}
          </span>
        )}
      </div>

      {/* Requirements Checklist */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {requirementItems.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-1.5 text-xs">
            {requirements[key as keyof typeof requirements] ? (
              <Check className="w-3.5 h-3.5 text-[var(--av-success)] shrink-0" />
            ) : (
              <X className="w-3.5 h-3.5 text-black shrink-0" />
            )}
            <span className={requirements[key as keyof typeof requirements] ? 'text-black' : 'text-black'}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
