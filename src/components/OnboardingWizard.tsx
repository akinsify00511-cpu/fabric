/**
 * AVENIZE ONBOARDING WIZARD
 * Step-by-step business setup flow
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { 
  Building2, Users, Package, FileText, TrendingUp, Check,
  ChevronRight, ChevronLeft, Sparkles, Zap, Target, Clock
} from 'lucide-react'

type Step = {
  id: string
  title: string
  description: string
  icon: typeof Building2
  completed: boolean
}

interface OnboardingWizardProps {
  onComplete?: () => void
}

const STEPS = [
  {
    id: 'business',
    title: 'Business Details',
    description: 'Tell us about your business',
    icon: Building2,
  },
  {
    id: 'team',
    title: 'Invite Your Team',
    description: 'Add team members to get started',
    icon: Users,
  },
  {
    id: 'inventory',
    title: 'Quick Setup',
    description: 'Import or create your first items',
    icon: Package,
  },
  {
    id: 'clients',
    title: 'Add Clients',
    description: 'Import your existing clients',
    icon: FileText,
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'Start using Avenize',
    icon: Sparkles,
  },
]

const INDUSTRIES = [
  'Manufacturing', 'Retail & E-Commerce', 'Professional Services',
  'Healthcare', 'Education', 'Technology', 'Logistics',
  'Real Estate', 'Food & Beverage', 'Fashion & Textiles',
  'Automotive', 'Media & Advertising', 'Agriculture', 'Other'
]

const QUICK_SETUP_OPTIONS = [
  { id: 'blank', label: 'Start Fresh', description: 'Build from scratch', icon: Target },
  { id: 'sample', label: 'Use Sample Data', description: 'Explore with demo data', icon: Sparkles },
  { id: 'import', label: 'Import Data', description: 'Upload from spreadsheet', icon: FileText },
]

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const navigate = useNavigate()
  const { staff } = useAuth()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  // Form data
  const [businessData, setBusinessData] = useState({
    name: (staff as any)?.business_name || '',
    industry: '',
    size: '',
    website: '',
  })
  
  const [teamEmails, setTeamEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [quickSetup, setQuickSetup] = useState<'blank' | 'sample' | 'import'>('blank')

  const progress = ((currentStep + 1) / STEPS.length) * 100

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (step === 0) {
      if (!businessData.name.trim()) newErrors.name = 'Business name is required'
      if (!businessData.industry) newErrors.industry = 'Please select an industry'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = async () => {
    if (!validateStep(currentStep)) return
    
    if (currentStep === STEPS.length - 2) {
      // Save business data on last step before complete
      await saveBusinessData()
      setCurrentStep(prev => prev + 1)
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const saveBusinessData = async () => {
    if (!staff?.business_id) return
    setLoading(true)
    
    await supabase
      .from('businesses')
      .update({
        industry: businessData.industry,
        website: businessData.website,
        size: businessData.size,
        onboarding_completed: true,
      })
      .eq('id', staff.business_id)
    
    setLoading(false)
  }

  const sendInvites = async () => {
    if (!staff?.business_id) return
    setLoading(true)
    
    for (const email of teamEmails) {
      await supabase.rpc('invite_staff', {
        p_business_id: staff.business_id,
        p_email: email.trim(),
        p_role: 'staff',
      })
    }
    
    setLoading(false)
  }

  const handleComplete = () => {
    // Mark onboarding complete
    localStorage.setItem('avenize_onboarding_complete', 'true')
    onComplete?.()
    navigate('/app')
  }

  const addTeamEmail = () => {
    const email = newEmail.trim()
    if (email && !teamEmails.includes(email) && email.includes('@')) {
      setTeamEmails([...teamEmails, email])
      setNewEmail('')
    }
  }

  const removeTeamEmail = (email: string) => {
    setTeamEmails(teamEmails.filter(e => e !== email))
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-900">Tell us about your business</h2>
              <p className="text-slate-500 mt-2">This helps us customize Avenize for you</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Business Name *
              </label>
              <input
                type="text"
                value={businessData.name}
                onChange={(e) => setBusinessData({ ...businessData, name: e.target.value })}
                className={`w-full px-4 py-3 rounded-xl border ${errors.name ? 'border-red-500' : 'border-slate-200'} focus:outline-none focus:ring-2 focus:ring-indigo-500/30`}
                placeholder="Your Company Ltd"
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Industry *
              </label>
              <select
                value={businessData.industry}
                onChange={(e) => setBusinessData({ ...businessData, industry: e.target.value })}
                className={`w-full px-4 py-3 rounded-xl border ${errors.industry ? 'border-red-500' : 'border-slate-200'} focus:outline-none focus:ring-2 focus:ring-indigo-500/30`}
              >
                <option value="">Select your industry</option>
                {INDUSTRIES.map(ind => (
                  <option key={ind} value={ind.toLowerCase()}>{ind}</option>
                ))}
              </select>
              {errors.industry && <p className="text-red-500 text-sm mt-1">{errors.industry}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Company Size
              </label>
              <select
                value={businessData.size}
                onChange={(e) => setBusinessData({ ...businessData, size: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="">Select size</option>
                <option value="1-10">1-10 employees</option>
                <option value="11-50">11-50 employees</option>
                <option value="51-200">51-200 employees</option>
                <option value="201+">201+ employees</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Website (optional)
              </label>
              <input
                type="url"
                value={businessData.website}
                onChange={(e) => setBusinessData({ ...businessData, website: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="https://yourcompany.com"
              />
            </div>
          </div>
        )

      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-900">Invite your team</h2>
              <p className="text-slate-500 mt-2">Collaborate with your team from day one</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-700">
                <strong>Tip:</strong> You can skip this step and invite team members later from Settings.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Team Member Emails
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTeamEmail())}
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="colleague@company.com"
                />
                <button
                  onClick={addTeamEmail}
                  className="px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
                >
                  Add
                </button>
              </div>
            </div>

            {teamEmails.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Invites to send:</p>
                {teamEmails.map((email) => (
                  <div key={email} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-700">{email}</span>
                    <button
                      onClick={() => removeTeamEmail(email)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-900">Quick setup</h2>
              <p className="text-slate-500 mt-2">Choose how you want to get started</p>
            </div>

            <div className="space-y-3">
              {QUICK_SETUP_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setQuickSetup(option.id as any)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    quickSetup === option.id
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      quickSetup === option.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <option.icon size={24} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{option.label}</p>
                      <p className="text-sm text-slate-500">{option.description}</p>
                    </div>
                    {quickSetup === option.id && (
                      <Check size={20} className="ml-auto text-indigo-600" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={40} className="text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">You're all set!</h2>
              <p className="text-slate-500 mt-2">Your business is ready to go</p>
            </div>

            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 space-y-4">
              <h3 className="font-semibold text-slate-900">What you can do next:</h3>
              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Zap size={16} className="text-indigo-600" />
                  </div>
                  <span className="text-slate-700">Create your first invoice</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Users size={16} className="text-indigo-600" />
                  </div>
                  <span className="text-slate-700">Add clients and leads</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <TrendingUp size={16} className="text-indigo-600" />
                  </div>
                  <span className="text-slate-700">Track your first task</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Clock size={16} className="text-indigo-600" />
                  </div>
                  <span className="text-slate-700">Get smart alerts automatically</span>
                </li>
              </ul>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {STEPS.map((step, i) => {
              const StepIcon = step.icon
              return (
                <div
                  key={step.id}
                  className={`flex flex-col items-center ${
                    i <= currentStep ? 'text-indigo-600' : 'text-slate-300'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    i < currentStep
                      ? 'bg-indigo-600 text-white'
                      : i === currentStep
                      ? 'bg-indigo-100 border-2 border-indigo-600'
                      : 'bg-slate-100'
                  }`}>
                    {i < currentStep ? <Check size={20} /> : <StepIcon size={20} />}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="h-2 bg-slate-200 rounded-full">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {renderStep()}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-slate-100">
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium ${
                currentStep === 0
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ChevronLeft size={20} />
              Back
            </button>

            {currentStep < STEPS.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Continue'}
                <ChevronRight size={20} />
              </button>
            ) : (
              <button
                onClick={async () => {
                  if (teamEmails.length > 0) await sendInvites()
                  handleComplete()
                }}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Setting up...' : 'Go to Dashboard'}
                <ChevronRight size={20} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
