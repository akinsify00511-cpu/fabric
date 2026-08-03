import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AvenizeMark from '../components/AvenizeMark'

const PENDING_INVITE_KEY = 'avenize_pending_invite'

type InviteInfo = { business_name: string; role: string; email: string; valid: boolean }

export default function Join() {
  const { inviteId } = useParams()
  const navigate = useNavigate()
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  useEffect(() => {
    if (!inviteId) return
    supabase.rpc('get_invite_info', { invite_id: inviteId }).then(({ data, error: rpcError }) => {
      if (rpcError || !data || data.length === 0) {
        setInfo({ business_name: '', role: '', email: '', valid: false })
      } else {
        setInfo(data[0] as InviteInfo)
        setEmail((data[0] as InviteInfo).email ?? '')
      }
      setLoadingInfo(false)
    })
  }, [inviteId])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!inviteId) return
    setSubmitting(true)
    setError(null)

    localStorage.setItem(PENDING_INVITE_KEY, inviteId)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })

    if (signUpError) {
      setError(signUpError.message)
      setSubmitting(false)
      return
    }

    if (!data.session) {
      setCheckEmail(true)
      setSubmitting(false)
      return
    }

    const { error: rpcError } = await supabase.rpc('accept_invite', {
      invite_id: inviteId,
      staff_full_name: fullName,
    })

    if (rpcError) {
      setError(rpcError.message)
      setSubmitting(false)
      return
    }

    localStorage.removeItem(PENDING_INVITE_KEY)
    navigate('/')
  }

  if (loadingInfo) {
    return <div className="min-h-screen flex items-center justify-center text-black/40 text-sm">Loading…</div>
  }

  if (!info?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-3">
          <AvenizeMark size={26} />
          <p className="text-sm text-[var(--avenize-black)] font-medium">This invite isn't valid</p>
          <p className="text-sm text-black/50">It may have expired or already been used.</p>
          <Link to="/login" className="text-sm text-[#4F46E5] hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  if (checkEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-3">
          <AvenizeMark size={26} />
          <p className="text-sm text-[var(--avenize-black)] font-medium">Check your email</p>
          <p className="text-sm text-black/50">
            Confirm your address, then sign in — we'll finish joining {info.business_name} automatically.
          </p>
          <Link to="/login" className="text-sm text-[#4F46E5] hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 space-y-5"
      >
        <div className="flex items-center gap-2">
          <AvenizeMark size={26} />
          <span className="text-xl font-semibold tracking-tight text-[var(--avenize-black)]">Avenize</span>
        </div>
        <p className="text-sm text-black/50 -mt-3">
          You're invited to join <span className="text-[var(--avenize-black)] font-medium">{info.business_name}</span> as{' '}
          {info.role}
        </p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="space-y-3">
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
            placeholder="Choose a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg avenize-gradient text-white py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {submitting ? 'Joining…' : 'Join'}
        </button>
      </form>
    </div>
  )
}
