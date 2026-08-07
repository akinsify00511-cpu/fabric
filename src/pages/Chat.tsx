import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import FeatureSuggestions from '../components/FeatureSuggestions'
import { Send, Hash, Lock, Users, Plus, ArrowLeft, Smile, Trash2 } from 'lucide-react'

type Channel = {
  id: string
  name: string
  description: string | null
  type: 'public' | 'private' | 'direct'
  unread_count: number
  last_message_at: string | null
}

type Message = {
  id: string
  channel_id: string
  sender_id: string | null
  sender_name?: string
  content: string
  message_type: 'text' | 'system' | 'file'
  parent_id: string | null
  created_at: string
  reactions?: Reaction[]
}

type Reaction = {
  emoji: string
  count: number
  reacted: boolean
}

type StaffMember = {
  id: string
  full_name: string | null
  name: string
}

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

// Demo data for when Supabase isn't available
const DEMO_CHANNELS: Channel[] = [
  { id: 'demo-1', name: 'general', description: 'General discussions', type: 'public', unread_count: 2, last_message_at: new Date().toISOString() },
  { id: 'demo-2', name: 'random', description: 'Off-topic chat', type: 'public', unread_count: 0, last_message_at: new Date().toISOString() },
  { id: 'demo-3', name: 'announcements', description: 'Team announcements', type: 'private', unread_count: 1, last_message_at: new Date().toISOString() },
]

const DEMO_MESSAGES: Record<string, Message[]> = {
  'demo-1': [
    { id: 'dm-1', channel_id: 'demo-1', sender_id: 'demo-user-1', sender_name: 'Sarah Johnson', content: 'Good morning team! Ready for the sprint review today?', message_type: 'text', parent_id: null, created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 'dm-2', channel_id: 'demo-1', sender_id: 'demo-user-2', sender_name: 'Michael Okonkwo', content: 'Yes! I have the demo ready. Just polishing the slides.', message_type: 'text', parent_id: null, created_at: new Date(Date.now() - 3000000).toISOString() },
    { id: 'dm-3', channel_id: 'demo-1', sender_id: 'demo-user-1', sender_name: 'Sarah Johnson', content: 'Perfect. Let\'s meet in the conference room at 2pm.', message_type: 'text', parent_id: null, created_at: new Date(Date.now() - 1800000).toISOString() },
  ],
  'demo-2': [
    { id: 'dm-4', channel_id: 'demo-2', sender_id: 'demo-user-3', sender_name: 'Aisha Bello', content: 'Anyone up for lunch at 12:30?', message_type: 'text', parent_id: null, created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: 'dm-5', channel_id: 'demo-2', sender_id: 'demo-user-2', sender_name: 'Michael Okonkwo', content: 'Count me in!', message_type: 'text', parent_id: null, created_at: new Date(Date.now() - 5400000).toISOString() },
  ],
  'demo-3': [
    { id: 'dm-6', channel_id: 'demo-3', sender_id: 'demo-admin', sender_name: 'Admin', content: 'New company policy update - please read by end of week.', message_type: 'system', parent_id: null, created_at: new Date(Date.now() - 86400000).toISOString() },
  ],
}

export default function Chat() {
  const { staff, isDemo } = useAuth()
  const { showToast } = useToast()
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [creatingChannel, setCreatingChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelListRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const loadChannels = async () => {
    // Use demo data for demo mode or if Supabase RPC fails
    if (isDemo || !staff?.business_id) {
      setChannels(DEMO_CHANNELS)
      setLoading(false)
      return
    }

    try {
      const { data } = await supabase.rpc('get_my_channels')
      if (data && Array.isArray(data) && data.length > 0) {
        setChannels(data as Channel[])
      } else {
        // Fallback to querying channels table directly
        const { data: channelData } = await supabase
          .from('channels')
          .select('*')
          .eq('business_id', staff.business_id)
          .order('created_at', { ascending: true })
        
        setChannels((channelData as Channel[]) ?? DEMO_CHANNELS)
      }
    } catch {
      setChannels(DEMO_CHANNELS)
    }
    setLoading(false)
  }

  const loadMessages = async (channelId: string) => {
    setLoading(true)

    // Use demo messages for demo mode or demo channel IDs
    if (isDemo || channelId.startsWith('demo-')) {
      const demoMsgs = DEMO_MESSAGES[channelId] || []
      setMessages(demoMsgs)
      setLoading(false)
      setTimeout(scrollToBottom, 100)
      return
    }

    try {
      const { data: messagesData } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(100)

      // Enrich with sender names
      const { data: staffData } = await supabase.from('staff').select('id, full_name, name')
      const staffMap = new Map((staffData ?? []).map((s: StaffMember) => [s.id, s.full_name ?? s.name]))

      const enrichedMessages = (messagesData ?? []).map((m: any) => ({
        ...m,
        sender_name: m.sender_id ? staffMap.get(m.sender_id) : 'Avenize',
      }))

      setMessages(enrichedMessages as Message[])
    } catch {
      setMessages([])
    }
    setLoading(false)
    setTimeout(scrollToBottom, 100)
  }

  useEffect(() => {
    loadChannels()
  }, [isDemo, staff?.business_id])

  useEffect(() => {
    if (!selectedChannel) return
    loadMessages(selectedChannel.id)

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat:${selectedChannel.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${selectedChannel.id}`,
      }, async (payload) => {
        const newMsg = payload.new as any
        // Enrich sender name
        const { data: senderData } = await supabase
          .from('staff')
          .select('full_name, name')
          .eq('id', newMsg.sender_id)
          .single()
        const enriched = {
          ...newMsg,
          sender_name: senderData?.full_name ?? senderData?.name ?? 'Unknown',
        }
        setMessages((prev) => [...prev, enriched as Message])
        setTimeout(scrollToBottom, 100)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedChannel?.id])

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChannel || !staff) return

    // Demo mode - add to local state only
    if (isDemo || selectedChannel.id.startsWith('demo-')) {
      const newMsg: Message = {
        id: `msg-${Date.now()}`,
        channel_id: selectedChannel.id,
        sender_id: staff.id,
        sender_name: staff.full_name || 'You',
        content: newMessage.trim(),
        message_type: 'text',
        parent_id: null,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, newMsg])
      setNewMessage('')
      setTimeout(scrollToBottom, 100)
      return
    }

    const { error } = await supabase.from('messages').insert({
      channel_id: selectedChannel.id,
      sender_id: staff.id,
      content: newMessage.trim(),
      message_type: 'text',
    })

    if (error) {
      showToast('Failed to send', 'error')
    } else {
      setNewMessage('')
    }
  }

  const createChannel = async () => {
    if (!newChannelName.trim()) return

    // Demo mode - create locally only
    if (isDemo || !staff?.business_id) {
      const newChannel: Channel = {
        id: `demo-${Date.now()}`,
        name: newChannelName.toLowerCase().replace(/\s+/g, '-'),
        description: null,
        type: 'public',
        unread_count: 0,
        last_message_at: null,
      }
      setChannels((prev) => [...prev, newChannel])
      setSelectedChannel(newChannel)
      setNewChannelName('')
      setCreatingChannel(false)
      showToast(`#${newChannel.name} created!`, 'success')
      return
    }

    const { data, error } = await supabase
      .from('channels')
      .insert({ 
        name: newChannelName.toLowerCase().replace(/\s+/g, '-'), 
        type: 'public',
        business_id: staff.business_id,
      })
      .select()
      .single()

    if (error) {
      showToast(error.message, 'error')
    } else {
      // Auto-join the new channel
      await supabase.from('channel_members').insert({ channel_id: data.id, staff_id: staff?.id })
      await loadChannels()
      setSelectedChannel({ ...data, unread_count: 0, last_message_at: null })
      setNewChannelName('')
      setCreatingChannel(false)
      showToast(`#${data.name} created!`, 'success')
    }
  }

  const joinChannel = async (channelId: string) => {
    // Demo channels don't need joining
    if (isDemo || channelId.startsWith('demo-')) {
      const channel = channels.find((c) => c.id === channelId)
      if (channel) setSelectedChannel(channel)
      return
    }

    await supabase.rpc('join_channel', { p_channel_id: channelId })
    await loadChannels()
    const channel = channels.find((c) => c.id === channelId)
    if (channel) setSelectedChannel(channel)
  }

  const addReaction = async (messageId: string, emoji: string) => {
    await supabase.from('message_reactions').insert({ message_id: messageId, staff_id: staff?.id, emoji })
    setShowEmojiPicker(null)
  }

  const deleteMessage = async (messageId: string) => {
    await supabase.from('messages').delete().eq('id', messageId)
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
    showToast('Message deleted', 'info')
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    if (date.toDateString() === today.toDateString()) return 'Today'
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = []
  let lastDate = ''
  messages.forEach((msg) => {
    const msgDate = formatDate(msg.created_at)
    if (msgDate !== lastDate) {
      groupedMessages.push({ date: msgDate, messages: [msg] })
      lastDate = msgDate
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg)
    }
  })

  return (
    <div className="flex h-[calc(100vh-140px)] md:h-[calc(100vh-80px)]">
      {/* Channel List */}
      <div
        ref={channelListRef}
        className={`w-64 bg-white border-r border-black/[0.06] flex flex-col ${
          selectedChannel ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-black/[0.06]">
          <h2 className="text-sm font-semibold text-gray-900">Channels</h2>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => {
                setSelectedChannel(channel)
                joinChannel(channel.id)
              }}
              className={`w-full px-4 py-2 flex items-center gap-2 text-sm transition ${
                selectedChannel?.id === channel.id
                  ? 'bg-[var(--avenize-accent-end)]/10 text-[var(--avenize-accent-end)]'
                  : 'text-black/60 hover:bg-black/[0.02]'
              }`}
            >
              <Hash size={16} className="shrink-0" />
              <span className="flex-1 text-left truncate">{channel.name}</span>
              {channel.unread_count > 0 && (
                <span className="w-5 h-5 rounded-full bg-[var(--avenize-accent-end)] text-white text-xs flex items-center justify-center">
                  {channel.unread_count > 9 ? '9+' : channel.unread_count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-black/[0.06]">
          {creatingChannel ? (
            <div className="flex gap-2">
              <input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="channel-name"
                className="flex-1 rounded-lg border border-black/10 px-2 py-1 text-sm"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && createChannel()}
              />
              <button onClick={createChannel} className="text-xs text-[var(--avenize-accent-end)]">
                Create
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreatingChannel(true)}
              className="flex items-center gap-2 text-xs text-black/40 hover:text-black/60 transition"
            >
              <Plus size={14} />
              Add channel
            </button>
          )}
        </div>
      </div>

      {/* Chat Area */}
      {selectedChannel ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-4 py-3 border-b border-black/[0.06] bg-white flex items-center gap-3">
            <button
              onClick={() => setSelectedChannel(null)}
              className="md:hidden p-1 hover:bg-black/[0.05] rounded"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <Hash size={18} className="text-black/40" />
              <span className="font-medium text-gray-900">{selectedChannel.name}</span>
            </div>
            {selectedChannel.description && (
              <span className="text-sm text-black/40 hidden md:inline">— {selectedChannel.description}</span>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center h-full text-black/40">
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-black/40">
                <Hash size={48} className="mb-3 opacity-20" />
                <p className="text-sm">No messages yet</p>
                <p className="text-xs mt-1">Be the first to say something!</p>
              </div>
            ) : (
              groupedMessages.map((group) => (
                <div key={group.date}>
                  <div className="flex items-center gap-4 my-4">
                    <div className="flex-1 h-px bg-black/[0.06]" />
                    <span className="text-xs text-black/40 font-medium">{group.date}</span>
                    <div className="flex-1 h-px bg-black/[0.06]" />
                  </div>
                  {group.messages.map((msg) => (
                    <div key={msg.id} className="group py-1">
                      {msg.message_type === 'system' ? (
                        <div className="text-center text-xs text-black/40 my-2">
                          {msg.content}
                        </div>
                      ) : (
                        <div className="flex items-start gap-3 hover:bg-black/[0.01] px-2 py-1 -mx-2 rounded group-hover:bg-black/[0.02]">
                          <div className="w-9 h-9 rounded-full avenize-gradient flex items-center justify-center text-white text-sm font-medium shrink-0">
                            {(msg.sender_name ?? 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                {msg.sender_name}
                              </span>
                              <span className="text-xs text-black/30">{formatTime(msg.created_at)}</span>
                              {msg.sender_id === staff?.id && (
                                <button
                                  onClick={() => deleteMessage(msg.id)}
                                  className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 transition"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-black/80 break-words">{msg.content}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <button
                                onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
                                className="text-xs text-black/30 hover:text-black/50 transition"
                              >
                                <Smile size={14} />
                              </button>
                              {showEmojiPicker === msg.id && (
                                <div className="absolute bg-white rounded-lg shadow-lg border border-black/[0.08] p-1 flex gap-0.5 z-10">
                                  {EMOJIS.map((emoji) => (
                                    <button
                                      key={emoji}
                                      onClick={() => addReaction(msg.id, emoji)}
                                      className="p-1 hover:bg-black/[0.05] rounded text-sm"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="p-4 border-t border-black/[0.06] bg-white">
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={`Message #${selectedChannel.name}`}
                  className="w-full resize-none rounded-xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--avenize-accent-end)]/30"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = Math.min(target.scrollHeight, 120) + 'px'
                  }}
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                className="p-3 rounded-xl avenize-gradient text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="text-xs text-black/30 mt-2">Press Enter to send, Shift+Enter for new line</p>
          </div>
        </div>
      ) : (
        // No channel selected
        <div className="flex-1 flex items-center justify-center bg-[var(--avenize-offwhite)]">
          <div className="text-center">
            <Hash size={64} className="mx-auto mb-4 text-black/10" />
            <h2 className="text-lg font-medium text-gray-900">Welcome to Avenize Chat</h2>
            <p className="text-sm text-black/40 mt-1">Select a channel or create a new one</p>
            <button
              onClick={() => setCreatingChannel(true)}
              className="mt-4 rounded-lg avenize-gradient text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition flex items-center gap-2 mx-auto"
            >
              <Plus size={16} />
              Create channel
            </button>
          </div>
        </div>
      )}

      {/* Contextual Feature Suggestions */}
      <FeatureSuggestions suggestions={[
        { label: 'Tasks', path: '/app/tasks', description: 'Create tasks from chat' },
        { label: 'Calendar', path: '/app/calendar', description: 'Schedule meetings' },
        { label: 'People', path: '/app/people', description: 'Invite team' },
      ]} />
    </div>
  )
}
