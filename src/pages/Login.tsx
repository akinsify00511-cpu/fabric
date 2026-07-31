import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import FabricMark from '../components/FabricMark'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--fabric-offwhite)]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 space-y-5"
      >
        <div className="flex items-center gap-2">
          <FabricMark size={26} />
          <span className="text-xl font-semibold tracking-tight text-[var(--fabric-black)]">Fabric</span>
        </div>
        <p className="text-sm text-black/50 -mt-3">Sign in to your workspace</p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

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

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg fabric-gradient text-white py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-xs text-center text-black/40">
          New here?{' '}
          <Link to="/signup" className="text-[#4F46E5] hover:underline">
            Set up your business
          </Link>
        </p>
      </form>
    </div>
  )
}
