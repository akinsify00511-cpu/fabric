import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, TrendingUp, DollarSign, CheckCircle2, Clock, X, Building, User } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'

interface PropertyOption { id: string; title: string; address: string }
interface StaffOption { id: string; full_name: string }
interface PropertySale {
  id: string
  property_id: string
  property_title?: string
  agent_id: string | null
  agent_name?: string
  offer_amount: number
  currency: string
  status: string
  sale_date: string | null
  completion_date: string | null
  notes: string | null
  commission_status?: string | null
  commission_id?: string | null
}

const SALE_STATUSES = [
  { value: 'offer', label: 'Offer', color: 'var(--av-warning)' },
  { value: 'accepted', label: 'Accepted', color: 'var(--av-primary)' },
  { value: 'contract', label: 'Contract', color: '#8B5CF6' },
  { value: 'completed', label: 'Completed', color: 'var(--av-success)' },
  { value: 'fell_through', label: 'Fell Through', color: 'var(--av-danger)' },
]

const fmtMoney = (n: number, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

export default function PropertySales() {
  const { staff } = useAuth()
  const [sales, setSales] = useState<PropertySale[]>([])
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [agents, setAgents] = useState<StaffOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PropertySale | null>(null)
  const [showCommissionModal, setShowCommissionModal] = useState(false)
  const [commissionSale, setCommissionSale] = useState<PropertySale | null>(null)

  const [form, setForm] = useState({
    property_id: '',
    agent_id: '',
    offer_amount: '',
    status: 'offer',
    sale_date: '',
    notes: '',
  })

  const [commissionForm, setCommissionForm] = useState({
    gross_amount: '',
    agency_split_pct: '0',
    agent_split_pct: '100',
    referral_split_pct: '0',
    notes: '',
  })

  useEffect(() => {
    fetchAll()
  }, [staff])

  async function fetchAll() {
    if (!staff?.business_id) return
    // Load sales with joined property title + agent name + any linked commission
    // status, so the manager sees the full lifecycle in one view.
    const [salesRes, propsRes, agentsRes] = await Promise.all([
      supabase
        .from('property_sales')
        .select(`
          *,
          property:properties!property_id (title, address),
          agent:staff!agent_id (full_name),
          commission:property_commissions!property_sale_id (id, status)
        `)
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false }),
      supabase.from('properties').select('id, title, address').eq('business_id', staff.business_id).order('title'),
      supabase.from('staff').select('id, full_name').eq('business_id', staff.business_id).order('full_name'),
    ])

    if (salesRes.error) console.error('Error loading sales:', salesRes.error)
    setSales((salesRes.data || []).map((s: any) => ({
      id: s.id,
      property_id: s.property_id,
      property_title: s.property?.title ?? 'Unknown',
      agent_id: s.agent_id,
      agent_name: s.agent?.full_name ?? 'Unassigned',
      offer_amount: Number(s.offer_amount),
      currency: s.currency || 'NGN',
      status: s.status,
      sale_date: s.sale_date,
      completion_date: s.completion_date,
      notes: s.notes,
      commission_status: s.commission?.[0]?.status ?? null,
      commission_id: s.commission?.[0]?.id ?? null,
    })))
    setProperties(propsRes.data || [])
    setAgents(agentsRes.data || [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({ property_id: '', agent_id: '', offer_amount: '', status: 'offer', sale_date: '', notes: '' })
    setShowModal(true)
  }

  function openEdit(s: PropertySale) {
    setEditing(s)
    setForm({
      property_id: s.property_id,
      agent_id: s.agent_id ?? '',
      offer_amount: String(s.offer_amount),
      status: s.status,
      sale_date: s.sale_date ?? '',
      notes: s.notes ?? '',
    })
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id) return
    const payload = {
      business_id: staff.business_id,
      property_id: form.property_id,
      agent_id: form.agent_id || null,
      offer_amount: Number(form.offer_amount) || 0,
      status: form.status,
      sale_date: form.sale_date || null,
      notes: form.notes || null,
    }
    try {
      if (editing) {
        const { error } = await supabase.from('property_sales').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('property_sales').insert(payload)
        if (error) throw error
      }
      setShowModal(false)
      fetchAll()
    } catch (error) {
      console.error('Error saving sale:', error)
      alert('Could not save the sale. Please try again.')
    }
  }

  async function remove(s: PropertySale) {
    if (!confirm(`Delete this sale record for "${s.property_title}"?`)) return
    const { error } = await supabase.from('property_sales').delete().eq('id', s.id)
    if (error) { alert('Could not delete the sale.'); return }
    fetchAll()
  }

  function openCommission(s: PropertySale) {
    setCommissionSale(s)
    setCommissionForm({
      gross_amount: '',
      agency_split_pct: '0',
      agent_split_pct: '100',
      referral_split_pct: '0',
      notes: '',
    })
    setShowCommissionModal(true)
  }

  // Create a commission row + an approvals-engine request so the payout is
  // gated by the Property Manager before Finance can pay — never auto-paid.
  async function handleCommissionSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id || !commissionSale) return
    const gross = Number(commissionForm.gross_amount) || 0
    const agentPct = Number(commissionForm.agent_split_pct) || 0
    const agencyPct = Number(commissionForm.agency_split_pct) || 0
    const refPct = Number(commissionForm.referral_split_pct) || 0
    if (agentPct + agencyPct + refPct > 100) {
      alert('Split percentages cannot exceed 100%.')
      return
    }
    try {
      // 1) insert the commission
      const { data: comm, error: commErr } = await supabase
        .from('property_commissions')
        .insert({
          business_id: staff.business_id,
          property_sale_id: commissionSale.id,
          agent_id: commissionSale.agent_id || null,
          agency_split_pct: agencyPct,
          agent_split_pct: agentPct,
          referral_split_pct: refPct,
          gross_amount: gross,
          currency: commissionSale.currency,
          status: 'pending_approval',
          notes: commissionForm.notes || null,
        })
        .select('id')
        .single()
      if (commErr) throw commErr

      // 2) create the linked approval (entity_type=property_commission)
      const { error: apprErr } = await supabase
        .from('approvals')
        .insert({
          business_id: staff.business_id,
          entity_type: 'property_commission',
          entity_id: comm.id,
          requester_id: staff.id,
          status: 'pending',
          amount: gross,
          description: `Commission for ${commissionSale.property_title}`,
        })
      if (apprErr) throw apprErr

      setShowCommissionModal(false)
      fetchAll()
    } catch (error) {
      console.error('Error creating commission:', error)
      alert('Could not create the commission. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[var(--av-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const stats = {
    total: sales.length,
    completed: sales.filter(s => s.status === 'completed').length,
    pipeline: sales.filter(s => !['completed', 'fell_through'].includes(s.status)).length,
    volume: sales.filter(s => s.status === 'completed').reduce((sum, s) => sum + s.offer_amount, 0),
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Property Sales</h1>
          <p className="text-sm text-black/60 mt-1">Track offers, closings, and agent commissions</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition"
        >
          <Plus size={18} />
          New Sale
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={TrendingUp} label="Pipeline" value={String(stats.pipeline)} color="var(--av-primary)" />
        <StatCard icon={CheckCircle2} label="Completed" value={String(stats.completed)} color="var(--av-success)" />
        <StatCard icon={Building} label="Total Sales" value={String(stats.total)} color="#8B5CF6" />
        <StatCard icon={DollarSign} label="Closed Volume" value={fmtMoney(stats.volume)} color="var(--av-success)" />
      </div>

      {sales.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No sales recorded yet"
          description="Record a property sale to track its offer status and agent commissions"
          action={{ label: 'New Sale', onClick: openCreate }}
          gamified
          hint="Each sale you record builds your property performance story — offers, closings, and commissions, all in one place."
          tip="Start with the property, the buyer's offer, and the agent — commissions flow to approvals automatically."
        />
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#F8F9FA]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Property</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Agent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Offer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Commission</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-black/60 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {sales.map(s => {
                const status = SALE_STATUSES.find(st => st.value === s.status)
                return (
                  <tr key={s.id} className="hover:bg-[#F8F9FA]/50 transition">
                    <td className="px-4 py-3">
                      <p className="font-medium text-black">{s.property_title}</p>
                      {s.sale_date && <p className="text-xs text-black/40">Sold {new Date(s.sale_date).toLocaleDateString()}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-black/60">
                      {s.agent_name}
                    </td>
                    <td className="px-4 py-3 font-medium text-black">{fmtMoney(s.offer_amount, s.currency)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-lg text-xs font-medium" style={{ background: (status?.color || '#999') + '1A', color: status?.color }}>
                        {status?.label || s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!s.commission_id ? (
                        <button
                          onClick={() => openCommission(s)}
                          className="text-xs font-medium text-[var(--av-primary)] hover:underline"
                        >
                          + Create
                        </button>
                      ) : (
                        <CommissionBadge status={s.commission_status} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(s)} className="p-2 hover:bg-black/5 rounded-lg transition" title="Edit">
                          <Edit size={16} className="text-black/60" />
                        </button>
                        <button onClick={() => remove(s)} className="p-2 hover:bg-[var(--av-danger-soft)] rounded-lg transition" title="Delete">
                          <Trash2 size={16} className="text-[var(--av-danger)]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sale modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Sale' : 'New Sale'} size="md">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Property *</label>
            <select
              required
              value={form.property_id}
              onChange={(e) => setForm({ ...form, property_id: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition bg-white"
            >
              <option value="">Select a property...</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.title} — {p.address}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Agent</label>
            <select
              value={form.agent_id}
              onChange={(e) => setForm({ ...form, agent_id: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition bg-white"
            >
              <option value="">Unassigned</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Offer Amount (₦) *</label>
              <input
                type="number"
                required
                min="0"
                value={form.offer_amount}
                onChange={(e) => setForm({ ...form, offer_amount: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition bg-white"
              >
                {SALE_STATUSES.map(st => (
                  <option key={st.value} value={st.value}>{st.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Sale Date</label>
            <input
              type="date"
              value={form.sale_date}
              onChange={(e) => setForm({ ...form, sale_date: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-black/10 rounded-xl font-medium hover:bg-black/5 transition">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition">{editing ? 'Save Changes' : 'Create Sale'}</button>
          </div>
        </form>
      </Modal>

      {/* Commission modal */}
      <Modal isOpen={showCommissionModal} onClose={() => setShowCommissionModal(false)} title="Create Commission" size="md">
        <form onSubmit={handleCommissionSubmit} className="p-6 space-y-4">
          <div className="bg-[var(--av-primary)]/5 rounded-xl p-3 text-sm text-black/70">
            <p className="font-medium text-black">{commissionSale?.property_title}</p>
            <p>Agent: {commissionSale?.agent_name} · Offer: {commissionSale && fmtMoney(commissionSale.offer_amount, commissionSale.currency)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Gross Commission (₦) *</label>
            <input
              type="number"
              required
              min="0"
              value={commissionForm.gross_amount}
              onChange={(e) => setCommissionForm({ ...commissionForm, gross_amount: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              placeholder="Total commission to split"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Agency %</label>
              <input type="number" min="0" max="100" value={commissionForm.agency_split_pct} onChange={(e) => setCommissionForm({ ...commissionForm, agency_split_pct: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Agent %</label>
              <input type="number" min="0" max="100" value={commissionForm.agent_split_pct} onChange={(e) => setCommissionForm({ ...commissionForm, agent_split_pct: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Referral %</label>
              <input type="number" min="0" max="100" value={commissionForm.referral_split_pct} onChange={(e) => setCommissionForm({ ...commissionForm, referral_split_pct: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition" />
            </div>
          </div>
          <p className="text-xs text-black/40">Splits must total ≤ 100%. The commission starts as "Pending Approval" and must be approved by a manager before payment.</p>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setShowCommissionModal(false)} className="flex-1 px-4 py-2 border border-black/10 rounded-xl font-medium hover:bg-black/5 transition">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition">Request Approval</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2" style={{ background: color + '1A' }}>
        <Icon size={18} style={{ color }} />
      </div>
      <p className="text-xs text-black/50">{label}</p>
      <p className="text-lg font-bold text-black">{value}</p>
    </div>
  )
}

function CommissionBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-xs text-black/30">—</span>
  const map: Record<string, { label: string; color: string }> = {
    pending_approval: { label: 'Pending', color: 'var(--av-warning)' },
    approved: { label: 'Approved', color: 'var(--av-primary)' },
    paid: { label: 'Paid', color: 'var(--av-success)' },
    disputed: { label: 'Disputed', color: 'var(--av-danger)' },
    voided: { label: 'Voided', color: 'var(--av-danger)' },
  }
  const s = map[status] || { label: status, color: '#999' }
  return (
    <span className="px-2 py-1 rounded-lg text-xs font-medium" style={{ background: s.color + '1A', color: s.color }}>
      {s.label}
    </span>
  )
}
