// Sales Orders — committed demand moving through fulfilment to revenue.

import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { fetchOrders, transitionDemand, ORDER_STATUS, type SalesOrder } from '../lib/demand'
import EmptyState from '../components/EmptyState'
import { PackageOpen } from 'lucide-react'

const FILTERS = ['all', 'confirmed', 'in_fulfilment', 'fulfilled', 'completed', 'cancelled'] as const

export default function SalesOrders() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    if (!staff?.business_id) return
    setLoading(true)
    fetchOrders(staff.business_id).then((o) => { setOrders(o); setLoading(false) })
  }, [staff?.business_id])

  const shown = filter === 'all' ? orders : orders.filter((o) => o.status === filter)
  const revenue = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total), 0)
  const inFlight = orders.filter((o) => o.status === 'confirmed' || o.status === 'in_fulfilment').length

  return (
    <div className="min-h-screen bg-[var(--av-surface-2)]">
      <div className="border-b border-[var(--av-border)] bg-[var(--av-surface)] px-6 py-4">
        <h1 className="text-xl font-semibold text-[var(--av-text)]">Orders</h1>
        <p className="mt-0.5 text-sm text-[var(--av-text-muted)]">
          Committed demand — every order keeps the chain back to its lead, request and quote.
        </p>
        <div className="mt-2 flex gap-4 text-xs">
          <span className="text-[var(--av-text)]"><strong>₦{revenue.toLocaleString()}</strong> order value</span>
          <span className="text-[var(--av-text-muted)]">{inFlight} in fulfilment</span>
        </div>
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
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-[var(--av-text-muted)]">Loading orders…</p>
        ) : shown.length === 0 ? (
          <EmptyState
            gamified
            milestone="Your first order"
            title="No orders yet"
            description="Orders are the moment demand becomes revenue. Convert an accepted quote, or take a direct order from a lead that's ready to buy."
            tip="Every order remembers its full chain: Lead → Request → Quote → Order — so revenue intelligence knows exactly where the money came from."
          />
        ) : (
          <div className="space-y-2">
            {shown.map((o) => {
              const st = ORDER_STATUS[o.status]
              return (
                <div key={o.id} className="rounded-xl border border-[var(--av-border)] bg-[var(--av-surface-elevated)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--av-text)]">Order #{o.order_number}</p>
                      <p className="mt-0.5 text-xs text-[var(--av-text-muted)]">
                        {new Date(o.created_at).toLocaleDateString()}
                        {o.quote_id ? ' · from quote' : o.request_id ? ' · from request' : ' · direct'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-[var(--av-text)]">₦{Number(o.total).toLocaleString()}</span>
                      <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `color-mix(in srgb, ${st.color} 12%, transparent)`, color: st.color }}>
                        {st.label}
                      </span>
                    </div>
                  </div>
                  {!['completed', 'cancelled'].includes(o.status) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(['in_fulfilment', 'fulfilled', 'completed', 'cancelled'] as const).filter((s) => s !== o.status).map((s) => (
                        <button
                          key={s}
                          onClick={async () => {
                            const ok = await transitionDemand('order', o.id, s)
                            showToast(ok ? `Moved to ${s.replace('_', ' ')}` : 'Transition failed', ok ? 'success' : 'error')
                            if (ok && staff?.business_id) fetchOrders(staff.business_id).then(setOrders)
                          }}
                          className="rounded-md bg-[var(--av-surface-2)] px-2 py-1 text-[11px] font-medium text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-3)]"
                        >
                          → {s.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {orders.length === 0 && !loading && (
          <div className="mt-4 flex items-center gap-2 text-xs text-[var(--av-text-muted)]">
            <PackageOpen className="h-3.5 w-3.5" /> Create orders from a lead's action centre or an accepted quote.
          </div>
        )}
      </div>
    </div>
  )
}
