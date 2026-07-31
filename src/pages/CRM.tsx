import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Deal, Contact } from '../lib/types'

const STAGES: Deal['stage'][] = ['prospect', 'qualified', 'proposal', 'negotiation', 'won', 'lost']

export default function CRM() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [title, setTitle] = useState('')

  const load = async () => {
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('deals').select('*').order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').order('created_at', { ascending: false }),
    ])
    setDeals((d as Deal[]) ?? [])
    setContacts((c as Contact[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  const addDeal = async () => {
    if (!title.trim()) return
    await supabase.from('deals').insert({ title, stage: 'prospect', value: 0 })
    setTitle('')
    load()
  }

  const moveStage = async (id: string, stage: Deal['stage']) => {
    await supabase.from('deals').update({ stage }).eq('id', id)
    load()
  }

  return (
    <div>
      <h1 className="text-xl font-medium text-[var(--fabric-black)] mb-6">CRM</h1>

      <div className="flex gap-2 mb-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New deal title"
          className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
        />
        <button onClick={addDeal} className="rounded-lg bg-[var(--fabric-black)] text-white px-4 py-2 text-sm">
          Add deal
        </button>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-10">
        {STAGES.map((stage) => (
          <div key={stage} className="bg-white rounded-2xl border border-black/5 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-black/40 mb-2">{stage}</p>
            <div className="space-y-2">
              {deals
                .filter((d) => d.stage === stage)
                .map((d) => (
                  <div key={d.id} className="rounded-lg bg-[var(--fabric-offwhite)] p-2 text-sm">
                    <p className="text-[var(--fabric-black)]">{d.title}</p>
                    <select
                      value={d.stage}
                      onChange={(e) => moveStage(d.id, e.target.value as Deal['stage'])}
                      className="mt-1 text-xs bg-transparent text-black/50"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-sm font-medium text-black/60 mb-3">Contacts</h2>
      <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5">
        {contacts.map((c) => (
          <div key={c.id} className="px-4 py-3 text-sm flex justify-between">
            <span className="text-[var(--fabric-black)]">{c.name}</span>
            <span className="text-black/40">{c.company ?? c.email ?? ''}</span>
          </div>
        ))}
        {contacts.length === 0 && <p className="px-4 py-3 text-sm text-black/40">No contacts yet.</p>}
      </div>
    </div>
  )
}
