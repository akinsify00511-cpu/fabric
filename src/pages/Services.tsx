import { useState, useEffect } from 'react'
import { Plus, Search, Clock, Tag, Edit, Trash2, Calendar } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'

interface Service {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number | null
  color: string | null
  is_active: boolean
}

const SERVICE_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#6366F1']

export default function Services() {
  const { staff } = useAuth()
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [bookingLink, setBookingLink] = useState('')

  const [form, setForm] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    price: '',
    color: SERVICE_COLORS[0],
    is_active: true,
  })

  useEffect(() => {
    fetchServices()
  }, [staff])

  useEffect(() => {
    if (staff?.business_id) {
      // The public booking page resolves a business by slug; surface the link
      // so the admin can share it. Falls back to the default-booking URL.
      supabase
        .from('businesses')
        .select('slug')
        .eq('id', staff.business_id)
        .maybeSingle()
        .then(({ data }) => {
          const slug = data?.slug
          setBookingLink(slug ? `/book/${slug}` : '/book')
        })
    }
  }, [staff])

  async function fetchServices() {
    if (!staff?.business_id) return
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('business_id', staff.business_id)
      .order('name')
    if (error) {
      console.error('Error loading services:', error)
      setServices([])
    } else {
      setServices(data || [])
    }
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', description: '', duration_minutes: 60, price: '', color: SERVICE_COLORS[0], is_active: true })
    setShowModal(true)
  }

  function openEdit(s: Service) {
    setEditing(s)
    setForm({
      name: s.name,
      description: s.description ?? '',
      duration_minutes: s.duration_minutes,
      price: s.price != null ? String(s.price) : '',
      color: s.color ?? SERVICE_COLORS[0],
      is_active: s.is_active,
    })
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id) return
    const payload = {
      business_id: staff.business_id,
      name: form.name,
      description: form.description || null,
      duration_minutes: Number(form.duration_minutes) || 60,
      price: form.price ? Number(form.price) : null,
      color: form.color,
      is_active: form.is_active,
    }
    try {
      if (editing) {
        const { error } = await supabase.from('services').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('services').insert(payload)
        if (error) throw error
      }
      setShowModal(false)
      fetchServices()
    } catch (error) {
      console.error('Error saving service:', error)
      alert('Could not save the service. Please try again.')
    }
  }

  async function toggleActive(s: Service) {
    const { error } = await supabase.from('services').update({ is_active: !s.is_active }).eq('id', s.id)
    if (error) {
      alert('Could not update the service.')
      return
    }
    fetchServices()
  }

  async function remove(s: Service) {
    if (!confirm(`Delete "${s.name}"? Bookers will no longer see this service.`)) return
    const { error } = await supabase.from('services').delete().eq('id', s.id)
    if (error) {
      alert('Could not delete the service.')
      return
    }
    fetchServices()
  }

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
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
          <h1 className="text-2xl font-bold text-black">Booking Services</h1>
          <p className="text-sm text-black/60 mt-1">
            Services customers can book on your public booking page
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition"
        >
          <Plus size={18} />
          New Service
        </button>
      </div>

      {bookingLink && services.length > 0 && (
        <div className="bg-[var(--av-primary)]/5 border border-[var(--av-primary)]/20 rounded-xl p-4 mb-6 flex items-center gap-3">
          <Calendar size={20} className="text-[var(--av-primary)]" />
          <div className="flex-1">
            <p className="text-sm font-medium text-black">Your public booking page</p>
            <a href={bookingLink} target="_blank" rel="noreferrer" className="text-sm text-[var(--av-primary)] hover:underline">
              {bookingLink}
            </a>
          </div>
        </div>
      )}

      {services.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No services yet"
          description="Add a service so customers can book it on your public page"
          action={{ label: 'New Service', onClick: openCreate }}
          gamified
          hint="Your services catalog powers your public booking page. Add one and customers can schedule you directly."
          tip="Name the service, set a duration and price — the booking calendar fills in automatically."
        />
      ) : (
        <>
          <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
              <input
                type="text"
                placeholder="Search services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(s => (
              <div key={s.id} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: (s.color || SERVICE_COLORS[0]) + '1A' }}>
                    <Tag size={20} style={{ color: s.color || SERVICE_COLORS[0] }} />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(s)} className="p-2 hover:bg-black/5 rounded-lg transition" title="Edit">
                      <Edit size={16} className="text-black/60" />
                    </button>
                    <button onClick={() => remove(s)} className="p-2 hover:bg-[var(--av-danger-soft)] rounded-lg transition" title="Delete">
                      <Trash2 size={16} className="text-[var(--av-danger)]" />
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-black mb-1">{s.name}</h3>
                {s.description && <p className="text-sm text-black/60 mb-3 line-clamp-2">{s.description}</p>}
                <div className="flex items-center gap-4 text-sm text-black/60">
                  <span className="flex items-center gap-1">
                    <Clock size={14} /> {s.duration_minutes} min
                  </span>
                  {s.price != null && (
                    <span className="font-medium text-black/80">
                      ₦{Number(s.price).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-black/5 flex items-center justify-between">
                  <button
                    onClick={() => toggleActive(s)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                      s.is_active
                        ? 'bg-[var(--av-success)]/10 text-[var(--av-success)]'
                        : 'bg-black/5 text-black/40'
                    }`}
                  >
                    {s.is_active ? 'Visible to bookers' : 'Hidden'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Service' : 'New Service'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Service Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              placeholder="e.g., Consultation, Viewing, Haircut"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              placeholder="What does this service include?"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Duration (min) *</label>
              <input
                type="number"
                required
                min="5"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Price (₦)</label>
              <input
                type="number"
                min="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {SERVICE_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full transition ${form.color === c ? 'ring-2 ring-offset-2 ring-black/40' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="rounded"
            />
            Visible to bookers on the public page
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
              {editing ? 'Save Changes' : 'Create Service'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
