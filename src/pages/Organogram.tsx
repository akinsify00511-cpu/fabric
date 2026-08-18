import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Network, Users, ChevronDown, ChevronRight, Mail, MessageSquare,
  Phone, MoreVertical, Plus, Settings, RefreshCw, Search,
  UserPlus, UserMinus, ArrowUpRight, Crown, Briefcase, Building2, PlusCircle
} from 'lucide-react'

type OrgNode = {
  staff_id: string
  full_name: string
  email: string
  avatar_url: string
  position_title: string
  department: string
  level: number
  manager_id: string
  direct_report_count: number
}

type ReportingChannel = {
  id: string
  channel_type: string
  name: string
  description: string
  frequency: string
  auto_generate: boolean
  is_active: boolean
}

export default function Organogram() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [orgChart, setOrgChart] = useState<OrgNode[]>([])
  const [channels, setChannels] = useState<ReportingChannel[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null)
  const [view, setView] = useState<'org' | 'channels' | 'departments'>('org')
  const [filter, setFilter] = useState('')
  const [showChannelForm, setShowChannelForm] = useState(false)
  const [channelForm, setChannelForm] = useState({
    name: '',
    channel_type: 'daily_standup',
    description: '',
    frequency: 'daily',
  })

  useEffect(() => {
    loadData()
  }, [staff?.business_id])

  async function loadData() {
    setLoading(true)

    // Load org chart
    const { data: orgData } = await supabase.rpc('get_org_chart')

    if (orgData && orgData.length > 0) {
      setOrgChart(orgData)
      // Expand first two levels by default
      const initialExpanded = new Set<string>()
      orgData.filter((n: OrgNode) => n.level <= 1).forEach((n: OrgNode) => initialExpanded.add(n.staff_id))
      setExpandedNodes(initialExpanded)
    } else {
      setOrgChart([])
    }

    // Load reporting channels
    const { data: channelData } = await supabase
      .from('reporting_channels')
      .select('*')
      .eq('business_id', staff?.business_id)
      .eq('is_active', true)

    setChannels((channelData as ReportingChannel[]) || [])

    setLoading(false)
  }

  async function createChannel() {
    if (!channelForm.name.trim()) {
      showToast('Enter a channel name', 'error')
      return
    }
    const { error } = await supabase.from('reporting_channels').insert({
      business_id: staff?.business_id,
      channel_type: channelForm.channel_type,
      name: channelForm.name.trim(),
      description: channelForm.description,
      frequency: channelForm.frequency,
      auto_generate: true,
      is_active: true,
    })
    if (error) {
      showToast('Could not create the channel.', 'error')
      return
    }
    showToast('Channel created!', 'success')
    setShowChannelForm(false)
    setChannelForm({ name: '', channel_type: 'daily_standup', description: '', frequency: 'daily' })
    loadData()
  }

  const toggleNode = (staffId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(staffId)) {
      newExpanded.delete(staffId)
    } else {
      newExpanded.add(staffId)
    }
    setExpandedNodes(newExpanded)
  }

  const getDirectReports = (managerId: string) => {
    return orgChart.filter((n) => n.manager_id === managerId)
  }

  const getRootNodes = () => {
    return orgChart.filter((n) => !n.manager_id || n.manager_id === '')
  }

  const getChildren = (parentId: string) => {
    return orgChart.filter((n) => n.manager_id === parentId)
  }

  const filteredChart = filter
    ? orgChart.filter((n) =>
        n.full_name.toLowerCase().includes(filter.toLowerCase()) ||
        n.position_title.toLowerCase().includes(filter.toLowerCase()) ||
        n.department.toLowerCase().includes(filter.toLowerCase())
      )
    : orgChart

  const getNodeStyle = (level: number) => {
    const colors = [
      { bg: 'to-[#4285F4] to-[#8B5CF6]', border: 'border-[#4285F4]' },
      { bg: 'from-blue-500 to-cyan-600', border: 'border-[var(--av-primary)]' },
      { bg: 'from-green-500 to-emerald-600', border: 'border-[var(--av-success)]' },
      { bg: 'from-white0 to-black', border: 'border-white0' },
    ]
    return colors[Math.min(level, colors.length - 1)]
  }

  const renderNode = (node: OrgNode, isLast: boolean = false) => {
    const children = getChildren(node.staff_id)
    const isExpanded = expandedNodes.has(node.staff_id)
    const style = getNodeStyle(node.level)
    const hasChildren = children.length > 0

    return (
      <div key={node.staff_id} className="relative">
        <div className="flex items-start">
          {/* Connecting line to parent */}
          <div className="flex flex-col items-center">
            {hasChildren && (
              <button
                onClick={() => toggleNode(node.staff_id)}
                className="w-6 h-6 rounded-full bg-[var(--av-surface)] border border-[var(--av-border)] flex items-center justify-center hover:bg-black/[0.05]"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            )}
          </div>

          {/* Node card */}
          <div
            onClick={() => setSelectedNode(node)}
            className={`ml-2 mb-3 p-4 rounded-xl bg-[var(--av-surface)] border-2 cursor-pointer hover:shadow-lg transition-all ${
              style.border
            } ${selectedNode?.staff_id === node.staff_id ? 'ring-2 ring-[#4285F4]' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${style.bg} flex items-center justify-center text-white font-bold text-sm`}>
                {node.avatar_url ? (
                  <img src={node.avatar_url} alt={node.full_name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  node.full_name.split(' ').map((n) => n[0]).join('')
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{node.full_name}</p>
                  {node.level === 0 && <Crown size={14} className="text-[var(--av-warning)]" />}
                </div>
                <p className="text-xs text-[var(--av-text)]">{node.position_title}</p>
                <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-black/[0.05] rounded-full">
                  {node.department}
                </span>
              </div>
            </div>

            {hasChildren && (
              <div className="mt-2 pt-2 border-t border-[var(--av-border)] flex items-center justify-between text-xs text-[var(--av-text)]">
                <span>{children.length} direct reports</span>
                <div className="flex items-center gap-1">
                  <Mail size={12} />
                  <MessageSquare size={12} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Children */}
        {isExpanded && hasChildren && (
          <div className="ml-6 border-l-2 border-[var(--av-border)] pl-4">
            {children.map((child, idx) => renderNode(child, idx === children.length - 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--av-text)]">Organogram</h1>
          <p className="text-sm text-[var(--av-text)] mt-0.5">Organization structure & reporting channels</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--av-border)] text-sm"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button onClick={() => navigate('/app/hr')} className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium">
            <UserPlus size={16} />
            Add Member
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'org', label: 'Organization Chart', icon: Network },
          { key: 'channels', label: 'Reporting Channels', icon: MessageSquare },
          { key: 'departments', label: 'Departments', icon: Building2 },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key as typeof view)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
              view === tab.key ? 'avenize-gradient text-white' : 'border border-[var(--av-border)]'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Organization Chart View */}
      {view === 'org' && (
        <>
          {/* Search & Controls */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--av-text)]" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search by name, title, or department..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--av-border)] bg-[var(--av-surface)]"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--av-text)]">
              <span>{orgChart.length} members</span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Members', value: orgChart.length, icon: Users },
              { label: 'Managers', value: orgChart.filter((n) => n.direct_report_count > 0).length, icon: Briefcase },
              { label: 'Departments', value: [...new Set(orgChart.map((n) => n.department))].length, icon: Building2 },
              { label: 'Avg Reports', value: (orgChart.reduce((sum, n) => sum + n.direct_report_count, 0) / Math.max(orgChart.filter((n) => n.direct_report_count > 0).length, 1)).toFixed(1), icon: Network },
            ].map((stat, i) => (
              <div key={i} className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border-strong)]/[0.06] p-4">
                <div className="flex items-center gap-2 text-[var(--av-text)] mb-1">
                  <stat.icon size={14} />
                  <span className="text-xs">{stat.label}</span>
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Org Chart */}
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-6 overflow-x-auto">
            <div className="min-w-max">
              {loading ? (
                <div className="animate-pulse space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-[var(--av-surface-3)] rounded-xl" />
                  ))}
                </div>
              ) : filteredChart.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto text-[var(--av-text)]/50 mb-3" />
                  <p className="text-[var(--av-text)]">No team members found</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {getRootNodes().map((node, idx) => renderNode(node, idx === getRootNodes().length - 1))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Reporting Channels View */}
      {view === 'channels' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--av-text)]">Automated reporting and sync channels</p>
            <button onClick={() => setShowChannelForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium">
              <Plus size={16} />
              New Channel
            </button>
          </div>

          {channels.map((channel) => (
            <div key={channel.id} className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#4285F4]/10 flex items-center justify-center">
                    <MessageSquare size={24} className="text-[#4285F4]" />
                  </div>
                  <div>
                    <h3 className="font-medium">{channel.name}</h3>
                    <p className="text-sm text-[var(--av-text)]">{channel.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs px-2 py-1 bg-black/[0.05] rounded-full capitalize">
                        {channel.frequency}
                      </span>
                      {channel.auto_generate && (
                        <span className="text-xs px-2 py-1 bg-[var(--av-success-soft)] text-[var(--av-success)] rounded-full flex items-center gap-1">
                          <RefreshCw size={10} />
                          Auto-generated
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 hover:bg-black/[0.05] rounded-lg">
                    <Settings size={16} />
                  </button>
                  <button className="p-2 hover:bg-black/[0.05] rounded-lg">
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-[var(--av-border-strong)]/[0.06] flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <span className="text-[var(--av-text)]">Last generated:</span>
                  <span>Today at 9:00 AM</span>
                </div>
                <button className="text-[#4285F4] font-medium">
                  View Reports →
                </button>
              </div>
            </div>
          ))}

          {/* Add channel card */}
          <div className="border-2 border-dashed border-[var(--av-border)] rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-[var(--av-surface-3)]">
            <PlusCircle size={32} className="text-[var(--av-text)] mb-2" />
            <p className="text-sm text-[var(--av-text)]">Create new reporting channel</p>
          </div>
        </div>
      )}

      {/* Departments View */}
      {view === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...new Set(orgChart.map((n) => n.department))].map((dept) => {
            const members = orgChart.filter((n) => n.department === dept)
            const head = members.find((n) => n.level === Math.min(...members.map((m) => m.level)))

            return (
              <div key={dept} className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[#4285F4]/10 flex items-center justify-center">
                    <Building2 size={20} className="text-[#4285F4]" />
                  </div>
                  <div>
                    <h3 className="font-medium">{dept}</h3>
                    <p className="text-xs text-[var(--av-text)]">{members.length} members</p>
                  </div>
                </div>

                {/* Department head */}
                {head && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-black/[0.02] mb-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br to-[#4285F4] to-[#8B5CF6]/50 flex items-center justify-center text-white text-xs font-bold">
                      {head.full_name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{head.full_name}</p>
                      <p className="text-xs text-[var(--av-text)]">{head.position_title}</p>
                    </div>
                  </div>
                )}

                {/* Team members */}
                <div className="space-y-2">
                  {members.filter((m) => m.staff_id !== head?.staff_id).slice(0, 3).map((member) => (
                    <div key={member.staff_id} className="flex items-center gap-2 text-sm">
                      <div className="w-6 h-6 rounded-full bg-black/[0.1] flex items-center justify-center text-xs">
                        {member.full_name[0]}
                      </div>
                      <span>{member.full_name}</span>
                    </div>
                  ))}
                  {members.length > 4 && (
                    <p className="text-xs text-[var(--av-text)]">+{members.length - 4} more</p>
                  )}
                </div>

                <button onClick={() => { setFilter(dept); setView('org'); }} className="w-full mt-4 py-2 rounded-lg border border-[var(--av-border)] text-sm">
                  View Department
                </button>
              </div>
            )
          })}

          {/* Add department card */}
          <button onClick={() => navigate('/app/operations?tab=departments')} className="border-2 border-dashed border-[var(--av-border)] rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-[var(--av-surface-3)] h-fit">
            <PlusCircle size={32} className="text-[var(--av-text)] mb-2" />
            <p className="text-sm text-[var(--av-text)]">Add Department</p>
          </button>
        </div>
      )}

      {/* Create Channel Modal */}
      {showChannelForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-[var(--av-border-strong)]/[0.06] flex items-center justify-between">
              <h2 className="font-semibold">New Reporting Channel</h2>
              <button onClick={() => setShowChannelForm(false)} className="p-2 hover:bg-black/[0.05] rounded-lg">✕</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createChannel() }} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Channel Name</label>
                <input
                  value={channelForm.name}
                  onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
                  placeholder="Daily Standup"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--av-border)]"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Type</label>
                <select
                  value={channelForm.channel_type}
                  onChange={(e) => setChannelForm({ ...channelForm, channel_type: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--av-border)]"
                >
                  <option value="daily_standup">Daily Standup</option>
                  <option value="weekly_update">Weekly Update</option>
                  <option value="monthly_review">Monthly Review</option>
                  <option value="project_sync">Project Sync</option>
                  <option value="one_on_one">1:1</option>
                  <option value="escalation">Escalation</option>
                  <option value="broadcast">Broadcast</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Frequency</label>
                <select
                  value={channelForm.frequency}
                  onChange={(e) => setChannelForm({ ...channelForm, frequency: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--av-border)]"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="as_needed">As needed</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Description</label>
                <textarea
                  value={channelForm.description}
                  onChange={(e) => setChannelForm({ ...channelForm, description: e.target.value })}
                  placeholder="What is this channel for?"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--av-border)]"
                  rows={2}
                />
              </div>
              <button type="submit" className="w-full py-2 rounded-lg avenize-gradient text-white font-medium">
                Create Channel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Selected Node Detail Modal */}
      {selectedNode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-[var(--av-border-strong)]/[0.06] flex items-center justify-between">
              <h2 className="font-semibold">Team Member</h2>
              <button onClick={() => setSelectedNode(null)} className="p-2 hover:bg-black/[0.05] rounded-lg">✕</button>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br to-[#4285F4] to-[#8B5CF6]/50 flex items-center justify-center text-white text-xl font-bold">
                  {selectedNode.full_name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div>
                  <h3 className="text-lg font-medium">{selectedNode.full_name}</h3>
                  <p className="text-[var(--av-text)]">{selectedNode.position_title}</p>
                  <span className="text-xs px-2 py-1 bg-black/[0.05] rounded-full">{selectedNode.department}</span>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 text-sm">
                  <Mail size={16} className="text-[var(--av-text)]" />
                  <span>{selectedNode.email}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Network size={16} className="text-[var(--av-text)]" />
                  <span>{selectedNode.direct_report_count} direct reports</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <ArrowUpRight size={16} className="text-[var(--av-text)]" />
                  <span>Reports to: CEO</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => navigate(`/app/staff/${selectedNode.staff_id}`)} className="flex-1 py-2 rounded-lg avenize-gradient text-white text-sm font-medium">
                  View Full Profile
                </button>
                <button onClick={() => navigate('/app/chat')} className="px-4 py-2 rounded-lg border border-[var(--av-border)]">
                  <MessageSquare size={16} />
                </button>
                <button onClick={() => window.location.href = `mailto:${selectedNode.email}`} className="px-4 py-2 rounded-lg border border-[var(--av-border)]">
                  <Mail size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
