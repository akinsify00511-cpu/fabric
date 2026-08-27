import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import {
  FileText, CheckCircle2, Loader2,
  ArrowLeft, Gavel, CheckSquare, Search, Calendar,
  ListChecks, ChevronDown, ChevronRight, Send,
} from 'lucide-react'
import {
  fetchMeetingIntelligence, createActionTask, updateActionStatus,
  type MeetingIntelligence, type MeetingAction,
} from '../lib/businessOS'

const BRAND = {
  primary: '#155BB4',
  primarySoft: 'rgba(21, 91, 180, 0.08)',
  surface: '#FFFFFF',
  surface2: '#F8F9FA',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
  success: '#157342',
  danger: '#EA4335',
  warning: '#B45309',
}

const PRIORITY_COLOR: Record<string, string> = {
  low: BRAND.textMuted,
  medium: BRAND.primary,
  high: BRAND.warning,
  urgent: BRAND.danger,
}

const STATUS_COLOR: Record<string, string> = {
  open: BRAND.textSecondary,
  in_progress: BRAND.primary,
  completed: BRAND.success,
  cancelled: BRAND.textMuted,
  deferred: BRAND.warning,
}

export default function MeetingIntelligenceView() {
  const { meetingId } = useParams<{ meetingId: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [intelligence, setIntelligence] = useState<MeetingIntelligence | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedTranscript, setExpandedTranscript] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [actionTaskModal, setActionTaskModal] = useState<MeetingAction | null>(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskPriority, setTaskPriority] = useState('medium')
  const [creatingTask, setCreatingTask] = useState(false)

  const load = useCallback(async () => {
    if (!meetingId) return
    setLoading(true)
    const data = await fetchMeetingIntelligence(meetingId)
    setIntelligence(data)
    setLoading(false)
  }, [meetingId])

  useEffect(() => { load() }, [load])

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    const mins = Math.floor(totalSec / 60)
    const secs = totalSec % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const handleCreateTask = async () => {
    if (!actionTaskModal || !taskTitle.trim()) return
    setCreatingTask(true)
    const taskId = await createActionTask(actionTaskModal.id, taskTitle, {
      dueDate: taskDueDate || undefined,
      priority: taskPriority,
    })
    setCreatingTask(false)
    if (taskId) {
      showToast('Task created from action item', 'success')
      setActionTaskModal(null)
      setTaskTitle('')
      setTaskDueDate('')
      setTaskPriority('medium')
      await load()
    } else {
      showToast('Failed to create task', 'error')
    }
  }

  const handleActionStatusChange = async (action: MeetingAction, status: MeetingAction['status']) => {
    const ok = await updateActionStatus(action.id, status)
    if (ok) {
      showToast('Action updated', 'success')
      await load()
    } else {
      showToast('Failed to update action', 'error')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F9FA' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: BRAND.primary }} />
      </div>
    )
  }

  if (!intelligence) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F9FA' }}>
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-3" style={{ color: BRAND.textMuted }} />
          <p className="text-sm" style={{ color: BRAND.textSecondary }}>
            Meeting intelligence not available.
          </p>
          <p className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
            This meeting may not have a transcript yet, or the feature isn't deployed.
          </p>
          <button
            onClick={() => navigate('/app/meetings')}
            className="mt-4 px-4 py-2 rounded-lg text-sm"
            style={{ backgroundColor: BRAND.primary, color: 'white' }}
          >
            Back to Meetings
          </button>
        </div>
      </div>
    )
  }

  const transcriptStatus = intelligence.meeting.transcript_status
  const hasTranscript = intelligence.transcripts.length > 0
  const hasSummary = intelligence.summaries.length > 0
  const hasDecisions = intelligence.decisions.length > 0
  const hasActions = intelligence.actions.length > 0

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F9FA' }}>
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/app/meetings')}
            className="p-2 rounded-lg"
            style={{ color: BRAND.textSecondary }}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold" style={{ color: BRAND.text }}>
              {intelligence.meeting.title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: transcriptStatus === 'completed' ? 'rgba(21,115,66,0.1)' : 'rgba(180,83,9,0.1)',
                  color: transcriptStatus === 'completed' ? BRAND.success : BRAND.warning,
                }}
              >
                Transcript: {transcriptStatus}
              </span>
              <span className="text-xs" style={{ color: BRAND.textMuted }}>
                Meeting: {intelligence.meeting.status}
              </span>
            </div>
          </div>
        </div>

        {/* Transcript Search */}
        {hasTranscript && (
          <div className="mb-6">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: BRAND.textMuted }} />
                <input
                  type="text"
                  placeholder="Search transcript..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      setSearching(true)
                      const { searchTranscripts } = await import('../lib/businessOS')
                      const results = await searchTranscripts(searchQuery)
                      setSearchResults(results)
                      setSearching(false)
                    }
                  }}
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
                  style={{ border: `1px solid ${BRAND.border}`, backgroundColor: BRAND.surface }}
                />
              </div>
            </div>
            {searching && (
              <p className="text-xs mt-2" style={{ color: BRAND.textMuted }}>Searching...</p>
            )}
            {searchResults.length > 0 && (
              <div className="mt-2 space-y-1">
                {searchResults.map((r, i) => (
                  <div key={i} className="p-2 rounded-lg text-sm" style={{ backgroundColor: BRAND.surface2 }}>
                    <span className="text-xs" style={{ color: BRAND.primary }}>{formatTime(r.start_time_ms)}</span>
                    <span className="ml-2" style={{ color: BRAND.text }}>{r.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Summary */}
          <div className="rounded-2xl p-6" style={{ backgroundColor: BRAND.surface, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4" style={{ color: BRAND.text }}>
              <FileText size={18} style={{ color: BRAND.primary }} />
              Summary
            </h2>
            {hasSummary ? (
              <div className="text-sm whitespace-pre-wrap" style={{ color: BRAND.textSecondary }}>
                {intelligence.summaries[0].summary}
              </div>
            ) : (
              <p className="text-sm" style={{ color: BRAND.textMuted }}>
                No summary available. Summaries are generated automatically when a recording is transcribed.
              </p>
            )}
          </div>

          {/* Decisions */}
          <div className="rounded-2xl p-6" style={{ backgroundColor: BRAND.surface, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4" style={{ color: BRAND.text }}>
              <Gavel size={18} style={{ color: BRAND.primary }} />
              Decisions ({intelligence.decisions.length})
            </h2>
            {hasDecisions ? (
              <div className="space-y-3">
                {intelligence.decisions.map(dec => (
                  <div key={dec.id} className="p-3 rounded-lg" style={{ backgroundColor: BRAND.surface2 }}>
                    <p className="text-sm font-medium" style={{ color: BRAND.text }}>
                      {dec.decision_text}
                    </p>
                    {dec.rationale && (
                      <p className="text-xs mt-1" style={{ color: BRAND.textSecondary }}>
                        {dec.rationale}
                      </p>
                    )}
                    <span
                      className="inline-block text-xs mt-2 px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: dec.status === 'decided' ? 'rgba(21,115,66,0.1)' : 'rgba(180,83,9,0.1)',
                        color: dec.status === 'decided' ? BRAND.success : BRAND.warning,
                      }}
                    >
                      {dec.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: BRAND.textMuted }}>
                No decisions detected. Decisions are extracted automatically from the transcript.
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 rounded-2xl p-6" style={{ backgroundColor: BRAND.surface, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-4" style={{ color: BRAND.text }}>
            <ListChecks size={18} style={{ color: BRAND.primary }} />
            Action Items ({intelligence.actions.length})
          </h2>
          {hasActions ? (
            <div className="space-y-2">
              {intelligence.actions.map(action => (
                <div
                  key={action.id}
                  className="flex items-start gap-3 p-3 rounded-lg"
                  style={{ backgroundColor: BRAND.surface2 }}
                >
                  <button
                    onClick={() => handleActionStatusChange(
                      action,
                      action.status === 'completed' ? 'open' : 'completed'
                    )}
                    className="mt-0.5 flex-shrink-0"
                  >
                    <CheckCircle2
                      size={18}
                      style={{ color: action.status === 'completed' ? BRAND.success : BRAND.textMuted }}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm"
                      style={{
                        color: action.status === 'completed' ? BRAND.textMuted : BRAND.text,
                        textDecoration: action.status === 'completed' ? 'line-through' : 'none',
                      }}
                    >
                      {action.action_text}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs" style={{ color: PRIORITY_COLOR[action.priority] }}>
                        {action.priority}
                      </span>
                      {action.due_date && (
                        <span className="text-xs flex items-center gap-1" style={{ color: BRAND.textMuted }}>
                          <Calendar size={11} /> {formatDate(action.due_date)}
                        </span>
                      )}
                      <span className="text-xs" style={{ color: STATUS_COLOR[action.status] }}>
                        {action.status.replace('_', ' ')}
                      </span>
                      {action.task_id && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: BRAND.primarySoft, color: BRAND.primary }}>
                          Linked to task
                        </span>
                      )}
                    </div>
                  </div>
                  {!action.task_id && action.status !== 'completed' && (
                    <button
                      onClick={() => {
                        setActionTaskModal(action)
                        setTaskTitle(action.action_text)
                      }}
                      className="flex-shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                      style={{ backgroundColor: BRAND.primary, color: 'white' }}
                    >
                      <Send size={12} /> Create task
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: BRAND.textMuted }}>
              No action items detected. Actions are extracted automatically from the transcript.
            </p>
          )}
        </div>

        {/* Transcript */}
        {hasTranscript && (
          <div className="mt-6 rounded-2xl p-6" style={{ backgroundColor: BRAND.surface, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
            <button
              onClick={() => setExpandedTranscript(!expandedTranscript)}
              className="flex items-center gap-2 text-lg font-semibold w-full"
              style={{ color: BRAND.text }}
            >
              {expandedTranscript ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <FileText size={18} style={{ color: BRAND.primary }} />
              Transcript ({intelligence.transcripts[0].word_count ?? 0} words)
            </button>
            {expandedTranscript && (
              <div className="mt-4 max-h-96 overflow-y-auto text-sm whitespace-pre-wrap" style={{ color: BRAND.textSecondary }}>
                {intelligence.transcripts[0].full_text}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      {actionTaskModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setActionTaskModal(null)}
        >
          <div
            className="max-w-md w-full rounded-2xl p-6"
            style={{ backgroundColor: BRAND.surface }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-1" style={{ color: BRAND.text }}>
              Create Task from Action
            </h3>
            <p className="text-xs mb-4" style={{ color: BRAND.textMuted }}>
              This creates a real task in your task list, linked to this meeting.
            </p>

            <label className="text-xs font-medium block mb-1" style={{ color: BRAND.textSecondary }}>
              Task title
            </label>
            <input
              type="text"
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm mb-3"
              style={{ border: `1px solid ${BRAND.border}`, backgroundColor: BRAND.surface2 }}
            />

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: BRAND.textSecondary }}>
                  Due date
                </label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={e => setTaskDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ border: `1px solid ${BRAND.border}`, backgroundColor: BRAND.surface2 }}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: BRAND.textSecondary }}>
                  Priority
                </label>
                <select
                  value={taskPriority}
                  onChange={e => setTaskPriority(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ border: `1px solid ${BRAND.border}`, backgroundColor: BRAND.surface2 }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setActionTaskModal(null)}
                className="flex-1 py-2.5 rounded-lg text-sm"
                style={{ backgroundColor: BRAND.surface2, color: BRAND.textSecondary }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTask}
                disabled={creatingTask || !taskTitle.trim()}
                className="flex-1 py-2.5 rounded-lg text-sm text-white flex items-center justify-center gap-2"
                style={{ backgroundColor: taskTitle.trim() ? BRAND.primary : BRAND.textMuted }}
              >
                {creatingTask ? <Loader2 size={16} className="animate-spin" /> : <CheckSquare size={16} />}
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
