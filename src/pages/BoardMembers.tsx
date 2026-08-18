// Board Members — governance roster (migration 20260818330000).
// Separate from operational staff (People.tsx): board members oversee the
// business (directors, chair, secretary) but do not get a staff row / app login.
// Owner/admin-gated by RLS (board_members policies). Client role check is UX
// only — RLS is the real boundary.

import { useEffect, useState } from 'react'
import { Plus, Users, Mail, Phone, Trash2, X, Briefcase, Calendar } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  fetchBoardMembers,
  saveBoardMember,
  deleteBoardMember,
  type BoardMember,
  type BoardTitle,
} from '../lib/businessOS'

const TITLES: BoardTitle[] = ['Chair', 'Vice Chair', 'Director', 'Secretary', 'Treasurer', 'Member', 'Observer']

const TITLE_COLORS: Record<BoardTitle, string> = {
  Chair: '#155BB4',
  'Vice Chair': '#155BB4',
  Director: '#5F6368',
  Secretary: '#8B5CF6',
  Treasurer: '#34A853',
  Member: '#5F6368',
  Observer: '#9AA0A6',
}

export default function BoardMembers() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [members, setMembers] = useState<BoardMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BoardMember | null>(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    title: 'Director' as BoardTitle,
    bio: '',
    term_start: '',
    term_end: '',
  })

  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    if (!staff?.business_id) return
    setLoading(true)
    const data = await fetchBoardMembers(staff.business_id)
    setMembers(data)
    setLoading(false)
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', email: '', phone: '', title: 'Director', bio: '', term_start: '', term_end: '' })
    setShowForm(true)
  }

  const openEdit = (m: BoardMember) => {
    setEditing(m)
    setForm({
      name: m.name,
      email: m.email || '',
      phone: m.phone || '',
      title: m.title,
      bio: m.bio || '',
      term_start: m.term_start || '',
      term_end: m.term_end || '',
    })
    setShowForm(true)
  }

  const submit = async () => {
    if (!form.name.trim()) {
      showToast('Name is required.', 'error')
      return
    }
    if (!staff?.business_id) return
    const ok = await saveBoardMember(staff.business_id, {
      ...(editing ? { id: editing.id } : {}),
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      title: form.title,
      bio: form.bio.trim() || null,
      term_start: form.term_start || null,
      term_end: form.term_end || null,
      is_active: editing?.is_active ?? true,
    })
    if (ok) {
      showToast(editing ? 'Board member updated.' : 'Board member added.', 'success')
      setShowForm(false)
      await load()
    } else {
      showToast('Could not save board member.', 'error')
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this board member?')) return
    const ok = await deleteBoardMember(id)
    if (ok) {
      showToast('Board member removed.', 'success')
      await load()
    } else {
      showToast('Could not remove board member.', 'error')
    }
  }

  const active = members.filter(m => m.is_active)
  const inactive = members.filter(m => !m.is_active)

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="text-center py-16">
          <Users size={40} className="mx-auto mb-4" style={{ color: 'var(--av-text-muted, #9AA0A6)' }} />
          <h2 className="text-lg font-semibold mb-2">Owner or admin access required</h2>
          <p className="text-sm" style={{ color: 'var(--av-text-muted, #5F6368)' }}>
            Only business owners and admins can manage the board roster.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--av-text, #202124)' }}>Board & Directors</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--av-text-muted, #5F6368)' }}>
            Governance roster — directors, chair, and officers overseeing the business.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm font-medium"
        >
          <Plus size={16} />
          Add Member
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <div className="flex items-center gap-2 text-sm mb-1" style={{ color: 'var(--av-text, #202124)' }}>
            <Users size={16} />
            <span>Active</span>
          </div>
          <p className="text-2xl font-bold">{active.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <div className="flex items-center gap-2 text-sm mb-1" style={{ color: 'var(--av-text, #202124)' }}>
            <Briefcase size={16} />
            <span>Directors</span>
          </div>
          <p className="text-2xl font-bold">{active.filter(m => m.title === 'Director').length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <div className="flex items-center gap-2 text-sm mb-1" style={{ color: 'var(--av-text, #202124)' }}>
            <Calendar size={16} />
            <span>With Terms</span>
          </div>
          <p className="text-2xl font-bold">{active.filter(m => m.term_start || m.term_end).length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <div className="flex items-center gap-2 text-sm mb-1" style={{ color: 'var(--av-text, #202124)' }}>
            <Mail size={16} />
            <span>With Contact</span>
          </div>
          <p className="text-2xl font-bold">{active.filter(m => m.email || m.phone).length}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm" style={{ color: 'var(--av-text-muted, #5F6368)' }}>Loading...</div>
      ) : active.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-black/[0.06]">
          <Users size={40} className="mx-auto mb-4" style={{ color: 'var(--av-text-muted, #9AA0A6)' }} />
          <h3 className="text-base font-semibold mb-1">No board members yet</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--av-text-muted, #5F6368)' }}>
            Add directors, a chair, secretary, and treasurer to your governance roster.
          </p>
          <button onClick={openCreate} className="px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm font-medium">
            Add First Member
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {active.map(m => (
            <div key={m.id} className="bg-white rounded-xl border border-black/[0.06] p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{m.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${TITLE_COLORS[m.title]}14`, color: TITLE_COLORS[m.title] }}>
                      {m.title}
                    </span>
                  </div>
                  {m.bio && <p className="text-xs mb-2" style={{ color: 'var(--av-text-muted, #5F6368)' }}>{m.bio}</p>}
                  <div className="flex flex-wrap gap-3 text-xs" style={{ color: 'var(--av-text-muted, #5F6368)' }}>
                    {m.email && (
                      <span className="flex items-center gap-1"><Mail size={12} /> {m.email}</span>
                    )}
                    {m.phone && (
                      <span className="flex items-center gap-1"><Phone size={12} /> {m.phone}</span>
                    )}
                    {(m.term_start || m.term_end) && (
                      <span className="flex items-center gap-1"><Calendar size={12} /> {m.term_start || '—'} to {m.term_end || 'present'}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => openEdit(m)} className="p-1.5 rounded text-xs" style={{ color: 'var(--av-text-muted, #5F6368)' }} title="Edit">
                    <Briefcase size={14} />
                  </button>
                  <button onClick={() => remove(m.id)} className="p-1.5 rounded text-xs" style={{ color: 'var(--av-danger, #EA4335)' }} title="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--av-text-muted, #5F6368)' }}>Former Members ({inactive.length})</h3>
          <div className="space-y-2">
            {inactive.map(m => (
              <div key={m.id} className="flex items-center justify-between bg-white rounded-lg border border-black/[0.06] px-4 py-2 opacity-60">
                <div>
                  <span className="text-sm">{m.name}</span>
                  <span className="text-xs ml-2" style={{ color: 'var(--av-text-muted, #5F6368)' }}>{m.title}</span>
                </div>
                <button onClick={() => openEdit(m)} className="text-xs" style={{ color: 'var(--av-text-muted, #5F6368)' }}>Reactivate</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editing ? 'Edit Board Member' : 'Add Board Member'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--av-text-muted, #5F6368)' }}>Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="Full name" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--av-text-muted, #5F6368)' }}>Title</label>
                <select value={form.title} onChange={e => setForm({ ...form, title: e.target.value as BoardTitle })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm">
                  {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--av-text-muted, #5F6368)' }}>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="director@company.com" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--av-text-muted, #5F6368)' }}>Phone</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="+234..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--av-text-muted, #5F6368)' }}>Term Start</label>
                  <input type="date" value={form.term_start} onChange={e => setForm({ ...form, term_start: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--av-text-muted, #5F6368)' }}>Term End</label>
                  <input type="date" value={form.term_end} onChange={e => setForm({ ...form, term_end: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--av-text-muted, #5F6368)' }}>Bio</label>
                <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={2} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" placeholder="Brief background..." />
              </div>
              {editing && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                  Active member
                </label>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 rounded-lg border border-black/10 text-sm">Cancel</button>
              <button onClick={submit} className="flex-1 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm">{editing ? 'Save' : 'Add Member'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
