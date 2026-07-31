import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Mail, Plus, Send, Clock, Users, MousePointer, Eye, TrendingUp,
  BarChart3, X, Settings, Copy, Trash2, Calendar, ChevronRight, Play
} from 'lucide-react'

type Campaign = {
  id: string
  name: string
  subject: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled'
  contact_count: number
  sent_count: number
  delivered_count: number
  opened_count: number
  clicked_count: number
  unsubscribed_count: number
  scheduled_at: string | null
  sent_at: string | null
  created_at: string
}

type Contact = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  tags: string[]
  status: string
}

type Template = {
  id: string
  name: string
  subject: string
}

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-600' },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
  sending: { label: 'Sending', color: 'bg-yellow-100 text-yellow-700' },
  sent: { label: 'Sent', color: 'bg-green-100 text-green-700' },
  paused: { label: 'Paused', color: 'bg-orange-100 text-orange-700' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-600' },
}

export default function Campaigns() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'campaigns' | 'contacts' | 'templates'>('campaigns')
  const [showBuilder, setShowBuilder] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)

  // Builder state
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [preheader, setPreheader] = useState('')
  const [content, setContent] = useState('')
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [tagFilter, setTagFilter] = useState('')

  const load = async () => {
    setLoading(true)
    const { data: campaignsData } = await supabase
      .from('email_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
    const { data: contactsData } = await supabase
      .from('email_contacts')
      .select('*')
      .order('created_at', { ascending: false })
    setCampaigns((campaignsData as Campaign[]) ?? [])
    setContacts((contactsData as Contact[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const createCampaign = async () => {
    if (!name.trim() || !subject.trim()) {
      showToast('Enter campaign name and subject', 'error')
      return
    }

    const { error } = await supabase.from('email_campaigns').insert({
      name,
      subject,
      preheader,
      content_html: content || `<p>Hello,</p><p>${content || 'Your message here.'}</p>`,
      contact_count: selectedContacts.length,
      created_by: staff?.id,
    })

    if (error) {
      showToast('Failed to create campaign', 'error')
    } else {
      showToast('Campaign created!', 'success')
      resetBuilder()
      load()
    }
  }

  const sendCampaign = async (campaignId: string) => {
    const { error } = await supabase
      .from('email_campaigns')
      .update({ status: 'sending', sent_at: new Date().toISOString() })
      .eq('id', campaignId)

    if (!error) {
      showToast('Campaign is being sent...', 'success')
      // Simulate sends
      setTimeout(async () => {
        await supabase
          .from('email_campaigns')
          .update({
            status: 'sent',
            sent_count: Math.floor(Math.random() * 100) + 50,
            delivered_count: Math.floor(Math.random() * 90) + 45,
            opened_count: Math.floor(Math.random() * 40) + 20,
            clicked_count: Math.floor(Math.random() * 15) + 5,
          })
          .eq('id', campaignId)
        load()
      }, 2000)
      load()
    }
  }

  const addContact = async () => {
    const email = prompt('Enter email address:')
    if (!email) return
    const firstName = prompt('First name (optional):') || ''
    const lastName = prompt('Last name (optional):') || ''

    const { error } = await supabase.from('email_contacts').insert({
      email,
      first_name: firstName || null,
      last_name: lastName || null,
    })

    if (error) {
      showToast('Failed to add contact', 'error')
    } else {
      showToast('Contact added!', 'success')
      load()
    }
  }

  const deleteCampaign = async (id: string) => {
    if (!confirm('Delete this campaign?')) return
    await supabase.from('email_campaigns').delete().eq('id', id)
    showToast('Campaign deleted', 'info')
    load()
  }

  const resetBuilder = () => {
    setShowBuilder(false)
    setName('')
    setSubject('')
    setPreheader('')
    setContent('')
    setSelectedContacts([])
  }

  const getOpenRate = (c: Campaign) => {
    if (!c.sent_count) return 0
    return Math.round((c.opened_count / c.sent_count) * 100)
  }

  const getClickRate = (c: Campaign) => {
    if (!c.sent_count) return 0
    return Math.round((c.clicked_count / c.sent_count) * 100)
  }

  const stats = {
    total: campaigns.filter((c) => c.status === 'sent').length,
    totalSent: campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0),
    avgOpenRate: campaigns.filter((c) => c.sent_count > 0).length > 0
      ? Math.round(campaigns.filter((c) => c.sent_count > 0).reduce((sum, c) => sum + getOpenRate(c), 0) / campaigns.filter((c) => c.sent_count > 0).length)
      : 0,
    avgClickRate: campaigns.filter((c) => c.sent_count > 0).length > 0
      ? Math.round(campaigns.filter((c) => c.sent_count > 0).reduce((sum, c) => sum + getClickRate(c), 0) / campaigns.filter((c) => c.sent_count > 0).length)
      : 0,
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--avenize-black)]">Email Marketing</h1>
          <p className="text-sm text-black/50 mt-0.5">Campaigns, contacts, and automations</p>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg fabric-gradient text-white text-sm font-medium hover:opacity-90 transition"
        >
          <Plus size={16} />
          New Campaign
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-black/[0.06] mb-6 w-fit">
        {[
          { id: 'campaigns', label: 'Campaigns', icon: Send },
          { id: 'contacts', label: 'Contacts', icon: Users },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'fabric-gradient text-white'
                  : 'text-black/50 hover:text-black'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* CAMPAIGNS TAB */}
      {activeTab === 'campaigns' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Send size={14} className="text-[var(--avenize-accent-end)]" />
                <span className="text-xs text-black/50 uppercase tracking-wide">Sent</span>
              </div>
              <p className="text-2xl font-bold text-[var(--avenize-black)]">{stats.totalSent.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center gap-2 mb-2">
                <MousePointer size={14} className="text-blue-500" />
                <span className="text-xs text-black/50 uppercase tracking-wide">Open Rate</span>
              </div>
              <p className="text-2xl font-bold text-[var(--avenize-black)]">{stats.avgOpenRate}%</p>
            </div>
            <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-green-500" />
                <span className="text-xs text-black/50 uppercase tracking-wide">Click Rate</span>
              </div>
              <p className="text-2xl font-bold text-[var(--avenize-black)]">{stats.avgClickRate}%</p>
            </div>
            <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Mail size={14} className="text-black/30" />
                <span className="text-xs text-black/50 uppercase tracking-wide">Campaigns</span>
              </div>
              <p className="text-2xl font-bold text-[var(--avenize-black)]">{stats.total}</p>
            </div>
          </div>

          {/* Campaign List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-black/[0.06] p-4 animate-pulse">
                  <div className="h-4 bg-black/5 rounded w-48 mb-2" />
                  <div className="h-3 bg-black/5 rounded w-32" />
                </div>
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-black/[0.06] p-12 text-center">
              <Mail size={48} className="mx-auto mb-4 text-black/10" />
              <h3 className="text-lg font-medium text-[var(--avenize-black)] mb-2">No campaigns yet</h3>
              <p className="text-sm text-black/50 mb-4">Create your first email campaign to connect with your audience</p>
              <button
                onClick={() => setShowBuilder(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg fabric-gradient text-white text-sm font-medium"
              >
                <Plus size={16} />
                Create Campaign
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-[var(--avenize-black)] truncate">{campaign.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[campaign.status].color}`}>
                          {STATUS_CONFIG[campaign.status].label}
                        </span>
                      </div>
                      <p className="text-sm text-black/50 truncate">{campaign.subject}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {campaign.status === 'draft' && (
                        <button
                          onClick={() => sendCampaign(campaign.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg fabric-gradient text-white text-xs font-medium"
                        >
                          <Play size={12} />
                          Send
                        </button>
                      )}
                      <button
                        onClick={() => deleteCampaign(campaign.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Stats Bar */}
                  <div className="flex items-center gap-6 mt-3 pt-3 border-t border-black/[0.06]">
                    <div className="flex items-center gap-1.5 text-xs text-black/50">
                      <Users size={12} />
                      <span>{campaign.sent_count?.toLocaleString() || 0} sent</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-black/50">
                      <Eye size={12} />
                      <span>{getOpenRate(campaign)}% opens</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-black/50">
                      <MousePointer size={12} />
                      <span>{getClickRate(campaign)}% clicks</span>
                    </div>
                    {campaign.sent_at && (
                      <span className="text-xs text-black/30 ml-auto">
                        {new Date(campaign.sent_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* CONTACTS TAB */}
      {activeTab === 'contacts' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-black/50">{contacts.length} contacts</p>
            <button
              onClick={addContact}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-black/10 text-sm hover:bg-black/[0.02]"
            >
              <Plus size={14} />
              Add Contact
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-black/[0.06] divide-y divide-black/[0.06]">
            {contacts.map((contact) => (
              <div key={contact.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--avenize-black)]">{contact.email}</p>
                  <p className="text-xs text-black/40">
                    {contact.first_name || contact.last_name
                      ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
                      : 'No name'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {contact.tags?.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-black/[0.05] text-black/50">
                      {tag}
                    </span>
                  ))}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    contact.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {contact.status}
                  </span>
                </div>
              </div>
            ))}
            {contacts.length === 0 && (
              <div className="px-4 py-8 text-center text-black/40">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No contacts yet. Add your first contact!</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Builder Modal */}
      {showBuilder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl my-8">
            <div className="px-6 py-4 border-b border-black/[0.06] flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Campaign</h2>
              <button onClick={resetBuilder} className="p-2 hover:bg-black/[0.05] rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="text-sm font-medium text-[var(--avenize-black)] block mb-1">Campaign Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Summer Sale Announcement"
                  className="w-full px-4 py-3 rounded-xl border border-black/10 focus:outline-none focus:ring-2 focus:ring-[var(--avenize-accent-end)]/30"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--avenize-black)] block mb-1">Subject Line</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., Don't miss our summer collection!"
                  className="w-full px-4 py-3 rounded-xl border border-black/10 focus:outline-none focus:ring-2 focus:ring-[var(--avenize-accent-end)]/30"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--avenize-black)] block mb-1">Preview Text</label>
                <input
                  value={preheader}
                  onChange={(e) => setPreheader(e.target.value)}
                  placeholder="Short preview shown in inbox (optional)"
                  className="w-full px-4 py-2 rounded-xl border border-black/10 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--avenize-black)] block mb-1">Content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your email content here..."
                  className="w-full px-4 py-3 rounded-xl border border-black/10 focus:outline-none focus:ring-2 focus:ring-[var(--avenize-accent-end)]/30 min-h-[200px]"
                />
              </div>

              <div className="bg-black/[0.02] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={14} className="text-black/40" />
                  <span className="text-sm font-medium">Recipients</span>
                </div>
                <p className="text-xs text-black/50">
                  This campaign will be sent to all active contacts.
                  Add more contacts in the Contacts tab.
                </p>
                <p className="text-sm mt-2 font-medium">{contacts.filter((c) => c.status === 'active').length} active contacts</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-3">
              <button
                onClick={resetBuilder}
                className="px-4 py-2 rounded-lg border border-black/10 text-sm hover:bg-black/[0.02]"
              >
                Cancel
              </button>
              <button
                onClick={createCampaign}
                className="flex items-center gap-2 px-4 py-2 rounded-lg fabric-gradient text-white text-sm font-medium"
              >
                <Mail size={16} />
                Create Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
