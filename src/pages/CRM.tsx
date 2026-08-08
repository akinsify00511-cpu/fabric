import { useEffect, useState } from 'react'
import { Plus, Search, Users, X, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import FeatureSuggestions from '../components/FeatureSuggestions'

type Deal = {
  id: string
  business_id: string
  title: string
  contact_name: string
  contact_email?: string
  contact_phone?: string
  stage: 'hot' | 'active' | 'proposal' | 'negotiation' | 'won' | 'lost'
  value: number
  probability: number
  notes?: string
  created_at: string
}

type Contact = {
  id: string
  business_id: string
  full_name: string
  email: string
  phone?: string
  company?: string
  created_at: string
}

type ViewMode = 'deals' | 'contacts' | 'pipeline'

const STAGES = [
  { key: 'hot', label: 'Hot', color: 'bg-red-500', textColor: 'text-white', probability: 80 },
  { key: 'active', label: 'Active', color: 'bg-blue-500', textColor: 'text-white', probability: 50 },
  { key: 'proposal', label: 'Proposal', color: 'bg-purple-500', textColor: 'text-white', probability: 60 },
  { key: 'negotiation', label: 'Negotiating', color: 'bg-amber-500', textColor: 'text-white', probability: 75 },
  { key: 'won', label: 'Won', color: 'bg-green-500', textColor: 'text-white', probability: 100 },
  { key: 'lost', label: 'Lost', color: 'bg-black', textColor: 'text-white', probability: 0 },
]

export default function CRM() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  
  const [viewMode, setViewMode] = useState<ViewMode>('deals')
  const [searchQuery, setSearchQuery] = useState('')
  const [deals, setDeals] = useState<Deal[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const [showAddDeal, setShowAddDeal] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [newDealForm, setNewDealForm] = useState({ title: '', contact_name: '', contact_email: '', contact_phone: '', value: '', stage: 'active' as Deal['stage'], notes: '' })
  const [newContactForm, setNewContactForm] = useState({ full_name: '', email: '', phone: '', company: '' })

  useEffect(() => {
    if (staff?.business_id) {
      loadData()
    }
  }, [staff?.business_id])

  const loadData = async () => {
    if (!staff?.business_id) return
    
    setLoading(true)
    try {
      const [dealsResult, contactsResult] = await Promise.all([
        supabase.from('deals').select('*').eq('business_id', staff.business_id).order('created_at', { ascending: false }),
        supabase.from('contacts').select('*').eq('business_id', staff.business_id).order('created_at', { ascending: false })
      ])

      if (dealsResult.data) setDeals(dealsResult.data)
      if (contactsResult.data) setContacts(contactsResult.data)
    } catch (error) {
      console.error('Error loading CRM data:', error)
      showToast('Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const addDeal = async () => {
    if (!newDealForm.title || !newDealForm.contact_name || !staff?.business_id) {
      showToast('Please fill required fields', 'error')
      return
    }

    const stageInfo = STAGES.find(s => s.key === newDealForm.stage)
    
    try {
      const { data, error } = await supabase.from('deals').insert({
        business_id: staff.business_id,
        title: newDealForm.title,
        contact_name: newDealForm.contact_name,
        contact_email: newDealForm.contact_email || null,
        contact_phone: newDealForm.contact_phone || null,
        stage: newDealForm.stage,
        value: parseInt(newDealForm.value) || 0,
        probability: stageInfo?.probability || 50,
        notes: newDealForm.notes || null,
      }).select().single()

      if (error) throw error

      setDeals(prev => [data, ...prev])
      setNewDealForm({ title: '', contact_name: '', contact_email: '', contact_phone: '', value: '', stage: 'active', notes: '' })
      setShowAddDeal(false)
      showToast('Deal created!', 'success')
    } catch (error) {
      console.error('Error creating deal:', error)
      showToast('Failed to create deal', 'error')
    }
  }

  const updateDeal = async (deal: Deal) => {
    try {
      const { error } = await supabase.from('deals').update({
        title: deal.title,
        contact_name: deal.contact_name,
        contact_email: deal.contact_email,
        contact_phone: deal.contact_phone,
        stage: deal.stage,
        value: deal.value,
        notes: deal.notes,
      }).eq('id', deal.id)

      if (error) throw error

      setDeals(prev => prev.map(d => d.id === deal.id ? deal : d))
      setEditingDeal(null)
      showToast('Deal updated!', 'success')
    } catch (error) {
      console.error('Error updating deal:', error)
      showToast('Failed to update deal', 'error')
    }
  }

  const deleteDeal = async (id: string) => {
    if (!confirm('Delete this deal?')) return

    try {
      const { error } = await supabase.from('deals').delete().eq('id', id)
      if (error) throw error

      setDeals(prev => prev.filter(d => d.id !== id))
      setEditingDeal(null)
      showToast('Deal deleted', 'info')
    } catch (error) {
      console.error('Error deleting deal:', error)
      showToast('Failed to delete deal', 'error')
    }
  }

  const addContact = async () => {
    if (!newContactForm.full_name || !newContactForm.email || !staff?.business_id) {
      showToast('Please fill required fields', 'error')
      return
    }

    try {
      const { data, error } = await supabase.from('contacts').insert({
        business_id: staff.business_id,
        full_name: newContactForm.full_name,
        email: newContactForm.email,
        phone: newContactForm.phone || null,
        company: newContactForm.company || null,
      }).select().single()

      if (error) throw error

      setContacts(prev => [data, ...prev])
      setNewContactForm({ full_name: '', email: '', phone: '', company: '' })
      setShowAddContact(false)
      showToast('Contact created!', 'success')
    } catch (error) {
      console.error('Error creating contact:', error)
      showToast('Failed to create contact', 'error')
    }
  }

  const filteredDeals = deals.filter(d =>
    d.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.contact_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredContacts = contacts.filter(c =>
    c.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.company?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const dealsByStage = STAGES.reduce((acc, stage) => {
    acc[stage.key] = filteredDeals.filter(d => d.stage === stage.key)
    return acc
  }, {} as Record<string, Deal[]>)

  const stats = {
    totalDeals: deals.length,
    totalValue: deals.reduce((sum, d) => sum + (d.value || 0), 0),
    hotDeals: deals.filter(d => d.stage === 'hot').length,
    wonDeals: deals.filter(d => d.stage === 'won').length,
    conversionRate: deals.filter(d => d.stage !== 'lost').length > 0 
      ? Math.round((deals.filter(d => d.stage === 'won').length / deals.filter(d => d.stage !== 'lost').length) * 100) 
      : 0
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white rounded w-32"></div>
          <div className="grid grid-cols-5 gap-3">
            {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-white rounded-xl"></div>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">CRM</h1>
          <p className="text-sm text-black">{deals.length} deals - {contacts.length} contacts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddDeal(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--av-text)] text-white text-sm font-medium">
            <Plus size={18} /> Add Deal
          </button>
          <button onClick={() => setShowAddContact(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 text-sm font-medium hover:bg-black/10">
            <Users size={18} /> Add Contact
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-4 border border-black/[0.06]">
          <div className="text-2xl font-bold">{stats.totalDeals}</div>
          <div className="text-xs text-black">Total Deals</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-black/[0.06]">
          <div className="text-2xl font-bold">\u20a6{stats.totalValue >= 1000000 ? (stats.totalValue / 1000000).toFixed(1) + 'M' : stats.totalValue.toLocaleString()}</div>
          <div className="text-xs text-black">Pipeline Value</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-black/[0.06]">
          <div className="text-2xl font-bold text-red-500">{stats.hotDeals}</div>
          <div className="text-xs text-black">Hot Deals</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-black/[0.06]">
          <div className="text-2xl font-bold text-green-500">{stats.wonDeals}</div>
          <div className="text-xs text-black">Won</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-black/[0.06]">
          <div className="text-2xl font-bold">{stats.conversionRate}%</div>
          <div className="text-xs text-black">Conversion</div>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-black/10 p-1 rounded-xl w-fit">
        {[{ key: 'deals', label: 'Deals' }, { key: 'contacts', label: 'Contacts' }, { key: 'pipeline', label: 'Pipeline' }].map(tab => (
          <button key={tab.key} onClick={() => setViewMode(tab.key as ViewMode)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${viewMode === tab.key ? 'bg-white shadow-sm text-black' : 'text-black hover:text-black/70'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black" size={18} />
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={`Search ${viewMode}...`} className="w-full pl-11 pr-4 py-3 rounded-xl border border-black/10 bg-white text-sm" />
      </div>

      {viewMode === 'deals' && (
        <div className="space-y-4">
          {filteredDeals.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-black/[0.06] text-center">
              <Users size={48} className="mx-auto mb-4 text-black/50" />
              <h3 className="font-semibold mb-2">No deals yet</h3>
              <p className="text-sm text-black mb-4">Create your first deal to start tracking</p>
              <button onClick={() => setShowAddDeal(true)} className="px-4 py-2 rounded-lg bg-[var(--av-text)] text-white text-sm font-medium">Add Deal</button>
            </div>
          ) : (
            filteredDeals.map(deal => {
              const stage = STAGES.find(s => s.key === deal.stage)
              return (
                <div key={deal.id} className="bg-white rounded-2xl p-5 border border-black/[0.06] hover:shadow-md transition cursor-pointer" onClick={() => setEditingDeal(deal)}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{deal.title}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${stage?.color} ${stage?.textColor}`}>{stage?.label}</span>
                      </div>
                      <p className="text-sm text-black">{deal.contact_name}</p>
                      {deal.notes && <p className="text-sm text-black mt-1 line-clamp-1">{deal.notes}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-lg">\u20a6{(deal.value || 0).toLocaleString()}</div>
                      <div className="text-xs text-black">{deal.probability || 50}% likely</div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {viewMode === 'contacts' && (
        <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center">
              <Users size={48} className="mx-auto mb-4 text-black/50" />
              <h3 className="font-semibold mb-2">No contacts yet</h3>
              <button onClick={() => setShowAddContact(true)} className="px-4 py-2 rounded-lg bg-[var(--av-text)] text-white text-sm font-medium">Add Contact</button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-black/[0.02]">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-black/60">Contact</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-black/60">Company</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-black/60">Phone</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-black/60">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {filteredContacts.map(contact => (
                  <tr key={contact.id} className="hover:bg-black/10">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br to-[#4285F4] to-[#8B5CF6]/50 flex items-center justify-center text-white text-sm font-bold">
                          {contact.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{contact.full_name}</div>
                          <div className="text-xs text-black">{contact.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{contact.company || '-'}</td>
                    <td className="px-4 py-3 text-sm">{contact.phone || '-'}</td>
                    <td className="px-4 py-3 text-right text-black text-sm">{new Date(contact.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {viewMode === 'pipeline' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.filter(s => s.key !== 'lost').map(stage => (
            <div key={stage.key} className="min-w-[280px] flex-1">
              <div className={`px-3 py-2 rounded-lg ${stage.color} ${stage.textColor} font-medium text-sm mb-3 flex items-center justify-between`}>
                <span>{stage.label}</span>
                <span className="opacity-80">\u20a6{(dealsByStage[stage.key] || []).reduce((sum, d) => sum + (d.value || 0), 0).toLocaleString()}</span>
              </div>
              <div className="space-y-2">
                {(dealsByStage[stage.key] || []).map(deal => (
                  <div key={deal.id} className="bg-white rounded-xl p-3 border border-black/[0.06] cursor-pointer hover:shadow" onClick={() => setEditingDeal(deal)}>
                    <div className="font-medium text-sm mb-1">{deal.title}</div>
                    <div className="text-xs text-black">{deal.contact_name}</div>
                    <div className="text-sm font-bold mt-2">\u20a6{(deal.value || 0).toLocaleString()}</div>
                  </div>
                ))}
                {(dealsByStage[stage.key] || []).length === 0 && <div className="text-center py-8 text-black text-sm">No deals</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddDeal && (
        <div className="fixed inset-0 bg-black/100 z-50 flex items-center justify-center p-4" onClick={() => setShowAddDeal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-black/10 flex items-center justify-between">
              <h3 className="font-bold text-lg">Add New Deal</h3>
              <button onClick={() => setShowAddDeal(false)} className="p-2 hover:bg-black/10 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div><label className="block text-sm font-medium mb-1">Deal Title *</label><input value={newDealForm.title} onChange={e => setNewDealForm(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g. Enterprise License" className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Contact Name *</label><input value={newDealForm.contact_name} onChange={e => setNewDealForm(prev => ({ ...prev, contact_name: e.target.value }))} placeholder="John Doe" className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
                <div><label className="block text-sm font-medium mb-1">Email</label><input value={newDealForm.contact_email} onChange={e => setNewDealForm(prev => ({ ...prev, contact_email: e.target.value }))} placeholder="john@example.com" className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Phone</label><input value={newDealForm.contact_phone} onChange={e => setNewDealForm(prev => ({ ...prev, contact_phone: e.target.value }))} placeholder="08012345678" className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
                <div><label className="block text-sm font-medium mb-1">Value (\u20a6)</label><input type="number" value={newDealForm.value} onChange={e => setNewDealForm(prev => ({ ...prev, value: e.target.value }))} placeholder="100000" className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Stage</label><select value={newDealForm.stage} onChange={e => setNewDealForm(prev => ({ ...prev, stage: e.target.value as Deal['stage'] }))} className="w-full px-4 py-2.5 rounded-xl border border-black/10">{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={newDealForm.notes} onChange={e => setNewDealForm(prev => ({ ...prev, notes: e.target.value }))} rows={3} placeholder="Add any notes..." className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
            </div>
            <div className="p-4 border-t border-black/10 flex gap-3">
              <button onClick={() => setShowAddDeal(false)} className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium">Cancel</button>
              <button onClick={addDeal} className="flex-1 px-4 py-3 rounded-xl bg-[var(--av-text)] text-white font-medium">Create Deal</button>
            </div>
          </div>
        </div>
      )}

      {showAddContact && (
        <div className="fixed inset-0 bg-black/100 z-50 flex items-center justify-center p-4" onClick={() => setShowAddContact(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-black/10 flex items-center justify-between">
              <h3 className="font-bold text-lg">Add New Contact</h3>
              <button onClick={() => setShowAddContact(false)} className="p-2 hover:bg-black/10 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div><label className="block text-sm font-medium mb-1">Full Name *</label><input value={newContactForm.full_name} onChange={e => setNewContactForm(prev => ({ ...prev, full_name: e.target.value }))} placeholder="John Doe" className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
              <div><label className="block text-sm font-medium mb-1">Email *</label><input type="email" value={newContactForm.email} onChange={e => setNewContactForm(prev => ({ ...prev, email: e.target.value }))} placeholder="john@example.com" className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
              <div><label className="block text-sm font-medium mb-1">Phone</label><input value={newContactForm.phone} onChange={e => setNewContactForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="08012345678" className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
              <div><label className="block text-sm font-medium mb-1">Company</label><input value={newContactForm.company} onChange={e => setNewContactForm(prev => ({ ...prev, company: e.target.value }))} placeholder="Company Name" className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
            </div>
            <div className="p-4 border-t border-black/10 flex gap-3">
              <button onClick={() => setShowAddContact(false)} className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium">Cancel</button>
              <button onClick={addContact} className="flex-1 px-4 py-3 rounded-xl bg-[var(--av-text)] text-white font-medium">Create Contact</button>
            </div>
          </div>
        </div>
      )}

      {editingDeal && (
        <div className="fixed inset-0 bg-black/100 z-50 flex items-center justify-center p-4" onClick={() => setEditingDeal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-black/10 flex items-center justify-between">
              <h3 className="font-bold text-lg">Edit Deal</h3>
              <button onClick={() => setEditingDeal(null)} className="p-2 hover:bg-black/10 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div><label className="block text-sm font-medium mb-1">Deal Title</label><input value={editingDeal.title} onChange={e => setEditingDeal(prev => prev ? { ...prev, title: e.target.value } : null)} className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Contact Name</label><input value={editingDeal.contact_name} onChange={e => setEditingDeal(prev => prev ? { ...prev, contact_name: e.target.value } : null)} className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
                <div><label className="block text-sm font-medium mb-1">Value (\u20a6)</label><input type="number" value={editingDeal.value} onChange={e => setEditingDeal(prev => prev ? { ...prev, value: parseInt(e.target.value) || 0 } : null)} className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Stage</label><select value={editingDeal.stage} onChange={e => setEditingDeal(prev => prev ? { ...prev, stage: e.target.value as Deal['stage'], probability: STAGES.find(s => s.key === e.target.value)?.probability || 50 } : null)} className="w-full px-4 py-2.5 rounded-xl border border-black/10">{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={editingDeal.notes || ''} onChange={e => setEditingDeal(prev => prev ? { ...prev, notes: e.target.value } : null)} rows={3} className="w-full px-4 py-2.5 rounded-xl border border-black/10" /></div>
            </div>
            <div className="p-4 border-t border-black/10 flex gap-3">
              <button onClick={() => deleteDeal(editingDeal.id)} className="px-4 py-3 rounded-xl border border-red-500 text-red-500 font-medium">Delete</button>
              <button onClick={() => updateDeal(editingDeal)} className="flex-1 px-4 py-3 rounded-xl bg-[var(--av-text)] text-white font-medium">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      <FeatureSuggestions suggestions={[
        { label: 'Tasks', path: '/app/tasks', description: 'Create tasks from deals' },
        { label: 'Finance', path: '/app/finance', description: 'Create invoices' },
        { label: 'Reports', path: '/app/reports', description: 'Sales analytics' },
      ]} />
    </div>
  )
}
