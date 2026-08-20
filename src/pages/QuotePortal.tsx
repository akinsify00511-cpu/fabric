// QuotePortal — the customer-facing quote page at /quote/:token.
// No login required: the access_token IS the authorization. The customer
// sees the quote and can Accept or Reject directly (respond_to_quote RPC).

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicQuote, respondToQuote, QUOTE_STATUS, type PublicQuote } from '../lib/demand'
import { CheckCircle2, XCircle, FileText } from 'lucide-react'

export default function QuotePortal() {
  const { token } = useParams<{ token: string }>()
  const [quote, setQuote] = useState<PublicQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [responded, setResponded] = useState<'accepted' | 'rejected' | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    getPublicQuote(token).then((q) => { setQuote(q); setLoading(false) })
  }, [token])

  async function respond(accept: boolean) {
    if (!token) return
    setBusy(true)
    const ok = await respondToQuote(token, accept)
    setBusy(false)
    if (ok) {
      setResponded(accept ? 'accepted' : 'rejected')
      const q = await getPublicQuote(token)
      setQuote(q)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-[var(--av-text-muted)]">Loading your quote…</div>
  }
  if (!quote) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--av-surface-2)] px-4">
        <div className="max-w-sm rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)] p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-[var(--av-text-disabled)]" />
          <h1 className="mt-3 text-lg font-semibold text-[var(--av-text)]">Quote not found</h1>
          <p className="mt-1 text-sm text-[var(--av-text-muted)]">This link may have expired or been withdrawn. Contact the business for a fresh quote.</p>
        </div>
      </div>
    )
  }

  const st = QUOTE_STATUS[quote.status]
  const actionable = !responded && ['sent', 'viewed'].includes(quote.status)

  return (
    <div className="min-h-screen bg-[var(--av-surface-2)] py-8 px-4">
      <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)] p-8 shadow-sm">
        <p className="text-xs font-medium uppercase text-[var(--av-text-muted)]">Quote from {quote.business_name}</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--av-text)]">{quote.title}</h1>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `color-mix(in srgb, ${st.color} 12%, transparent)`, color: st.color }}>{st.label}</span>
          {quote.valid_until && <span className="text-xs text-[var(--av-text-muted)]">valid until {new Date(quote.valid_until).toLocaleDateString()}</span>}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--av-border)] text-left text-xs uppercase text-[var(--av-text-muted)]">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((it, i) => (
              <tr key={i} className="border-b border-[var(--av-border-subtle)]">
                <td className="py-2.5 text-[var(--av-text)]">{it.name}</td>
                <td className="py-2.5 text-right text-[var(--av-text-secondary)]">{it.quantity}</td>
                <td className="py-2.5 text-right text-[var(--av-text-secondary)]">₦{Number(it.unit_price).toLocaleString()}</td>
                <td className="py-2.5 text-right font-medium text-[var(--av-text)]">₦{(it.quantity * it.unit_price).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-2 text-right text-xs text-[var(--av-text-muted)]">Subtotal</td>
              <td className="py-2 text-right text-sm text-[var(--av-text)]">₦{Number(quote.subtotal).toLocaleString()}</td>
            </tr>
            {quote.vat_amount > 0 && (
              <tr>
                <td colSpan={3} className="py-1 text-right text-xs text-[var(--av-text-muted)]">VAT</td>
                <td className="py-1 text-right text-sm text-[var(--av-text)]">₦{Number(quote.vat_amount).toLocaleString()}</td>
              </tr>
            )}
            <tr>
              <td colSpan={3} className="py-3 text-right text-sm font-semibold text-[var(--av-text)]">Total</td>
              <td className="py-3 text-right text-xl font-bold text-[var(--av-text)]">₦{Number(quote.total).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>

        {responded ? (
          <div className="mt-6 rounded-xl border p-4 text-center" style={{ borderColor: responded === 'accepted' ? 'var(--av-success)' : 'var(--av-danger)' }}>
            {responded === 'accepted' ? (
              <>
                <CheckCircle2 className="mx-auto h-8 w-8 text-[var(--av-success)]" />
                <p className="mt-2 font-semibold text-[var(--av-success)]">Quote accepted — thank you!</p>
                <p className="mt-1 text-sm text-[var(--av-text-muted)]">{quote.business_name} has been notified and will be in touch.</p>
              </>
            ) : (
              <>
                <XCircle className="mx-auto h-8 w-8 text-[var(--av-danger)]" />
                <p className="mt-2 font-semibold text-[var(--av-danger)]">Quote declined</p>
                <p className="mt-1 text-sm text-[var(--av-text-muted)]">{quote.business_name} has been notified.</p>
              </>
            )}
          </div>
        ) : actionable ? (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button disabled={busy} onClick={() => void respond(false)} className="rounded-xl border border-[var(--av-danger)] py-3 text-sm font-semibold text-[var(--av-danger)] disabled:opacity-50">
              Decline
            </button>
            <button disabled={busy} onClick={() => void respond(true)} className="rounded-xl bg-[var(--av-success)] py-3 text-sm font-semibold text-white disabled:opacity-50">
              Accept quote
            </button>
          </div>
        ) : (
          <p className="mt-6 text-center text-sm text-[var(--av-text-muted)]">
            This quote is <strong>{st.label.toLowerCase()}</strong> — contact {quote.business_name} for next steps.
          </p>
        )}
      </div>
    </div>
  )
}
