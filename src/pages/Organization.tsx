import { useState, useEffect } from 'react'
import {
  Building2, Users, Plus, Edit2, Trash2, ChevronRight,
  ChevronDown, User, MoreHorizontal, Search, RefreshCw,
  UserPlus, Briefcase, Crown, X, Check, Filter
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface Department {
  id: string
  name: string
  code: string
  parent_id: string | null
  head_id: string | null
  color: string
  description: string
  staff?: any[]
  teams?: Team[]
}

interface Team {
  id: string
  name: string
  code: string
  department_id: string
  lead_id: string
  color: string
  staff?: any[]
}

interface Position {
  id: string
  title: string
  level: string
  department_id: string
}

export default function OrganizationPage() {
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'
  const [departments, setDepartments] = useState<Department[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState<'dept' | 'team' | null>(null)
  const [editingItem, setEditingItem] = useState<any>(null)

  useEffect(() => {
    loadData()
  }, [staff?.business_id])

  async function loadData() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      // Load departments
      const { data: depts } = await supabase
        .from('departments')
        .select('*')
        .eq('business_id', staff.business_id)
        .eq('is_active', true)
        .order('name')

      // Load teams
      const { data: tm } = await supabase
        .from('teams')
        .select('*')
        .eq('business_id', staff.business_id)
        .eq('is_active', true)
        .order('name')

      // Load staff assignments with staff details
      const { data: assignments } = await supabase
        .from('staff_assignments')
        .select('*, staff:staff(id, full_name, email, avatar_url)')
        .eq('is_active', true)

      // Group staff by department and team
      const staffByDept: Record<string, any[]> = {}
      const staffByTeam: Record<string, any[]> = {}

      assignments?.forEach(a => {
        if (a.department_id) {
          if (!staffByDept[a.department_id]) staffByDept[a.department_id] = []
          staffByDept[a.department_id].push(a.staff)
        }
        if (a.team_id) {
          if (!staffByTeam[a.team_id]) staffByTeam[a.team_id] = []
          staffByTeam[a.team_id].push(a.staff)
        }
      })

      // Attach staff to departments
      const deptsWithStaff = depts?.map(d => ({
        ...d,
        staff: staffByDept[d.id] || [],
        teams: tm?.filter(t => t.department_id === d.id) || []
      })) || []

      setDepartments(deptsWithStaff)
      setTeams(tm || [])
    } catch (e) {
      console.error('Failed to load org data:', e)
    } finally {
      setLoading(false)
    }
  }

  function toggleDept(id: string) {
    const newExpanded = new Set(expandedDepts)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedDepts(newExpanded)
  }

  async function handleSaveDept(data: Partial<Department>) {
    if (!staff?.business_id) return

    try {
      if (editingItem) {
        await supabase.from('departments').update(data).eq('id', editingItem.id)
      } else {
        await supabase.from('departments').insert({
          ...data,
          business_id: staff.business_id
        })
      }
      setShowModal(null)
      setEditingItem(null)
      loadData()
    } catch (e) {
      console.error('Failed to save department:', e)
    }
  }

  async function handleSaveTeam(data: Partial<Team>) {
    if (!staff?.business_id) return

    try {
      if (editingItem) {
        await supabase.from('teams').update(data).eq('id', editingItem.id)
      } else {
        await supabase.from('teams').insert({
          ...data,
          business_id: staff.business_id
        })
      }
      setShowModal(null)
      setEditingItem(null)
      loadData()
    } catch (e) {
      console.error('Failed to save team:', e)
    }
  }

  async function handleDelete(type: 'dept' | 'team', id: string) {
    if (!confirm(`Delete this ${type}? Staff will be unassigned.`)) return

    try {
      const table = type === 'dept' ? 'departments' : 'teams'
      await supabase.from(table).update({ is_active: false }).eq('id', id)
      loadData()
    } catch (e) {
      console.error('Failed to delete:', e)
    }
  }

  const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#EF4444']

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Building2 size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Organization</h1>
            <p className="text-sm text-black/50">Manage departments and teams</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => { setEditingItem(null); setShowModal('dept') }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm"
            >
              <Plus size={16} />
              Add Department
            </button>
            <button
              onClick={() => { setEditingItem(null); setShowModal('team') }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-black/10 text-sm"
            >
              <Users size={16} />
              Add Team
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Departments" value={departments.length} icon={<Building2 size={18} />} color="bg-violet-500" />
        <StatCard title="Teams" value={teams.length} icon={<Users size={18} />} color="bg-emerald-500" />
        <StatCard 
          title="Total Staff" 
          value={departments.reduce((sum, d) => sum + (d.staff?.length || 0), 0)} 
          icon={<User size={18} />} 
          color="bg-blue-500" 
        />
        <StatCard title="Managers" value={departments.filter(d => d.head_id).length} icon={<Crown size={18} />} color="bg-amber-500" />
      </div>

      {/* Organization Tree */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        <div className="p-4 border-b border-black/[0.06]">
          <h2 className="font-semibold">Organization Structure</h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-black/40">
            <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
            Loading...
          </div>
        ) : departments.length === 0 ? (
          <div className="p-12 text-center text-black/40">
            <Building2 size={48} className="mx-auto mb-4 text-black/20" />
            <p className="font-medium mb-2">No departments yet</p>
            <p className="text-sm">Create your first department to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {departments.map(dept => (
              <DepartmentRow
                key={dept.id}
                department={dept}
                isExpanded={expandedDepts.has(dept.id)}
                onToggle={() => toggleDept(dept.id)}
                onEdit={() => { setEditingItem(dept); setShowModal('dept') }}
                onDelete={() => handleDelete('dept', dept.id)}
                onEditTeam={(team) => { setEditingItem(team); setShowModal('team') }}
                onDeleteTeam={(id) => handleDelete('team', id)}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Department Modal */}
      {showModal === 'dept' && (
        <OrgModal
          type="department"
          data={editingItem}
          onSave={handleSaveDept}
          onClose={() => { setShowModal(null); setEditingItem(null) }}
          colors={colors}
          departments={departments}
        />
      )}

      {/* Add/Edit Team Modal */}
      {showModal === 'team' && (
        <OrgModal
          type="team"
          data={editingItem}
          onSave={handleSaveTeam}
          onClose={() => { setShowModal(null); setEditingItem(null) }}
          colors={colors}
          departments={departments}
        />
      )}
    </div>
  )
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center text-white mb-3`}>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-black/50">{title}</div>
    </div>
  )
}

function DepartmentRow({ 
  department, isExpanded, onToggle, onEdit, onDelete, onEditTeam, onDeleteTeam, isAdmin 
}: { 
  department: Department
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onEditTeam: (team: Team) => void
  onDeleteTeam: (id: string) => void
  isAdmin: boolean
}) {
  const teamCount = department.teams?.length || 0
  const staffCount = department.staff?.length || 0

  return (
    <div>
      <div className="flex items-center gap-4 p-4 hover:bg-black/[0.02]">
        {/* Expand Button */}
        <button onClick={onToggle} className="p-1 hover:bg-black/5 rounded">
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {/* Color Dot */}
        <div 
          className="w-4 h-4 rounded-full shrink-0" 
          style={{ backgroundColor: department.color || '#6366F1' }} 
        />

        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
          <Building2 size={18} className="text-violet-500" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium">{department.name}</div>
          <div className="flex items-center gap-2 text-sm text-black/50">
            <span>{department.code}</span>
            {department.head_id && <span>• Manager assigned</span>}
          </div>
        </div>

        {/* Stats */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          <div className="text-center">
            <div className="font-medium">{teamCount}</div>
            <div className="text-black/50">Teams</div>
          </div>
          <div className="text-center">
            <div className="font-medium">{staffCount}</div>
            <div className="text-black/50">Staff</div>
          </div>
        </div>

        {/* Actions */}
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="p-2 hover:bg-black/5 rounded-lg">
              <Edit2 size={16} className="text-black/50" />
            </button>
            <button onClick={onDelete} className="p-2 hover:bg-red-50 rounded-lg">
              <Trash2 size={16} className="text-red-500" />
            </button>
          </div>
        )}
      </div>

      {/* Expanded: Teams */}
      {isExpanded && department.teams && department.teams.length > 0 && (
        <div className="pl-16 pr-4 pb-4 bg-black/[0.02]">
          <div className="space-y-2">
            {department.teams.map(team => (
              <TeamRow
                key={team.id}
                team={team}
                onEdit={() => onEditTeam(team)}
                onDelete={() => onDeleteTeam(team.id)}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TeamRow({ team, onEdit, onDelete, isAdmin }: { team: Team; onEdit: () => void; onDelete: () => void; isAdmin: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-black/[0.06]">
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color || '#10B981' }} />
      <Users size={16} className="text-emerald-500" />
      <div className="flex-1 font-medium text-sm">{team.name}</div>
      {team.code && <span className="text-xs text-black/40">{team.code}</span>}
      {isAdmin && (
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-1 hover:bg-black/5 rounded">
            <Edit2 size={14} className="text-black/40" />
          </button>
          <button onClick={onDelete} className="p-1 hover:bg-red-50 rounded">
            <Trash2 size={14} className="text-red-400" />
          </button>
        </div>
      )}
    </div>
  )
}

function OrgModal({ 
  type, data, onSave, onClose, colors, departments 
}: { 
  type: 'department' | 'team'
  data: any
  onSave: (d: any) => void
  onClose: () => void
  colors: string[]
  departments: Department[]
}) {
  const [form, setForm] = useState({
    name: data?.name || '',
    code: data?.code || '',
    color: data?.color || colors[0],
    parent_id: data?.parent_id || '',
    description: data?.description || '',
    department_id: data?.department_id || '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave(type === 'department' 
      ? { name: form.name, code: form.code, color: form.color, parent_id: form.parent_id || null, description: form.description }
      : { name: form.name, code: form.code, color: form.color, department_id: form.department_id || null }
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-black/[0.06]">
          <h2 className="text-lg font-bold">
            {data ? 'Edit' : 'Add'} {type === 'department' ? 'Department' : 'Team'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10"
              placeholder={`Enter ${type} name`}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Code</label>
            <input
              type="text"
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="w-full px-4 py-3 rounded-xl border border-black/10"
              placeholder={`e.g., ${type === 'department' ? 'HR' : 'TEAM-A'}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Color</label>
            <div className="flex gap-2">
              {colors.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full ${form.color === c ? 'ring-2 ring-offset-2 ring-black/20' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {type === 'department' && (
            <div>
              <label className="block text-sm font-medium mb-2">Parent Department (Optional)</label>
              <select
                value={form.parent_id}
                onChange={e => setForm({ ...form, parent_id: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10"
              >
                <option value="">None (Top Level)</option>
                {departments.filter(d => d.id !== data?.id).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          {type === 'team' && (
            <div>
              <label className="block text-sm font-medium mb-2">Department</label>
              <select
                value={form.department_id}
                onChange={e => setForm({ ...form, department_id: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10"
                required
              >
                <option value="">Select Department</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          {type === 'department' && (
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10 resize-none"
                rows={3}
              />
            </div>
          )}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium">
              Cancel
            </button>
            <button type="submit" className="flex-1 px-4 py-3 rounded-xl bg-[var(--avenize-primary)] text-white font-medium">
              {data ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
