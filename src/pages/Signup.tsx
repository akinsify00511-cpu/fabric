import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import FabricMark from '../components/FabricMark'

export default function Signup() {
  const navigate = useNavigate()
  const [businessName, setBusinessName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, business_name: businessName } },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (!data.session) {
      // Email confirmation is required before a session exists.
      // Onboarding.tsx will run bootstrap_business the first time they log in.
      setCheckEmail(true)
      setLoading(false)
      return
    }

    const { error: rpcError } = await supabase.rpc('bootstrap_business', {
      business_name: businessName,
      staff_full_name: fullName,
    })

    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }

    navigate('/')
  }

  if (checkEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--fabric-offwhite)] px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-3">
          <FabricMark size={26} />
          <p className="text-sm text-[var(--fabric-black)] font-medium">Check your email</p>
          <p className="text-sm text-black/50">
            Confirm your address, then sign in — we'll finish setting up {businessName || 'your business'} automatically.
          </p>
          <Link to="/login" className="text-sm text-[#4F46E5] hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--fabric-offwhite)] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 space-y-5"
      >
        <div className="flex items-center gap-2">
          <FabricMark size={26} />
          <span className="text-xl font-semibold tracking-tight text-[var(--fabric-black)]">Fabric</span>
        </div>
        <p className="text-sm text-black/50 -mt-3">Set up your business</p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="space-y-3">
          <input
            required
            placeholder="Business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
          />
          <input
            required
            placeholder="Your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
          />
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
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg fabric-gradient text-white py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? 'Setting up…' : 'Create business'}
        </button>

        <p className="text-xs text-center text-black/40">
          Already set up?{' '}
          <Link to="/login" className="text-[#4F46E5] hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  )
}
