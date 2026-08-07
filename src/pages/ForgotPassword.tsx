import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold">Check your email</h2>
          <p className="text-sm text-black/60">
            We sent a password reset link to <span className="font-medium">{email}</span>
          </p>
          <p className="text-xs text-black">
            Didn't receive it? Check your spam folder or{' '}
            <button onClick={() => setSuccess(false)} className="text-[#0891B2] hover:underline">
              try again
            </button>
          </p>
          <Link 
            to="/login" 
            className="block text-sm text-[#0891B2] hover:underline font-medium"
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 space-y-5">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl avenize-gradient flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <h2 className="text-xl font-semibold">Reset password</h2>
          <p className="text-sm text-black mt-1">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            required
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0891B2]/30"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg avenize-gradient text-white py-3 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>

        <p className="text-center">
          <Link to="/login" className="text-sm text-[#0891B2] hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
