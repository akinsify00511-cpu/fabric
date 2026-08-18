import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, Mail, Phone, Building, User, ExternalLink } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'

interface PropertyOwner {
  id: string
  name: string
  email: string | null
  phone: string | null
  is_active: boolean
  portal_user_id: string | null
  created_at: string
  property_count?: number
}

export default function PropertyOwners() {
  const { staff } = useAuth()
  const [owners, setOwners] = useState<PropertyOwner[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PropertyOwner | null>(null)

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    is_active: true,
  })

  useEffect(() => {
    fetchOwners()
  }, [staff])

  async function fetchOwners() {
    if (!staff?.business_id) return
    // Pull owners with a count of their properties so the manager sees each
    // owner's portfolio at a glance without opening a detail page.
    const { data, error } = await supabase
      .from('property_owners')
      .select(`
        id, name, email, phone, is_active, portal_user_id, created_at,
        properties:properties!owner_id_uuid(count)
      `)
      .eq('business_id', staff.business_id)
      .order('name')
    if (error) {
      console.error('Error loading owners:', error)
      setOwners([])
    } else {
      setOwners((data || []).map((o: any) => ({
        id: o.id,
        name: o.name,
        email: o.email,
        phone: o.phone,
        is_active: o.is_active,
        portal_user_id: o.portal_user_id,
        created_at: o.created_at,
        property_count: o.properties?.[0]?.count ?? 0,
      })))
    }
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', email: '', phone: '', is_active: true })
    setShowModal(true)
  }

  function openEdit(o: PropertyOwner) {
    setEditing(o)
    setForm({ name: o.name, email: o.email ?? '', phone: o.phone ?? '', is_active: o.is_active })
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
      is_active: form.is_active,
    }
    try {
      if (editing) {
        const { error } = await supabase.from('property_owners').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('property_owners').insert(payload)
        if (error) throw error
      }
      setShowModal(false)
      fetchOwners()
    } catch (error) {
      console.error('Error saving owner:', error)
      alert('Could not save the owner. Please try again.')
    }
  }

  async function remove(o: PropertyOwner) {
    if (!confirm(`Remove ${o.name}? Their properties stay on file but lose this owner link.`)) return
    const { error } = await supabase.from('property_owners').delete().eq('id', o.id)
    if (error) {
      alert('Could not remove the owner.')
      return
    }
    fetchOwners()
  }

  const filtered = owners.filter(o =>
    o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (o.email ?? '').toLowerCase().includes(searchQuery.toLowerCase())
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
          <h1 className="text-2xl font-bold text-black">Property Owners</h1>
          <p className="text-sm text-black/60 mt-1">Landlords who own properties you manage</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition"
        >
          <Plus size={18} />
          New Owner
        </button>
      </div>

      {owners.length === 0 ? (
        <EmptyState
          icon={User}
          title="No property owners yet"
          description="Add an owner to link them to their properties and track payouts"
          action={{ label: 'New Owner', onClick: openCreate }}
        />
      ) : (
        <>
          <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
              <input
                type="text"
                placeholder="Search owners by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-[#F8F9FA]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Properties</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Portal</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-black/60 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.map(o => (
                  <tr key={o.id} className="hover:bg-[#F8F9FA]/50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[var(--av-primary)]/10 flex items-center justify-center text-xs font-medium text-[var(--av-primary)]">
                          {o.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium text-black">{o.name}</p>
                          {!o.is_active && <span className="text-xs text-black/40">Inactive</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-black/60">
                      {o.email && <div className="flex items-center gap-1"><Mail size={12} /> {o.email}</div>}
                      {o.phone && <div className="flex items-center gap-1"><Phone size={12} /> {o.phone}</div>}
                      {!o.email && !o.phone && <span className="text-black/30">No contact info</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-sm font-medium text-black/80">
                        <Building size={14} /> {o.property_count ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {o.portal_user_id ? (
                        <span className="px-2 py-1 rounded-lg text-xs font-medium bg-[var(--av-success)]/10 text-[var(--av-success)]">
                          Has access
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-lg text-xs font-medium bg-black/5 text-black/40">
                          No access
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(o)} className="p-2 hover:bg-black/5 rounded-lg transition" title="Edit">
                          <Edit size={16} className="text-black/60" />
                        </button>
                        <button onClick={() => remove(o)} className="p-2 hover:bg-[var(--av-danger-soft)] rounded-lg transition" title="Remove">
                          <Trash2 size={16} className="text-[var(--av-danger)]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Owner' : 'New Owner'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              placeholder="e.g., Adebayo Ogundimu"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              placeholder="owner@email.com"
            />
            <p className="text-xs text-black/40 mt-1">Used to invite them to the owner portal</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              placeholder="+234..."
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="rounded"
            />
            Active owner
          </label>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="flex-1 px-4 py-2 border border-black/10 rounded-xl font-medium hover:bg-black/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition"
            >
              {editing ? 'Save Changes' : 'Create Owner'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
