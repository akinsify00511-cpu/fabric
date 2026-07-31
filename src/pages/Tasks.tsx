import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { ListSkeleton } from '../components/Skeleton'
import { Plus, CheckCircle2, Circle, Clock, AlertTriangle, Trash2 } from 'lucide-react'

type Task = {
  id: string
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assignee_id: string | null
  assignee_name?: string
  due_date: string | null
  created_at: string
}

type StaffMember = {
  id: string
  full_name: string | null
  name: string
}

const PRIORITY_CONFIG = {
  low: { color: 'text-gray-400', label: 'Low' },
  medium: { color: 'text-blue-500', label: 'Medium' },
  high: { color: 'text-orange-500', label: 'High' },
  urgent: { color: 'text-red-500', label: 'Urgent' },
}

const STATUS_CONFIG = {
  todo: { icon: Circle, color: 'text-gray-400', bg: 'bg-gray-100' },
  in_progress: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-100' },
  done: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-100' },
  cancelled: { icon: Circle, color: 'text-gray-300', bg: 'bg-gray-50' },
}

export default function Tasks() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [teamMembers, setTeamMembers] = useState<StaffMember[]>([])
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [filter, setFilter] = useState<'all' | 'mine' | 'unassigned'>('all')

  const load = async () => {
    setLoading(true)
    const [{ data: tasksData }, { data: staffData }] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('staff').select('id, full_name, name'),
    ])
    setTasks((tasksData as Task[]) ?? [])
    setTeamMembers((staffData as StaffMember[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const addTask = async () => {
    if (!title.trim()) {
      showToast('Enter a task title', 'error')
      return
    }
    const { error } = await supabase.from('tasks').insert({
      title,
      priority,
      assignee_id: assigneeId || null,
      due_date: dueDate || null,
      status: 'todo',
      created_by: staff?.id,
    })
    if (error) {
      showToast('Failed to create task', 'error')
    } else {
      showToast('Task created!', 'success')
      setTitle('')
      setDueDate('')
      setAssigneeId('')
      load()
    }
  }

  const toggleStatus = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus, completed_at: newStatus === 'done' ? new Date().toISOString() : null })
      .eq('id', task.id)
    if (error) {
      showToast('Failed to update', 'error')
    } else {
      load()
    }
  }

  const deleteTask = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id)
    showToast('Task deleted', 'info')
    load()
  }

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'mine') return t.assignee_id === staff?.id
    if (filter === 'unassigned') return !t.assignee_id
    return true
  })

  const kanbanColumns = ['todo', 'in_progress', 'done'] as const

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--avenize-black)]">Tasks</h1>
          <p className="text-sm text-black/50 mt-0.5">Assign and track team work</p>
        </div>
      </div>

      {/* Create Task */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm mb-3"
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Task['priority'])}
            className="rounded-lg border border-black/10 px-2 py-1.5 text-xs"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="rounded-lg border border-black/10 px-2 py-1.5 text-xs"
          >
            <option value="">Unassigned</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name ?? m.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border border-black/10 px-2 py-1.5 text-xs"
          />
          <button
            onClick={addTask}
            className="ml-auto rounded-lg avenize-gradient text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition flex items-center gap-1.5"
          >
            <Plus size={14} />
            Add Task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-4">
        {[
          { id: 'all', label: 'All' },
          { id: 'mine', label: 'My Tasks' },
          { id: 'unassigned', label: 'Unassigned' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as typeof filter)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter === f.id ? 'avenize-gradient text-white' : 'bg-white text-black/50 border border-black/[0.06]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Kanban Board */}
      {loading ? (
        <ListSkeleton items={6} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {kanbanColumns.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col)
            const config = STATUS_CONFIG[col]
            const Icon = config.icon
            return (
              <div key={col} className="bg-black/[0.02] rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-3">
                  <Icon size={14} className={config.color} />
                  <span className="text-xs font-medium text-black/60 uppercase tracking-wide">
                    {col.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-black/30 ml-auto">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((task) => {
                    const priorityConfig = PRIORITY_CONFIG[task.priority]
                    return (
                      <div
                        key={task.id}
                        className="bg-white rounded-xl p-3 border border-black/[0.06] shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm text-[var(--avenize-black)] ${task.status === 'done' ? 'line-through opacity-50' : ''}`}>
                              {task.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className={`text-xs ${priorityConfig.color}`}>{priorityConfig.label}</span>
                              {task.due_date && (
                                <span className="text-xs text-black/40">{new Date(task.due_date).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleStatus(task)}
                              className="p-1 hover:bg-black/[0.05] rounded"
                            >
                              {task.status === 'done' ? (
                                <CheckCircle2 size={16} className="text-green-500" />
                              ) : (
                                <Circle size={16} className="text-gray-400" />
                              )}
                            </button>
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="p-1 hover:bg-red-50 rounded text-red-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-black/30 text-center py-4">No tasks</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
