// DemandActionCentre — the lead-action layer.
// Turns a lead record into an action centre: Request → Quote → Order,
// with the complete chain visible inline. Non-blocking (§24): empty chain
// when the migration isn't deployed yet.

import { useCallback, useEffect, useState } from 'react'
import {
  createLeadRequest, createDemandQuote, createSalesOrder, transitionDemand,
  fetchLeadChain, fetchDemandActivity, canOrder,
  REQUEST_TYPES, REQUEST_STATUS, QUOTE_STATUS, ORDER_STATUS,
  type DemandChain, type DemandActivityItem, type RequestType, type LeadRequest,
  type DemandQuote, type Urgency,
} from '../lib/demand'
import { ClipboardList, FileText, PackageOpen, ChevronRight, CalendarClock } from 'lucide-react'

interface Props {
  leadId: string
  leadName: string
  onToast: (msg: string, type: 'success' | 'error') => void
}

type ActionKind = 'request' | 'quote' | 'order' | null

export default function DemandActionCentre({ leadId, onToast }: Props) {
  const [chain, setChain] = useState<DemandChain | null>(null)
  const [activity, setActivity] = useState<DemandActivityItem[]>([])
  const [kind, setKind] = useState<ActionKind>(null)

  const refresh = useCallback(async () => {
    const [c, a] = await Promise.all([fetchLeadChain(leadId), fetchDemandActivity(leadId)])
    setChain(c)
    setActivity(a)
  }, [leadId])

  useEffect(() => { void refresh() }, [refresh])

  const requests = chain?.requests ?? []
  const quotes = chain?.quotes ?? []
  const orders = chain?.orders ?? []

  return (
    <div className="mt-4 rounded-xl border border-[var(--av-border)] bg-[var(--av-surface)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--av-border)] p-3">
        <span className="text-xs font-semibold uppercase text-[var(--av-text-muted)]">Demand → Revenue</span>
        <div className="ml-auto flex gap-2">
          <ActionButton icon={<ClipboardList className="h-3.5 w-3.5" />} label="Create Request" onClick={() => setKind('request')} />
          <ActionButton icon={<FileText className="h-3.5 w-3.5" />} label="New Quote" onClick={() => setKind('quote')} />
          <ActionButton icon={<PackageOpen className="h-3.5 w-3.5" />} label="New Order" onClick={() => setKind('order')} />
        </div>
      </div>

      <div className="space-y-3 p-3">
        {kind === 'request' && <RequestForm leadId={leadId} onDone={() => { setKind(null); void refresh(); }} onToast={onToast} />}
        {kind === 'quote' && <QuoteForm leadId={leadId} requests={requests} onDone={() => { setKind(null); void refresh(); }} onToast={onToast} />}
        {kind === 'order' && <OrderForm leadId={leadId} requests={requests} quotes={quotes} onDone={() => { setKind(null); void refresh(); }} onToast={onToast} />}

        {/* chain */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-[var(--av-text-muted)]">Chain:</span>
          <ChainPill
            label="Request" items={requests.map((r) => ({ id: `#${r.request_number}`, status: REQUEST_STATUS[r.status].label, color: REQUEST_STATUS[r.status].color }))}
            empty="no requests yet"
          />
          <ChevronRight className="h-3 w-3 text-[var(--av-text-disabled)]" />
          <ChainPill
            label="Quote" items={quotes.map((q) => ({ id: q.id.slice(0, 6), status: QUOTE_STATUS[q.status].label, color: QUOTE_STATUS[q.status].color }))}
            empty="no quotes yet"
          />
          <ChevronRight className="h-3 w-3 text-[var(--av-text-disabled)]" />
          <ChainPill
            label="Order" items={orders.map((o) => ({ id: `#${o.order_number}`, status: ORDER_STATUS[o.status].label, color: ORDER_STATUS[o.status].color }))}
            empty="no orders yet"
          />
        </div>

        {/* individual entities with transition controls */}
        {requests.length > 0 && (
          <EntityList title="Requests" entities={requests.map((r) => ({ id: r.id, label: `Request #${r.request_number} — ${r.title}`, status: r.status, meta: `${REQUEST_TYPES[r.request_type]} · ${r.urgency}` }))} entity="request" onDone={() => void refresh()} />
        )}
        {quotes.length > 0 && (
          <EntityList title="Quotes" entities={quotes.map((q) => ({ id: q.id, label: `Quote — ₦${q.total.toLocaleString()}`, status: q.status, meta: `valid until ${q.valid_until ? new Date(q.valid_until).toLocaleDateString() : '—'}` }))} entity="quote" onDone={() => void refresh()} />
        )}
        {orders.length > 0 && (
          <EntityList title="Orders" entities={orders.map((o) => ({ id: o.id, label: `Order #${o.order_number} — ₦${o.total.toLocaleString()}`, status: o.status, meta: '' }))} entity="order" onDone={() => void refresh()} />
        )}

        {activity.length > 0 && (
          <div>
            <p className="text-[11px] font-medium uppercase text-[var(--av-text-muted)]">Activity</p>
            <ul className="mt-1 space-y-1">
              {activity.slice(0, 6).map((a, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-[var(--av-text-secondary)]">
                  <span className="rounded bg-[var(--av-surface-2)] px-1.5 py-0.5 font-mono text-[10px]">{a.action}</span>
                  <span>{new Date(a.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--av-primary-soft)] px-2.5 py-1.5 text-xs font-medium text-[var(--av-primary)] hover:bg-[var(--av-primary-soft-hover)]">
      {icon}{label}
    </button>
  )
}

function ChainPill({ label, items, empty }: { label: string; items: { id: string; status: string; color: string }[]; empty: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="font-medium text-[var(--av-text)]">{label}</span>
      {items.length === 0 ? (
        <span className="text-[var(--av-text-disabled)]">{empty}</span>
      ) : (
        items.map((it, i) => (
          <span key={i} className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `color-mix(in srgb, ${it.color} 12%, transparent)`, color: it.color }}>
            {it.id} · {it.status}
          </span>
        ))
      )}
    </span>
  )
}

function EntityList({ title, entities, entity, onDone }: {
  title: string
  entities: { id: string; label: string; status: string; meta: string }[]
  entity: 'request' | 'quote' | 'order'
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const transitions: Record<string, string[]> = {
    request: ['reviewing', 'qualified', 'quoted', 'accepted', 'fulfilled', 'rejected', 'abandoned'],
    quote: ['sent', 'accepted', 'rejected', 'expired'],
    order: ['in_fulfilment', 'fulfilled', 'completed', 'cancelled'],
  }
  const opts = transitions[entity]
  return (
    <div>
      <p className="text-[11px] font-medium uppercase text-[var(--av-text-muted)]">{title}</p>
      <ul className="mt-1 space-y-1">
        {entities.map((e) => (
          <li key={e.id} className="text-xs">
            <button
              className="flex w-full items-center justify-between rounded-lg border border-[var(--av-border)] px-2.5 py-1.5 hover:bg-[var(--av-surface-2)]"
              onClick={() => setOpen(open === e.id ? null : e.id)}
            >
              <span className="font-medium text-[var(--av-text)]">{e.label}</span>
              <span className="rounded bg-[var(--av-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--av-text-secondary)]">{e.status}</span>
            </button>
            {open === e.id && (
              <div className="mt-1 flex flex-wrap gap-1.5 pl-2">
                {opts.filter((o) => o !== e.status).map((o) => (
                  <button
                    key={o}
                    disabled={busy}
                    className="rounded-md bg-[var(--av-primary-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--av-primary)] disabled:opacity-50"
                    onClick={async () => {
                      setBusy(true)
                      await transitionDemand(entity, e.id, o)
                      setBusy(false)
                      onDone()
                    }}
                  >
                    → {o}
                  </button>
                ))}
                {e.meta && <span className="py-0.5 text-[10px] text-[var(--av-text-disabled)]">{e.meta}</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function RequestForm({ leadId, onDone, onToast }: { leadId: string; onDone: () => void; onToast: Props['onToast'] }) {
  const [type, setType] = useState<RequestType>('service')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('')
  const [location, setLocation] = useState('')
  const [budget, setBudget] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('normal')
  const [busy, setBusy] = useState(false)
  return (
    <form className="space-y-2 rounded-lg border border-[var(--av-border)] p-3" onSubmit={async (e) => {
      e.preventDefault()
      setBusy(true)
      const id = await createLeadRequest({
        leadId, type, title: title || 'Untitled request', description: description || undefined,
        quantity: quantity ? Number(quantity) : undefined, location: location || undefined,
        budget: budget ? Number(budget) : undefined, urgency,
      })
      setBusy(false)
      if (id) { onToast('Request created', 'success'); onDone() } else onToast('Request failed', 'error')
    }}>
      <div className="grid grid-cols-2 gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as RequestType)} className="rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs">
          {Object.entries(REQUEST_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)} className="rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs">
          {(['low', 'normal', 'high', 'urgent'] as const).map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do they need? e.g. Roof repair" required className="w-full rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Requirements, specifications…" rows={2} className="w-full rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs" />
      <div className="grid grid-cols-3 gap-2">
        <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty" type="number" min="0" step="0.01" className="rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className="col-span-2 rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs" />
      </div>
      <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Budget (optional)" type="number" min="0" step="0.01" className="w-full rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs" />
      <button disabled={busy || !title} className="w-full rounded-lg bg-[var(--av-primary)] py-1.5 text-xs font-semibold text-white disabled:opacity-50">
        {busy ? 'Creating…' : 'Create request'}
      </button>
    </form>
  )
}

function QuoteForm({ leadId, requests, onDone, onToast }: { leadId: string; requests: LeadRequest[]; onDone: () => void; onToast: Props['onToast'] }) {
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState([{ name: '', quantity: 1, unit_price: 0 }])
  const [requestId, setRequestId] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [busy, setBusy] = useState(false)
  const subtotal = rows.reduce((s, r) => s + (r.quantity * r.unit_price), 0)
  const eligible = requests.filter((r) => !['rejected', 'abandoned', 'fulfilled'].includes(r.status))
  return (
    <form className="space-y-2 rounded-lg border border-[var(--av-border)] p-3" onSubmit={async (e) => {
      e.preventDefault()
      setBusy(true)
      const id = await createDemandQuote({
        leadId, requestId: requestId || undefined, title: title || 'Quote',
        items: rows.filter((r) => r.name && r.unit_price > 0), validUntil: validUntil || undefined,
      })
      setBusy(false)
      if (id) { onToast('Quote created', 'success'); onDone() } else onToast('Quote failed', 'error')
    }}>
      {eligible.length > 0 && (
        <select value={requestId} onChange={(e) => setRequestId(e.target.value)} className="w-full rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs">
          <option value="">Not tied to a request</option>
          {eligible.map((r) => <option key={r.id} value={r.id}>Request #{r.request_number} — {r.title}</option>)}
        </select>
      )}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quote title" className="w-full rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs" />
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_70px_110px] gap-2">
          <input value={r.name} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Item" className="rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs" />
          <input value={r.quantity} type="number" min="1" onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} className="rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs" />
          <input value={r.unit_price || ''} type="number" min="0" step="0.01" placeholder="Price" onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, unit_price: Number(e.target.value) } : x))} className="rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs" />
        </div>
      ))}
      <button type="button" className="text-xs text-[var(--av-primary)]" onClick={() => setRows([...rows, { name: '', quantity: 1, unit_price: 0 }])}>+ add line</button>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-[var(--av-text-muted)]"><CalendarClock className="h-3 w-3" /> valid until (optional)</span>
        <input value={validUntil} onChange={(e) => setValidUntil(e.target.value)} type="date" className="rounded-lg border border-[var(--av-border)] px-2 py-1 text-xs" />
      </div>
      <p className="text-right text-sm font-semibold text-[var(--av-text)]">Total: ₦{subtotal.toLocaleString()}</p>
      <button disabled={busy} className="w-full rounded-lg bg-[var(--av-primary)] py-1.5 text-xs font-semibold text-white disabled:opacity-50">
        {busy ? 'Creating…' : 'Create quote'}
      </button>
    </form>
  )
}

function OrderForm({ leadId, requests, quotes, onDone, onToast }: { leadId: string; requests: LeadRequest[]; quotes: DemandQuote[]; onDone: () => void; onToast: Props['onToast'] }) {
  const accepted = quotes.filter((q) => canOrder(q).ok)
  const [source, setSource] = useState<'direct' | 'quote' | 'request'>('quote')
  const [quoteId, setQuoteId] = useState('')
  const [requestId, setRequestId] = useState('')
  const [total, setTotal] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const chosenQuote = accepted.find((q) => q.id === quoteId)
    const chosenRequest = requests.find((r) => r.id === requestId)
    let computedTotal = total ? Number(total) : 0
    if (source === 'quote' && chosenQuote) computedTotal = chosenQuote.total
    if (source === 'request' && chosenRequest?.budget) computedTotal = Number(chosenRequest.budget)
    const id = await createSalesOrder({
      leadId,
      quoteId: source === 'quote' ? quoteId || undefined : undefined,
      requestId: source === 'request' ? requestId || undefined : undefined,
      title: chosenQuote?.title ?? chosenRequest?.title,
      total: computedTotal,
    })
    setBusy(false)
    if (id) { onToast('Order created', 'success'); onDone() } else onToast('Order failed (quote must be accepted)', 'error')
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-[var(--av-border)] p-3">
      <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="w-full rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs">
        <option value="quote">From accepted quote</option>
        <option value="request">From open request</option>
        <option value="direct">Direct order</option>
      </select>
      {source === 'quote' && (
        <select value={quoteId} onChange={(e) => setQuoteId(e.target.value)} className="w-full rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs">
          <option value="">Pick an accepted quote…</option>
          {accepted.map((q) => <option key={q.id} value={q.id}>{q.title} — ₦{q.total.toLocaleString()}</option>)}
        </select>
      )}
      {source === 'request' && (
        <select value={requestId} onChange={(e) => setRequestId(e.target.value)} className="w-full rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs">
          <option value="">Pick a request…</option>
          {requests.filter((r) => !['rejected', 'abandoned', 'fulfilled'].includes(r.status)).map((r) => <option key={r.id} value={r.id}>Request #{r.request_number} — {r.title}</option>)}
        </select>
      )}
      {source === 'direct' && (
        <input value={total} onChange={(e) => setTotal(e.target.value)} type="number" min="0" step="0.01" placeholder="Order total" className="w-full rounded-lg border border-[var(--av-border)] px-2 py-1.5 text-xs" />
      )}
      <button disabled={busy || (source === 'quote' && !quoteId) || (source === 'request' && !requestId)} className="w-full rounded-lg bg-[var(--av-success)] py-1.5 text-xs font-semibold text-white disabled:opacity-50">
        {busy ? 'Creating…' : 'Create order'}
      </button>
    </form>
  )
}
