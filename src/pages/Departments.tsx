import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { 
  Building2, Users, Plus, X, Edit3, Trash2,
  Briefcase, Search
} from 'lucide-react'

type Department = {
  id: string
  business_id: string
  name: string
  code: string | null
  description: string | null
  parent_id: string | null
  created_at: string
}

type Team = {
  id: string
  business_id: string
  department_id: string | null
  name: string
  code: string | null
  description: string | null
  created_at: string
}

type Position = {
  id: string
  business_id: string
  department_id: string | null
  title: string
  level: string
  description: string | null
  created_at: string
}

const LEVELS = ['entry', 'mid', 'senior', 'lead', 'manager', 'director', 'executive']

export default function Departments() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  
  const [loading, setLoading] = useState(true)
  const [departments, setDepartments] = useState<Department[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [view, setView] = useState<'departments' | 'teams' | 'positions'>('departments')
  
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<'department' | 'team' | 'position'>('department')
  const [editingItem, setEditingItem] = useState<any>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    parent_id: '',
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
      const [deptResult, teamResult, posResult] = await Promise.all([
        supabase.from('departments').select('*').eq('business_id', staff.business_id),
        supabase.from('teams').select('*').eq('business_id', staff.business_id),
        supabase.from('positions').select('*').eq('business_id', staff.business_id),
      ])

      setDepartments(deptResult.data || [])
      setTeams(teamResult.data || [])
      setPositions(posResult.data || [])
    } catch (error) {
      console.error('Failed to load data:', error)
      showToast('Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const openAddModal = (type: 'department' | 'team' | 'position') => {
    setModalType(type)
    setEditingItem(null)
    setFormData({ name: '', code: '', description: '', parent_id: '' })
    setShowModal(true)
  }

  const openEditModal = (type: 'department' | 'team' | 'position', item: any) => {
    setModalType(type)
    setEditingItem(item)
    setFormData({
      name: item.name || item.title || '',
      code: item.code || item.level || '',
      description: item.description || '',
      parent_id: item.parent_id || item.department_id || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!formData.name || !staff?.business_id) {
      showToast('Name is required', 'error')
      return
    }

    try {
      if (modalType === 'department') {
        if (editingItem) {
          const { error } = await supabase
            .from('departments')
            .update({
              name: formData.name,
              code: formData.code || null,
              description: formData.description || null,
              parent_id: formData.parent_id || null,
            })
            .eq('id', editingItem.id)
          if (error) throw error
          showToast('Department updated', 'success')
        } else {
          const { error } = await supabase
            .from('departments')
            .insert({
              business_id: staff.business_id,
              name: formData.name,
              code: formData.code || null,
              description: formData.description || null,
              parent_id: formData.parent_id || null,
            })
          if (error) throw error
          showToast('Department created', 'success')
        }
      } else if (modalType === 'team') {
        if (editingItem) {
          const { error } = await supabase
            .from('teams')
            .update({
              name: formData.name,
              code: formData.code || null,
              description: formData.description || null,
              department_id: formData.parent_id || null,
            })
            .eq('id', editingItem.id)
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
              department_id: formData.parent_id || null,
            })
          if (error) throw error
          showToast('Team created', 'success')
        }
      } else if (modalType === 'position') {
        if (editingItem) {
          const { error } = await supabase
            .from('positions')
            .update({
              title: formData.name,
              level: formData.code || 'mid',
              description: formData.description || null,
              department_id: formData.parent_id || null,
            })
            .eq('id', editingItem.id)
          if (error) throw error
          showToast('Position updated', 'success')
        } else {
          const { error } = await supabase
            .from('positions')
            .insert({
              business_id: staff.business_id,
              title: formData.name,
              level: formData.code || 'mid',
              description: formData.description || null,
              department_id: formData.parent_id || null,
            })
          if (error) throw error
          showToast('Position created', 'success')
        }
      }

      setShowModal(false)
      loadData()
    } catch (error) {
      console.error('Failed to save:', error)
      showToast('Failed to save', 'error')
    }
  }

  async function handleDelete(type: string, id: string) {
    if (!confirm('Are you sure you want to delete this?')) return

    try {
      const { error } = await supabase.from(type).delete().eq('id', id)
      if (error) throw error
      showToast('Deleted successfully', 'success')
      loadData()
    } catch (error) {
      console.error('Failed to delete:', error)
      showToast('Failed to delete', 'error')
    }
  }

  const getDepartmentName = (id: string | null) => {
    if (!id) return '-'
    const dept = departments.find(d => d.id === id)
    return dept?.name || '-'
  }

  const getTeamCount = (departmentId: string) => {
    return teams.filter(t => t.department_id === departmentId).length
  }

  if (loading) {
    return (
      <div className="max-w-6xl">
        <h1 className="text-xl font-medium text-black mb-6">Departments & Teams</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-xl"></div>)}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium text-black">Departments & Teams</h1>
        <div className="flex gap-2">
          <button
            onClick={() => openAddModal('department')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#202124] text-white text-sm font-medium"
          >
            <Plus size={18} /> Add Department
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-black/10 p-1 rounded-xl w-fit">
        <button
          onClick={() => setView('departments')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'departments' ? 'bg-white shadow-sm' : 'text-black'}`}
        >
          Departments
        </button>
        <button
          onClick={() => setView('teams')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'teams' ? 'bg-white shadow-sm' : 'text-black'}`}
        >
          Teams
        </button>
        <button
          onClick={() => setView('positions')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'positions' ? 'bg-white shadow-sm' : 'text-black'}`}
        >
          Positions
        </button>
      </div>

      {/* Departments View */}
      {view === 'departments' && (
        <div className="space-y-3">
          {departments.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-black/[0.06] text-center">
              <Building2 size={48} className="mx-auto mb-4 text-black/50" />
              <h3 className="font-semibold mb-2">No departments yet</h3>
              <p className="text-sm text-black mb-4">Create your first department to organize your team</p>
              <button
                onClick={() => openAddModal('department')}
                className="px-4 py-2 rounded-lg bg-[#202124] text-white text-sm font-medium"
              >
                Add Department
              </button>
            </div>
          ) : (
            departments.map(dept => (
              <div key={dept.id} className="bg-white rounded-2xl p-5 border border-black/[0.06]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white">
                      <Building2 size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{dept.name}</h3>
                        {dept.code && (
                          <span className="px-2 py-0.5 rounded bg-black/10 text-xs text-black">{dept.code}</span>
                        )}
                      </div>
                      {dept.description && (
                        <p className="text-sm text-black mt-0.5">{dept.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-medium">{getTeamCount(dept.id)}</div>
                      <div className="text-xs text-black">Teams</div>
                    </div>
                    <button
                      onClick={() => openEditModal('department', dept)}
                      className="p-2 hover:bg-black/10 rounded-lg"
                    >
                      <Edit3 size={18} className="text-black" />
                    </button>
                    <button
                      onClick={() => handleDelete('departments', dept.id)}
                      className="p-2 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={18} className="text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Teams View */}
      {view === 'teams' && (
        <div className="space-y-3">
          <div className="flex justify-end mb-3">
            <button
              onClick={() => openAddModal('team')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#202124] text-white text-sm font-medium"
            >
              <Plus size={18} /> Add Team
            </button>
          </div>
          {teams.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-black/[0.06] text-center">
              <Users size={48} className="mx-auto mb-4 text-black/50" />
              <h3 className="font-semibold mb-2">No teams yet</h3>
              <p className="text-sm text-black">Create teams to organize your staff</p>
            </div>
          ) : (
            teams.map(team => (
              <div key={team.id} className="bg-white rounded-2xl p-5 border border-black/[0.06]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                      <Users size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{team.name}</h3>
                        {team.code && (
                          <span className="px-2 py-0.5 rounded bg-black/10 text-xs text-black">{team.code}</span>
                        )}
                      </div>
                      <p className="text-sm text-black mt-0.5">
                        {getDepartmentName(team.department_id)}
                        {team.description && ` - ${team.description}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal('team', team)}
                      className="p-2 hover:bg-black/10 rounded-lg"
                    >
                      <Edit3 size={18} className="text-black" />
                    </button>
                    <button
                      onClick={() => handleDelete('teams', team.id)}
                      className="p-2 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={18} className="text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Positions View */}
      {view === 'positions' && (
        <div className="space-y-3">
          <div className="flex justify-end mb-3">
            <button
              onClick={() => openAddModal('position')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#202124] text-white text-sm font-medium"
            >
              <Plus size={18} /> Add Position
            </button>
          </div>
          {positions.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-black/[0.06] text-center">
              <Briefcase size={48} className="mx-auto mb-4 text-black/50" />
              <h3 className="font-semibold mb-2">No positions yet</h3>
              <p className="text-sm text-black">Create positions for your organization</p>
            </div>
          ) : (
            positions.map(pos => (
              <div key={pos.id} className="bg-white rounded-2xl p-5 border border-black/[0.06]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
                      <Briefcase size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{pos.title}</h3>
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs capitalize">{pos.level}</span>
                      </div>
                      <p className="text-sm text-black mt-0.5">
                        {getDepartmentName(pos.department_id) || 'No department'}
                        {pos.description && ` - ${pos.description}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal('position', pos)}
                      className="p-2 hover:bg-black/10 rounded-lg"
                    >
                      <Edit3 size={18} className="text-black" />
                    </button>
                    <button
                      onClick={() => handleDelete('positions', pos.id)}
                      className="p-2 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={18} className="text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/100 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-black/10 flex items-center justify-between">
              <h3 className="font-bold text-lg">
                {editingItem ? 'Edit' : 'Add'} {modalType === 'department' ? 'Department' : modalType === 'team' ? 'Team' : 'Position'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-black/10 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {modalType === 'position' ? 'Title' : 'Name'} *
                </label>
                <input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder={`Enter ${modalType === 'position' ? 'title' : 'name'}`}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {modalType === 'position' ? 'Level' : 'Code'}
                </label>
                {modalType === 'position' ? (
                  <select
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10"
                  >
                    <option value="">Select level</option>
                    {LEVELS.map(level => (
                      <option key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    placeholder="e.g. ENG, SALES"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {modalType === 'team' ? 'Department' : 'Parent Department'}
                </label>
                <select
                  value={formData.parent_id}
                  onChange={e => setFormData({ ...formData, parent_id: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10"
                >
                  <option value="">None</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder="Optional description"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 resize-none"
                />
              </div>
            </div>
            <div className="p-4 border-t border-black/10 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-3 rounded-xl bg-[#202124] text-white font-medium"
              >
                {editingItem ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
