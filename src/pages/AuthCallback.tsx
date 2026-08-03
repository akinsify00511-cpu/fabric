// ============================================
// AUTH CALLBACK PAGE
// Handles email confirmation and OAuth callbacks
// ============================================

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handleCallback = async () => {
      // Get the code from the URL
      const code = searchParams.get('code')
      const errorParam = searchParams.get('error')
      
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
        
        // Check if this is a new user who needs business setup
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session) {
          // Check if user already has a business
          const { data: staffData } = await supabase
            .from('staff')
            .select('business_id')
            .eq('user_id', session.user.id)
            .maybeSingle()
          
          if (staffData?.business_id) {
            // Already has a business, go to dashboard
            navigate('/app', { replace: true })
          } else {
            // New user, go to onboarding
            navigate('/onboarding', { replace: true })
          }
        } else {
          navigate('/login', { replace: true })
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
          <div className="w-12 h-12 rounded-2xl avenize-gradient flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <div className="w-8 h-8 border-2 border-[var(--avenize-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-black/50 mt-4">Completing sign in...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Authentication Failed</h2>
          <p className="text-sm text-black/60">{error}</p>
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

  return null
}
