import { useState, useEffect, useRef } from 'react'
import {
  MessageSquare, Clock, User, Send, MoreHorizontal,
  Trash2, Edit2, Smile, Paperclip, AtSign,
  CheckCircle, UserPlus, Bell
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
  mentions?: string[]
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

interface MentionSuggestion {
  user_id: string
  user_name: string
  user_email: string
}

// Map full_name to user_name for compatibility

interface ActivityTimelineProps {
  entityType: string
  entityId: string
  title?: string
}

export default function ActivityTimeline({ entityType, entityId, title }: ActivityTimelineProps) {
  
  const { staff } = useAuth()
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  
  // @mention autocomplete
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([])
  const [showMentionPopup, setShowMentionPopup] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [mentionStartIndex, setMentionStartIndex] = useState(-1)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (entityType && entityId) {
      loadData()
    }
  }, [entityType, entityId])

  // Fetch mention suggestions
  useEffect(() => {
    const fetchMentions = async () => {
      if (!mentionSearch) {
        // Load all team members when @ is typed
        if (staff?.business_id) {
          const { data } = await supabase
            .from('staff')
            .select('user_id, full_name, email')
            .eq('business_id', staff.business_id)
            .neq('user_id', staff.user_id)
            .limit(10)
          
          const mapped: MentionSuggestion[] = (data || []).map((row: any) => ({
            user_id: row.user_id,
            user_name: row.full_name,
            user_email: row.email,
          }))
          setMentionSuggestions(mapped)
        }
      } else {
        // Filter by search
        if (staff?.business_id) {
          const { data } = await supabase
            .from('staff')
            .select('user_id, full_name, email')
            .eq('business_id', staff.business_id)
            .neq('user_id', staff.user_id)
            .ilike('full_name', `${mentionSearch}%`)
            .limit(10)
          
          const mapped: MentionSuggestion[] = (data || []).map((row: any) => ({
            user_id: row.user_id,
            user_name: row.full_name,
            user_email: row.email,
          }))
          setMentionSuggestions(mapped)
        }
      }
    }
    
    if (showMentionPopup) {
      fetchMentions()
    }
  }, [mentionSearch, showMentionPopup, staff?.business_id, staff?.user_id])

  // Handle @ mention in text
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart
    const textBeforeCursor = value.slice(0, cursorPos)
    
    // Check if we're typing a mention
    const atIndex = textBeforeCursor.lastIndexOf('@')
    
    if (atIndex !== -1 && atIndex < cursorPos) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1)
      // Only show popup if there's no space after @
      if (!textAfterAt.includes(' ')) {
        setMentionStartIndex(atIndex)
        setMentionSearch(textAfterAt)
        setShowMentionPopup(true)
        setSelectedMentionIndex(0)
      } else {
        setShowMentionPopup(false)
      }
    } else {
      setShowMentionPopup(false)
    }
    
    setNewComment(value)
  }

  // Insert mention into text
  const insertMention = (user: MentionSuggestion) => {
    const before = newComment.slice(0, mentionStartIndex)
    const after = newComment.slice(textareaRef.current?.selectionStart || mentionStartIndex)
    const mentionText = `@${user.user_name} `
    
    setNewComment(before + mentionText + after)
    setShowMentionPopup(false)
    
    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = mentionStartIndex + mentionText.length
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newPos, newPos)
      }
    }, 0)
  }

  // Handle keyboard in mention popup
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionPopup && mentionSuggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedMentionIndex(prev => Math.min(prev + 1, mentionSuggestions.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedMentionIndex(prev => Math.max(prev - 1, 0))
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          insertMention(mentionSuggestions[selectedMentionIndex])
          break
        case 'Escape':
          setShowMentionPopup(false)
          break
      }
    }
  }

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
      // Extract mentions from content
      const mentionMatches = newComment.match(/@(\w+(?:\s\w+)?)/g) || []
      const mentionedNames = mentionMatches.map(m => m.slice(1).trim())
      
      // Get user IDs for mentions
      let mentionedUserIds: string[] = []
      if (mentionedNames.length > 0) {
        const { data: mentionedUsers } = await supabase
          .from('staff')
          .select('user_id, full_name')
          .eq('business_id', staff.business_id)
          .in('full_name', mentionedNames)
        
        mentionedUserIds = mentionedUsers?.map(u => u.user_id) || []
      }

      const { error } = await supabase
        .from('comments')
        .insert({
          business_id: staff.business_id,
          user_id: staff.user_id,
          content: newComment,
          entity_type: entityType,
          entity_id: entityId,
          parent_id: replyingTo,
          depth: replyingTo ? 1 : 0,
          mentions: mentionedUserIds,
        })
        .select()
        .single()

      if (error) throw error

      // Also add to timeline
      await supabase.from('activity_timeline').insert({
        business_id: staff.business_id,
        entity_type: entityType,
        entity_id: entityId,
        activity_type: mentionedUserIds.length > 0 ? 'mentioned' : 'commented',
        title: mentionedUserIds.length > 0 ? 'Mentioned someone' : 'Comment added',
        content: newComment.slice(0, 100),
        user_id: staff.user_id,
        user_name: staff.full_name,
      })

      setNewComment('')
      setReplyingTo(null)
      setShowMentionPopup(false)
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
          <span className="text-sm text-black">{allItems.length} activities</span>
        </div>
      )}

      {/* Comment Input */}
      <div className="bg-white rounded-xl border border-black/[0.06] p-4 relative">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--av-primary, #4285F4)] to-[#8B5CF6]/50 flex items-center justify-center text-white text-sm font-medium shrink-0">
            {staff?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={newComment}
                onChange={handleCommentChange}
                onKeyDown={handleTextareaKeyDown}
                placeholder={replyingTo ? 'Write a reply... Use @ to mention someone' : 'Add a comment... Use @ to mention someone'}
                className="w-full p-3 rounded-lg border border-black/10 resize-none text-sm focus:outline-none focus:border-[var(--av-primary, #4285F4)]"
                rows={3}
              />
              
              {/* @Mention Autocomplete Popup */}
              {showMentionPopup && mentionSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 bottom-full mb-1 bg-white rounded-lg shadow-xl z-20 max-h-48 overflow-auto">
                  <div className="p-2">
                    <div className="text-xs text-black px-2 py-1 flex items-center gap-1">
                      <AtSign size={10} />
                      Mention someone
                    </div>
                    {mentionSuggestions.map((user, idx) => (
                      <button
                        key={user.user_id}
                        onClick={() => insertMention(user)}
                        className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition ${
                          selectedMentionIndex === idx 
                            ? 'bg-[var(--av-primary, #4285F4)]/10 text-[var(--av-primary, #4285F4)]' 
                            : 'hover:bg-black/10'
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-[#8B5CF6]/50 flex items-center justify-center text-white text-xs">
                          {user.user_name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{user.user_name}</div>
                          <div className="text-xs text-black">{user.user_email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <button 
                  className="p-1.5 rounded hover:bg-black/10 text-[var(--av-primary, #4285F4)]"
                  title="Type @ to mention someone"
                >
                  <AtSign size={16} />
                </button>
                <button className="p-1.5 rounded hover:bg-black/10 text-black">
                  <Paperclip size={16} />
                </button>
                <button className="p-1.5 rounded hover:bg-black/10 text-black">
                  <Smile size={16} />
                </button>
              </div>
              <button
                onClick={handleSubmitComment}
                disabled={!newComment.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm disabled:opacity-50"
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
        <div className="text-center py-8 text-black">Loading...</div>
      ) : allItems.length === 0 ? (
        <div className="text-center py-8 text-black">
          <MessageSquare size={32} className="mx-auto mb-2" />
          <p>No activity yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {allItems.map((item, _index) => {
            const isComment = item.type === 'comment'
            const commentItem = item as Comment & { type: 'comment' }
            const timelineItem = item as TimelineItem & { type: 'timeline' }

            if (isComment) {
              
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
                            <span className="text-xs text-black">(edited)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-black">
                            {new Date(commentItem.created_at).toLocaleString()}
                          </span>
                          <button className="p-1 rounded hover:bg-black/10">
                            <MoreHorizontal size={14} className="text-black" />
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
                                ? 'bg-[var(--av-primary, #4285F4)]/10 text-[var(--av-primary, #4285F4)]' 
                                : 'bg-black/10 text-black/60'
                            }`}
                          >
                            {emoji} {users.length}
                          </button>
                        ))}
                        <button
                          onClick={() => setReplyingTo(commentItem.id)}
                          className="px-2 py-0.5 rounded-full text-sm text-black hover:bg-black/10"
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
                  <div className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-black" />
                  </div>
                  <div className="flex-1 py-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{timelineItem.user_name || 'System'}</span>
                      <span className="text-black">{timelineItem.title}</span>
                    </div>
                    {timelineItem.description && (
                      <p className="text-sm text-black mt-1">{timelineItem.description}</p>
                    )}
                    <span className="text-xs text-black mt-1 block">
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
          <p className="text-sm text-black">All your mentions and comments</p>
        </div>
        <div className="flex gap-2">
          {(['all', 'mentions', 'own'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                filter === f 
                  ? 'bg-[var(--av-primary, #4285F4)] text-white' 
                  : 'bg-black/10 text-black/60'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-black">Loading...</div>
      ) : comments.length === 0 ? (
        <div className="text-center py-20 text-black">
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
                      <span className="text-xs px-2 py-0.5 rounded bg-black/10 text-black ml-2 uppercase">
                        {comment.entity_type}
                      </span>
                    </div>
                    <span className="text-xs text-black">
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
