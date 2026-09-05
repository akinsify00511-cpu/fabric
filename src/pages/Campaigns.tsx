import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { Mail, Plus, Send, Users, MousePointer, Eye, TrendingUp, X, Trash2, Play } from 'lucide-react'

type Campaign = {
  id: string; name: string; subject: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled'
  contact_count: number; sent_count: number; delivered_count: number; opened_count: number; clicked_count: number; unsubscribed_count: number
  scheduled_at: string | null; sent_at: string | null; created_at: string
}
type Contact = { id: string; email: string; first_name: string | null; last_name: string | null; tags: string[]; status: string }
const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-[var(--av-surface)] text-[var(--av-text)]' }, scheduled: { label: 'Scheduled', color: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]' }, sending: { label: 'Sending', color: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]' }, sent: { label: 'Sent', color: 'bg-[var(--av-success-soft)] text-[var(--av-success)]' }, paused: { label: 'Paused', color: 'bg-orange-100 text-orange-700' }, cancelled: { label: 'Cancelled', color: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]' },
}

export default function Campaigns() {
  const { staff } = useAuth(); const { showToast } = useToast(); const businessId = staff?.business_id
  const [campaigns, setCampaigns] = useState<Campaign[]>([]); const [contacts, setContacts] = useState<Contact[]>([]); const [loading, setLoading] = useState(true); const [activeTab, setActiveTab] = useState<'campaigns'|'contacts'|'templates'>('campaigns'); const [showBuilder, setShowBuilder] = useState(false)
  const [name, setName] = useState(''); const [subject, setSubject] = useState(''); const [preheader, setPreheader] = useState(''); const [content, setContent] = useState(''); const [selectedContacts, setSelectedContacts] = useState<string[]>([])

  const load = async () => {
    if (!businessId) { setCampaigns([]); setContacts([]); setLoading(false); return }
    setLoading(true)
    const [{ data: campaignsData }, { data: contactsData }] = await Promise.all([
      supabase.from('email_campaigns').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
      supabase.from('email_contacts').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
    ])
    setCampaigns((campaignsData || []) as Campaign[]); setContacts((contactsData || []) as Contact[]); setLoading(false)
  }
  useEffect(() => { void load() }, [businessId])

  const createCampaign = async () => {
    if (!businessId) return showToast('Your business membership is not ready yet', 'error')
    if (!name.trim() || !subject.trim()) return showToast('Enter campaign name and subject', 'error')
    const { error } = await supabase.from('email_campaigns').insert({ name, subject, preheader, content_html: content || '<p>Hello,</p><p>Your message here.</p>', content_text: content || 'Hello,\n\nYour message here.', contact_count: contacts.filter(c => c.status === 'active').length, business_id: businessId, created_by: staff?.id })
    if (error) return showToast('Failed to create campaign', 'error')
    showToast('Campaign created!', 'success'); resetBuilder(); void load()
  }

  const sendCampaign = async (campaignId: string) => {
    showToast('Sending campaign...', 'info')
    const { data, error } = await supabase.functions.invoke('campaign-send', { body: { campaignId } })
    if (error || data?.error) return showToast(data?.error || error?.message || 'Failed to send campaign', 'error')
    showToast(`Campaign sent to ${data.sent || 0} recipient${data.sent === 1 ? '' : 's'}`, 'success'); await load()
  }
  const addContact = async () => {
    if (!businessId) return showToast('Your business membership is not ready yet', 'error')
    const email = prompt('Enter email address:'); if (!email) return
    const firstName = prompt('First name (optional):') || ''; const lastName = prompt('Last name (optional):') || ''
    const { error } = await supabase.from('email_contacts').insert({ business_id: businessId, email, first_name: firstName || null, last_name: lastName || null })
    if (error) showToast('Failed to add contact', 'error'); else { showToast('Contact added!', 'success'); void load() }
  }
  const deleteCampaign = async (id: string) => {
    if (!confirm('Delete this campaign?')) return
    if (!businessId) return
    const { error } = await supabase.from('email_campaigns').delete().eq('id', id).eq('business_id', businessId)
    if (error) showToast('Failed to delete campaign', 'error'); else { showToast('Campaign deleted', 'info'); void load() }
  }
  const resetBuilder = () => { setShowBuilder(false); setName(''); setSubject(''); setPreheader(''); setContent(''); setSelectedContacts([]) }
  const getOpenRate = (c: Campaign) => c.sent_count ? Math.round(c.opened_count / c.sent_count * 100) : 0
  const getClickRate = (c: Campaign) => c.sent_count ? Math.round(c.clicked_count / c.sent_count * 100) : 0
  const sentCampaigns = campaigns.filter(c => c.status === 'sent'); const withSends = campaigns.filter(c => c.sent_count > 0)
  const stats = { total: sentCampaigns.length, totalSent: campaigns.reduce((s,c) => s + (c.sent_count || 0),0), avgOpenRate: withSends.length ? Math.round(withSends.reduce((s,c)=>s+getOpenRate(c),0)/withSends.length) : 0, avgClickRate: withSends.length ? Math.round(withSends.reduce((s,c)=>s+getClickRate(c),0)/withSends.length) : 0 }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6"><div><h1 className="text-xl font-medium text-[var(--av-text)]">Email Marketing</h1><p className="text-sm text-[var(--av-text)] mt-0.5">Campaigns, contacts, and automations</p></div><button onClick={()=>setShowBuilder(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium hover:opacity-90 transition"><Plus size={16}/>New Campaign</button></div>
      <div className="flex gap-1 bg-[var(--av-surface-elevated)] rounded-xl p-1 border border-[var(--av-border-strong)]/[0.06] mb-6 w-fit">{[{id:'campaigns',label:'Campaigns',icon:Send},{id:'contacts',label:'Contacts',icon:Users}].map(tab=>{const Icon=tab.icon;return <button key={tab.id} onClick={()=>setActiveTab(tab.id as typeof activeTab)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab===tab.id?'avenize-gradient text-white':'text-[var(--av-text)] hover:text-[var(--av-text)]'}`}><Icon size={14}/>{tab.label}</button>})}</div>
      {activeTab==='campaigns' && <><div className="grid grid-cols-4 gap-3 mb-6">{[['Sent',stats.totalSent,Send],['Open Rate',`${stats.avgOpenRate}%`,MousePointer],['Click Rate',`${stats.avgClickRate}%`,TrendingUp],['Campaigns',stats.total,Mail]].map(([label,value,Icon]:any)=><div key={label as string} className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-4"><div className="flex items-center gap-2 mb-2"><Icon size={14}/><span className="text-xs text-[var(--av-text)] uppercase tracking-wide">{label as string}</span></div><p className="text-2xl font-bold text-[var(--av-text)]">{value as any}</p></div>)}</div>
      {loading?<div className="space-y-3">{[1,2,3].map(i=><div key={i} className="bg-[var(--av-surface-elevated)] rounded-2xl p-4 animate-pulse"><div className="h-4 bg-[var(--av-surface-3)] rounded w-48 mb-2"/><div className="h-3 bg-[var(--av-surface-3)] rounded w-32"/></div>)}</div>:campaigns.length===0?<div className="bg-[var(--av-surface-elevated)] rounded-2xl p-12 text-center"><Mail size={48} className="mx-auto mb-4 opacity-40"/><h3 className="text-lg font-medium mb-2">No campaigns yet</h3><p className="text-sm mb-4">Create your first email campaign to connect with your audience</p><button onClick={()=>setShowBuilder(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"><Plus size={16}/>Create Campaign</button></div>:<div className="space-y-3">{campaigns.map(c=><div key={c.id} className="bg-[var(--av-surface-elevated)] rounded-2xl p-4"><div className="flex items-start justify-between gap-4"><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1"><h3 className="font-medium truncate">{c.name}</h3><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[c.status].color}`}>{STATUS_CONFIG[c.status].label}</span></div><p className="text-sm truncate">{c.subject}</p></div><div className="flex items-center gap-2">{c.status==='draft'&&<button onClick={()=>sendCampaign(c.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg avenize-gradient text-white text-xs font-medium"><Play size={12}/>Send</button>}<button onClick={()=>deleteCampaign(c.id)} className="p-2 rounded-lg text-[var(--av-danger)]"><Trash2 size={14}/></button></div></div><div className="flex items-center gap-6 mt-3 pt-3 border-t border-[var(--av-border-strong)]/[0.06]"><span className="text-xs"><Users size={12} className="inline mr-1"/>{c.sent_count||0} sent</span><span className="text-xs"><Eye size={12} className="inline mr-1"/>{getOpenRate(c)}% opens</span><span className="text-xs"><MousePointer size={12} className="inline mr-1"/>{getClickRate(c)}% clicks</span>{c.sent_at&&<span className="text-xs ml-auto">{new Date(c.sent_at).toLocaleDateString()}</span>}</div></div>)}</div>}</>}
      {activeTab==='contacts'&&<div><div className="flex items-center justify-between mb-4"><p className="text-sm">{contacts.length} contacts</p><button onClick={addContact} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border"><Plus size={14}/>Add Contact</button></div><div className="space-y-2">{contacts.map(c=><div key={c.id} className="flex items-center justify-between p-3 rounded-xl border"><div><p className="font-medium">{c.first_name||c.email} {c.last_name||''}</p><p className="text-xs">{c.email}</p></div><span className="text-xs">{c.status}</span></div>)}</div></div>}
      {showBuilder&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-2xl rounded-2xl bg-[var(--av-surface-elevated)] p-6"><div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">New Campaign</h2><button onClick={resetBuilder}><X size={18}/></button></div><div className="space-y-3"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Campaign name" className="w-full rounded-lg border p-2"/><input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-lg border p-2"/><input value={preheader} onChange={e=>setPreheader(e.target.value)} placeholder="Preheader" className="w-full rounded-lg border p-2"/><textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Email content" rows={10} className="w-full rounded-lg border p-2"/><div className="flex justify-end gap-2"><button onClick={resetBuilder} className="px-4 py-2 rounded-lg border">Cancel</button><button onClick={createCampaign} className="px-4 py-2 rounded-lg avenize-gradient text-white">Create Campaign</button></div></div></div></div>}
    </div>
  )
}
