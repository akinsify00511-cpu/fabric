import { useState, useEffect } from 'react'
import {
  Zap, Plus, Play, Pause, Trash2, Edit2, Settings,
  ChevronRight, Clock, CheckCircle, XCircle, AlertTriangle,
  GitBranch, Database, Mail, Bell, User, FileText,
  ArrowRight, Copy, MoreHorizontal, RefreshCw
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface Workflow {
  id: string
  name: string
  description?: string
  trigger_type: string
  trigger_config?: Record<string, any>
  steps: WorkflowStep[]
  is_active: boolean
  run_count: number
  last_run_at?: string
  last_error?: string
  created_at: string
}

interface WorkflowStep {
  id: string
  type: 'action' | 'condition' | 'delay' | 'notification'
  config: Record<string, any>
  next?: string[]
}

const TRIGGER_TYPES = [
  { value: 'manual', label: 'Manual', desc: 'Start workflow with a button' },
  { value: 'on_create', label: 'On Create', desc: 'When a record is created' },
  { value: 'on_update', label: 'On Update', desc: 'When a record is updated' },
  { value: 'on_delete', label: 'On Delete', desc: 'When a record is deleted' },
  { value: 'scheduled', label: 'Scheduled', desc: 'Run at specific times' },
]

const ACTION_TYPES = [
  { value: 'send_email', label: 'Send Email', icon: Mail, color: 'bg-blue-100 text-blue-600' },
  { value: 'send_notification', label: 'Send Notification', icon: Bell, color: 'bg-amber-100 text-amber-600' },
  { value: 'update_record', label: 'Update Record', icon: Database, color: 'bg-green-100 text-green-600' },
  { value: 'create_task', label: 'Create Task', icon: FileText, color: 'bg-purple-100 text-purple-600' },
  { value: 'assign_user', label: 'Assign User', icon: User, color: 'bg-pink-100 text-pink-600' },
  { value: 'webhook', label: 'Webhook', icon: Zap, color: 'bg-indigo-100 text-indigo-600' },
]

const ENTITY_TYPES = [
  { value: 'contacts', label: 'Contacts' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'staff', label: 'Staff' },
  { value: 'leads', label: 'Leads' },
  { value: 'projects', label: 'Projects' },
]

export default function WorkflowBuilderPage() {
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null)

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    triggerType: 'manual',
    entityType: 'tasks',
    steps: [] as WorkflowStep[],
  })

  useEffect(() => {
    loadWorkflows()
  }, [staff?.business_id])

  async function loadWorkflows() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      const { data } = await supabase
        .from('workflows')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      setWorkflows(data || [])
    } catch (e) {
      console.error('Failed to load workflows:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveWorkflow() {
    if (!staff?.business_id || !form.name) return

    try {
      const workflowData = {
        business_id: staff.business_id,
        name: form.name,
        description: form.description,
        trigger_type: form.triggerType,
        trigger_config: { entity_type: form.entityType },
        steps: form.steps,
        is_active: false,
      }

      if (editingWorkflow) {
        await supabase
          .from('workflows')
          .update(workflowData)
          .eq('id', editingWorkflow.id)
      } else {
        await supabase.from('workflows').insert(workflowData)
      }

      setShowModal(false)
      setEditingWorkflow(null)
      setForm({ name: '', description: '', triggerType: 'manual', entityType: 'tasks', steps: [] })
      loadWorkflows()
    } catch (e) {
      console.error('Failed to save workflow:', e)
    }
  }

  async function handleToggleWorkflow(workflow: Workflow) {
    try {
      await supabase
        .from('workflows')
        .update({ is_active: !workflow.is_active })
        .eq('id', workflow.id)
      loadWorkflows()
    } catch (e) {
      console.error('Failed to toggle workflow:', e)
    }
  }

  async function handleDeleteWorkflow(id: string) {
    if (!confirm('Delete this workflow?')) return

    try {
      await supabase.from('workflows').delete().eq('id', id)
      loadWorkflows()
    } catch (e) {
      console.error('Failed to delete workflow:', e)
    }
  }

  function editWorkflow(workflow: Workflow) {
    setEditingWorkflow(workflow)
    setForm({
      name: workflow.name,
      description: workflow.description || '',
      triggerType: workflow.trigger_type,
      entityType: workflow.trigger_config?.entity_type || 'tasks',
      steps: workflow.steps || [],
    })
    setShowModal(true)
  }

  function addStep(type: WorkflowStep['type']) {
    const newStep: WorkflowStep = {
      id: `step_${Date.now()}`,
      type,
      config: type === 'action' ? { action_type: 'send_notification' } : {},
    }
    setForm({ ...form, steps: [...form.steps, newStep] })
  }

  function removeStep(stepId: string) {
    setForm({ ...form, steps: form.steps.filter(s => s.id !== stepId) })
  }

  function updateStep(stepId: string, config: Record<string, any>) {
    setForm({
      ...form,
      steps: form.steps.map(s => s.id === stepId ? { ...s, config: { ...s.config, ...config } } : s)
    })
  }

  const stepIcons: Record<string, any> = {
    action: Zap,
    condition: GitBranch,
    delay: Clock,
    notification: Bell,
  }

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <GitBranch size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Workflows</h1>
            <p className="text-sm text-black">Automate your business processes</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary, #0891B2)] text-white text-sm"
        >
          <Plus size={16} />
          New Workflow
        </button>
      </div>

      {/* Workflows List */}
      {loading ? (
        <div className="text-center py-20 text-black">
          <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
          Loading workflows...
        </div>
      ) : workflows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-12 text-center">
          <GitBranch size={48} className="mx-auto text-black/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No workflows yet</h3>
          <p className="text-black mb-4">Create your first workflow to automate tasks</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-3 rounded-xl bg-[var(--av-primary, #0891B2)] text-white font-medium"
          >
            Create Workflow
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {workflows.map(workflow => (
            <div key={workflow.id} className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
              <div className="p-4 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  workflow.is_active 
                    ? 'bg-green-100 text-green-600' 
                    : 'bg-black/10 text-black'
                }`}>
                  <Zap size={24} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{workflow.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      workflow.is_active 
                        ? 'bg-green-100 text-green-600' 
                        : 'bg-black/10 text-black'
                    }`}>
                      {workflow.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-black">
                    <span className="capitalize">{workflow.trigger_type.replace('_', ' ')}</span>
                    <span>•</span>
                    <span>{workflow.steps?.length || 0} steps</span>
                    <span>•</span>
                    <span>{workflow.run_count} runs</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleWorkflow(workflow)}
                    className={`p-2 rounded-lg ${
                      workflow.is_active 
                        ? 'bg-amber-50 text-amber-500 hover:bg-amber-100' 
                        : 'bg-green-50 text-green-500 hover:bg-green-100'
                    }`}
                    title={workflow.is_active ? 'Pause' : 'Activate'}
                  >
                    {workflow.is_active ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                  <button
                    onClick={() => editWorkflow(workflow)}
                    className="p-2 rounded-lg hover:bg-black/10"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDeleteWorkflow(workflow.id)}
                    className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              
              {/* Last Error */}
              {workflow.last_error && (
                <div className="px-4 pb-4">
                  <div className="p-3 bg-red-50 rounded-lg flex items-center gap-2 text-red-600 text-sm">
                    <AlertTriangle size={16} />
                    {workflow.last_error}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/100 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="text-lg font-bold">{editingWorkflow ? 'Edit Workflow' : 'Create Workflow'}</h2>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Basic Info */}
              <div>
                <label className="block text-sm font-medium mb-2">Workflow Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                  placeholder="e.g., Welcome Email Sequence"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-black/10 resize-none"
                  rows={2}
                  placeholder="What does this workflow do?"
                />
              </div>

              {/* Trigger */}
              <div>
                <label className="block text-sm font-medium mb-2">Trigger</label>
                <p className="text-xs text-black mb-2">When should this workflow run?</p>
                <div className="grid grid-cols-2 gap-3">
                  {TRIGGER_TYPES.map(trigger => (
                    <button
                      key={trigger.value}
                      onClick={() => setForm({ ...form, triggerType: trigger.value })}
                      className={`p-3 rounded-xl border-2 text-left transition ${
                        form.triggerType === trigger.value
                          ? 'border-[var(--av-primary, #0891B2)] bg-[var(--av-primary, #0891B2)]/5'
                          : 'border-black/10 hover:border-black/20'
                      }`}
                    >
                      <div className="font-medium text-sm">{trigger.label}</div>
                      <div className="text-xs text-black">{trigger.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Entity Type (for non-manual triggers) */}
              {form.triggerType !== 'manual' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Entity Type</label>
                  <select
                    value={form.entityType}
                    onChange={(e) => setForm({ ...form, entityType: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  >
                    {ENTITY_TYPES.map(entity => (
                      <option key={entity.value} value={entity.value}>{entity.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Steps */}
              <div>
                <label className="block text-sm font-medium mb-2">Steps</label>
                <p className="text-xs text-black mb-3">Add actions to perform when triggered</p>

                {/* Existing Steps */}
                <div className="space-y-3 mb-4">
                  {form.steps.map((step, index) => {
                    const Icon = stepIcons[step.type] || Zap
                    return (
                      <div key={step.id} className="p-4 bg-black/[0.02] rounded-xl flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[var(--av-primary, #0891B2)]/10 flex items-center justify-center text-[var(--av-primary, #0891B2)]">
                          <span className="text-sm font-bold">{index + 1}</span>
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-sm capitalize">{step.type}</div>
                          {step.type === 'action' && (
                            <select
                              value={step.config.action_type}
                              onChange={(e) => updateStep(step.id, { action_type: e.target.value })}
                              className="w-full mt-2 px-3 py-2 rounded-lg border border-black/10 text-sm"
                            >
                              {ACTION_TYPES.map(action => (
                                <option key={action.value} value={action.value}>{action.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                        <button
                          onClick={() => removeStep(step.id)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* Add Step Buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => addStep('action')}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/10 text-sm hover:bg-black/10"
                  >
                    <Plus size={14} />
                    Add Action
                  </button>
                  <button
                    onClick={() => addStep('condition')}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/10 text-sm hover:bg-black/10"
                  >
                    <GitBranch size={14} />
                    Add Condition
                  </button>
                  <button
                    onClick={() => addStep('delay')}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/10 text-sm hover:bg-black/10"
                  >
                    <Clock size={14} />
                    Add Delay
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-black/[0.06] flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false)
                  setEditingWorkflow(null)
                  setForm({ name: '', description: '', triggerType: 'manual', entityType: 'tasks', steps: [] })
                }}
                className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveWorkflow}
                disabled={!form.name}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--av-primary, #0891B2)] text-white font-medium disabled:opacity-50"
              >
                {editingWorkflow ? 'Update' : 'Create'} Workflow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
