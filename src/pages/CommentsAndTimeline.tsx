import { useState, useEffect } from 'react'
import {
  MessageSquare, Clock, User, Send, Reply, MoreHorizontal,
  Trash2, Edit2, Heart, Smile, Paperclip, AtSign,
  Calendar, Edit3, CheckCircle, UserPlus, Bell
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface Comment {
  id: string
  content: string
  content_html?: string
  entity_type: string
  entity_id: string
  user_id: string
  user_name?: string
  user_avatar?: string
  parent_id?: string
  depth: number
  reactions: Record<string, string[]>
  is_edited: boolean
  created_at: string
  replies?: Comment[]
}

interface TimelineItem {
  id: string
  entity_type: string
  entity_id: string
  activity_type: string
  title: string
  description?: string
  user_id: string
  user_name?: string
  content?: string
  created_at: string
}

interface ActivityTimelineProps {
  entityType: string
  entityId: string
  title?: string
}

export default function ActivityTimeline({ entityType, entityId, title }: ActivityTimelineProps) {
  const entityIdStr = entityId || ''
  const { staff } = useAuth()
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (entityType && entityId) {
      loadData()
    }
  }, [entityType, entityId])

  async function loadData() {
    setLoading(true)
    try {
      // Load comments
      const { data: commentsData } = await supabase
        .from('comments')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .is('parent_id', null)
        .order('created_at', { ascending: true })

      // Load timeline
      const { data: timelineData } = await supabase
        .from('activity_timeline')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })

      setComments(commentsData || [])
      setTimeline(timelineData || [])
    } catch (e) {
      console.error('Failed to load timeline:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmitComment() {
    if (!newComment.trim() || !staff) return

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          business_id: staff.business_id,
          user_id: staff.user_id,
          content: newComment,
          entity_type: entityType,
          entity_id: entityId,
          parent_id: replyingTo,
          depth: replyingTo ? 1 : 0,
        })
        .select()
        .single()

      if (error) throw error

      // Also add to timeline
      await supabase.from('activity_timeline').insert({
        business_id: staff.business_id,
        entity_type: entityType,
        entity_id: entityId,
        activity_type: 'commented',
        title: 'Comment added',
        content: newComment.slice(0, 100),
        user_id: staff.user_id,
        user_name: staff.full_name,
      })

      setNewComment('')
      setReplyingTo(null)
      loadData()
    } catch (e) {
      console.error('Failed to add comment:', e)
    }
  }

  async function handleReaction(commentId: string, emoji: string) {
    if (!staff) return

    try {
      const comment = comments.find(c => c.id === commentId)
      if (!comment || !staff?.user_id) return

      const currentReactions = comment.reactions || {}
      const emojiReactions = currentReactions[emoji] || []
      
      if (emojiReactions.includes(staff.user_id)) {
        // Remove reaction
        const updated = emojiReactions.filter(id => id !== staff.user_id)
        await supabase.from('comments').update({
          reactions: { ...currentReactions, [emoji]: updated }
        }).eq('id', commentId)
      } else {
        // Add reaction
        await supabase.from('comments').update({
          reactions: { ...currentReactions, [emoji]: [...emojiReactions, staff.user_id] }
        }).eq('id', commentId)
      }

      loadData()
    } catch (e) {
      console.error('Failed to react:', e)
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return

    try {
      await supabase.from('comments').delete().eq('id', commentId)
      loadData()
    } catch (e) {
      console.error('Failed to delete comment:', e)
    }
  }

  const activityIcons: Record<string, any> = {
    created: UserPlus,
    updated: Edit2,
    deleted: Trash2,
    completed: CheckCircle,
    assigned: User,
    commented: MessageSquare,
    mentioned: AtSign,
    status_changed: Bell,
  }

  // Merge timeline and comments
  const allItems = [
    ...timeline.map(t => ({ ...t, type: 'timeline' as const })),
    ...comments.map(c => ({ ...c, type: 'comment' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="space-y-6">
      {/* Header */}
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <span className="text-sm text-black/50">{allItems.length} activities</span>
        </div>
      )}

      {/* Comment Input */}
      <div className="bg-white rounded-xl border border-black/[0.06] p-4">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--avenize-primary)] to-purple-500 flex items-center justify-center text-white text-sm font-medium shrink-0">
            {staff?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={replyingTo ? 'Write a reply...' : 'Add a comment...'}
              className="w-full p-3 rounded-lg border border-black/10 resize-none text-sm focus:outline-none focus:border-[var(--avenize-primary)]"
              rows={3}
            />
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <button className="p-1.5 rounded hover:bg-black/5 text-black/40">
                  <AtSign size={16} />
                </button>
                <button className="p-1.5 rounded hover:bg-black/5 text-black/40">
                  <Paperclip size={16} />
                </button>
                <button className="p-1.5 rounded hover:bg-black/5 text-black/40">
                  <Smile size={16} />
                </button>
              </div>
              <button
                onClick={handleSubmitComment}
                disabled={!newComment.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm disabled:opacity-50"
              >
                <Send size={14} />
                {replyingTo ? 'Reply' : 'Comment'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-8 text-black/40">Loading...</div>
      ) : allItems.length === 0 ? (
        <div className="text-center py-8 text-black/40">
          <MessageSquare size={32} className="mx-auto mb-2" />
          <p>No activity yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {allItems.map((item, index) => {
            const isComment = item.type === 'comment'
            const commentItem = item as Comment & { type: 'comment' }
            const timelineItem = item as TimelineItem & { type: 'timeline' }

            if (isComment) {
              const Icon = activityIcons.commented
              return (
                <div key={item.id} className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-sm font-medium shrink-0">
                    {commentItem.user_name?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1">
                    <div className="bg-white rounded-xl border border-black/[0.06] p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{commentItem.user_name}</span>
                          {commentItem.is_edited && (
                            <span className="text-xs text-black/40">(edited)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-black/40">
                            {new Date(commentItem.created_at).toLocaleString()}
                          </span>
                          <button className="p-1 rounded hover:bg-black/5">
                            <MoreHorizontal size={14} className="text-black/40" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{commentItem.content}</p>
                      
                      {/* Reactions */}
                      <div className="flex items-center gap-2 mt-3">
                        {Object.entries(commentItem.reactions || {}).map(([emoji, users]) => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(commentItem.id, emoji)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm ${
                              users.includes(staff?.user_id || '') 
                                ? 'bg-[var(--avenize-primary)]/10 text-[var(--avenize-primary)]' 
                                : 'bg-black/5 text-black/60'
                            }`}
                          >
                            {emoji} {users.length}
                          </button>
                        ))}
                        <button
                          onClick={() => setReplyingTo(commentItem.id)}
                          className="px-2 py-0.5 rounded-full text-sm text-black/40 hover:bg-black/5"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            } else {
              const Icon = activityIcons[timelineItem.activity_type] || Clock
              return (
                <div key={item.id} className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-black/50" />
                  </div>
                  <div className="flex-1 py-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{timelineItem.user_name || 'System'}</span>
                      <span className="text-black/50">{timelineItem.title}</span>
                    </div>
                    {timelineItem.description && (
                      <p className="text-sm text-black/50 mt-1">{timelineItem.description}</p>
                    )}
                    <span className="text-xs text-black/40 mt-1 block">
                      {new Date(timelineItem.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              )
            }
          })}
        </div>
      )}
    </div>
  )
}

// ============================================
// Dedicated Comments Page
// ============================================

export function CommentsPage() {
  const { staff } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'mentions' | 'own'>('all')

  useEffect(() => {
    loadComments()
  }, [staff?.business_id, filter])

  async function loadComments() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      let query = supabase
        .from('comments')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (filter === 'mentions') {
        query = query.contains('mentions', [staff.user_id])
      } else if (filter === 'own') {
        query = query.eq('user_id', staff.user_id)
      }

      const { data } = await query
      setComments(data || [])
    } catch (e) {
      console.error('Failed to load comments:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Comments</h1>
          <p className="text-sm text-black/50">All your mentions and comments</p>
        </div>
        <div className="flex gap-2">
          {(['all', 'mentions', 'own'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                filter === f 
                  ? 'bg-[var(--avenize-primary)] text-white' 
                  : 'bg-black/5 text-black/60'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-black/40">Loading...</div>
      ) : comments.length === 0 ? (
        <div className="text-center py-20 text-black/40">
          <MessageSquare size={48} className="mx-auto mb-4" />
          <p>No comments found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map(comment => (
            <div key={comment.id} className="bg-white rounded-xl border border-black/[0.06] p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-medium shrink-0">
                  {comment.user_name?.charAt(0) || 'U'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium">{comment.user_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-black/5 text-black/50 ml-2 uppercase">
                        {comment.entity_type}
                      </span>
                    </div>
                    <span className="text-xs text-black/40">
                      {new Date(comment.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm">{comment.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
