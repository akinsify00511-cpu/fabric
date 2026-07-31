import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Invoice, Deal } from '../lib/types'

const STATUSES: Invoice['status'][] = ['draft', 'sent', 'paid', 'overdue', 'cancelled']

export default function Finance() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [dealId, setDealId] = useState('')
  const [amount, setAmount] = useState('')

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
    if (!amount) return
    await supabase.from('invoices').insert({
      deal_id: dealId || null,
      amount: Number(amount),
      status: 'draft',
    })
    setAmount('')
    setDealId('')
    load()
  }

  const setStatus = async (id: string, status: Invoice['status']) => {
    await supabase
      .from('invoices')
      .update({ status, paid_at: status === 'paid' ? new Date().toISOString() : null })
      .eq('id', id)
    load()
  }

  return (
    <div>
      <h1 className="text-xl font-medium text-[var(--fabric-black)] mb-6">Finance</h1>

      <div className="flex gap-2 mb-6">
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
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          type="number"
          className="w-32 rounded-lg border border-black/10 px-3 py-2 text-sm"
        />
        <button onClick={addInvoice} className="rounded-lg bg-[var(--fabric-black)] text-white px-4 py-2 text-sm">
          Create invoice
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5">
        {invoices.map((inv) => (
          <div key={inv.id} className="px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-[var(--fabric-black)]">
              {inv.currency} {inv.amount.toLocaleString()}
            </span>
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
