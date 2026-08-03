import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../components/Toast'
import { 
  Vote, ThumbsUp, ThumbsDown, Clock, CheckCircle2, 
  Users, Calendar, Trophy, Star, Crown, Award,
  TrendingUp, MessageSquare, Share2, Bookmark
} from 'lucide-react'

type Poll = {
  id: string
  title: string
  description: string
  options: PollOption[]
  created_by: string
  created_at: string
  deadline: string
  status: 'active' | 'closed' | 'draft'
  allow_multiple: boolean
  anonymous: boolean
}

type PollOption = {
  id: string
  text: string
  votes: number
  percentage: number
}

type Vote = {
  id: string
  poll_id: string
  option_id: string
  created_by: string
}

export default function Voting() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [polls, setPolls] = useState<Poll[]>([])
  const [myVotes, setMyVotes] = useState<Record<string, string>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [newPoll, setNewPoll] = useState({
    title: '',
    description: '',
    options: ['', ''],
    deadline: '',
    allow_multiple: false,
    anonymous: false,
  })

  const loadPolls = async () => {
    if (!staff?.business_id) return
    const { data: pollsData } = await supabase
      .from('polls')
      .select('*')
      .eq('business_id', staff.business_id)
      .order('created_at', { ascending: false })
    
    const { data: votesData } = await supabase
      .from('poll_votes')
      .select('*')
      .eq('business_id', staff.business_id)
    
    setPolls((pollsData as Poll[]) ?? [])
    const votesMap: Record<string, string> = {}
    ;(votesData as Vote[])?.forEach(v => { votesMap[v.poll_id] = v.option_id })
    setMyVotes(votesMap)
  }

  useEffect(() => { loadPolls() }, [staff?.business_id])

  const castVote = async (pollId: string, optionId: string) => {
    if (myVotes[pollId]) {
      showToast('You have already voted on this poll', 'error')
      return
    }
    await supabase.from('poll_votes').insert({
      poll_id: pollId,
      option_id: optionId,
      business_id: staff?.business_id,
      created_by: staff?.id,
    })
    showToast('Vote recorded!', 'success')
    loadPolls()
  }

  const createPoll = async () => {
    if (!newPoll.title || newPoll.options.filter(o => o.trim()).length < 2) {
      showToast('Add title and at least 2 options', 'error')
      return
    }
    const { data } = await supabase.from('polls').insert({
      title: newPoll.title,
      description: newPoll.description,
      options: newPoll.options.filter(o => o.trim()).map((text, i) => ({
        id: `opt_${Date.now()}_${i}`,
        text,
        votes: 0,
        percentage: 0,
      })),
      deadline: newPoll.deadline,
      allow_multiple: newPoll.allow_multiple,
      anonymous: newPoll.anonymous,
      business_id: staff?.business_id,
      created_by: staff?.id,
      status: 'active',
    }).select().single()
    
    if (data) {
      showToast('Poll created!', 'success')
      setShowCreate(false)
      setNewPoll({ title: '', description: '', options: ['', ''], deadline: '', allow_multiple: false, anonymous: false })
      loadPolls()
    }
  }

  const addOption = () => setNewPoll(prev => ({ ...prev, options: [...prev.options, ''] }))
  const removeOption = (i: number) => setNewPoll(prev => ({ ...prev, options: prev.options.filter((_, idx) => idx !== i) }))
  const updateOption = (i: number, val: string) => setNewPoll(prev => ({
    ...prev,
    options: prev.options.map((o, idx) => idx === i ? val : o)
  }))

  const getTotalVotes = (poll: Poll) => poll.options.reduce((sum, o) => sum + o.votes, 0)

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Team Decisions & Voting</h1>
          <p className="text-sm text-black/50">Make decisions together, transparently</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
        >
          <Vote size={16} />
          Create Poll
        </button>
      </div>

      {/* Active Polls */}
      <div className="space-y-4">
        {polls.filter(p => p.status === 'active').map(poll => (
          <div key={poll.id} className="bg-white rounded-2xl border border-black/5 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg">{poll.title}</h3>
                {poll.description && <p className="text-sm text-black/50 mt-1">{poll.description}</p>}
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            </div>

            <div className="space-y-3 mb-4">
              {poll.options.map(option => {
                const total = getTotalVotes(poll)
                const pct = total > 0 ? Math.round((option.votes / total) * 100) : 0
                const isVoted = myVotes[poll.id] === option.id
                
                return (
                  <div key={option.id} className="relative">
                    <button
                      onClick={() => castVote(poll.id, option.id)}
                      disabled={!!myVotes[poll.id]}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        isVoted 
                          ? 'border-indigo-500 bg-indigo-50' 
                          : myVotes[poll.id]
                          ? 'border-black/10 opacity-50'
                          : 'border-black/10 hover:border-indigo-300 hover:bg-indigo-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{option.text}</span>
                        <span className="text-sm text-black/50">{pct}%</span>
                      </div>
                      <div className="h-2 bg-black/5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${isVoted ? 'bg-indigo-500' : 'bg-indigo-300'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                    {isVoted && (
                      <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                        <CheckCircle2 size={14} />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between text-sm text-black/50">
              <span className="flex items-center gap-1">
                <Users size={14} />
                {getTotalVotes(poll)} votes
              </span>
              {poll.deadline && (
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  Ends {new Date(poll.deadline).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        ))}

        {polls.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-black/5">
            <Vote size={48} className="mx-auto text-black/20 mb-4" />
            <h3 className="font-bold text-lg mb-2">No active polls</h3>
            <p className="text-black/50 text-sm mb-4">Create a poll to get team input on important decisions</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
            >
              Create First Poll
            </button>
          </div>
        )}
      </div>

      {/* Create Poll Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-black/5 sticky top-0 bg-white">
              <h2 className="font-bold text-lg">Create New Poll</h2>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-black/5 rounded-lg">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Question</label>
                <input
                  value={newPoll.title}
                  onChange={e => setNewPoll(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="What should we decide on?"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Description (optional)</label>
                <textarea
                  value={newPoll.description}
                  onChange={e => setNewPoll(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Add context for this decision..."
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Options</label>
                {newPoll.options.map((opt, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      value={opt}
                      onChange={e => updateOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                    />
                    {newPoll.options.length > 2 && (
                      <button onClick={() => removeOption(i)} className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg">✕</button>
                    )}
                  </div>
                ))}
                <button onClick={addOption} className="text-sm text-indigo-600 font-medium">+ Add Option</button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Deadline</label>
                <input
                  type="date"
                  value={newPoll.deadline}
                  onChange={e => setNewPoll(prev => ({ ...prev, deadline: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newPoll.allow_multiple}
                    onChange={e => setNewPoll(prev => ({ ...prev, allow_multiple: e.target.checked }))}
                    className="rounded"
                  />
                  Allow multiple votes
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newPoll.anonymous}
                    onChange={e => setNewPoll(prev => ({ ...prev, anonymous: e.target.checked }))}
                    className="rounded"
                  />
                  Anonymous poll
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium">Cancel</button>
                <button onClick={createPoll} className="flex-1 px-4 py-3 rounded-xl avenize-gradient text-white font-medium">Create Poll</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
