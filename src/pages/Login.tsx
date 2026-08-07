import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AvenizeMark } from '../components/AvenizeMark'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)

  // Check if already logged in
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        // Check if user has a business
        const { data: staffData } = await supabase
          .from('staff')
          .select('business_id')
          .eq('user_id', session.user.id)
          .maybeSingle()
        
        if (staffData?.business_id) {
          navigate('/app', { replace: true })
        } else {
          navigate('/onboarding', { replace: true })
        }
      }
    }
    checkSession()
  }, [navigate])

    const handleDemoLogin = () => {
    localStorage.setItem('avenize_demo', 'true')
    localStorage.setItem('avenize_demo_user', JSON.stringify({
      id: 'demo-user-001',
      email: 'demo@avenize.ng',
      name: 'Adebayo Johnson',
      business_name: 'TechBuild Nigeria Ltd',
      role: 'Business Owner',
      business_id: 'demo-business-001'
    }))
    navigate('/app')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    
    // Check if user has a business after successful login
    if (data.session) {
      const { data: staffData } = await supabase
        .from('staff')
        .select('business_id')
        .eq('user_id', data.session.user.id)
        .maybeSingle()
      
      if (staffData?.business_id) {
        navigate('/app')
      } else {
        navigate('/onboarding')
      }
    }
  }

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setOauthLoading(provider)
    setError(null)
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    
    if (error) {
      setError(error.message)
      setOauthLoading(null)
    }
    // If successful, browser redirects to provider, then back to /auth/callback
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 space-y-5"
      >
        <div className="flex items-center gap-2">
          <AvenizeMark size={26} />
          <span className="text-xl font-semibold tracking-tight text-black">Avenize</span>
        </div>
        <p className="text-sm text-black -mt-3">Sign in to your workspace</p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {/* OAuth Buttons */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleOAuthSignIn('google')}
            disabled={!!oauthLoading}
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-black/10 py-2.5 text-sm font-medium hover:bg-black/10 transition disabled:opacity-50"
          >
            {oauthLoading === 'google' ? (
              <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="var(--av-primary, #0891B2)" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </button>
          
          <button
            type="button"
            onClick={() => handleOAuthSignIn('github')}
            disabled={!!oauthLoading}
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-black/10 py-2.5 text-sm font-medium hover:bg-black/10 transition disabled:opacity-50"
          >
            {oauthLoading === 'github' ? (
              <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            )}
            Continue with GitHub
          </button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-black/10"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-black">Or</span>
          </div>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
          />
        </div>

        <div className="flex items-center justify-between">
          <Link to="/forgot-password" className="text-xs text-[#4F46E5] hover:underline">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg avenize-gradient text-white py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        {/* Demo Button */}
        <button
          type="button"
          onClick={handleDemoLogin}
          className="w-full rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 text-indigo-600 py-3 text-sm font-medium hover:bg-indigo-100 transition"
        >
          🎯 Try Demo Account
        </button>

        <p className="text-xs text-center text-black">
          New here?{' '}
          <Link to="/signup" className="text-[#4F46E5] hover:underline">
            Set up your business
          </Link>
        </p>
      </form>
    </div>
  )
}
