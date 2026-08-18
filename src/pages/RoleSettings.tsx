import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { TOOLS, ToolKey } from '../lib/useToolAccess'
import { fetchBusinessApprovalConfig, saveBusinessApprovalConfig } from '../lib/businessOS'
import {
  ChevronRight, Plus, Edit2, Trash2, Check, X,
  Users, Settings, Shield, UserCog, ShieldCheck
} from 'lucide-react'

type FunctionalRole = {
  id: string
  name: string
  description: string | null
  is_default: boolean
  tools: string[]
}

const TOOL_CATEGORIES = [
  { key: 'core', label: 'Core', tools: ['dashboard', 'reports'] },
  { key: 'sales', label: 'Sales & Marketing', tools: ['crm', 'quotes', 'campaigns', 'social'] },
  { key: 'finance', label: 'Finance', tools: ['finance', 'payments', 'accounting', 'cashflow'] },
  { key: 'ops', label: 'Operations', tools: ['projects', 'inventory', 'tasks', 'meetings', 'calendar', 'events', 'time-tracking', 'requisitions', 'knowledge', 'automations'] },
  { key: 'hr', label: 'HR & People', tools: ['people', 'approvals', 'merit', 'social-recognition'] },
  { key: 'support', label: 'Support', tools: ['tickets', 'chat'] },
  { key: 'settings', label: 'Settings', tools: ['settings', 'integrations', 'api', 'branding'] },
]

export default function RoleSettings() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [roles, setRoles] = useState<FunctionalRole[]>([])
  const [editingRole, setEditingRole] = useState<string | null>(null)
  const [newRoleName, setNewRoleName] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [expandedRole, setExpandedRole] = useState<string | null>(null)
  const [approvalCfg, setApprovalCfg] = useState<{ bypass_all_approvals: boolean; auto_approve_below: number | null }>({
    bypass_all_approvals: false, auto_approve_below: null,
  })
  const [savingApproval, setSavingApproval] = useState(false)

  useEffect(() => {
    loadRoles()
    if (staff?.business_id) {
      fetchBusinessApprovalConfig(staff.business_id).then(c => {
        if (c) setApprovalCfg({ bypass_all_approvals: c.bypass_all_approvals, auto_approve_below: c.auto_approve_below })
      })
    }
  }, [staff?.business_id])

  const loadRoles = async () => {
    if (!staff?.business_id) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('functional_roles')
        .select(`
          *,
          functional_role_tools (tool_key)
        `)
        .eq('business_id', staff.business_id)
        .order('name')

      if (error) throw error

      const rolesWithTools = (data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        is_default: r.is_default,
        tools: r.functional_role_tools?.map((t: any) => t.tool_key) || [],
      }))

      setRoles(rolesWithTools)
    } catch (err) {
      console.error('Failed to load roles:', err)
      showToast('Failed to load roles', 'error')
    } finally {
      setLoading(false)
    }
  }

  const createRole = async () => {
    if (!staff?.business_id || !newRoleName.trim()) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('functional_roles')
        .insert({
          business_id: staff.business_id,
          name: newRoleName.trim(),
          is_default: false,
        })

      if (error) throw error

      await loadRoles()
      setNewRoleName('')
      setShowNewForm(false)
      showToast('Role created', 'success')
    } catch (err) {
      console.error('Failed to create role:', err)
      showToast('Failed to create role', 'error')
    } finally {
      setSaving(false)
    }
  }

  const deleteRole = async (roleId: string) => {
    if (!staff?.business_id) return
    if (!confirm('Delete this role? Staff with this role will lose access to associated tools.')) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('functional_roles')
        .delete()
        .eq('id', roleId)
        .eq('business_id', staff.business_id)

      if (error) throw error

      await loadRoles()
      showToast('Role deleted', 'success')
    } catch (err) {
      console.error('Failed to delete role:', err)
      showToast('Failed to delete role', 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleTool = async (roleId: string, toolKey: string, currentTools: string[]) => {
    setSaving(true)
    try {
      const hasTool = currentTools.includes(toolKey)

      if (hasTool) {
        // Remove tool
        const { error } = await supabase
          .from('functional_role_tools')
          .delete()
          .eq('functional_role_id', roleId)
          .eq('tool_key', toolKey)

        if (error) throw error
      } else {
        // Add tool
        const { error } = await supabase
          .from('functional_role_tools')
          .insert({
            functional_role_id: roleId,
            tool_key: toolKey,
          })

        if (error) throw error
      }

      // Update local state
      setRoles(prev => prev.map(r => 
        r.id === roleId 
          ? { ...r, tools: hasTool ? r.tools.filter(t => t !== toolKey) : [...r.tools, toolKey] }
          : r
      ))
      showToast(hasTool ? 'Tool removed' : 'Tool added', 'success')
    } catch (err) {
      console.error('Failed to toggle tool:', err)
      showToast('Failed to update tools', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-20">
      <h1 className="text-xl font-medium text-black mb-6">Team Roles</h1>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <UserCog size={20} className="text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800">Functional Role Management</p>
            <p className="text-sm text-blue-700 mt-1">
              Define roles (like Sales, Marketing, Finance) and assign which tools each role can access. 
              Staff members can hold multiple roles - they'll see the union of all tools.
            </p>
          </div>
        </div>
      </div>

      {/* New Role Form */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-6">
        {showNewForm ? (
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Role name (e.g., Customer Success)"
              className="flex-1 px-3 py-2 border border-black/[0.1] rounded-lg text-sm"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createRole()}
            />
            <button
              onClick={createRole}
              disabled={saving || !newRoleName.trim()}
              className="p-2 bg-green-500 text-white rounded-lg disabled:opacity-50"
            >
              <Check size={18} />
            </button>
            <button
              onClick={() => { setShowNewForm(false); setNewRoleName(''); }}
              className="p-2 hover:bg-black/[0.05] rounded-lg"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-2 text-[var(--av-primary, #4285F4)] font-medium text-sm"
          >
            <Plus size={18} />
            Add Role
          </button>
        )}
      </div>

      {/* Roles List */}
      {loading ? (
        <div className="text-center py-12 text-black">Loading roles...</div>
      ) : roles.length === 0 ? (
        <div className="text-center py-12">
          <Users size={48} className="mx-auto text-black/50 mb-4" />
          <p className="text-black">No roles configured</p>
          <p className="text-sm text-black mt-1">Add roles to manage tool access</p>
        </div>
      ) : (
        <div className="space-y-4">
          {roles.map((role) => (
            <div key={role.id} className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
              {/* Role Header */}
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-black/10"
                onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                    <Shield size={18} className="text-purple-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{role.name}</p>
                      {role.is_default && (
                        <span className="px-2 py-0.5 rounded-full bg-white text-black text-xs">Default</span>
                      )}
                    </div>
                    <p className="text-sm text-black">{role.tools.length} tools assigned</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteRole(role.id); }}
                    className="p-2 hover:bg-red-50 rounded-lg text-red-400"
                    title="Delete role"
                  >
                    <Trash2 size={16} />
                  </button>
                  <ChevronRight 
                    size={20} 
                    className={`text-black transition-transform ${expandedRole === role.id ? 'rotate-90' : ''}`}
                  />
                </div>
              </div>

              {/* Tool Grid (expandable) */}
              {expandedRole === role.id && (
                <div className="border-t border-black/[0.06] p-4 bg-white">
                  <p className="text-sm font-medium text-black/70 mb-4">
                    Check the tools this role can access:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {TOOL_CATEGORIES.map((category) => (
                      <div key={category.key} className="bg-white rounded-xl p-3">
                        <p className="text-xs font-medium text-black uppercase tracking-wide mb-2">
                          {category.label}
                        </p>
                        <div className="space-y-2">
                          {category.tools.map((toolKey) => {
                            const tool = TOOLS.find(t => t.key === toolKey)
                            const hasTool = role.tools.includes(toolKey)
                            return (
                              <label
                                key={toolKey}
                                className="flex items-center gap-2 cursor-pointer hover:bg-black/10 p-1 rounded"
                              >
                                <input
                                  type="checkbox"
                                  checked={hasTool}
                                  onChange={() => toggleTool(role.id, toolKey, role.tools)}
                                  disabled={saving}
                                  className="w-4 h-4 rounded border-black/20 text-[var(--av-primary, #4285F4)] focus:ring-[var(--av-primary, #4285F4)]"
                                />
                                <span className="text-sm">{tool?.label || toolKey}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* §7.3: Approval threshold configuration — per-business, never global. */}
      <div className="mt-6 p-5 bg-white rounded-2xl">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={18} className="text-[#155BB4]" />
          <h3 className="text-base font-semibold text-slate-900">Approval thresholds</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Decide when a human needs to approve money or access changes. A solo founder needs none; a growing team needs some. These are your business's rules — never hardcoded globally.
        </p>
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={approvalCfg.bypass_all_approvals}
              onChange={e => setApprovalCfg(c => ({ ...c, bypass_all_approvals: e.target.checked }))}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-[#155BB4] focus:ring-[#155BB4]"
            />
            <div>
              <span className="text-sm font-medium text-slate-900">Bypass all approvals</span>
              <p className="text-xs text-slate-500">For sole proprietors — you're the only person, so approval gates are a no-op. Turn this on to skip them entirely.</p>
            </div>
          </label>
          <div>
            <label className="text-sm font-medium text-slate-900">Auto-approve below (₦)</label>
            <p className="text-xs text-slate-500 mb-1">Small decisions shouldn't be bureaucratic. Purchases/expenses below this amount skip approval (category-level thresholds still win when more specific). Leave blank to require approval regardless of amount.</p>
            <input
              type="number"
              value={approvalCfg.auto_approve_below ?? ''}
              onChange={e => setApprovalCfg(c => ({ ...c, auto_approve_below: e.target.value === '' ? null : Number(e.target.value) }))}
              placeholder="e.g. 5000"
              className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <button
            onClick={async () => {
              if (!staff?.business_id) return
              setSavingApproval(true)
              try {
                await saveBusinessApprovalConfig(staff.business_id, approvalCfg)
                showToast('Approval settings saved', 'success')
              } catch {
                showToast('Could not save approval settings', 'error')
              } finally {
                setSavingApproval(false)
              }
            }}
            disabled={savingApproval}
            className="rounded-lg bg-[#155BB4] px-4 py-2 text-sm font-medium text-white hover:bg-[#1247A0] disabled:opacity-50"
          >
            {savingApproval ? 'Saving…' : 'Save approval settings'}
          </button>
        </div>
      </div>

      {/* Help Text */}
      <div className="mt-6 p-4 bg-white rounded-xl">
        <p className="text-sm text-black/60">
          <strong>How it works:</strong> Create roles like "Sales" or "Support", then assign tools to each role. 
          When you invite team members in People settings, you can assign one or more roles to them. 
          They'll see the combined set of tools from all their roles. Owners and admins always see all tools.
        </p>
      </div>
    </div>
  )
}
