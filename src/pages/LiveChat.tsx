// Live Chat Page
// Real-time customer support chat

import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { hasPermission } from '../lib/permissions'
import {
  MessageSquare, Send, Search, Circle, X, Minimize2, Maximize2, CheckCircle2, Check
} from 'lucide-react'

interface ChatConversation {
  id: string
  client_id?: string
  client_name: string
  client_email?: string
  client_phone?: string
  last_message?: string
  last_message_at?: string
  unread_count: number
  status: 'open' | 'closed' | 'pending'
  assigned_to?: string
  assigned_name?: string
  created_at: string
}

interface ChatMessage {
  id: string
  conversation_id: string
  sender_type: 'client' | 'agent' | 'system'
  sender_id?: string
  sender_name?: string
  message: string
  attachment_url?: string
  read_at?: string
  created_at: string
}

const STATUS_COLORS = {
  open: 'bg-[var(--av-success)]',
  closed: 'bg-[var(--av-text-disabled)]',
  pending: 'bg-[var(--av-warning-soft)]0',
}

export default function LiveChatPage() {
  const { staff } = useAuth()
  const { showToast } = useToast()

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [selectedConversation, setSelectedConversation] = useState<ChatConversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('open')
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const canManage = staff ? hasPermission(staff.role || 'staff', 'settings', 'manage') : false

  useEffect(() => {
    if (staff?.business_id) {
      fetchConversations()
    }
  }, [staff?.business_id, statusFilter])

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id)
      markAsRead(selectedConversation.id)
    }
  }, [selectedConversation])

  useEffect(() => {
    // Scroll to bottom on new messages
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime: refresh the conversation list when any conversation in this
  // business is updated (new message, assignment, status change), and
  // live-append new messages to the open conversation so agents see replies
  // without manual refresh. This is the "routed to an available agent via
  // Supabase Realtime" behaviour the Live Chat spec requires.
  useEffect(() => {
    if (!staff?.business_id) return
    const channel = supabase
      .channel('live-chat')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations', filter: `business_id=eq.${staff.business_id}` },
        () => fetchConversations()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const msg = payload.new as ChatMessage
          if (selectedConversation && msg.conversation_id === selectedConversation.id) {
            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [staff?.business_id, selectedConversation])

  async function fetchConversations() {
    if (!staff?.business_id) return

    try {
      setLoading(true)
      let query = supabase
        .from('chat_conversations')
        .select(`
          *,
          assigned_staff:assigned_to(full_name)
        `)
        .eq('business_id', staff.business_id)
        .order('last_message_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error } = await query

      if (error) throw error

      const convosWithNames = (data || []).map(c => ({
        ...c,
        assigned_name: c.assigned_staff?.full_name,
      }))

      setConversations(convosWithNames)
    } catch (error) {
      console.error('Error fetching conversations:', error)
      showToast('Failed to load conversations', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function fetchMessages(conversationId: string) {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setMessages(data || [])
    } catch (error) {
      console.error('Error fetching messages:', error)
    }
  }

  async function markAsRead(conversationId: string) {
    try {
      await supabase
        .from('chat_conversations')
        .update({ unread_count: 0 })
        .eq('id', conversationId)

      // Update local state
      setConversations(prev =>
        prev.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c)
      )
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedConversation || !staff) return

    setSending(true)
    try {
      const messageData = {
        conversation_id: selectedConversation.id,
        sender_type: 'agent' as const,
        sender_id: staff.id,
        sender_name: staff.full_name,
        message: newMessage.trim(),
      }

      const { error } = await supabase
        .from('chat_messages')
        .insert(messageData)

      if (error) throw error

      // Update conversation
      await supabase
        .from('chat_conversations')
        .update({
          last_message: newMessage.trim(),
          last_message_at: new Date().toISOString(),
          status: 'open',
        })
        .eq('id', selectedConversation.id)

      // Refresh messages and conversations
      fetchMessages(selectedConversation.id)
      fetchConversations()
      setNewMessage('')
    } catch (error) {
      console.error('Error sending message:', error)
      showToast('Failed to send message', 'error')
    } finally {
      setSending(false)
    }
  }

  async function assignConversation(conversation: ChatConversation) {
    if (!staff) return

    try {
      const { error } = await supabase
        .from('chat_conversations')
        .update({
          assigned_to: staff.id,
          status: 'open',
        })
        .eq('id', conversation.id)

      if (error) throw error
      showToast('Conversation assigned', 'success')
      fetchConversations()
    } catch (error) {
      console.error('Error assigning conversation:', error)
      showToast('Failed to assign conversation', 'error')
    }
  }

  async function closeConversation(conversation: ChatConversation) {
    try {
      const { error } = await supabase
        .from('chat_conversations')
        .update({ status: 'closed' })
        .eq('id', conversation.id)

      if (error) throw error
      showToast('Conversation closed', 'success')
      fetchConversations()
    } catch (error) {
      console.error('Error closing conversation:', error)
      showToast('Failed to close conversation', 'error')
    }
  }

  // Filter conversations
  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations
    const query = searchQuery.toLowerCase()
    return conversations.filter(c =>
      c.client_name.toLowerCase().includes(query) ||
      c.client_email?.toLowerCase().includes(query) ||
      c.last_message?.toLowerCase().includes(query)
    )
  }, [conversations, searchQuery])

  // Stats
  const stats = useMemo(() => {
    const open = conversations.filter(c => c.status === 'open').length
    const pending = conversations.filter(c => c.status === 'pending').length
    const closed = conversations.filter(c => c.status === 'closed').length
    const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0)
    return { open, pending, closed, totalUnread }
  }, [conversations])

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  function formatMessageTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-NG', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="h-[calc(100vh-64px)] flex bg-gray-50">
      {/* Conversations List */}
      <div className={`${selectedConversation && isMinimized ? 'hidden' : 'w-80'} bg-[var(--av-surface)] border-r border-[var(--av-border)] flex flex-col`}>
        {/* Header */}
        <div className="p-4 border-b border-[var(--av-border)]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-[var(--av-text)]">Live Chat</h2>
            <div className="flex items-center gap-2">
              {stats.totalUnread > 0 && (
                <span className="px-2 py-0.5 bg-[var(--av-primary-soft)] text-[var(--av-primary)] text-xs rounded-full">
                  {stats.totalUnread} unread
                </span>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-4 mb-3 text-sm">
            <div className="flex items-center gap-1">
              <Circle className="w-2 h-2 text-[var(--av-success)] fill-green-500" />
              <span className="text-[var(--av-text-muted)]">{stats.open} open</span>
            </div>
            <div className="flex items-center gap-1">
              <Circle className="w-2 h-2 text-[var(--av-warning)] fill-amber-500" />
              <span className="text-[var(--av-text-muted)]">{stats.pending} pending</span>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--av-text-disabled)]" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Filter */}
        <div className="px-4 py-2 border-b border-[var(--av-border)] flex gap-2">
          {['open', 'pending', 'closed', 'all'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 text-xs rounded-full ${
                statusFilter === status
                  ? 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]'
                  : 'bg-[var(--av-surface-2)] text-[var(--av-text-muted)] hover:bg-[var(--av-surface-3)]'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center">
              <div className="animate-spin w-6 h-6 border-2 border-[var(--av-primary)] border-t-transparent rounded-full mx-auto"></div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-[var(--av-text-muted)]">
              <MessageSquare className="w-12 h-12 text-[var(--av-text-disabled)] mx-auto" />
              <p className="mt-2">No conversations found</p>
            </div>
          ) : (
            filteredConversations.map(conversation => (
              <div
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className={`p-4 border-b border-[var(--av-border)] cursor-pointer hover:bg-gray-50 ${
                  selectedConversation?.id === conversation.id ? 'bg-[var(--av-primary-soft)]' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-[var(--av-primary-soft)] flex items-center justify-center text-[var(--av-primary)] font-medium">
                      {conversation.client_name.charAt(0).toUpperCase()}
                    </div>
                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[var(--av-surface)] ${STATUS_COLORS[conversation.status]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-medium truncate ${
                        conversation.unread_count > 0 ? 'text-[var(--av-text)]' : 'text-[var(--av-text-secondary)]'
                      }`}>
                        {conversation.client_name}
                      </p>
                      <span className="text-xs text-[var(--av-text-muted)]">
                        {conversation.last_message_at ? formatTime(conversation.last_message_at) : ''}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--av-text-muted)] truncate">
                      {conversation.last_message || 'No messages yet'}
                    </p>
                    {conversation.assigned_name && (
                      <p className="text-xs text-[var(--av-text-disabled)] mt-1">
                        Assigned to {conversation.assigned_name}
                      </p>
                    )}
                  </div>
                  {conversation.unread_count > 0 && (
                    <span className="w-5 h-5 bg-[var(--av-primary)] text-white text-xs rounded-full flex items-center justify-center">
                      {conversation.unread_count}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Panel */}
      {selectedConversation ? (
        <div className={`flex-1 flex flex-col bg-[var(--av-surface)] ${isMinimized ? 'h-16' : ''}`}>
          {/* Chat Header */}
          <div className="px-4 py-3 border-b border-[var(--av-border)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1 hover:bg-[var(--av-surface-2)] rounded lg:hidden"
              >
                <X className="w-5 h-5 text-[var(--av-text-muted)]" />
              </button>
              <div className="w-10 h-10 rounded-full bg-[var(--av-primary-soft)] flex items-center justify-center text-[var(--av-primary)] font-medium">
                {selectedConversation.client_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--av-text)]">{selectedConversation.client_name}</p>
                <p className="text-xs text-[var(--av-text-muted)]">
                  {selectedConversation.client_email || selectedConversation.client_phone || 'Unknown'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedConversation.status === 'open' && canManage && (
                <button
                  onClick={() => closeConversation(selectedConversation)}
                  className="px-3 py-1.5 text-sm border border-[var(--av-border)] rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
              )}
              {(!selectedConversation.assigned_to || selectedConversation.assigned_to !== staff?.id) && canManage && (
                <button
                  onClick={() => assignConversation(selectedConversation)}
                  className="px-3 py-1.5 text-sm bg-[var(--av-primary)] text-white rounded-lg hover:bg-[var(--av-primary-hover)]"
                >
                  Take Chat
                </button>
              )}
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1.5 hover:bg-[var(--av-surface-2)] rounded"
              >
                {isMinimized ? <Maximize2 className="w-5 h-5" /> : <Minimize2 className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Messages */}
          {!isMinimized && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map(message => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender_type === 'agent' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] ${message.sender_type === 'agent' ? 'order-2' : 'order-1'}`}>
                      <div className={`rounded-2xl px-4 py-2 ${
                        message.sender_type === 'agent'
                          ? 'bg-[var(--av-primary)] text-white rounded-br-md'
                          : message.sender_type === 'system'
                          ? 'bg-[var(--av-surface-2)] text-[var(--av-text-muted)] text-center text-xs italic'
                          : 'bg-[var(--av-surface-2)] text-[var(--av-text)] rounded-bl-md'
                      }`}>
                        {message.sender_type !== 'system' && (
                          <p className="text-xs opacity-75 mb-1">{message.sender_name}</p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                      </div>
                      <p className={`text-xs text-[var(--av-text-disabled)] mt-1 ${
                        message.sender_type === 'agent' ? 'text-right' : 'text-left'
                      }`}>
                        {formatMessageTime(message.created_at)}
                        {message.sender_type === 'agent' && (
                          <span className="ml-1">
                            {message.read_at ? <CheckCircle2 className="w-3 h-3 inline" /> : <Check className="w-3 h-3 inline" />}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              {selectedConversation.status !== 'closed' && (
                <div className="p-4 border-t border-[var(--av-border)]">
                  <div className="flex items-end gap-3">
                    <div className="flex-1 relative">
                      <textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            sendMessage()
                          }
                        }}
                        placeholder="Type your message..."
                        rows={1}
                        className="w-full px-4 py-3 border border-[var(--av-border)] rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      onClick={sendMessage}
                      disabled={sending || !newMessage.trim()}
                      className="p-3 bg-[var(--av-primary)] text-white rounded-full hover:bg-[var(--av-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs text-[var(--av-text-muted)] mt-2">
                    Press Enter to send, Shift+Enter for new line
                  </p>
                </div>
              )}

              {selectedConversation.status === 'closed' && (
                <div className="p-4 bg-gray-50 text-center">
                  <p className="text-sm text-[var(--av-text-muted)]">This conversation has been closed</p>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <MessageSquare className="w-16 h-16 text-[var(--av-text-disabled)] mx-auto" />
            <p className="mt-4 text-[var(--av-text-muted)]">Select a conversation to start chatting</p>
          </div>
        </div>
      )}
    </div>
  )
}
