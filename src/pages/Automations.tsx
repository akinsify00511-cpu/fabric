import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { useFeatureFlag, FEATURE_FLAG_KEYS } from '../lib/useFeatureFlag'
import { useAnalytics, ANALYTICS_EVENTS } from '../lib/analytics'
import { BetaBadge, FeatureComingSoon } from '../components/BetaTesterGate'
import {
  Zap, Plus, Play, Pause, Trash2, Settings, ChevronRight, CheckCircle2,
  XCircle, Clock, ArrowRight, AlertTriangle, Activity, Filter, X, Sparkles,
  GripVertical, ChevronDown, Info, Eye, EyeOff, Edit3
} from 'lucide-react'

type Automation = {
  id: string
  name: string
  description: string | null
  trigger_type: string
  trigger_config: any
  action_type: string
  action_config: any
  enabled: boolean
  run_count: number
  last_run_at: string | null
  created_at: string
}

type Trigger = {
  type: string
  name: string
  description: string
  icon: string
}

type Action = {
  type: string
  name: string
  description: string
  icon: string
}

type Run = {
  id: string
  automation_id: string
  trigger_event: any
  status: 'success' | 'failed' | 'skipped'
  error_message: string | null
  executed_at: string
}

const TRIGGERS: Trigger[] = [
  { type: 'deal_won', name: 'Deal won', description: 'When a deal is marked as won', icon: '🎉' },
  { type: 'deal_lost', name: 'Deal lost', description: 'When a deal is marked as lost', icon: '😔' },
  { type: 'deal_created', name: 'Deal created', description: 'When a new deal is added', icon: '📋' },
  { type: 'deal_stage_changed', name: 'Stage changed', description: 'When deal moves to a new stage', icon: '🔄' },
  { type: 'invoice_paid', name: 'Invoice paid', description: 'When an invoice is marked as paid', icon: '💰' },
  { type: 'invoice_created', name: 'Invoice created', description: 'When a new invoice is created', icon: '📄' },
  { type: 'task_completed', name: 'Task completed', description: 'When a task is marked done', icon: '✅' },
  { type: 'task_created', name: 'Task created', description: 'When a new task is added', icon: '✨' },
  { type: 'task_due_soon', name: 'Task due soon', description: 'When a task is due within 24 hours', icon: '⏰' },
  { type: 'staff_joined', name: 'Staff joined', description: 'When a new team member joins', icon: '👋' },
  { type: 'leave_approved', name: 'Leave approved', description: 'When a leave request is approved', icon: '🏖️' },
  { type: 'product_low_stock', name: 'Low stock', description: 'When a product falls below threshold', icon: '⚠️' },
  { type: 'scheduled', name: 'Scheduled (hourly)', description: 'Runs automatically on an hourly schedule', icon: '⏲️' },
]

const ACTIONS: Action[] = [
  { type: 'create_task', name: 'Create task', description: 'Create a new task', icon: '📝' },
  { type: 'send_notification', name: 'Notify', description: 'Send in-app notification', icon: '🔔' },
  { type: 'add_to_cashflow', name: 'Record cashflow', description: 'Add income or expense', icon: '💵' },
  { type: 'award_merit', name: 'Award merit', description: 'Give recognition points', icon: '⭐' },
  { type: 'post_to_chat', name: 'Post to chat', description: 'Send message to channel', icon: '💬' },
  { type: 'update_deal', name: 'Update deal', description: 'Change deal fields', icon: '✏️' },
]

export default function Automations() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const { track } = useAnalytics()

    // Feature flag gating - automations are behind a flag, defaulted off for beta
  const automationsEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.AUTOMATIONS)

const [automations, setAutomations] = useState<Automation[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [selectedAutomation, setSelectedAutomation] = useState<Automation | null>(null)
  const [showRuns, setShowRuns] = useState(false)

  // Builder state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState('')
  const [actionType, setActionType] = useState('')
  const [triggerConfig, setTriggerConfig] = useState<Record<string, string>>({})
  const [actionConfig, setActionConfig] = useState<Record<string, string>>({})

  const load = async () => {
    setLoading(true)
    try {
      const [{ data: autoData }, { data: runsData }] = await Promise.all([
        supabase.from('automations').select('*').order('created_at', { ascending: false }),
        supabase.from('automation_runs').select('*').order('executed_at', { ascending: false }).limit(50),
      ])
      if (autoData && autoData.length > 0) {
        setAutomations(autoData as Automation[])
      } else {
        setAutomations([])
      }
      if (runsData && runsData.length > 0) {
        setRuns(runsData as Run[])
      } else {
        setRuns([])
      }
    } catch {
      setAutomations([])
      setRuns([])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const createAutomation = async () => {
    if (!name.trim() || !triggerType || !actionType) {
      showToast('Fill in name, trigger, and action', 'error')
      return
    }

    const { error } = await supabase.from('automations').insert({
      name,
      description,
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      action_type: actionType,
      action_config: actionConfig,
      created_by: staff?.id,
    })

    if (error) {
      showToast('Failed to create automation', 'error')
    } else {
      showToast('Automation created!', 'success')
      resetBuilder()
      load()
    }
  }

  const toggleAutomation = async (automation: Automation) => {
    const { error } = await supabase
      .from('automations')
      .update({ enabled: !automation.enabled })
      .eq('id', automation.id)

    if (!error) {
      showToast(automation.enabled ? 'Automation paused' : 'Automation enabled', 'success')
      load()
    }
  }

  const deleteAutomation = async (id: string) => {
    if (!confirm('Delete this automation?')) return
    await supabase.from('automations').delete().eq('id', id)
    showToast('Automation deleted', 'info')
    load()
  }

  const resetBuilder = () => {
    setShowBuilder(false)
    setName('')
    setDescription('')
    setTriggerType('')
    setActionType('')
    setTriggerConfig({})
    setActionConfig({})
    setSelectedAutomation(null)
  }

  const getTriggerIcon = (type: string) => TRIGGERS.find((t) => t.type === type)?.icon ?? '⚡'
  const getActionIcon = (type: string) => ACTIONS.find((a) => a.type === type)?.icon ?? '⚡'

  const getRecentRunsForAutomation = (autoId: string) => {
    return runs.filter((r) => r.automation_id === autoId).slice(0, 5)
  }

  // Feature flag gating - if not enabled, show coming soon
  if (!automationsEnabled) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-medium text-black">Automations</h1>
            <p className="text-sm text-black mt-0.5">Make your workflow smarter — when this happens, do that</p>
          </div>
        </div>

        {/* Beta Request Banner */}
        <div className="bg-gradient-to-br from-blue-800 to-blue-900 rounded-2xl p-8 mb-6 text-white">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 rounded-full bg-[var(--av-warning-soft)]0/20 text-amber-300 text-xs font-medium">
                  Beta Feature
                </span>
                <BetaBadge />
              </div>
              <h2 className="text-xl font-semibold mb-2">Workflow Automations</h2>
              <p className="text-white/70 text-sm leading-relaxed mb-4">
                Automate repetitive tasks with triggers and actions. When a deal is won, send a notification. 
                When a task is overdue, award merit points. When a contact is added, create a welcome task.
              </p>
              <div className="flex items-center gap-4">
                <a
                  href="mailto:support@avenize.com?subject=Automations%20Beta%20Access%20Request"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-blue-900 rounded-xl text-sm font-medium hover:bg-[var(--av-primary-soft)] transition"
                >
                  <Sparkles className="w-4 h-4" />
                  Request Beta Access
                </a>
                <span className="text-white/80 text-sm">
                  Join the beta program for early access
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Preview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl  p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Zap className="w-5 h-5 text-[var(--av-warning)]" />
              </div>
              <h3 className="font-medium">Smart Triggers</h3>
            </div>
            <p className="text-sm text-black">
              Fire automations on deal won, task completed, invoice paid, staff joined, and more events.
            </p>
          </div>

          <div className="bg-white rounded-2xl  p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#4285F4]/10 flex items-center justify-center">
                <Settings className="w-5 h-5 text-[#4285F4]" />
              </div>
              <h3 className="font-medium">Multiple Actions</h3>
            </div>
            <p className="text-sm text-black">
              Send notifications, create tasks, update deals, award merit, or post to chat.
            </p>
          </div>

          <div className="bg-white rounded-2xl  p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Activity className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-medium">Activity Log</h3>
            </div>
            <p className="text-sm text-black">
              Track every automation run with success/failure status and error details.
            </p>
          </div>
        </div>

        {/* Beta Note */}
        <div className="p-4 rounded-xl bg-[var(--av-warning-soft)] border border-[var(--av-warning)]/30">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-[var(--av-warning)] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                Beta Access <BetaBadge />
              </p>
              <p className="text-xs text-[var(--av-warning)] mt-1">
                Automations are currently being tested with beta users. Contact support to join the beta program.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      {/* BETA STATUS BANNER */}
      <div className="mb-6 p-4 bg-[var(--av-primary-soft)] border border-[var(--av-primary)]/30 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg shrink-0">
            <Zap size={20} className="text-[var(--av-primary)]" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-blue-900">Automations</h3>
              <BetaBadge />
            </div>
            <p className="text-sm text-blue-800">
              <strong>Creating and saving automations works.</strong> Execution triggers when events occur 
              (deal won, task completed, etc.) require the Edge Function to be deployed. 
              <a href="#" className="underline ml-1">View setup guide →</a>
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-black">Automations</h1>
          <p className="text-sm text-black mt-0.5">Make your workflow smarter — when this happens, do that</p>
        </div>
        <button
          onClick={() => {
            track(ANALYTICS_EVENTS.AUTOMATION_CREATED)
            setShowBuilder(true)
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium hover:opacity-90 transition"
        >
          <Plus size={16} />
          New automation
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-2xl  p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-[var(--av-success)]" />
            <span className="text-xs text-black uppercase tracking-wide">Active</span>
          </div>
          <p className="text-2xl font-bold text-black">
            {automations.filter((a) => a.enabled).length}
          </p>
        </div>
        <div className="bg-white rounded-2xl  p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} className="text-[#8B5CF6]" />
            <span className="text-xs text-black uppercase tracking-wide">Total runs</span>
          </div>
          <p className="text-2xl font-bold text-black">
            {automations.reduce((sum, a) => sum + a.run_count, 0)}
          </p>
        </div>
        <div className="bg-white rounded-2xl  p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-black" />
            <span className="text-xs text-black uppercase tracking-wide">Last run</span>
          </div>
          <p className="text-sm font-medium text-black">
            {automations.filter((a) => a.last_run_at).length > 0
              ? new Date(Math.max(...automations.filter((a) => a.last_run_at).map((a) => new Date(a.last_run_at!).getTime()))).toLocaleDateString()
              : 'Never'}
          </p>
        </div>
      </div>

      {/* Automations List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl  p-4 animate-pulse">
              <div className="h-4 bg-black/10 rounded w-32 mb-2" />
              <div className="h-3 bg-black/10 rounded w-48" />
            </div>
          ))}
        </div>
      ) : automations.length === 0 ? (
        <div className="bg-white rounded-2xl  p-12 text-center">
          <div className="w-16 h-16 rounded-2xl avenize-gradient flex items-center justify-center text-white text-2xl mx-auto mb-4">
            🤖
          </div>
          <h3 className="text-lg font-medium text-black mb-2">No automations yet</h3>
          <p className="text-sm text-black mb-4 max-w-sm mx-auto">
            Create your first automation to streamline your workflow. For example: when a deal is won, create a task to follow up.
          </p>
          <button
            onClick={() => setShowBuilder(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
          >
            <Plus size={16} />
            Create first automation
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((auto) => {
            const trigger = TRIGGERS.find((t) => t.type === auto.trigger_type)
            const action = ACTIONS.find((a) => a.type === auto.action_type)
            
            return (
              <div
                key={auto.id}
                className={`bg-white rounded-2xl  p-4 transition hover:shadow-md ${
                  !auto.enabled ? 'opacity-60' : ''
                }`}
              >
                {/* Visual Flow Preview */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-blue-50 via-purple-50 to-green-50 mb-3">
                  {/* Trigger */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-sm">
                    <span className="text-xl">{trigger?.icon || '⚡'}</span>
                    <div>
                      <div className="text-xs text-black">When</div>
                      <div className="text-sm font-medium">{trigger?.name || auto.trigger_type}</div>
                    </div>
                  </div>
                  
                  {/* Arrow */}
                  <div className="flex items-center">
                    <ArrowRight className="text-[var(--av-primary, #4285F4)]" size={20} />
                  </div>
                  
                  {/* Action */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-sm">
                    <span className="text-xl">{action?.icon || '⚡'}</span>
                    <div>
                      <div className="text-xs text-black">Do</div>
                      <div className="text-sm font-medium">{action?.name || auto.action_type}</div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-black">{auto.name}</h3>
                      {!auto.enabled && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white text-black">Paused</span>
                      )}
                      {auto.enabled && (
                        <span className="flex items-center gap-1 text-xs text-[var(--av-success)]">
                          <span className="w-2 h-2 rounded-full bg-[var(--av-success-soft)]0 animate-pulse"></span>
                          Active
                        </span>
                      )}
                    </div>
                    {auto.description && (
                      <p className="text-xs text-black">{auto.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setSelectedAutomation(auto)
                        setShowRuns(true)
                      }}
                      className="p-2 hover:bg-black/[0.05] rounded-lg text-black hover:text-black/60"
                      title="View runs"
                    >
                      <Activity size={16} />
                    </button>
                    <button
                      onClick={() => toggleAutomation(auto)}
                      className={`p-2 rounded-lg ${auto.enabled ? 'text-[var(--av-warning)] hover:bg-[var(--av-warning-soft)]' : 'text-[var(--av-success)] hover:bg-[var(--av-success-soft)]'}`}
                      title={auto.enabled ? 'Pause' : 'Enable'}
                    >
                      {auto.enabled ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button
                      onClick={() => deleteAutomation(auto.id)}
                      className="p-2 hover:bg-[var(--av-danger-soft)] rounded-lg text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-black/[0.06]">
                  <span className="flex items-center gap-1 text-xs text-black">
                    <Activity size={12} />
                    {auto.run_count} runs
                  </span>
                  {auto.last_run_at && (
                    <span className="text-xs text-black">
                      Last: {new Date(auto.last_run_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Builder Modal */}
      {showBuilder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl my-8">
            <div className="px-6 py-4 border-b border-black/[0.06] flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Automation</h2>
              <button onClick={resetBuilder} className="p-2 hover:bg-black/[0.05] rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Name */}
              <div>
                <label className="text-sm font-medium text-black block mb-1">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Won deal → Create follow-up task"
                  className="w-full px-4 py-3 rounded-xl border border-black/10 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-black block mb-1">Description (optional)</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this automation do?"
                  className="w-full px-4 py-2 rounded-xl border border-black/10 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
                />
              </div>

              {/* Trigger */}
              <div>
                <label className="text-sm font-medium text-black block mb-2">
                  <span className="flex items-center gap-2">
                    <span className="text-lg">⚡</span> When this happens...
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRIGGERS.map((trigger) => (
                    <button
                      key={trigger.type}
                      onClick={() => {
                        setTriggerType(trigger.type)
                        setTriggerConfig({})
                      }}
                      className={`p-3 rounded-xl border text-left transition ${
                        triggerType === trigger.type
                          ? 'border-[#8B5CF6] bg-[#8B5CF6]/5'
                          : 'border-black/[0.08] hover:border-black/[0.15]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span>{trigger.icon}</span>
                        <span className="text-sm font-medium">{trigger.name}</span>
                      </div>
                      <p className="text-xs text-black">{trigger.description}</p>
                    </button>
                  ))}
                </div>
                {triggerType === 'scheduled' && (
                  <div className="mt-3 p-3 rounded-xl bg-[var(--av-warning-soft)] border border-[var(--av-warning)]/30">
                    <label className="text-xs font-medium text-amber-900 block mb-1">
                      Schedule
                    </label>
                    <p className="text-xs text-amber-800 mb-2">
                      Scheduled automations run on an hourly cadence (checked every hour by the platform). The cron field is informational — every enabled scheduled automation runs hourly.
                    </p>
                    <input
                      type="text"
                      value={triggerConfig.cron ?? '0 * * * *'}
                      onChange={(e) => setTriggerConfig({ ...triggerConfig, cron: e.target.value })}
                      placeholder="0 * * * * (hourly)"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--av-warning)]/40 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                    />
                  </div>
                )}
              </div>

              {/* Action */}
              <div>
                <label className="text-sm font-medium text-black block mb-2">
                  <span className="flex items-center gap-2">
                    <span className="text-lg">➡️</span> Do this...
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ACTIONS.map((action) => (
                    <button
                      key={action.type}
                      onClick={() => {
                        setActionType(action.type)
                        setActionConfig({})
                      }}
                      className={`p-3 rounded-xl border text-left transition ${
                        actionType === action.type
                          ? 'border-[#8B5CF6] bg-[#8B5CF6]/5'
                          : 'border-black/[0.08] hover:border-black/[0.15]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span>{action.icon}</span>
                        <span className="text-sm font-medium">{action.name}</span>
                      </div>
                      <p className="text-xs text-black">{action.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Config */}
              {actionType && (
                <div className="bg-black/[0.02] rounded-xl p-4">
                  <p className="text-sm font-medium mb-3">Action settings</p>
                  {actionType === 'create_task' && (
                    <>
                      <input
                        value={actionConfig.title || ''}
                        onChange={(e) => setActionConfig({ ...actionConfig, title: e.target.value })}
                        placeholder="Task title (use {{deal_title}} for dynamic)"
                        className="w-full px-3 py-2 rounded-lg border border-black/10 mb-2 text-sm"
                      />
                      <textarea
                        value={actionConfig.description || ''}
                        onChange={(e) => setActionConfig({ ...actionConfig, description: e.target.value })}
                        placeholder="Description (optional)"
                        className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm"
                        rows={2}
                      />
                    </>
                  )}
                  {actionType === 'add_to_cashflow' && (
                    <>
                      <select
                        value={actionConfig.type || ''}
                        onChange={(e) => setActionConfig({ ...actionConfig, type: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-black/10 mb-2 text-sm"
                      >
                        <option value="">Select type...</option>
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                      </select>
                      <input
                        value={actionConfig.category || ''}
                        onChange={(e) => setActionConfig({ ...actionConfig, category: e.target.value })}
                        placeholder="Category (e.g., Sales, Marketing)"
                        className="w-full px-3 py-2 rounded-lg border border-black/10 mb-2 text-sm"
                      />
                      <input
                        value={actionConfig.amount || ''}
                        onChange={(e) => setActionConfig({ ...actionConfig, amount: e.target.value })}
                        placeholder="Amount (use {{value}} for dynamic)"
                        type="number"
                        className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm"
                      />
                    </>
                  )}
                  {actionType === 'award_merit' && (
                    <>
                      <input
                        value={actionConfig.points || ''}
                        onChange={(e) => setActionConfig({ ...actionConfig, points: e.target.value })}
                        placeholder="Points to award"
                        type="number"
                        className="w-full px-3 py-2 rounded-lg border border-black/10 mb-2 text-sm"
                      />
                      <input
                        value={actionConfig.reason || ''}
                        onChange={(e) => setActionConfig({ ...actionConfig, reason: e.target.value })}
                        placeholder="Reason (use {{deal_title}} for dynamic)"
                        className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm"
                      />
                    </>
                  )}
                  {actionType === 'post_to_chat' && (
                    <>
                      <textarea
                        value={actionConfig.message || ''}
                        onChange={(e) => setActionConfig({ ...actionConfig, message: e.target.value })}
                        placeholder="Message (use {{deal_title}} for dynamic)"
                        className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm"
                        rows={2}
                      />
                    </>
                  )}
                  {actionType === 'send_notification' && (
                    <input
                      value={actionConfig.message || ''}
                      onChange={(e) => setActionConfig({ ...actionConfig, message: e.target.value })}
                      placeholder="Notification message"
                      className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm"
                    />
                  )}
                  <p className="text-xs text-black mt-2">
                    Use {"{{variable}}"} for dynamic values (deal_title, value, contact_name)
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-3">
              <button
                onClick={resetBuilder}
                className="px-4 py-2 rounded-lg border border-black/10 text-sm hover:bg-black/10"
              >
                Cancel
              </button>
              <button
                onClick={createAutomation}
                className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
              >
                <Zap size={16} />
                Create automation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Runs Panel */}
      {showRuns && selectedAutomation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-50">
          <div className="bg-white h-full w-full max-w-lg shadow-xl flex flex-col">
            <div className="px-6 py-4 border-b border-black/[0.06] flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Automation Runs</h2>
                <p className="text-sm text-black">{selectedAutomation.name}</p>
              </div>
              <button onClick={() => { setShowRuns(false); setSelectedAutomation(null) }} className="p-2 hover:bg-black/[0.05] rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {getRecentRunsForAutomation(selectedAutomation.id).length === 0 ? (
                <div className="text-center py-12 text-black">
                  <Activity size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No runs yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {getRecentRunsForAutomation(selectedAutomation.id).map((run) => (
                    <div key={run.id} className="p-3 rounded-xl bg-black/[0.02]">
                      <div className="flex items-center gap-2 mb-1">
                        {run.status === 'success' ? (
                          <CheckCircle2 size={14} className="text-[var(--av-success)]" />
                        ) : (
                          <XCircle size={14} className="text-[var(--av-danger)]" />
                        )}
                        <span className="text-sm font-medium capitalize">{run.status}</span>
                        <span className="text-xs text-black">
                          {new Date(run.executed_at).toLocaleString()}
                        </span>
                      </div>
                      {run.error_message && (
                        <p className="text-xs text-[var(--av-danger)]">{run.error_message}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
