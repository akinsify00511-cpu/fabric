import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, Mail, Phone, MapPin, Building2, CreditCard } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'

interface Vendor {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  payment_terms: string | null
  is_active: boolean
}

export default function Vendors() {
  const { staff } = useAuth()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    payment_terms: '',
    is_active: true,
  })

  useEffect(() => { fetchVendors() }, [staff])

  async function fetchVendors() {
    if (!staff?.business_id) return
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('business_id', staff.business_id)
      .order('name')
    if (error) { console.error('Error loading vendors:', error); setVendors([]) }
    else setVendors(data || [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', email: '', phone: '', address: '', payment_terms: 'Net 30', is_active: true })
    setShowModal(true)
  }

  function openEdit(v: Vendor) {
    setEditing(v)
    setForm({
      name: v.name,
      email: v.email ?? '',
      phone: v.phone ?? '',
      address: v.address ?? '',
      payment_terms: v.payment_terms ?? '',
      is_active: v.is_active,
    })
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id) return
    const payload = {
      business_id: staff.business_id,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      payment_terms: form.payment_terms || null,
      is_active: form.is_active,
    }
    try {
      if (editing) {
        const { error } = await supabase.from('vendors').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('vendors').insert(payload)
        if (error) throw error
      }
      setShowModal(false)
      fetchVendors()
    } catch (error) {
      console.error('Error saving vendor:', error)
      alert('Could not save the vendor. Please try again.')
    }
  }

  async function remove(v: Vendor) {
    if (!confirm(`Remove ${v.name}? Existing POs keep their vendor link.`)) return
    const { error } = await supabase.from('vendors').delete().eq('id', v.id)
    if (error) { alert('Could not remove the vendor — they may be referenced by purchase orders.'); return }
    fetchVendors()
  }

  const filtered = vendors.filter(v =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.email ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[var(--av-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Vendors</h1>
          <p className="text-sm text-black/60 mt-1">Suppliers you purchase goods from</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition"
        >
          <Plus size={18} />
          New Vendor
        </button>
      </div>

      {vendors.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No vendors yet"
          description="Add a supplier so you can create purchase orders against them"
          action={{ label: 'New Vendor', onClick: openCreate }}
        />
      ) : (
        <>
          <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
              <input
                type="text"
                placeholder="Search vendors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(v => (
              <div key={v.id} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--av-primary)]/10 flex items-center justify-center">
                    <Building2 size={20} className="text-[var(--av-primary)]" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(v)} className="p-2 hover:bg-black/5 rounded-lg transition" title="Edit">
                      <Edit size={16} className="text-black/60" />
                    </button>
                    <button onClick={() => remove(v)} className="p-2 hover:bg-[var(--av-danger-soft)] rounded-lg transition" title="Remove">
                      <Trash2 size={16} className="text-[var(--av-danger)]" />
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-black mb-2">{v.name}</h3>
                <div className="space-y-1 text-sm text-black/60">
                  {v.email && <div className="flex items-center gap-2"><Mail size={14} /> {v.email}</div>}
                  {v.phone && <div className="flex items-center gap-2"><Phone size={14} /> {v.phone}</div>}
                  {v.address && <div className="flex items-center gap-2"><MapPin size={14} /> {v.address}</div>}
                  {v.payment_terms && <div className="flex items-center gap-2"><CreditCard size={14} /> {v.payment_terms}</div>}
                </div>
                <div className="mt-4 pt-4 border-t border-black/5">
                  <span className={`px-3 py-1 rounded-lg text-xs font-medium ${v.is_active ? 'bg-[var(--av-success)]/10 text-[var(--av-success)]' : 'bg-black/5 text-black/40'}`}>
                    {v.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Vendor' : 'New Vendor'} size="md">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Vendor Name *</label>
            <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition" placeholder="e.g., ABC Supplies Ltd" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition" placeholder="vendor@email.com" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition" placeholder="+234..." />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address</label>
            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition" placeholder="Street, City" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Payment Terms</label>
            <input type="text" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition" placeholder="Net 30, COD, etc." />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
            Active vendor
          </label>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-black/10 rounded-xl font-medium hover:bg-black/5 transition">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition">{editing ? 'Save Changes' : 'Create Vendor'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
