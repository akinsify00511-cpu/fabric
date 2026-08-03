// ============================================
// AUTH CALLBACK PAGE
// Handles email confirmation for signup and invite acceptance
// ============================================

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    const handleCallback = async () => {
      // Get the code from the URL
      const code = searchParams.get('code')
      const errorParam = searchParams.get('error')
      const type = searchParams.get('type') // 'signup' or 'invite'
      const token = searchParams.get('token') // invite token if coming from invite
      
      if (errorParam) {
        setError(errorParam)
        setLoading(false)
        return
      }

      if (code) {
        // Exchange the code for a session
        const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
        
        if (sessionError) {
          console.error('Session exchange error:', sessionError)
          setError(sessionError.message)
          setLoading(false)
          return
        }
        
        // Get the current session
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session) {
          navigate('/login', { replace: true })
          return
        }

        // Check if user already has a business
        const { data: staffData } = await supabase
          .from('staff')
          .select('business_id')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (staffData?.business_id) {
          // Already has a business, go to dashboard
          setMessage('Welcome back! Redirecting to your dashboard...')
          setTimeout(() => navigate('/app', { replace: true }), 1500)
        } else {
          // Check for pending business signup
          const pendingBusiness = localStorage.getItem('avenize_pending_business')
          
          if (pendingBusiness) {
            try {
              const { businessName, industry, fullName } = JSON.parse(pendingBusiness)
              
              setMessage(`Setting up ${businessName}...`)
              
              // Create the business
              const { error: bizError } = await supabase.rpc('create_business_and_owner', {
                p_business_name: businessName,
                p_industry: industry || null,
                p_staff_name: fullName,
              })
              
              if (bizError) {
                console.error('Failed to create business:', bizError)
                setError('Failed to set up your business. Please contact support.')
                setLoading(false)
                return
              }
              
              localStorage.removeItem('avenize_pending_business')
              setMessage('Business created! Redirecting...')
              setTimeout(() => navigate('/app', { replace: true }), 1500)
            } catch (err) {
              console.error('Error parsing pending business:', err)
              navigate('/onboarding', { replace: true })
            }
          } 
          // Check for pending invite
          else if (token) {
            const pendingInvite = localStorage.getItem('avenize_pending_invite')
            
            if (pendingInvite) {
              setMessage('Joining your team...')
              
              const { error: inviteError } = await supabase.rpc('accept_invite', {
                p_token: token,
                p_staff_name: session.user.user_metadata?.full_name || null,
              })
              
              if (inviteError) {
                console.error('Failed to accept invite:', inviteError)
                setError(inviteError.message)
                setLoading(false)
                return
              }
              
              localStorage.removeItem('avenize_pending_invite')
              setMessage('Joined! Redirecting...')
              setTimeout(() => navigate('/app', { replace: true }), 1500)
            } else {
              // No pending invite, go to onboarding
              navigate('/onboarding', { replace: true })
            }
          }
          else {
            // New user, go to onboarding
            navigate('/onboarding', { replace: true })
          }
        }
      } else {
        // No code, redirect to login
        navigate('/login', { replace: true })
      }
      
      setLoading(false)
    }

    handleCallback()
  }, [searchParams, navigate])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl avenize-gradient flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">A</span>
          </div>
          <div className="w-8 h-8 border-2 border-[var(--avenize-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-black/50 mt-4">{message || 'Completing sign in...'}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="text-sm text-black/60 mt-2">{error}</p>
          </div>
          <a 
            href="/login" 
            className="inline-block px-6 py-3 rounded-xl avenize-gradient text-white font-medium"
          >
            Back to Sign In
          </a>
        </div>
      </div>
    )
  }

  // Success state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)]">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-green-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mt-6">Success!</h2>
        <p className="text-sm text-black/50 mt-2">{message || 'Redirecting...'}</p>
      </div>
    </div>
  )
}
