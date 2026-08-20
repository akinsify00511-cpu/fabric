// Requests — the demand inbox. Every customer request across all leads.

import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { fetchRequests, transitionDemand, REQUEST_TYPES, REQUEST_STATUS, type LeadRequest } from '../lib/demand'
import EmptyState from '../components/EmptyState'
import { ClipboardList, MapPin, Wallet } from 'lucide-react'

const FILTERS = ['all', 'new', 'reviewing', 'qualified', 'quoted', 'accepted', 'fulfilled', 'rejected', 'abandoned'] as const

export default function Requests() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [requests, setRequests] = useState<LeadRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    if (!staff?.business_id) return
    setLoading(true)
    fetchRequests(staff.business_id).then((r) => { setRequests(r); setLoading(false) })
  }, [staff?.business_id])

  const shown = filter === 'all' ? requests : requests.filter((r) => r.status === filter)
  const openCount = requests.filter((r) => !['fulfilled', 'rejected', 'abandoned'].includes(r.status)).length

  return (
    <div className="min-h-screen bg-[var(--av-surface-2)]">
      <div className="border-b border-[var(--av-border)] bg-[var(--av-surface)] px-6 py-4">
        <h1 className="text-xl font-semibold text-[var(--av-text)]">Requests</h1>
        <p className="mt-0.5 text-sm text-[var(--av-text-muted)]">
          Every customer request across your leads — the first step of the demand → revenue chain.
        </p>
        <p className="mt-1 text-xs text-[var(--av-text-muted)]">
          {openCount} open · {requests.length} total
        </p>
      </div>

      <div className="p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === f ? 'bg-[var(--av-primary)] text-white' : 'bg-[var(--av-surface-elevated)] text-[var(--av-text-muted)] border border-[var(--av-border)]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-[var(--av-text-muted)]">Loading requests…</p>
        ) : shown.length === 0 ? (
          <EmptyState
            gamified
            milestone="Your first customer request"
            title="No requests yet"
            description="Every sale starts with a request. Open a lead and use the action centre to capture what your customer needs."
            tip="Requests carry requirements, quantity, location and budget — they flow into quotes and orders automatically."
          />
        ) : (
          <div className="space-y-2">
            {shown.map((r) => {
              const st = REQUEST_STATUS[r.status]
              return (
                <div key={r.id} className="rounded-xl border border-[var(--av-border)] bg-[var(--av-surface-elevated)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--av-text)]">
                        #{r.request_number} · {r.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--av-text-muted)]">
                        {REQUEST_TYPES[r.request_type]} · {r.urgency} priority · {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `color-mix(in srgb, ${st.color} 12%, transparent)`, color: st.color }}>
                      {st.label}
                    </span>
                  </div>
                  {(r.description || r.location || r.budget || r.quantity) && (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--av-text-secondary)]">
                      {r.quantity && <span>Qty {r.quantity}</span>}
                      {r.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{r.location}</span>}
                      {r.budget && <span className="inline-flex items-center gap-1"><Wallet className="h-3 w-3" />₦{r.budget.toLocaleString()}</span>}
                    </div>
                  )}
                  {r.description && <p className="mt-2 line-clamp-2 text-xs text-[var(--av-text-muted)]">{r.description}</p>}
                  {!['fulfilled', 'rejected', 'abandoned'].includes(r.status) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(['reviewing', 'qualified', 'rejected', 'abandoned'] as const).filter((s) => s !== r.status).map((s) => (
                        <button
                          key={s}
                          onClick={async () => {
                            const ok = await transitionDemand('request', r.id, s)
                            showToast(ok ? `Moved to ${s}` : 'Transition failed', ok ? 'success' : 'error')
                            if (ok && staff?.business_id) fetchRequests(staff.business_id).then(setRequests)
                          }}
                          className="rounded-md bg-[var(--av-surface-2)] px-2 py-1 text-[11px] font-medium text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-3)]"
                        >
                          → {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {requests.length === 0 && !loading && (
          <div className="mt-4 flex items-center gap-2 text-xs text-[var(--av-text-muted)]">
            <ClipboardList className="h-3.5 w-3.5" /> Create requests from any lead's action centre.
          </div>
        )}
      </div>
    </div>
  )
}
