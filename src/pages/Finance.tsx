import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Invoice, Deal } from '../lib/types'

const STATUSES: Invoice['status'][] = ['draft', 'sent', 'paid', 'overdue', 'cancelled']

export default function Finance() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [dealId, setDealId] = useState('')
  const [clientName, setClientName] = useState('')
  const [total, setTotal] = useState('')

  const load = async () => {
    const [{ data: inv }, { data: d }] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('deals').select('*').eq('stage', 'won'),
    ])
    setInvoices((inv as Invoice[]) ?? [])
    setDeals((d as Deal[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  const addInvoice = async () => {
    if (!total || !clientName) return
    await supabase.from('invoices').insert({
      deal_id: dealId || null,
      client_name: clientName,
      total: Number(total),
      subtotal: Number(total),
      status: 'draft',
    })
    setTotal('')
    setClientName('')
    setDealId('')
    load()
  }

  const setStatus = async (id: string, status: Invoice['status']) => {
    await supabase.from('invoices').update({ status }).eq('id', id)
    load()
  }

  return (
    <div>
      <h1 className="text-xl font-medium text-[var(--fabric-black)] mb-6">Finance</h1>

      <div className="bg-white rounded-2xl border border-black/5 p-4 mb-6 space-y-3">
        <p className="text-sm font-medium text-[var(--fabric-black)]">Create invoice</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Client name"
            className="flex-1 min-w-40 rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            className="rounded-lg border border-black/10 px-3 py-2 text-sm"
          >
            <option value="">No linked deal</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <input
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="Amount"
            type="number"
            className="w-32 rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <button onClick={addInvoice} className="rounded-lg bg-[var(--fabric-black)] text-white px-4 py-2 text-sm">
            Create
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5">
        {invoices.map((inv) => (
          <div key={inv.id} className="px-4 py-3 flex items-center justify-between text-sm">
            <div>
              <span className="text-[var(--fabric-black)]">{inv.client_name}</span>
              <span className="text-black/40 ml-2">${inv.total?.toLocaleString() ?? 0}</span>
            </div>
            <select
              value={inv.status}
              onChange={(e) => setStatus(inv.id, e.target.value as Invoice['status'])}
              className="text-xs rounded-md border border-black/10 px-2 py-1"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ))}
        {invoices.length === 0 && <p className="px-4 py-3 text-sm text-black/40">No invoices yet.</p>}
      </div>
    </div>
  )
}
