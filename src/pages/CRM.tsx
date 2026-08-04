import { useEffect, useState } from 'react'
import { Plus, Users, DollarSign, TrendingUp, Clock } from 'lucide-react'

// Types
type Deal = {
  id: string
  title: string
  stage: 'prospect' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
  value: number
  created_at: string
}

type Contact = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  created_at: string
}

const STAGES: { key: Deal['stage']; label: string; color: string }[] = [
  { key: 'prospect', label: 'Prospect', color: 'bg-gray-100' },
  { key: 'qualified', label: 'Qualified', color: 'bg-blue-100' },
  { key: 'proposal', label: 'Proposal', color: 'bg-purple-100' },
  { key: 'negotiation', label: 'Negotiation', color: 'bg-amber-100' },
  { key: 'won', label: 'Won', color: 'bg-green-100' },
  { key: 'lost', label: 'Lost', color: 'bg-red-100' },
]

export default function CRM() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [title, setTitle] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Try to load from Supabase, fall back to demo data
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY
        )
        
        // Try to fetch deals
        const { data: dealsData } = await supabase
          .from('deals')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50)
        
        // Try to fetch contacts
        const { data: contactsData } = await supabase
          .from('contacts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50)
        
        if (dealsData && dealsData.length > 0) {
          setDeals(dealsData as Deal[])
        } else {
          // Use demo data
          setDeals(DEMO_DEALS)
        }
        
        if (contactsData && contactsData.length > 0) {
          setContacts(contactsData as Contact[])
        } else {
          setContacts(DEMO_CONTACTS)
        }
      } catch (err) {
        console.warn('CRM load error:', err)
        // Use demo data on error
        setDeals(DEMO_DEALS)
        setContacts(DEMO_CONTACTS)
      }
      setLoading(false)
    }
    load()
  }, [])

  const addDeal = async () => {
    if (!title.trim()) return
    const newDeal: Deal = {
      id: crypto.randomUUID(),
      title,
      stage: 'prospect',
      value: 0,
      created_at: new Date().toISOString(),
    }
    setDeals(prev => [newDeal, ...prev])
    setTitle('')
  }

  const addContact = async () => {
    if (!contactName.trim()) return
    const newContact: Contact = {
      id: crypto.randomUUID(),
      full_name: contactName,
      email: contactEmail || null,
      phone: null,
      created_at: new Date().toISOString(),
    }
    setContacts(prev => [newContact, ...prev])
    setContactName('')
    setContactEmail('')
  }

  const moveStage = (id: string, newStage: Deal['stage']) => {
    setDeals(prev => prev.map(d => d.id === id ? { ...d, stage: newStage } : d))
  }

  // Stats
  const totalValue = deals.filter(d => d.stage !== 'lost').reduce((sum, d) => sum + d.value, 0)
  const wonDeals = deals.filter(d => d.stage === 'won').length
  const avgDealValue = wonDeals > 0 ? totalValue / wonDeals : 0

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-[var(--avenize-black)] mb-6">CRM</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <div className="flex items-center gap-2 text-black/50 text-sm mb-1">
            <DollarSign size={16} />
            <span>Pipeline Value</span>
          </div>
          <p className="text-2xl font-bold">₦{totalValue.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <div className="flex items-center gap-2 text-black/50 text-sm mb-1">
            <TrendingUp size={16} />
            <span>Won Deals</span>
          </div>
          <p className="text-2xl font-bold">{wonDeals}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <div className="flex items-center gap-2 text-black/50 text-sm mb-1">
            <Users size={16} />
            <span>Contacts</span>
          </div>
          <p className="text-2xl font-bold">{contacts.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <div className="flex items-center gap-2 text-black/50 text-sm mb-1">
            <Clock size={16} />
            <span>Avg Deal</span>
          </div>
          <p className="text-2xl font-bold">₦{avgDealValue.toLocaleString()}</p>
        </div>
      </div>

      {/* Add New */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <h3 className="font-medium mb-3">Add New Deal</h3>
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Deal title..."
              className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <button 
              onClick={addDeal}
              className="rounded-lg bg-[var(--avenize-black)] text-white px-4 py-2 text-sm flex items-center gap-1"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/[0.06]">
          <h3 className="font-medium mb-3">Add New Contact</h3>
          <div className="flex gap-2">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Contact name..."
              className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Email..."
              className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <button 
              onClick={addContact}
              className="rounded-lg bg-[var(--avenize-black)] text-white px-4 py-2 text-sm flex items-center gap-1"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Deals Pipeline */}
      <div className="bg-white rounded-xl border border-black/[0.06] p-4 mb-8">
        <h3 className="font-medium mb-4">Deals Pipeline</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAGES.map((stage) => {
            const stageDeals = deals.filter(d => d.stage === stage.key)
            return (
              <div key={stage.key} className={`rounded-xl p-3 ${stage.color}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{stage.label}</span>
                  <span className="text-xs opacity-60">{stageDeals.length}</span>
                </div>
                <div className="space-y-2">
                  {stageDeals.slice(0, 3).map((deal) => (
                    <div key={deal.id} className="bg-white rounded-lg p-2 text-xs shadow-sm">
                      <p className="font-medium truncate">{deal.title}</p>
                      {deal.value > 0 && (
                        <p className="text-black/50">₦{deal.value.toLocaleString()}</p>
                      )}
                    </div>
                  ))}
                  {stageDeals.length > 3 && (
                    <p className="text-xs text-center opacity-60">+{stageDeals.length - 3} more</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Contacts */}
      <div className="bg-white rounded-xl border border-black/[0.06] p-4">
        <h3 className="font-medium mb-4">Recent Contacts</h3>
        <div className="space-y-2">
          {contacts.slice(0, 10).map((contact) => (
            <div key={contact.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-black/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--avenize-primary)] flex items-center justify-center text-white font-medium">
                  {contact.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-sm">{contact.full_name}</p>
                  <p className="text-xs text-black/50">{contact.email || 'No email'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Demo data
const DEMO_DEALS: Deal[] = [
  { id: '1', title: 'Enterprise License', stage: 'negotiation', value: 2500000, created_at: '2024-01-15' },
  { id: '2', title: 'Monthly Subscription', stage: 'qualified', value: 150000, created_at: '2024-01-14' },
  { id: '3', title: 'Consulting Package', stage: 'proposal', value: 800000, created_at: '2024-01-13' },
  { id: '4', title: 'Startup Plan', stage: 'won', value: 50000, created_at: '2024-01-12' },
  { id: '5', title: 'Premium Support', stage: 'prospect', value: 120000, created_at: '2024-01-11' },
  { id: '6', title: 'Training Package', stage: 'qualified', value: 200000, created_at: '2024-01-10' },
]

const DEMO_CONTACTS: Contact[] = [
  { id: '1', full_name: 'Adebayo Johnson', email: 'adebayo@techcorp.ng', phone: '08012345678', created_at: '2024-01-15' },
  { id: '2', full_name: 'Chioma Okonkwo', email: 'chioma@startup.ng', phone: '08098765432', created_at: '2024-01-14' },
  { id: '3', full_name: 'Emmanuel Eze', email: 'emmanuel@enterprise.com', phone: null, created_at: '2024-01-13' },
  { id: '4', full_name: 'Fatima Bello', email: 'fatima@business.ng', phone: '08055544433', created_at: '2024-01-12' },
]
