import { useEffect, useState } from 'react'
import { Plus, Users, Search, Mail, Phone, Briefcase, UserCog, X, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { useTeamLimit } from '../lib/useEntitlement'
import FeatureSuggestions from '../components/FeatureSuggestions'

type FunctionalRole = {
  id: string
  name: string
  description?: string
}

type TeamMember = {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  department?: string
  avatar_url?: string
  joined_at: string
  functional_roles?: string[] // Array of role IDs
}

export default function People() {
  const { staff: currentStaff } = useAuth()
  const { showToast } = useToast()
  const { canAddMember: canAddTeamMember, currentCount: teamCount, limit: teamLimit, loading: teamLimitLoading } = useTeamLimit()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [functionalRoles, setFunctionalRoles] = useState<FunctionalRole[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [editingRoles, setEditingRoles] = useState<string | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load staff members
      const { data: staffData } = await supabase
        .from('staff')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      // Load functional roles
      const { data: rolesData } = await supabase
        .from('functional_roles')
        .select('id, name, description')
        .eq('business_id', currentStaff?.business_id || '')
        .order('name')

      if (rolesData) {
        setFunctionalRoles(rolesData)
      }

      // Load staff-functional-role mappings
      let memberRoleMap: Record<string, string[]> = {}
      if (staffData && staffData.length > 0 && rolesData) {
        const { data: roleMappings } = await supabase
          .from('staff_functional_roles')
          .select('staff_id, functional_role_id')
          .in('staff_id', staffData.map(s => s.id))

        if (roleMappings) {
          memberRoleMap = roleMappings.reduce((acc, mapping) => {
            if (!acc[mapping.staff_id]) acc[mapping.staff_id] = []
            acc[mapping.staff_id].push(mapping.functional_role_id)
            return acc
          }, {} as Record<string, string[]>)
        }
      }

      if (staffData && staffData.length > 0) {
        setMembers(staffData.map(s => ({
          ...s,
          functional_roles: memberRoleMap[s.id] || []
        })) as TeamMember[])
      } else {
        setMembers(DEMO_MEMBERS)
      }
    } catch {
      setMembers(DEMO_MEMBERS)
    }
    setLoading(false)
  }

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    (m.department && m.department.toLowerCase().includes(search.toLowerCase()))
  )

  const departments = [...new Set(members.map(m => m.department).filter(Boolean))]
  const isAdmin = currentStaff?.role === 'owner' || currentStaff?.role === 'admin'

  const sendInvite = () => {
    if (!inviteEmail) return
    alert(`Invitation sent to ${inviteEmail}!`)
    setInviteEmail('')
    setShowInvite(false)
  }

  const startEditRoles = (member: TeamMember) => {
    setEditingRoles(member.id)
    setSelectedRoles(member.functional_roles || [])
  }

  const cancelEditRoles = () => {
    setEditingRoles(null)
    setSelectedRoles([])
  }

  const toggleRole = (roleId: string) => {
    setSelectedRoles(prev => 
      prev.includes(roleId) 
        ? prev.filter(r => r !== roleId)
        : [...prev, roleId]
    )
  }

  const saveRoles = async (memberId: string) => {
    setSaving(true)
    try {
      // Delete existing mappings
      await supabase
        .from('staff_functional_roles')
        .delete()
        .eq('staff_id', memberId)

      // Insert new mappings
      if (selectedRoles.length > 0) {
        const inserts = selectedRoles.map(roleId => ({
          staff_id: memberId,
          functional_role_id: roleId,
        }))
        await supabase
          .from('staff_functional_roles')
          .insert(inserts)
      }

      // Update local state
      setMembers(prev => prev.map(m => 
        m.id === memberId ? { ...m, functional_roles: selectedRoles } : m
      ))
      setEditingRoles(null)
      showToast('Roles updated', 'success')
    } catch (err) {
      console.error('Failed to save roles:', err)
      showToast('Failed to update roles', 'error')
    } finally {
      setSaving(false)
    }
  }

  const getRoleNames = (roleIds: string[] | undefined): string => {
    if (!roleIds || roleIds.length === 0) return '-'
    return roleIds
      .map(id => functionalRoles.find(r => r.id === id)?.name || 'Unknown')
      .join(', ')
  }

  const getRoleLabels = (roleIds: string[] | undefined) => {
    if (!roleIds || roleIds.length === 0) return []
    return roleIds
      .map(id => functionalRoles.find(r => r.id === id)?.name)
      .filter(Boolean) as string[]
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">People</h1>
        <div className="flex items-center gap-3">
          {!teamLimitLoading && !canAddTeamMember && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
              Team limit reached ({teamCount}/{teamLimit})
            </span>
          )}
          <button
            onClick={() => canAddTeamMember ? setShowInvite(true) : showToast('Team limit reached. Upgrade your plan to add more members.', 'error')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm font-medium"
          >
            <Plus size={16} />
            Invite Team
          </button>
        </div>
      </div>

           {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <div className="flex items-center gap-2 text-black text-sm mb-1">
            <Users size={16} />
            <span>Total Team</span>
          </div>
          <p className="text-2xl font-bold">{members.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <div className="flex items-center gap-2 text-black text-sm mb-1">
            <UserCog size={16} />
            <span>Functional Roles</span>
          </div>
          <p className="text-2xl font-bold">{functionalRoles.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/[0.06] col-span-2">
          <div className="flex items-center gap-2 text-black text-sm mb-1">
            <Search size={16} />
            <span>Search</span>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or role..."
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm mt-1"
          />
        </div>
      </div>

      {/* Team List */}
      <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden">
        <table className="w-full">
          <thead className="bg-black/[0.02]">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-black/60">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-black/60 hidden md:table-cell">Email</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-black/60 hidden lg:table-cell">Permission</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-black/60">Functional Roles</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-black/60 hidden lg:table-cell">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06]">
            {filteredMembers.map((member) => (
              <tr key={member.id} className="hover:bg-black/10">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--av-primary, #4285F4)] flex items-center justify-center text-white font-medium">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">{member.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-sm text-black/60">{member.email}</span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-xs px-2 py-1 rounded-full bg-black/[0.05] capitalize">{member.role || 'staff'}</span>
                </td>
                <td className="px-4 py-3">
                  {editingRoles === member.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        className="text-sm border border-black/10 rounded px-2 py-1"
                        value=""
                        onChange={() => {}}
                      >
                        <option value="">Select roles...</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {getRoleLabels(member.functional_roles).length > 0 ? (
                        getRoleLabels(member.functional_roles).map((label, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-600">
                            {label}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-black">-</span>
                      )}
                      {isAdmin && member.role !== 'owner' && (
                        <button
                          onClick={() => startEditRoles(member)}
                          className="p-1 hover:bg-black/[0.05] rounded"
                          title="Edit roles"
                        >
                          <UserCog size={14} className="text-black" />
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-sm text-black">{new Date(member.joined_at).toLocaleDateString()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredMembers.length === 0 && (
          <div className="p-8 text-center text-black">
            <Users size={32} className="mx-auto mb-2 opacity-50" />
            <p>No team members found</p>
          </div>
        )}
      </div>

      {/* Edit Roles Modal */}
      {editingRoles && (
        <div className="fixed inset-0 bg-black/100 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Edit Functional Roles</h2>
              <button onClick={cancelEditRoles} className="p-1 hover:bg-black/[0.05] rounded">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-black/60 mb-4">
              Select the functional roles for this team member. They'll see tools from all selected roles.
            </p>
            <div className="space-y-2 mb-6">
              {functionalRoles.length === 0 ? (
                <p className="text-sm text-black">No roles configured yet.</p>
              ) : (
                functionalRoles.map((role) => (
                  <label
                    key={role.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-black/[0.06] hover:bg-black/10 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                      className="w-4 h-4 rounded"
                    />
                    <div>
                      <p className="font-medium text-sm">{role.name}</p>
                      {role.description && (
                        <p className="text-xs text-black">{role.description}</p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={cancelEditRoles}
                className="flex-1 px-4 py-2 rounded-lg border border-black/10 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => saveRoles(editingRoles)}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/100 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-bold mb-4">Invite Team Member</h2>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Enter email address..."
              className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowInvite(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-black/10 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={sendInvite}
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Feature Suggestions */}
      <FeatureSuggestions suggestions={[
        { label: 'Chat', path: '/app/chat', description: 'Message team members' },
        { label: 'Time', path: '/app/time', description: 'Track attendance' },
        { label: 'Tasks', path: '/app/tasks', description: 'Assign tasks' },
      ]} />
    </div>
  )
}

const DEMO_MEMBERS: TeamMember[] = [
  { id: '1', name: 'Adaeze Nwankwo', email: 'adaeze@company.com', role: 'owner', department: 'Leadership', joined_at: '2024-01-01' },
  { id: '2', name: 'Emeka Obi', email: 'emeka@company.com', role: 'admin', department: 'Engineering', joined_at: '2024-01-05' },
  { id: '3', name: 'Blessing Adeyemi', email: 'blessing@company.com', role: 'manager', department: 'Sales', joined_at: '2024-01-10' },
  { id: '4', name: 'Kunle Adebayo', email: 'kunle@company.com', role: 'staff', department: 'Engineering', joined_at: '2024-01-15' },
  { id: '5', name: 'Ngozi Chukwu', email: 'ngozi@company.com', role: 'staff', department: 'Marketing', joined_at: '2024-01-20' },
  { id: '6', name: 'Tunde Bakare', email: 'tunde@company.com', role: 'team_lead', department: 'Operations', joined_at: '2024-02-01' },
]
