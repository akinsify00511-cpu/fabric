import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import FabricMark from '../components/FabricMark'

const PENDING_INVITE_KEY = 'avenize_pending_invite'

export default function Onboarding() {
  const { session, refreshStaff, signOut } = useAuth()
  const [pendingInvite, setPendingInvite] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [fullName, setFullName] = useState(
    (session?.user.user_metadata?.full_name as string | undefined) ?? '',
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setPendingInvite(localStorage.getItem(PENDING_INVITE_KEY))
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (pendingInvite) {
      const { error: rpcError } = await supabase.rpc('accept_invite', {
        invite_id: pendingInvite,
        staff_full_name: fullName,
      })
      if (rpcError) {
        setError(rpcError.message)
        setLoading(false)
        return
      }
      localStorage.removeItem(PENDING_INVITE_KEY)
    } else {
      const { error: rpcError } = await supabase.rpc('bootstrap_business', {
        business_name: businessName,
        staff_full_name: fullName,
      })
      if (rpcError) {
        setError(rpcError.message)
        setLoading(false)
        return
      }
    }

    await refreshStaff()
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 space-y-5"
      >
        <div className="flex items-center gap-2">
          <FabricMark size={26} />
          <span className="text-xl font-semibold tracking-tight text-[var(--avenize-black)]">Fabric</span>
        </div>
        <p className="text-sm text-black/50 -mt-3">
          {pendingInvite ? "One more step — you're joining a team" : 'One more step — set up your business'}
        </p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="space-y-3">
          {!pendingInvite && (
            <input
              required
              placeholder="Business name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
            />
          )}
          <input
            required
            placeholder="Your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg avenize-gradient text-white py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? 'Setting up…' : 'Finish setup'}
        </button>

        <button type="button" onClick={signOut} className="w-full text-xs text-black/40 hover:text-black/60">
          Sign out
        </button>
      </form>
    </div>
  )
}
