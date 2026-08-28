// Vendor Portal — admin side of external vendor/partner workspaces
// (Doc1 §24). Vendors get controlled access to their POs, invoices,
// delivery and payment status without seeing internal information.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { Truck, Loader2, Plus, UserCheck, Mail } from 'lucide-react'

export default function VendorPortal() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const bid = staff?.business_id
  const [accounts, setAccounts] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', contact_id: '', portal_type: 'vendor' })

  async function load() {
    if (!bid) return
    const [a, v] = await Promise.all([
      supabase.from('portal_accounts').select('*').eq('business_id', bid).order('created_at', { ascending: false }),
      supabase.from('contacts').select('id, name').eq('business_id', bid).limit(200),
    ])
    setAccounts(a.data || [])
    setVendors(v.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [bid])

  async function invite() {
    if (!bid) return
    try {
      const { error } = await supabase.from('portal_accounts').insert({
        business_id: bid, portal_type: form.portal_type,
        name: form.name, email: form.email,
        contact_id: form.contact_id || null,
        scope: { contact_id: form.contact_id },
      })
      if (error) throw error
      showToast('Vendor portal account created', 'success')
      setForm({ name: '', email: '', contact_id: '', portal_type: 'vendor' })
      setShowForm(false)
      load()
    } catch  { showToast('Could not create account', 'error') }
  }

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
            <Truck size={24} className="text-[var(--av-primary)]" /> Vendor Portal
          </h1>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">
            Give vendors and partners controlled access — their POs, invoices, delivery and payment status — without exposing internal data.
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm font-medium">
          <Plus size={16} /> {showForm ? 'Cancel' : 'Invite vendor'}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)] mb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Vendor / company name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm" />
            <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              className="rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm" />
            <select value={form.contact_id} onChange={e => setForm({ ...form, contact_id: e.target.value })}
              className="rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-white">
              <option value="">Link to contact (optional)</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select value={form.portal_type} onChange={e => setForm({ ...form, portal_type: e.target.value })}
              className="rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-white">
              <option value="vendor">Vendor</option>
              <option value="partner">Partner</option>
              <option value="contractor">Contractor</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button onClick={invite} disabled={!form.name || !form.email}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50">
              <Mail size={16} /> Create & invite
            </button>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-sm text-[var(--av-text-tertiary)] shadow-[var(--av-elevation-1)]">
          No vendor portal accounts yet. Invite a vendor to give them scoped access to their POs and payment status.
        </div>
      ) : (
        <div className="rounded-xl bg-white shadow-[var(--av-elevation-1)] divide-y divide-[var(--av-border)]">
          {accounts.map(a => (
            <div key={a.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-[var(--av-text)]">{a.name}</div>
                <div className="text-xs text-[var(--av-text-secondary)]">{a.email} · {a.portal_type}</div>
              </div>
              <div className="flex items-center gap-2">
                {a.last_login_at
                  ? <span className="text-xs text-[var(--av-text-tertiary)]">last in {new Date(a.last_login_at).toLocaleDateString()}</span>
                  : <span className="text-xs text-[var(--av-warning)] flex items-center gap-1"><UserCheck size={12} /> pending</span>}
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.is_active ? 'bg-[var(--av-success)]/15 text-[var(--av-success)]' : 'bg-[var(--av-surface-2)] text-[var(--av-text-tertiary)]'}`}>
                  {a.is_active ? 'active' : 'inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
