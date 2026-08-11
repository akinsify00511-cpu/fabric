import { useState } from 'react'
import { X, Building2, User, Users, FileText, Check, ChevronRight, ChevronLeft } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface OnboardingWizardProps {
  onComplete: () => void
}

const STEPS = [
  {
    id: 'business',
    title: 'Tell us about your business',
    description: 'Set up your company profile',
    icon: Building2,
  },
  {
    id: 'profile',
    title: 'Your profile',
    description: 'Complete your profile',
    icon: User,
  },
  {
    id: 'team',
    title: 'Build your team',
    description: 'Invite team members',
    icon: Users,
  },
  {
    id: 'first',
    title: 'Create your first invoice',
    description: 'Start billing clients',
    icon: FileText,
  },
]

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { staff } = useAuth()
  const [currentStep, setCurrentStep] = useState(0)
  const [businessName, setBusinessName] = useState('')
  const [industry, setIndustry] = useState('')
  const [fullName, setFullName] = useState(staff?.full_name || '')
  const [jobTitle, setJobTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [loading, setLoading] = useState(false)

  const step = STEPS[currentStep]

  const markOnboardingComplete = async () => {
    // Update staff record for persistence - save profile data too
    if (staff?.id) {
      await supabase
        .from('staff')
        .update({ 
          onboarding_completed: true,
          full_name: fullName || staff.full_name,
          job_title: jobTitle || null,
          department: department || null,
        })
        .eq('id', staff.id)
    }
  }

  const handleNext = async () => {
    if (currentStep === STEPS.length - 1) {
      // Complete onboarding
      setLoading(true)
      await markOnboardingComplete()
      setLoading(false)
      onComplete()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const skipOnboarding = async () => {
    await markOnboardingComplete()
    onComplete()
  }

  const industries = [
    'Construction & Real Estate',
    'Technology & Software',
    'Consulting & Professional Services',
    'Retail & E-commerce',
    'Manufacturing',
    'Healthcare',
    'Education',
    'Finance & Banking',
    'Other',
  ]

  return (
    <div className="fixed inset-0 bg-gradient-to-br to-[#4285F4] to-[#8B5CF6] flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r to-[#4285F4] to-[#8B5CF6] p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Welcome to Avenize! 🎉</h1>
              <p className="text-white/80 mt-1">Let's set up your business in a few quick steps</p>
            </div>
            <button
              onClick={skipOnboarding}
              className="text-white/80 hover:text-white p-2"
            >
              <X size={20} />
            </button>
          </div>
          
          {/* Progress */}
          <div className="flex items-center gap-2 mt-6">
            {STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  index <= currentStep ? 'bg-white' : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-8 min-h-[400px]">
          {/* Step indicators */}
          <div className="flex justify-center gap-4 mb-8">
            {STEPS.map((s, index) => (
              <div
                key={s.id}
                className={`flex flex-col items-center ${
                  index === currentStep ? 'opacity-100' : 'opacity-40'
                } transition-opacity`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  index < currentStep ? 'bg-green-500 text-white' :
                  index === currentStep ? 'bg-[#4285F4] text-white' :
                  'bg-white text-black'
                }`}>
                  {index < currentStep ? <Check size={20} /> : <s.icon size={20} />}
                </div>
                <span className="text-xs mt-2 font-medium text-black">{s.title}</span>
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-black mb-2">{step.title}</h2>
            <p className="text-black">{step.description}</p>
          </div>

          {/* Step forms */}
          <div className="space-y-4 max-w-md mx-auto">
            {step.id === 'business' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">Business Name</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g., TechBuild Nigeria Ltd"
                    className="w-full px-4 py-3 rounded-xl border border-black focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">Industry</label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-black focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4]"
                  >
                    <option value="">Select your industry</option>
                    {industries.map(ind => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {step.id === 'profile' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full px-4 py-3 rounded-xl border border-black focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">Job Title</label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g., Managing Director"
                    className="w-full px-4 py-3 rounded-xl border border-black focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4]"
                  />
                </div>
              </>
            )}

            {step.id === 'team' && (
              <>
                <div className="bg-[#4285F4]/5 rounded-xl p-6 text-center">
                  <Users size={48} className="mx-auto text-[#4285F4] mb-4" />
                  <p className="text-black mb-4">
                    You can invite team members from the People page later.
                  </p>
                  <p className="text-sm text-black">
                    For now, let's skip this step and get you started!
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">Team Size (optional)</label>
                  <select
                    value={teamSize}
                    onChange={(e) => setTeamSize(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-black focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4]"
                  >
                    <option value="">Select team size</option>
                    <option value="1">Just me</option>
                    <option value="2-5">2-5 people</option>
                    <option value="6-20">6-20 people</option>
                    <option value="21-50">21-50 people</option>
                    <option value="50+">50+ people</option>
                  </select>
                </div>
              </>
            )}

            {step.id === 'first' && (
              <div className="bg-green-50 rounded-xl p-6 text-center">
                <FileText size={48} className="mx-auto text-green-500 mb-4" />
                <p className="text-black mb-4">
                  You're all set! Go to the Finance page to create your first invoice.
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 rounded-full text-green-700 text-sm">
                  <Check size={16} />
                  Ready to go!
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-white flex items-center justify-between">
          <button
            onClick={skipOnboarding}
            className="text-black hover:text-black text-sm"
          >
            Skip for now
          </button>
          
          <div className="flex items-center gap-3">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1 px-4 py-2 text-black hover:text-black"
              >
                <ChevronLeft size={16} />
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#4285F4] text-white rounded-xl font-medium hover:bg-[#4285F4] transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : currentStep === STEPS.length - 1 ? 'Get Started' : 'Continue'}
              {!loading && (currentStep === STEPS.length - 1 ? <Check size={18} /> : <ChevronRight size={18} />)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
