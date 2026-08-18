import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Check, Circle, Clock, Trash2, X, MessageSquare, Timer,
  CheckCircle2, AlertCircle, User,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import FeatureSuggestions from '../components/FeatureSuggestions'
import type { Staff } from '../lib/AuthContext'

type TaskStatus = 'todo' | 'in_progress' | 'done'
type Priority = 'low' | 'medium' | 'high' | 'urgent'
type ReviewStatus = 'pending' | 'satisfactory' | 'needs_rework'

type Task = {
  id: string
  title: string
  description?: string | null
  status: TaskStatus
  due_date?: string | null
  assignee_id?: string | null
  priority: Priority
  estimated_hours?: number | null
  actual_hours?: number | null
  review_status?: ReviewStatus
  review_comment?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  created_at: string
  business_id?: string
  created_by?: string | null
}

type TaskComment = {
  id: string
  body: string
  author_id?: string | null
  created_at: string
}

type TimeLog = {
  id: string
  hours: number
  note?: string | null
  staff_id?: string | null
  logged_at: string
}

const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-[var(--av-surface-3)] text-[var(--av-text-secondary)]',
  medium: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
}

const REVIEW_BADGE: Record<ReviewStatus, { label: string; cls: string; icon: typeof Check }> = {
  pending: { label: 'Review', cls: 'bg-[var(--av-surface-3)] text-[var(--av-text-secondary)]', icon: Clock },
  satisfactory: { label: 'Satisfactory', cls: 'bg-[var(--av-success-soft)] text-[var(--av-success)]', icon: CheckCircle2 },
  needs_rework: { label: 'Needs Rework', cls: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]', icon: AlertCircle },
}

export default function Tasks() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [teamMembers, setTeamMembers] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | TaskStatus>('all')

  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('medium')
  const [newEstimate, setNewEstimate] = useState('')

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const canManage =
    !!staff &&
    (staff.role === 'owner' ||
      staff.role === 'admin' ||
      staff.role === 'manager' ||
      staff.role === 'team_lead')

  const memberName = useCallback(
    (id?: string | null) =>
      teamMembers.find((m) => m.id === id)?.full_name ||
      teamMembers.find((m) => m.id === id)?.name ||
      null,
    [teamMembers],
  )

  const loadData = useCallback(async () => {
    if (!staff?.business_id) {
      setTasks([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [tasksRes, membersRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*')
          .eq('business_id', staff.business_id)
          .order('created_at', { ascending: false }),
        supabase
          .from('staff')
          .select('id, full_name, name, role, job_title')
          .eq('business_id', staff.business_id)
          .eq('active', true),
      ])
      if (tasksRes.error) throw tasksRes.error
      setTasks((tasksRes.data as Task[]) || [])
      if (membersRes.error) {
        console.warn('Could not load team members:', membersRes.error.message)
      }
      setTeamMembers((membersRes.data as Staff[]) || [])
    } catch (error) {
      console.warn('Tasks not available:', (error as any)?.message)
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [staff?.business_id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const resetForm = () => {
    setNewTitle('')
    setNewDesc('')
    setNewAssignee('')
    setNewDue('')
    setNewPriority('medium')
    setNewEstimate('')
    setShowForm(false)
  }

  const addTask = async () => {
    if (!newTitle.trim() || !staff?.business_id) return
    const est = newEstimate.trim() ? parseFloat(newEstimate) : null
    const payload = {
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      business_id: staff.business_id,
      created_by: staff.id,
      status: 'todo' as TaskStatus,
      priority: newPriority,
      assignee_id: newAssignee || null,
      due_date: newDue || null,
      estimated_hours: est && !isNaN(est) ? est : null,
    }
    try {
      const { data, error } = await supabase.from('tasks').insert(payload).select().single()
      if (error) throw error
      setTasks((prev) => [data as Task, ...prev])
      resetForm()
      showToast('Task created and assigned', 'success')
    } catch (error) {
      console.warn('Could not save task:', (error as any)?.message)
      showToast('Failed to create task', 'error')
    }
  }

  const updateTask = async (id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    setSelectedTask((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev))
    try {
      const { error } = await supabase
        .from('tasks')
        .update(patch)
        .eq('id', id)
        .eq('business_id', staff!.business_id!)
      if (error) throw error
    } catch (error) {
      console.warn('Could not update task:', (error as any)?.message)
      showToast('Failed to update task', 'error')
      await loadData()
    }
  }

  const toggleStatus = (task: Task) => {
    const order: TaskStatus[] = ['todo', 'in_progress', 'done']
    const next = order[(order.indexOf(task.status) + 1) % 3]
    updateTask(task.id, { status: next })
  }

  const deleteTask = async (id: string) => {
    if (!confirm('Delete this task?')) return
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setSelectedTask(null)
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)
        .eq('business_id', staff!.business_id!)
      if (error) throw error
      showToast('Task deleted', 'info')
    } catch (error) {
      console.warn('Could not delete task:', (error as any)?.message)
      showToast('Failed to delete task', 'error')
      await loadData()
    }
  }

  const filtered = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)
  const stats = {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  }

  const totalEstimated = tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0)
  const totalActual = tasks.reduce((s, t) => s + (t.actual_hours || 0), 0)

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-white rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Tasks</h1>
        {canManage && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm hover:opacity-90"
          >
            <Plus size={16} />
            {showForm ? 'Cancel' : 'Assign Task'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { key: 'all', label: 'All', value: stats.total },
          { key: 'todo', label: 'To Do', value: stats.todo },
          { key: 'in_progress', label: 'In Progress', value: stats.in_progress },
          { key: 'done', label: 'Done', value: stats.done },
        ].map((stat) => (
          <button
            key={stat.key}
            onClick={() => setFilter(stat.key as any)}
            className={`bg-white rounded-xl p-3 border text-center transition ${
              filter === stat.key
                ? 'border-[var(--av-primary, #4285F4)] ring-2 ring-[var(--av-primary, #4285F4)]/20'
                : 'border-black/[0.06]'
            }`}
          >
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-black">{stat.label}</p>
          </button>
        ))}
      </div>

      {(totalEstimated > 0 || totalActual > 0) && (
        <div className="bg-white rounded-xl p-3 border border-black/[0.06] mb-6 flex items-center gap-4 text-sm">
          <Timer size={16} className="text-[var(--av-text-muted)]" />
          <span className="text-black">
            Time tracked: <b>{totalActual}h</b> logged / <b>{totalEstimated}h</b> estimated
          </span>
        </div>
      )}

      {showForm && canManage && (
        <div className="bg-white rounded-xl p-4 border border-black/[0.06] mb-6 space-y-3">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title..."
            className="w-full rounded-lg border border-black/10 px-4 py-2 text-sm"
            autoFocus
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description / instructions (optional)..."
            rows={2}
            className="w-full rounded-lg border border-black/10 px-4 py-2 text-sm resize-none"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-black/60 mb-1">Assign to</label>
              <select
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.name} {m.role !== 'staff' ? `(${m.role})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-black/60 mb-1">Due date</label>
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-black/60 mb-1">Priority</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as Priority)}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-black/60 mb-1">Est. hours</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={newEstimate}
                onChange={(e) => setNewEstimate(e.target.value)}
                placeholder="—"
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={resetForm} className="px-4 py-2 rounded-lg text-sm text-black/60 hover:bg-black/5">
              Cancel
            </button>
            <button
              onClick={addTask}
              disabled={!newTitle.trim()}
              className="px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm disabled:opacity-50 hover:opacity-90"
            >
              Create & Assign
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-black">
            <Circle size={32} className="mx-auto mb-2 opacity-50" />
            <p>No tasks yet</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {filtered.map((task) => {
              const assignee = memberName(task.assignee_id)
              const review = REVIEW_BADGE[task.review_status || 'pending']
              const isOverdue =
                !!task.due_date &&
                task.status !== 'done' &&
                new Date(task.due_date) < new Date(new Date().toDateString())
              return (
                <div
                  key={task.id}
                  className="p-4 hover:bg-black/[0.02] group cursor-pointer"
                  onClick={() => setSelectedTask(task)}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleStatus(task)
                      }}
                      className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                        task.status === 'done'
                          ? 'bg-[var(--av-success-soft)]0 border-green-500 text-white'
                          : task.status === 'in_progress'
                            ? 'border-amber-400 text-amber-400'
                            : 'border-black/20 hover:border-black/40'
                      }`}
                    >
                      {task.status === 'done' && <Check size={14} />}
                      {task.status === 'in_progress' && <Clock size={12} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm truncate ${
                          task.status === 'done' ? 'line-through text-black/40' : 'text-black'
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-black/50">{STATUS_LABELS[task.status]}</span>
                        {assignee && (
                          <span className="text-xs text-black/50 flex items-center gap-0.5">
                            · <User size={10} /> {assignee}
                          </span>
                        )}
                        {task.due_date && (
                          <span className={`text-xs ${isOverdue ? 'text-[var(--av-danger)] font-medium' : 'text-black/50'}`}>
                            · {isOverdue ? 'Overdue ' : 'Due '}
                            {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        )}
                        {task.status === 'done' && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${review.cls}`}>
                            <review.icon size={10} /> {review.label}
                          </span>
                        )}
                        {(task.actual_hours || 0) > 0 && (
                          <span className="text-xs text-black/40">· {task.actual_hours}h logged</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${PRIORITY_COLORS[task.priority]}`}>
                      {task.priority}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteTask(task.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--av-danger-soft)] rounded text-[var(--av-danger)] transition shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <FeatureSuggestions
        suggestions={[
          { label: 'Chat', path: '/app/chat', description: 'Discuss tasks with team' },
          { label: 'Calendar', path: '/app/calendar', description: 'Schedule deadlines' },
          { label: 'People', path: '/app/people', description: 'Assign team members' },
        ]}
      />

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          teamMembers={teamMembers}
          memberName={memberName}
          canManage={canManage}
          currentUserId={staff?.id}
          onClose={() => setSelectedTask(null)}
          onUpdate={(patch) => updateTask(selectedTask.id, patch)}
          onToast={showToast}
          businessId={staff?.business_id}
        />
      )}
    </div>
  )
}

/* ============================================================
   TaskDetail — follow-up comments, time logs, review feedback
   ============================================================ */

function TaskDetail({
  task,
  memberName,
  canManage,
  currentUserId,
  onClose,
  onUpdate,
  onToast,
  businessId,
}: {
  task: Task
  teamMembers: Staff[]
  memberName: (id?: string | null) => string | null
  canManage: boolean
  currentUserId?: string
  onClose: () => void
  onUpdate: (patch: Partial<Task>) => void
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  businessId?: string
}) {
  const [comments, setComments] = useState<TaskComment[]>([])
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([])
  const [newComment, setNewComment] = useState('')
  const [logHours, setLogHours] = useState('')
  const [logNote, setLogNote] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [tab, setTab] = useState<'comments' | 'time' | 'review'>('comments')

  useEffect(() => {
    const load = async () => {
      try {
        const [cRes, tRes] = await Promise.all([
          supabase
            .from('task_comments')
            .select('id, body, author_id, created_at')
            .eq('task_id', task.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('task_time_logs')
            .select('id, hours, note, staff_id, logged_at')
            .eq('task_id', task.id)
            .order('logged_at', { ascending: false }),
        ])
        setComments((cRes.data as TaskComment[]) || [])
        setTimeLogs((tRes.data as TimeLog[]) || [])
      } catch (error) {
        console.warn('Could not load task detail:', (error as any)?.message)
      }
    }
    load()
  }, [task.id])

  const addComment = async () => {
    if (!newComment.trim() || !businessId || !currentUserId) return
    const payload = {
      task_id: task.id,
      business_id: businessId,
      author_id: currentUserId,
      body: newComment.trim(),
    }
    try {
      const { data, error } = await supabase
        .from('task_comments')
        .insert(payload)
        .select('id, body, author_id, created_at')
        .single()
      if (error) throw error
      setComments((prev) => [...prev, data as TaskComment])
      setNewComment('')
    } catch (error) {
      onToast('Could not post comment', 'error')
      console.warn((error as any)?.message)
    }
  }

  const logTime = async () => {
    const hours = parseFloat(logHours)
    if (!hours || hours <= 0 || !businessId || !currentUserId) return
    const payload = {
      task_id: task.id,
      business_id: businessId,
      staff_id: currentUserId,
      hours,
      note: logNote.trim() || null,
    }
    try {
      const { data, error } = await supabase
        .from('task_time_logs')
        .insert(payload)
        .select('id, hours, note, staff_id, logged_at')
        .single()
      if (error) throw error
      setTimeLogs((prev) => [data as TimeLog, ...prev])
      setLogHours('')
      setLogNote('')
      onUpdate({ actual_hours: (task.actual_hours || 0) + hours })
      onToast(`${hours}h logged`, 'success')
    } catch (error) {
      onToast('Could not log time', 'error')
      console.warn((error as any)?.message)
    }
  }

  const reviewTask = (status: 'satisfactory' | 'needs_rework') => {
    if (!currentUserId) return
    const patch: Partial<Task> = {
      review_status: status,
      review_comment: reviewComment.trim() || null,
      reviewed_by: currentUserId,
      reviewed_at: new Date().toISOString(),
    }
    if (status === 'needs_rework') patch.status = 'in_progress'
    onUpdate(patch)
    setReviewComment('')
    onToast(
      status === 'satisfactory' ? 'Marked satisfactory' : 'Sent back for rework',
      status === 'satisfactory' ? 'success' : 'info',
    )
  }

  const totalLogged = timeLogs.reduce((s, t) => s + t.hours, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-black/[0.06]">
          <div className="min-w-0">
            <p className="font-semibold text-black truncate">{task.title}</p>
            <p className="text-xs text-black/50 mt-0.5">
              {STATUS_LABELS[task.status]} · {task.priority}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded text-black/50">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4 flex-1">
          {task.description && <p className="text-sm text-black/70">{task.description}</p>}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-black/40 mb-0.5">Assignee</p>
              <p className="text-black">{memberName(task.assignee_id) || 'Unassigned'}</p>
            </div>
            <div>
              <p className="text-xs text-black/40 mb-0.5">Due date</p>
              <p className="text-black">
                {task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-black/40 mb-0.5">Estimated</p>
              <p className="text-black">{task.estimated_hours ? `${task.estimated_hours}h` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-black/40 mb-0.5">Logged</p>
              <p className="text-black">{totalLogged}h</p>
            </div>
          </div>

          <div className="flex gap-1 border-b border-black/[0.06]">
            {(
              [
                { k: 'comments', label: 'Follow-ups', icon: MessageSquare, count: comments.length },
                { k: 'time', label: 'Time', icon: Timer, count: timeLogs.length },
                { k: 'review', label: 'Review', icon: CheckCircle2 },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition ${
                  tab === t.k
                    ? 'border-[var(--av-primary, #4285F4)] text-black'
                    : 'border-transparent text-black/50'
                }`}
              >
                <t.icon size={14} /> {t.label}
                {'count' in t && t.count ? (
                  <span className="text-xs bg-black/10 rounded-full px-1.5">{t.count}</span>
                ) : null}
              </button>
            ))}
          </div>

          {tab === 'comments' && (
            <div className="space-y-3">
              {comments.length === 0 && (
                <p className="text-sm text-black/40 text-center py-4">No follow-ups yet</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="bg-[var(--av-surface-2)] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-black/70">
                      {memberName(c.author_id) || 'Someone'}
                    </span>
                    <span className="text-xs text-black/40">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-black/80 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addComment()}
                  placeholder="Add a follow-up comment..."
                  className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
                <button
                  onClick={addComment}
                  disabled={!newComment.trim()}
                  className="px-3 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {tab === 'time' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={logHours}
                  onChange={(e) => setLogHours(e.target.value)}
                  placeholder="Hours"
                  className="w-24 rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
                <input
                  value={logNote}
                  onChange={(e) => setLogNote(e.target.value)}
                  placeholder="What did you work on? (optional)"
                  className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
                <button
                  onClick={logTime}
                  disabled={!logHours}
                  className="px-3 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm disabled:opacity-50"
                >
                  Log
                </button>
              </div>
              {timeLogs.length === 0 ? (
                <p className="text-sm text-black/40 text-center py-4">No time logged yet</p>
              ) : (
                timeLogs.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between bg-[var(--av-surface-2)] rounded-lg p-3"
                  >
                    <div>
                      <p className="text-sm text-black/80">
                        <b>{t.hours}h</b> {t.note && <span className="text-black/50">— {t.note}</span>}
                      </p>
                      <p className="text-xs text-black/40">
                        {memberName(t.staff_id) || 'Someone'} · {new Date(t.logged_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {(task.estimated_hours || 0) > 0 && (
                <div className="text-xs text-black/50">
                  {totalLogged}h logged of {task.estimated_hours}h estimated
                  {totalLogged > (task.estimated_hours || 0) && (
                    <span className="text-[var(--av-warning)]"> · over estimate</span>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'review' && (
            <div className="space-y-3">
              {!canManage ? (
                <p className="text-sm text-black/40">
                  Only team leads and managers can review completed work.
                </p>
              ) : task.status !== 'done' ? (
                <p className="text-sm text-black/40">Mark the task as done before reviewing it.</p>
              ) : (
                <>
                  <div
                    className={`p-3 rounded-lg flex items-center gap-2 ${REVIEW_BADGE[task.review_status || 'pending'].cls}`}
                  >
                    <CheckCircle2 size={16} />
                    <span className="text-sm font-medium">
                      Current status: {REVIEW_BADGE[task.review_status || 'pending'].label}
                    </span>
                  </div>
                  {task.review_comment && (
                    <div className="bg-[var(--av-surface-2)] rounded-lg p-3">
                      <p className="text-xs text-black/40 mb-1">Review feedback</p>
                      <p className="text-sm text-black/80">{task.review_comment}</p>
                    </div>
                  )}
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Review feedback (e.g. 'Good work' or 'Please redo the calculations...')"
                    rows={3}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => reviewTask('satisfactory')}
                      className="flex-1 px-4 py-2 rounded-lg bg-[var(--av-success)] text-white text-sm hover:bg-green-700"
                    >
                      <CheckCircle2 size={14} className="inline mr-1" /> Satisfactory
                    </button>
                    <button
                      onClick={() => reviewTask('needs_rework')}
                      className="flex-1 px-4 py-2 rounded-lg bg-[var(--av-danger)] text-white text-sm hover:bg-red-700"
                    >
                      <AlertCircle size={14} className="inline mr-1" /> Needs Rework
                    </button>
                  </div>
                  <p className="text-xs text-black/40">
                    'Needs Rework' sends the task back to In Progress so the assignee can act on your
                    feedback.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
