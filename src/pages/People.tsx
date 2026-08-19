import { useEffect, useState } from 'react'
import { Plus, Users, Search, Mail, Phone, Briefcase, UserCog, X, Check, Copy, Clock, Trash2, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth, MEMBER_KIND_CONFIG, memberKindLabel, type MemberKind } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { useTeamLimit } from '../lib/useEntitlement'
import FeatureSuggestions from '../components/FeatureSuggestions'
import { createInvite, revokeInvite, fetchPendingInvites, setMemberKind, type PendingInvite } from '../lib/businessOS'

const INVITABLE_KINDS: MemberKind[] = ['staff', 'consultant', 'vendor', 'expert', 'partner']

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
  member_kind?: string
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
  const [inviteRole, setInviteRole] = useState('staff')
  const [inviteKind, setInviteKind] = useState<MemberKind>('staff')
  const [kindFilter, setKindFilter] = useState<'all' | MemberKind>('all')
  const [sendingInvite, setSendingInvite] = useState(false)
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [showBulk, setShowBulk] = useState(false)
  const [bulkEmails, setBulkEmails] = useState('')
  const [bulkRole, setBulkRole] = useState('staff')
  const [bulkResults, setBulkResults] = useState<{ email: string; ok: boolean; url?: string }[]>([])
  const [sendingBulk, setSendingBulk] = useState(false)
  const [editingRoles, setEditingRoles] = useState<string | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])

  useEffect(() => {
    loadData()
    loadPendingInvites()
  }, [])

  const loadPendingInvites = async () => {
    if (!currentStaff?.business_id) return
    const invites = await fetchPendingInvites(currentStaff.business_id)
    setPendingInvites(invites)
  }

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
        setMembers([])
      }
    } catch (err) {
      console.error('Failed to load people:', err)
      setMembers([])
    }
    setLoading(false)
  }

  const filteredMembers = members.filter(m => {
    if (kindFilter !== 'all' && (m.member_kind || 'staff') !== kindFilter) return false
    return (
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      (m.department && m.department.toLowerCase().includes(search.toLowerCase()))
    )
  })

  const departments = [...new Set(members.map(m => m.department).filter(Boolean))]
  const isAdmin = currentStaff?.role === 'owner' || currentStaff?.role === 'admin'

  const sendInvite = async () => {
    if (!inviteEmail) return
    setSendingInvite(true)
    setLastInviteUrl(null)
    try {
      const result = await createInvite(inviteEmail, inviteRole, currentStaff?.business_id, inviteKind)
      if (!result) {
        showToast('Could not send invite. Check the email and try again.', 'error')
        return
      }
      if (!result.seatAvailable) {
        showToast('Seat limit reached for your plan. Upgrade to add more members.', 'error')
        return
      }
      const fullUrl = `${window.location.origin}${result.joinUrl}`
      setLastInviteUrl(fullUrl)
      await navigator.clipboard?.writeText(fullUrl).catch(() => {})
      showToast(`Invite link ready — copied to clipboard. Send it to ${inviteEmail}.`, 'success')
      await loadPendingInvites()
      setInviteEmail('')
      setInviteRole('staff')
      setInviteKind('staff')
    } catch (err) {
      const msg = (err as any)?.message || 'Could not send invite.'
      showToast(msg.includes('pending') ? 'A pending invite already exists for this email.' : msg, 'error')
    } finally {
      setSendingInvite(false)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    const ok = await revokeInvite(inviteId)
    if (ok) {
      showToast('Invite revoked.', 'success')
      await loadPendingInvites()
    } else {
      showToast('Could not revoke invite.', 'error')
    }
  }

  const sendBulkInvites = async () => {
    const emails = bulkEmails
      .split(/[\n,;]+/)
      .map(e => e.trim())
      .filter(e => e.length > 0 && /\S+@\S+\.\S+/.test(e))
    if (emails.length === 0) {
      showToast('Enter at least one valid email (one per line, or comma-separated).', 'error')
      return
    }
    setSendingBulk(true)
    setBulkResults([])
    const results: { email: string; ok: boolean; url?: string }[] = []
    for (const email of emails) {
      const result = await createInvite(email, bulkRole, currentStaff?.business_id)
      if (result && result.seatAvailable && result.joinUrl) {
        results.push({ email, ok: true, url: `${window.location.origin}${result.joinUrl}` })
      } else {
        results.push({ email, ok: false })
      }
    }
    setBulkResults(results)
    const succeeded = results.filter(r => r.ok).length
    const failed = results.length - succeeded
    if (succeeded > 0) {
      showToast(`${succeeded} invite(s) created${failed > 0 ? `, ${failed} failed (seat limit or duplicate)` : ''}.`, succeeded === results.length ? 'success' : 'error')
    } else {
      showToast('No invites created — seat limit reached or all emails already have pending invites.', 'error')
    }
    await loadPendingInvites()
    setSendingBulk(false)
  }

  const copyInviteUrl = async (token: string) => {
    const url = `${window.location.origin}/join/${token}`
    await navigator.clipboard?.writeText(url).catch(() => {})
    showToast('Invite link copied to clipboard.', 'success')
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
          {!teamLimitLoading && (
            <span className="text-xs px-2 py-1 rounded" style={{
              color: canAddTeamMember ? 'var(--av-text-muted, #5F6368)' : 'var(--av-warning, #B45309)',
              background: canAddTeamMember ? 'var(--av-surface-2, #F1F3F4)' : 'rgba(180,83,9,0.08)',
            }}>
              {teamCount}{teamLimit >= 1000000 ? '' : `/${teamLimit}`} seats
            </span>
          )}
          <button
            onClick={() => canAddTeamMember ? setShowInvite(true) : showToast('Team limit reached. Upgrade your plan to add more members.', 'error')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm font-medium"
          >
            <Plus size={16} />
            Invite Team
          </button>
          <button
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium"
            style={{ borderColor: 'var(--av-border, #E8EAED)', color: 'var(--av-text, #202124)' }}
          >
            <Upload size={16} />
            Bulk Invite
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

      {/* Member-kind filter: narrows the roster by account identity. UX only — access stays role+RLS. */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'owner', 'staff', 'consultant', 'vendor', 'expert', 'partner'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              kindFilter === k
                ? 'bg-[var(--av-primary)] text-white'
                : 'bg-white text-black/70 border border-black/10'
            }`}
          >
            {k === 'all' ? 'All members' : memberKindLabel(k)}
          </button>
        ))}
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs px-2 py-1 rounded-full bg-black/[0.05] capitalize">{member.role || 'staff'}</span>
                    {isAdmin ? (
                      <select
                        value={member.member_kind || 'staff'}
                        onChange={async (e) => {
                          const ok = await setMemberKind(member.id, e.target.value)
                          if (ok) {
                            setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, member_kind: e.target.value } : m)))
                            showToast(`${member.name} reclassified as ${memberKindLabel(e.target.value)}.`, 'success')
                          } else {
                            showToast('Could not change member kind.', 'error')
                          }
                        }}
                        className={`text-xs px-2 py-1 rounded-full capitalize border-0 cursor-pointer ${MEMBER_KIND_CONFIG[(member.member_kind || 'staff') as MemberKind]?.classes || ''}`}
                        title="Member kind (account identity)"
                      >
                        <option value="owner">Owner</option>
                        <option value="staff">Staff</option>
                        <option value="consultant">Consultant</option>
                        <option value="vendor">Vendor</option>
                        <option value="expert">Expert</option>
                        <option value="partner">Partner</option>
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-full capitalize ${MEMBER_KIND_CONFIG[(member.member_kind || 'staff') as MemberKind]?.classes || 'bg-black/[0.05]'}`}>
                        {memberKindLabel(member.member_kind || 'staff')}
                      </span>
                    )}
                  </div>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-bold mb-4">Invite Team Member</h2>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Enter email address..."
              className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm mb-3"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm mb-3"
            >
              <option value="staff">Staff</option>
              <option value="team_lead">Team Lead</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <label className="block text-xs mb-1" style={{ color: 'var(--av-text-muted, #5F6368)' }}>
              Member kind — who this person is to your business
            </label>
            <select
              value={inviteKind}
              onChange={(e) => setInviteKind(e.target.value as MemberKind)}
              className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm mb-4"
            >
              {INVITABLE_KINDS.map((k) => (
                <option key={k} value={k}>{memberKindLabel(k)}</option>
              ))}
            </select>
            {lastInviteUrl && (
              <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--av-surface-2, #F1F3F4)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--av-text-muted, #5F6368)' }}>
                  Invite link (share via WhatsApp, email, or SMS):
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-xs flex-1 truncate">{lastInviteUrl}</code>
                  <button onClick={() => navigator.clipboard?.writeText(lastInviteUrl).catch(() => {})} className="text-[var(--av-primary, #4285F4)]">
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowInvite(false); setLastInviteUrl(null) }}
                className="flex-1 px-4 py-2 rounded-lg border border-black/10 text-sm"
              >
                Close
              </button>
              <button
                onClick={sendInvite}
                disabled={sendingInvite || !inviteEmail}
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm disabled:opacity-50"
              >
                {sendingInvite ? 'Creating...' : 'Create Invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Invite Modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-1">Bulk Invite Team</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--av-text-muted, #5F6368)' }}>
              Paste one email per line (or comma-separated). Each invite creates a join link you can share. Seats are enforced per invite.
            </p>
            <select
              value={bulkRole}
              onChange={(e) => setBulkRole(e.target.value)}
              className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-sm mb-3"
            >
              <option value="staff">All Staff</option>
              <option value="team_lead">All Team Lead</option>
              <option value="manager">All Manager</option>
              <option value="admin">All Admin</option>
            </select>
            <textarea
              value={bulkEmails}
              onChange={(e) => setBulkEmails(e.target.value)}
              placeholder={'ada@company.com\ntunde@company.com\nfatima@company.com'}
              rows={6}
              className="w-full rounded-lg border border-black/10 px-4 py-3 text-sm mb-3 font-mono"
            />
            {bulkResults.length > 0 && (
              <div className="mb-3 max-h-40 overflow-y-auto space-y-1">
                {bulkResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-2 rounded" style={{ background: 'var(--av-surface-2, #F1F3F4)' }}>
                    {r.ok ? <Check size={12} style={{ color: 'var(--av-success, #34A853)' }} /> : <X size={12} style={{ color: 'var(--av-danger, #EA4335)' }} />}
                    <span className="flex-1 truncate">{r.email}</span>
                    {r.ok && r.url && (
                      <button onClick={() => navigator.clipboard?.writeText(r.url!).catch(() => {})} className="text-[var(--av-primary, #4285F4)]">
                        <Copy size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setShowBulk(false); setBulkEmails(''); setBulkResults([]) }} className="flex-1 px-4 py-2 rounded-lg border border-black/10 text-sm">
                Close
              </button>
              <button
                onClick={sendBulkInvites}
                disabled={sendingBulk || !bulkEmails.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm disabled:opacity-50"
              >
                {sendingBulk ? 'Creating invites...' : `Create Invites`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} style={{ color: 'var(--av-text-muted, #5F6368)' }} />
            <h3 className="text-sm font-semibold">Pending Invites ({pendingInvites.length})</h3>
          </div>
          <div className="space-y-2">
            {pendingInvites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 py-2 border-b border-black/[0.04] last:border-0">
                <Mail size={14} style={{ color: 'var(--av-text-muted, #5F6368)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{inv.email}</p>
                  <p className="text-xs" style={{ color: 'var(--av-text-muted, #5F6368)' }}>
                    {inv.role} {inv.expires_at && `• expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button onClick={() => copyInviteUrl(inv.token)} className="text-[var(--av-primary, #4285F4)] p-1" title="Copy join link">
                  <Copy size={14} />
                </button>
                {isAdmin && (
                  <button onClick={() => handleRevokeInvite(inv.id)} className="p-1" style={{ color: 'var(--av-danger, #EA4335)' }} title="Revoke invite">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
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

