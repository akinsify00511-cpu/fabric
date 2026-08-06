import { useState, useEffect } from 'react'
import {
  Megaphone, Plus, Pin, Clock, User, Check, X,
  AlertTriangle, Info, AlertCircle, RefreshCw,
  Eye, EyeOff, Trash2, Edit2, ChevronDown
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface Announcement {
  id: string
  title: string
  content: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  target_type: 'all' | 'department' | 'team' | 'role' | 'individual'
  target_ids: string[]
  is_pinned: boolean
  is_dismissible: boolean
  start_date: string
  end_date: string | null
  status: 'draft' | 'active' | 'archived'
  view_count: number
  author: any
  created_at: string
  views?: { viewed_at: string; dismissed: boolean }[]
}

interface UserAnnouncement extends Announcement {
  is_viewed: boolean
  is_dismissed: boolean
}

export default function AnnouncementsPage() {
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [userAnnouncements, setUserAnnouncements] = useState<UserAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'draft'>('active')

  useEffect(() => {
    loadData()
  }, [staff?.business_id, staff?.id])

  async function loadData() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      // Load announcements
      const { data: anns } = await supabase
        .from('announcements')
        .select('*, author:staff(full_name, email, avatar_url)')
        .eq('business_id', staff.business_id)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })

      // Load user's view history
      const { data: views } = await supabase
        .from('announcement_views')
        .select('*')
        .eq('staff_id', staff.id)

      const viewMap = new Map(views?.map(v => [v.announcement_id, v]) || [])

      // Combine with view status
      const userAnns: UserAnnouncement[] = (anns || []).map(a => {
        const view = viewMap.get(a.id)
        return {
          ...a,
          is_viewed: !!view,
          is_dismissed: view?.dismissed || false,
        }
      })

      if (isAdmin) {
        setAnnouncements(anns || [])
      }
      setUserAnnouncements(userAnns)
    } catch (e) {
      console.error('Failed to load announcements:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(data: Partial<Announcement>) {
    if (!staff?.business_id) return

    try {
      if (editing) {
        await supabase.from('announcements').update(data).eq('id', editing.id)
      } else {
        await supabase.from('announcements').insert({
          ...data,
          business_id: staff.business_id,
          author_id: staff.id,
          status: 'active',
        })
      }
      setShowModal(false)
      setEditing(null)
      loadData()
    } catch (e) {
      console.error('Failed to save announcement:', e)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return

    try {
      await supabase.from('announcements').delete().eq('id', id)
      loadData()
    } catch (e) {
      console.error('Failed to delete:', e)
    }
  }

  async function handleTogglePin(ann: Announcement) {
    try {
      await supabase.from('announcements').update({ is_pinned: !ann.is_pinned }).eq('id', ann.id)
      loadData()
    } catch (e) {
      console.error('Failed to toggle pin:', e)
    }
  }

  async function handleDismiss(announcementId: string) {
    try {
      await supabase.from('announcement_views').upsert({
        announcement_id: announcementId,
        staff_id: staff?.id,
        dismissed: true,
        dismissed_at: new Date().toISOString(),
      }, {
        onConflict: 'announcement_id,staff_id',
      })
      loadData()
    } catch (e) {
      console.error('Failed to dismiss:', e)
    }
  }

  async function handleMarkViewed(announcementId: string) {
    try {
      const existing = await supabase
        .from('announcement_views')
        .select('id')
        .eq('announcement_id', announcementId)
        .eq('staff_id', staff?.id)
        .single()

      if (!existing.data) {
        await supabase.from('announcement_views').insert({
          announcement_id: announcementId,
          staff_id: staff?.id,
        })
        
        // Increment view count
        const ann = announcements.find(a => a.id === announcementId)
        if (ann) {
          await supabase.from('announcements').update({
            view_count: (ann.view_count || 0) + 1
          }).eq('id', announcementId)
        }
      }
      loadData()
    } catch (e) {
      console.error('Failed to mark viewed:', e)
    }
  }

  const priorityConfig: Record<string, { bg: string; text: string; border: string; icon: any }> = {
    low: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', icon: Info },
    normal: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', icon: Info },
    high: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', icon: AlertTriangle },
    urgent: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: AlertCircle },
  }

  const filteredAnnouncements = isAdmin 
    ? announcements.filter(a => filter === 'all' || a.status === filter)
    : userAnnouncements.filter(a => 
        a.status === 'active' && 
        (filter === 'all' || !a.is_dismissed)
      )

  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
            <Megaphone size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--avenize-black)]">Announcements</h1>
            <p className="text-sm text-black/50">Company updates and notifications</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setEditing(null); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm"
          >
            <Plus size={16} />
            New Announcement
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {['all', 'active', 'draft'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
              filter === f 
                ? 'bg-[var(--avenize-primary)] text-white' 
                : 'bg-white border border-black/10'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Pinned Section */}
      {(isAdmin ? announcements : userAnnouncements).filter(a => a.is_pinned && a.status === 'active').length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-black/50 mb-3 flex items-center gap-2">
            <Pin size={14} />
            Pinned
          </h3>
          <div className="space-y-3">
            {(isAdmin ? announcements : userAnnouncements).filter(a => a.is_pinned && a.status === 'active').map(ann => (
              <AnnouncementCard
                key={ann.id}
                announcement={ann}
                isAdmin={isAdmin}
                onEdit={() => { setEditing(ann); setShowModal(true) }}
                onDelete={() => handleDelete(ann.id)}
                onTogglePin={() => handleTogglePin(ann)}
                onDismiss={() => handleDismiss(ann.id)}
                onView={() => handleMarkViewed(ann.id)}
                priorityConfig={priorityConfig}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Announcements */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-black/40">
            <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
            Loading...
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="text-center py-12 text-black/40 bg-white rounded-2xl border border-black/[0.06]">
            <Megaphone size={48} className="mx-auto mb-4 text-black/20" />
            <p className="font-medium mb-2">No announcements</p>
            <p className="text-sm">
              {isAdmin ? 'Create your first announcement' : 'No new announcements'}
            </p>
          </div>
        ) : (
          filteredAnnouncements.map(ann => (
            <AnnouncementCard
              key={ann.id}
              announcement={ann}
              isAdmin={isAdmin}
              onEdit={() => { setEditing(ann); setShowModal(true) }}
              onDelete={() => handleDelete(ann.id)}
              onTogglePin={() => handleTogglePin(ann)}
              onDismiss={() => handleDismiss(ann.id)}
              onView={() => handleMarkViewed(ann.id)}
              priorityConfig={priorityConfig}
            />
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <AnnouncementModal
          announcement={editing}
          onSave={handleCreate}
          onClose={() => { setShowModal(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function AnnouncementCard({
  announcement, isAdmin, onEdit, onDelete, onTogglePin, onDismiss, onView, priorityConfig
}: {
  announcement: Announcement | UserAnnouncement
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
  onDismiss: () => void
  onView: () => void
  priorityConfig: any
}) {
  const [expanded, setExpanded] = useState(false)
  const priority = priorityConfig[announcement.priority] || priorityConfig.normal
  const PriorityIcon = priority.icon
  const isUserAnn = announcement as any
  const isViewed = 'is_viewed' in announcement ? (announcement as any).is_viewed : false

  return (
    <div 
      className={`bg-white rounded-xl border ${priority.border} overflow-hidden ${
        !isViewed ? 'ring-2 ring-blue-100' : ''
      }`}
      onClick={() => !isViewed && onView()}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg ${priority.bg} ${priority.text} flex items-center justify-center shrink-0`}>
            <PriorityIcon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {announcement.is_pinned && <Pin size={14} className="text-amber-500 fill-amber-500" />}
              <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${priority.bg} ${priority.text}`}>
                {announcement.priority}
              </span>
              <span className="text-xs text-black/40">
                {new Date(announcement.created_at).toLocaleDateString()}
              </span>
            </div>
            <h3 className="font-semibold">{announcement.title}</h3>
            <div className="mt-2 text-sm text-black/60 whitespace-pre-wrap">
              {expanded ? announcement.content : announcement.content.slice(0, 200)}
              {announcement.content.length > 200 && !expanded && '...'}
            </div>
            {announcement.content.length > 200 && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
                className="text-sm text-[var(--avenize-primary)] mt-2"
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {announcement.author && (
              <div className="flex items-center gap-2 text-sm text-black/50">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs">
                  {announcement.author.full_name?.charAt(0) || 'U'}
                </div>
                {announcement.author.full_name}
              </div>
            )}
            {isAdmin && (
              <span className="flex items-center gap-1 text-xs text-black/40">
                <Eye size={12} />
                {announcement.view_count || 0} views
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isUserAnn && announcement.is_dismissible && !isUserAnn.is_dismissed && (
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss() }}
                className="px-3 py-1.5 rounded-lg bg-black/5 text-sm hover:bg-black/10"
              >
                Dismiss
              </button>
            )}
            {isAdmin && (
              <>
                <button onClick={onTogglePin} className="p-1.5 rounded hover:bg-black/5">
                  <Pin size={16} className={announcement.is_pinned ? 'text-amber-500' : 'text-black/30'} />
                </button>
                <button onClick={onEdit} className="p-1.5 rounded hover:bg-black/5">
                  <Edit2 size={16} className="text-black/50" />
                </button>
                <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50">
                  <Trash2 size={16} className="text-red-500" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AnnouncementModal({
  announcement, onSave, onClose
}: {
  announcement?: Announcement | null
  onSave: (d: any) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    title: announcement?.title || '',
    content: announcement?.content || '',
    priority: announcement?.priority || 'normal',
    is_pinned: announcement?.is_pinned || false,
    is_dismissible: announcement?.is_dismissible ?? true,
    start_date: announcement?.start_date?.split('T')[0] || new Date().toISOString().split('T')[0],
    end_date: announcement?.end_date?.split('T')[0] || '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      title: form.title,
      content: form.content,
      priority: form.priority,
      is_pinned: form.is_pinned,
      is_dismissible: form.is_dismissible,
      start_date: form.start_date,
      end_date: form.end_date || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-black/[0.06]">
          <h2 className="text-lg font-bold">
            {announcement ? 'Edit' : 'New'} Announcement
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10"
              placeholder="Announcement title"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Content</label>
            <textarea
              value={form.content}
              onChange={e => setForm({ ...form, content: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10 resize-none"
              rows={6}
              placeholder="Write your announcement..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value as any })}
                className="w-full px-4 py-3 rounded-xl border border-black/10"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_pinned}
                onChange={e => setForm({ ...form, is_pinned: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">Pin to top</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_dismissible}
                onChange={e => setForm({ ...form, is_dismissible: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">Can be dismissed</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium">
              Cancel
            </button>
            <button type="submit" className="flex-1 px-4 py-3 rounded-xl bg-[var(--avenize-primary)] text-white font-medium">
              {announcement ? 'Update' : 'Publish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
