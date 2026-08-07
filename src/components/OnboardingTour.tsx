import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, X, Check, Users2 } from 'lucide-react'

export type OnboardingStep = {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  action?: () => void
  actionLabel?: string
}

const DEFAULT_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Avenize! 👋',
    description: "You're all set up! Let's take a quick tour to help you get the most out of your business OS.",
    icon: <span className="text-4xl">🚀</span>,
  },
  {
    id: 'crm',
    title: 'Track Your Deals',
    description: 'Add contacts and deals to keep track of your sales pipeline. Watch opportunities move from lead to closed!',
    icon: <Users2 className="w-8 h-8 text-purple-500" />,
  },
  {
    id: 'tasks',
    title: 'Stay Organized',
    description: 'Create tasks to track what needs to get done. Assign them to yourself or your team.',
    icon: <Check className="w-8 h-8 text-cyan-500" />,
  },
  {
    id: 'chat',
    title: 'Team Chat',
    description: 'Message your team in real-time. Create channels for different topics and projects.',
    icon: <span className="text-4xl">💬</span>,
  },
  {
    id: 'finance',
    title: 'Manage Money',
    description: 'Create invoices, track payments, and monitor your cash flow all in one place.',
    icon: <span className="text-4xl">💰</span>,
  },
  {
    id: 'invite',
    title: 'Bring Your Team',
    description: 'Invite your team members to collaborate. Everyone can contribute and stay aligned.',
    icon: <Users2 className="w-8 h-8 text-green-500" />,
    actionLabel: 'Invite Team',
  },
  {
    id: 'complete',
    title: "You're All Set! 🎉",
    description: "That's the quick tour! Remember, you can access anything from the sidebar or the More menu. Let's get started!",
    icon: <span className="text-4xl">✨</span>,
  },
]

interface OnboardingTourProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  steps?: OnboardingStep[]
  initialStep?: number
}

export default function OnboardingTour({
  isOpen,
  onClose,
  onComplete,
  steps = DEFAULT_STEPS,
  initialStep = 0,
}: OnboardingTourProps) {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [isAnimating, setIsAnimating] = useState(false)

  const step = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1
  const isFirstStep = currentStep === 0

  const goNext = () => {
    if (isLastStep) {
      onComplete()
      return
    }
    setIsAnimating(true)
    setTimeout(() => {
      setCurrentStep((prev) => prev + 1)
      setIsAnimating(false)
    }, 150)
  }

  const goPrev = () => {
    if (isFirstStep) return
    setIsAnimating(true)
    setTimeout(() => {
      setCurrentStep((prev) => prev - 1)
      setIsAnimating(false)
    }, 150)
  }

  const handleAction = () => {
    if (step.action) {
      step.action()
    } else if (step.id === 'invite') {
      navigate('/people')
      onClose()
    }
  }

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Tour Card */}
      <div
        className={`
          relative bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4
          transition-all duration-300
          ${isAnimating ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}
        `}
      >
        {/* Header Pattern */}
        <div className="h-24 rounded-t-3xl avenize-gradient relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-white rounded-full animate-pulse"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                }}
              />
            ))}
          </div>
          <div className="absolute top-4 right-4">
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-colors"
            >
              <X size={20} className="text-white" />
            </button>
          </div>
          {/* Step indicator */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 -mt-8">
          {/* Icon */}
          <div className="w-20 h-20 rounded-2xl bg-white shadow-lg flex items-center justify-center mx-auto mb-4">
            {step.icon}
          </div>

          {/* Title & Description */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h2>
            <p className="text-sm text-black/60 leading-relaxed">{step.description}</p>
          </div>

          {/* Progress Dots */}
          <div className="flex justify-center gap-1.5 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all duration-200 ${
                  i === currentStep
                    ? 'w-6 bg-[var(--avenize-accent-end)]'
                    : i < currentStep
                    ? 'bg-[var(--avenize-accent-end)]/50'
                    : 'bg-black/10'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {!isFirstStep && (
              <button
                onClick={goPrev}
                className="flex-1 flex items-center justify-center gap-1 py-3 rounded-xl border border-black/10 text-sm font-medium hover:bg-black/[0.02] transition-colors"
              >
                <ChevronLeft size={16} />
                Back
              </button>
            )}
            <button
              onClick={step.actionLabel ? handleAction : goNext}
              className={`${isFirstStep ? 'flex-1' : 'flex-[2]'} flex items-center justify-center gap-1 py-3 rounded-xl avenize-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity`}
            >
              {step.actionLabel || (isLastStep ? 'Get Started!' : 'Next')}
              {!step.actionLabel && <ChevronRight size={16} />}
            </button>
          </div>

          {/* Skip */}
          <button
            onClick={onClose}
            className="w-full mt-3 text-xs text-black/40 hover:text-black/60 transition-colors"
          >
            Skip tour
          </button>
        </div>
      </div>
    </div>
  )
}

// Quick tip tooltip for features
interface FeatureTipProps {
  children: React.ReactNode
  tip: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export function FeatureTip({ children, tip, position = 'top' }: FeatureTipProps) {
  const [showTip, setShowTip] = useState(false)

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  return (
    <div className="relative inline-block" onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
      {children}
      {showTip && (
        <div className={`absolute z-50 ${positionClasses[position]} pointer-events-none`}>
          <div className="bg-[var(--avenize-black)] text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap max-w-[200px]">
            {tip}
            <div className={`absolute w-2 h-2 bg-[var(--avenize-black)] rotate-45 ${
              position === 'top' ? '-bottom-1 left-1/2 -translate-x-1/2' :
              position === 'bottom' ? '-top-1 left-1/2 -translate-x-1/2' :
              position === 'left' ? '-right-1 top-1/2 -translate-y-1/2' :
              '-left-1 top-1/2 -translate-y-1/2'
            }`} />
          </div>
        </div>
      )}
    </div>
  )
}
