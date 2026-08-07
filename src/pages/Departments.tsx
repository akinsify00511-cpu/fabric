import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Building2, Users, Plus, X, Edit3, Trash2,
  Search
} from 'lucide-react'

type Team = {
  id: string
  business_id: string
  name: string
  code: string | null
  description: string | null
  head_id: string | null
  member_count: number
  created_at: string
}

export default function Departments() {
  const { staff } = useAuth()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<Team[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
  })

  useEffect(() => {
    loadData()
  }, [staff?.business_id])

  async function loadData() {
    if (!staff?.business_id) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('name')

      if (error) throw error

      setTeams((data || []).map((t: any) => ({ ...t, member_count: 0 })))
    } catch (error) {
      console.error('Failed to load teams:', error)
      showToast('Failed to load teams', 'error')
    } finally {
      setLoading(false)
    }
  }

  const openAddModal = () => {
    setEditingTeam(null)
    setFormData({ name: '', code: '', description: '' })
    setShowModal(true)
  }

  const openEditModal = (team: Team) => {
    setEditingTeam(team)
    setFormData({
      name: team.name,
      code: team.code || '',
      description: team.description || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!formData.name || !staff?.business_id) {
      showToast('Team name is required', 'error')
      return
    }

    try {
      if (editingTeam) {
        const { error } = await supabase
          .from('teams')
          .update({
            name: formData.name,
            code: formData.code || null,
            description: formData.description || null,
          })
          .eq('id', editingTeam.id)
        if (error) throw error
        showToast('Team updated', 'success')
      } else {
        const { error } = await supabase
          .from('teams')
          .insert({
            business_id: staff.business_id,
            name: formData.name,
            code: formData.code || null,
            description: formData.description || null,
          })
        if (error) throw error
        showToast('Team created', 'success')
      }

      setShowModal(false)
      loadData()
    } catch (error) {
      console.error('Failed to save:', error)
      showToast('Failed to save team', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this team?')) return

    try {
      const { error } = await supabase.from('teams').delete().eq('id', id)
      if (error) throw error
      showToast('Team deleted', 'success')
      loadData()
    } catch (error) {
      console.error('Failed to delete:', error)
      showToast('Failed to delete team', 'error')
    }
  }

  const filteredTeams = teams.filter(team =>
    team.name.toLowerCase().includes(search.toLowerCase()) ||
    team.code?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-xl font-semibold text-black mb-6">Teams</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-xl"></div>)}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-black">Teams</h1>
          <p className="text-sm text-black mt-1">Organize your team into groups</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-text)] text-white text-sm font-medium"
        >
          <Plus size={18} /> Add Team
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
        <input
          type="text"
          placeholder="Search teams..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </div>

      {/* Teams List */}
      {filteredTeams.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-black/10 text-center">
          <Building2 size={48} className="mx-auto mb-4 text-black/50" />
          <h3 className="font-semibold mb-2">No teams yet</h3>
          <p className="text-sm text-black mb-4">Create teams to organize your workforce</p>
          <button
            onClick={openAddModal}
            className="px-4 py-2 rounded-lg bg-[var(--av-text)] text-white text-sm font-medium"
          >
            Create Team
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTeams.map(team => (
            <div key={team.id} className="bg-white rounded-2xl p-5 border border-black/10 hover:border-black/20 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white">
                    <Users size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-black">{team.name}</h3>
                      {team.code && (
                        <span className="px-2 py-0.5 rounded bg-black/10 text-xs text-black">{team.code}</span>
                      )}
                    </div>
                    {team.description && (
                      <p className="text-sm text-black mt-0.5">{team.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => openEditModal(team)}
                    className="p-2 hover:bg-black/5 rounded-lg"
                  >
                    <Edit3 size={18} className="text-black" />
                  </button>
                  <button
                    onClick={() => handleDelete(team.id)}
                    className="p-2 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={18} className="text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-black">
                {editingTeam ? 'Edit Team' : 'Add Team'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-black/5 rounded-lg">
                <X size={20} className="text-black" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1.5">Team Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Sales, Engineering, Marketing"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1.5">Code (optional)</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., SAL, ENG, MKT"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1.5">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the team..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/10 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-black hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--av-text)] text-white text-sm font-medium"
              >
                {editingTeam ? 'Save Changes' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
