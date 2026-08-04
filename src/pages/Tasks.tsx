import { useState } from 'react'
import { Plus, Check, Circle, Clock, User, Filter } from 'lucide-react'

type Task = {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  due_date?: string
  assignee?: string
  priority: 'low' | 'medium' | 'high'
  created_at: string
}

const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-amber-100 text-amber-600',
  high: 'bg-red-100 text-red-600',
}

const STATUS_ICONS = {
  todo: Circle,
  in_progress: Clock,
  done: Check,
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>(DEMO_TASKS)
  const [newTask, setNewTask] = useState('')
  const [filter, setFilter] = useState<'all' | 'todo' | 'in_progress' | 'done'>('all')

  const addTask = () => {
    if (!newTask.trim()) return
    const task: Task = {
      id: crypto.randomUUID(),
      title: newTask,
      status: 'todo',
      priority: 'medium',
      created_at: new Date().toISOString(),
    }
    setTasks(prev => [task, ...prev])
    setNewTask('')
  }

  const toggleStatus = (id: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t
      const next: Task['status'][] = ['todo', 'in_progress', 'done']
      const idx = next.indexOf(t.status)
      return { ...t, status: next[(idx + 1) % 3] }
    }))
  }

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)
  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-[var(--avenize-black)] mb-6">Tasks</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { key: 'all', label: 'All', value: stats.total },
          { key: 'todo', label: 'To Do', value: stats.todo },
          { key: 'in_progress', label: 'In Progress', value: stats.in_progress },
          { key: 'done', label: 'Done', value: stats.done },
        ].map(stat => (
          <button
            key={stat.key}
            onClick={() => setFilter(stat.key as any)}
            className={`bg-white rounded-xl p-3 border text-center transition ${
              filter === stat.key ? 'border-[var(--avenize-primary)] ring-2 ring-[var(--avenize-primary)]/20' : 'border-black/[0.06]'
            }`}
          >
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-black/50">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* Add Task */}
      <div className="bg-white rounded-xl p-4 border border-black/[0.06] mb-6">
        <div className="flex gap-2">
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
            placeholder="Add a new task..."
            className="flex-1 rounded-lg border border-black/10 px-4 py-2 text-sm"
          />
          <button
            onClick={addTask}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm"
          >
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-black/40">
            <Circle size={32} className="mx-auto mb-2 opacity-50" />
            <p>No tasks yet</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {filtered.map(task => {
              const StatusIcon = STATUS_ICONS[task.status]
              return (
                <div key={task.id} className="flex items-center gap-3 p-4 hover:bg-black/[0.02]">
                  <button
                    onClick={() => toggleStatus(task.id)}
                    className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                      task.status === 'done' 
                        ? 'bg-green-500 border-green-500 text-white' 
                        : task.status === 'in_progress'
                        ? 'border-amber-400 text-amber-400'
                        : 'border-black/20 hover:border-black/40'
                    }`}
                  >
                    {task.status === 'done' && <Check size={14} />}
                    {task.status === 'in_progress' && <Clock size={12} />}
                  </button>
                  <div className="flex-1">
                    <p className={`text-sm ${task.status === 'done' ? 'line-through text-black/40' : ''}`}>
                      {task.title}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLORS[task.priority]}`}>
                    {task.priority}
                  </span>
                  <span className="text-xs text-black/30">
                    {new Date(task.created_at).toLocaleDateString()}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const DEMO_TASKS: Task[] = [
  { id: '1', title: 'Review Q4 sales report', status: 'done', priority: 'high', created_at: '2024-01-15' },
  { id: '2', title: 'Update client onboarding docs', status: 'in_progress', priority: 'medium', created_at: '2024-01-14' },
  { id: '3', title: 'Prepare presentation for investors', status: 'todo', priority: 'high', created_at: '2024-01-13' },
  { id: '4', title: 'Fix login bug on mobile', status: 'in_progress', priority: 'high', created_at: '2024-01-12' },
  { id: '5', title: 'Schedule team meeting', status: 'todo', priority: 'low', created_at: '2024-01-11' },
  { id: '6', title: 'Update pricing page', status: 'todo', priority: 'medium', created_at: '2024-01-10' },
]
