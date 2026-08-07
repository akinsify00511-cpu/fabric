import { useState, useEffect } from 'react'
import { Plus, Check, Circle, Clock, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import FeatureSuggestions from '../components/FeatureSuggestions'

type Task = {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  due_date?: string
  assignee?: string
  priority: 'low' | 'medium' | 'high'
  created_at: string
  business_id?: string
  created_by?: string
}

const DEMO_TASKS: Task[] = [
  { id: '1', title: 'Review Q4 sales report', status: 'done', priority: 'high', created_at: '2024-01-15' },
  { id: '2', title: 'Update client onboarding docs', status: 'in_progress', priority: 'medium', created_at: '2024-01-14' },
  { id: '3', title: 'Prepare presentation for investors', status: 'todo', priority: 'high', created_at: '2024-01-13' },
  { id: '4', title: 'Fix login bug on mobile', status: 'in_progress', priority: 'high', created_at: '2024-01-12' },
  { id: '5', title: 'Schedule team meeting', status: 'todo', priority: 'low', created_at: '2024-01-11' },
  { id: '6', title: 'Update pricing page', status: 'todo', priority: 'medium', created_at: '2024-01-10' },
]

const PRIORITY_COLORS = {
  low: 'bg-white text-black',
  medium: 'bg-amber-100 text-amber-600',
  high: 'bg-red-100 text-red-600',
}

const STATUS_ICONS = {
  todo: Circle,
  in_progress: Clock,
  done: Check,
}

export default function Tasks() {
  const { staff, isDemo } = useAuth()
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState('')
  const [filter, setFilter] = useState<'all' | 'todo' | 'in_progress' | 'done'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadTasks = async () => {
      setLoading(true)
      
      if (isDemo || !staff?.business_id) {
        setTasks(DEMO_TASKS)
        setLoading(false)
        return
      }

      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('business_id', staff.business_id)
          .order('created_at', { ascending: false })

        if (error) throw error
        setTasks(data as Task[] || DEMO_TASKS)
      } catch (error) {
        console.error('Failed to load tasks:', error)
        setTasks(DEMO_TASKS)
      } finally {
        setLoading(false)
      }
    }

    loadTasks()
  }, [staff?.business_id, isDemo])

  const addTask = async () => {
    if (!newTask.trim()) return
    
    const task: Task = {
      id: crypto.randomUUID(),
      title: newTask.trim(),
      status: 'todo',
      priority: 'medium',
      created_at: new Date().toISOString(),
      business_id: staff?.business_id,
      created_by: staff?.id,
    }

    if (!isDemo && staff?.business_id) {
      try {
        const { error } = await supabase
          .from('tasks')
          .insert({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            business_id: staff.business_id,
            created_by: staff.id,
          })
        
        if (error) throw error
      } catch (error) {
        console.error('Failed to save task:', error)
        showToast('Failed to create task', 'error')
        return
      }
    }

    setTasks(prev => [task, ...prev])
    setNewTask('')
    showToast('Task created!', 'success')
  }

  const toggleStatus = async (id: string) => {
    const task = tasks.find(t => t.id === id)
    if (!task) return

    const statusOrder: Task['status'][] = ['todo', 'in_progress', 'done']
    const currentIdx = statusOrder.indexOf(task.status)
    const nextStatus = statusOrder[(currentIdx + 1) % 3]

    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: nextStatus } : t))

    if (!isDemo && staff?.business_id) {
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ status: nextStatus })
          .eq('id', id)
          .eq('business_id', staff.business_id)
        
        if (error) throw error
      } catch (error) {
        console.error('Failed to update task:', error)
        showToast('Failed to update task', 'error')
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: task.status } : t))
      }
    }
  }

  const deleteTask = async (id: string) => {
    if (!confirm('Delete this task?')) return

    setTasks(prev => prev.filter(t => t.id !== id))

    if (!isDemo && staff?.business_id) {
      try {
        const { error } = await supabase
          .from('tasks')
          .delete()
          .eq('id', id)
          .eq('business_id', staff.business_id)
        
        if (error) throw error
        showToast('Task deleted', 'info')
      } catch (error) {
        console.error('Failed to delete task:', error)
        showToast('Failed to delete task', 'error')
      }
    }
  }

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)
  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-white rounded-xl"></div>
            ))}
          </div>
          <div className="h-16 bg-white rounded-xl"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {isDemo && (
        <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-xl p-4 mb-6 text-white">
          <p className="font-medium">Demo Mode Active</p>
          <p className="text-sm opacity-90">Sample data shown. Actions are read-only in demo mode.</p>
        </div>
      )}

      <h1 className="text-2xl font-bold text-black mb-6">Tasks</h1>

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
              filter === stat.key ? 'border-[#4285F4] ring-2 ring-[#4285F4]/20' : 'border-black/[0.06]'
            }`}
          >
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-black/50">{stat.label}</p>
          </button>
        ))}
      </div>

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
            disabled={isDemo}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4285F4] text-white text-sm disabled:opacity-50"
          >
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>

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
                <div key={task.id} className="flex items-center gap-3 p-4 hover:bg-black/[0.02] group">
                  <button
                    onClick={() => toggleStatus(task.id)}
                    disabled={isDemo}
                    className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                      task.status === 'done' 
                        ? 'bg-green-500 border-green-500 text-white' 
                        : task.status === 'in_progress'
                        ? 'border-amber-400 text-amber-400'
                        : 'border-black/20 hover:border-black/40'
                    } ${isDemo ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                  <button
                    onClick={() => deleteTask(task.id)}
                    disabled={isDemo}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded text-red-500 transition disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <FeatureSuggestions suggestions={[
        { label: 'Chat', path: '/app/chat', description: 'Discuss tasks with team' },
        { label: 'Calendar', path: '/app/calendar', description: 'Schedule deadlines' },
        { label: 'People', path: '/app/people', description: 'Assign team members' },
      ]} />
    </div>
  )
}
