import { useEffect, useState } from 'react'
import { Plus, Users, Search, Mail, Phone, Briefcase } from 'lucide-react'

type TeamMember = {
  id: string
  full_name: string
  email: string
  phone?: string
  role: string
  department?: string
  avatar_url?: string
  joined_at: string
}

export default function People() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY
        )
        const { data } = await supabase.from('staff').select('*').order('created_at', { ascending: false }).limit(50)
        if (data && data.length > 0) {
          setMembers(data as TeamMember[])
        } else {
          setMembers(DEMO_MEMBERS)
        }
      } catch {
        setMembers(DEMO_MEMBERS)
      }
      setLoading(false)
    }
    load()
  }, [])

  const filteredMembers = members.filter(m =>
    m.full_name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    (m.department && m.department.toLowerCase().includes(search.toLowerCase()))
  )

  const departments = [...new Set(members.map(m => m.department).filter(Boolean))]

  const sendInvite = () => {
    if (!inviteEmail) return
    alert(`Invitation sent to ${inviteEmail}!`)
    setInviteEmail('')
    setShowInvite(false)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--avenize-black)]">People</h1>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm font-medium"
        >
          <Plus size={16} />
          Invite Team
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <div className="flex items-center gap-2 text-black/50 text-sm mb-1">
            <Users size={16} />
            <span>Total Team</span>
          </div>
          <p className="text-2xl font-bold">{members.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <div className="flex items-center gap-2 text-black/50 text-sm mb-1">
            <Briefcase size={16} />
            <span>Departments</span>
          </div>
          <p className="text-2xl font-bold">{departments.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/[0.06] col-span-2">
          <div className="flex items-center gap-2 text-black/50 text-sm mb-1">
            <Search size={16} />
            <span>Search</span>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or department..."
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
              <th className="text-left px-4 py-3 text-sm font-medium text-black/60 hidden lg:table-cell">Role</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-black/60 hidden lg:table-cell">Department</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-black/60">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06]">
            {filteredMembers.map((member) => (
              <tr key={member.id} className="hover:bg-black/[0.02]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--avenize-primary)] flex items-center justify-center text-white font-medium">
                      {member.full_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">{member.full_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-sm text-black/60">{member.email}</span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-xs px-2 py-1 rounded-full bg-black/[0.05] capitalize">{member.role || 'Staff'}</span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-sm text-black/60">{member.department || '-'}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-black/40">{new Date(member.joined_at).toLocaleDateString()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredMembers.length === 0 && (
          <div className="p-8 text-center text-black/40">
            <Users size={32} className="mx-auto mb-2 opacity-50" />
            <p>No team members found</p>
          </div>
        )}
      </div>

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
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const DEMO_MEMBERS: TeamMember[] = [
  { id: '1', full_name: 'Adaeze Nwankwo', email: 'adaeze@company.com', role: 'owner', department: 'Leadership', joined_at: '2024-01-01' },
  { id: '2', full_name: 'Emeka Obi', email: 'emeka@company.com', role: 'admin', department: 'Engineering', joined_at: '2024-01-05' },
  { id: '3', full_name: 'Blessing Adeyemi', email: 'blessing@company.com', role: 'manager', department: 'Sales', joined_at: '2024-01-10' },
  { id: '4', full_name: 'Kunle Adebayo', email: 'kunle@company.com', role: 'staff', department: 'Engineering', joined_at: '2024-01-15' },
  { id: '5', full_name: 'Ngozi Chukwu', email: 'ngozi@company.com', role: 'staff', department: 'Marketing', joined_at: '2024-01-20' },
  { id: '6', full_name: 'Tunde Bakare', email: 'tunde@company.com', role: 'team_lead', department: 'Operations', joined_at: '2024-02-01' },
]
