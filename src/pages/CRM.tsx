import { useEffect, useState, useRef } from 'react'
import { 
  Plus, Search, Filter, Users, DollarSign, TrendingUp, 
  Phone, MessageCircle, Mail, MoreVertical, ChevronRight,
  Upload, Download, X, Check, Clock, Star,
  Zap, Briefcase, User, Trash2, Edit3,
  ArrowUpRight, AlertCircle, Heart, MessageSquare, 
  TrendingDown, Award, UsersRound, Gift, ThumbsUp, BarChart3
} from 'lucide-react'
import FeatureSuggestions from '../components/FeatureSuggestions'
import { useToast } from '../components/Toast'

// Types
type Deal = {
  id: string
  title: string
  contact_name: string
  contact_phone: string
  contact_email: string
  stage: 'hot' | 'active' | 'proposal' | 'negotiation' | 'won' | 'lost'
  value: number
  probability: number
  created_at: string
  last_contact: string
  notes: string
  source: 'referral' | 'cold_call' | 'website' | 'social' | 'walk_in' | 'other'
  assigned_to: string
}

type Contact = {
  id: string
  full_name: string
  email: string
  phone: string
  company: string
  created_at: string
  last_contact: string
  total_deals: number
  won_deals: number
}

type ViewMode = 'deals' | 'contacts' | 'pipeline' | 'postsale'
type QuickAddType = 'deal' | 'contact' | null

// Post-Sale Types
type ClientComplaint = {
  id: string
  client_id: string
  client_name: string
  subject: string
  description: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  created_at: string
  resolved_at?: string
  assigned_to: string
}

type ClientReferral = {
  id: string
  referrer_id: string
  referrer_name: string
  referred_name: string
  referred_company: string
  referred_phone: string
  referred_email: string
  status: 'pending' | 'contacted' | 'converted' | 'not_interested'
  notes: string
  created_at: string
  converted_deal_id?: string
}

type ClientSuggestion = {
  id: string
  client_id: string
  client_name: string
  type: 'feature' | 'improvement' | 'compliment' | 'other'
  subject: string
  description: string
  status: 'new' | 'reviewed' | 'implemented' | 'declined'
  created_at: string
}

type ClientLTV = {
  client_id: string
  client_name: string
  company: string
  total_revenue: number
  deal_count: number
  last_purchase: string
  avg_deal_value: number
  customer_since: string
  satisfaction_score: number
  referral_count: number
}

const SOURCE_LABELS: Record<Deal['source'], string> = {
  referral: 'Referral',
  cold_call: 'Cold Call',
  website: 'Website',
  social: 'Social Media',
  walk_in: 'Walk-in',
  other: 'Other'
}

const STAGES = [
  { key: 'hot', label: '🔥 Hot', color: 'bg-red-500', textColor: 'text-white', probability: 80 },
  { key: 'active', label: 'Active', color: 'bg-blue-500', textColor: 'text-white', probability: 50 },
  { key: 'proposal', label: 'Proposal', color: 'bg-purple-500', textColor: 'text-white', probability: 60 },
  { key: 'negotiation', label: 'Negotiating', color: 'bg-amber-500', textColor: 'text-white', probability: 75 },
  { key: 'won', label: '✅ Won', color: 'bg-green-500', textColor: 'text-white', probability: 100 },
  { key: 'lost', label: '❌ Lost', color: 'bg-gray-400', textColor: 'text-white', probability: 0 },
]

const DEMO_DEALS: Deal[] = [
  { id: '1', title: 'Enterprise License', contact_name: 'Adebayo Johnson', contact_phone: '08012345678', contact_email: 'adebayo@techcorp.ng', stage: 'negotiation', value: 2500000, probability: 75, created_at: '2024-01-15', last_contact: '2024-01-20', notes: 'Waiting for final approval', source: 'referral', assigned_to: 'You' },
  { id: '2', title: 'Monthly Subscription', contact_name: 'Chioma Okonkwo', contact_phone: '08098765432', contact_email: 'chioma@startup.ng', stage: 'active', value: 150000, probability: 50, created_at: '2024-01-14', last_contact: '2024-01-18', notes: 'Follow up next week', source: 'website', assigned_to: 'You' },
  { id: '3', title: 'Consulting Package', contact_name: 'Emmanuel Eze', contact_phone: '08055544433', contact_email: 'emmanuel@enterprise.com', stage: 'proposal', value: 800000, probability: 60, created_at: '2024-01-13', last_contact: '2024-01-19', notes: 'Sent proposal, awaiting response', source: 'cold_call', assigned_to: 'You' },
  { id: '4', title: 'Startup Plan', contact_name: 'Fatima Bello', contact_phone: '08112233445', contact_email: 'fatima@business.ng', stage: 'won', value: 50000, probability: 100, created_at: '2024-01-12', last_contact: '2024-01-17', notes: 'Closed!', source: 'referral', assigned_to: 'You' },
  { id: '5', title: 'Premium Support', contact_name: 'Chukwudi Emeka', contact_phone: '08099988777', contact_email: 'chukwudi@firm.ng', stage: 'hot', value: 1200000, probability: 80, created_at: '2024-01-11', last_contact: '2024-01-20', notes: 'Very interested, call tomorrow', source: 'social', assigned_to: 'You' },
  { id: '6', title: 'Training Package', contact_name: 'Blessing Adeyemi', contact_phone: '07066655544', contact_email: 'blessing@company.com', stage: 'lost', value: 200000, probability: 0, created_at: '2024-01-10', last_contact: '2024-01-15', notes: 'Went with competitor', source: 'walk_in', assigned_to: 'You' },
  { id: '7', title: 'Annual Contract', contact_name: 'Ibrahim Musa', contact_phone: '09011122334', contact_email: 'ibrahim@corp.ng', stage: 'hot', value: 3500000, probability: 80, created_at: '2024-01-09', last_contact: '2024-01-20', notes: 'Urgent need, close this week!', source: 'referral', assigned_to: 'You' },
]

const DEMO_CONTACTS: Contact[] = [
  { id: '1', full_name: 'Adebayo Johnson', email: 'adebayo@techcorp.ng', phone: '08012345678', company: 'TechCorp Nigeria', created_at: '2024-01-01', last_contact: '2024-01-20', total_deals: 3, won_deals: 1 },
  { id: '2', full_name: 'Chioma Okonkwo', email: 'chioma@startup.ng', phone: '08098765432', company: 'StartupNG', created_at: '2024-01-03', last_contact: '2024-01-18', total_deals: 2, won_deals: 0 },
  { id: '3', full_name: 'Emmanuel Eze', email: 'emmanuel@enterprise.com', phone: '08055544433', company: 'Enterprise Ltd', created_at: '2024-01-05', last_contact: '2024-01-19', total_deals: 1, won_deals: 0 },
  { id: '4', full_name: 'Fatima Bello', email: 'fatima@business.ng', phone: '08112233445', company: 'Business Solutions', created_at: '2024-01-07', last_contact: '2024-01-17', total_deals: 2, won_deals: 1 },
  { id: '5', full_name: 'Chukwudi Emeka', email: 'chukwudi@firm.ng', phone: '08099988777', company: 'Legal Firm & Co', created_at: '2024-01-09', last_contact: '2024-01-20', total_deals: 1, won_deals: 0 },
]

// Demo Post-Sale Data
const DEMO_COMPLAINTS: ClientComplaint[] = [
  { id: '1', client_id: '1', client_name: 'Adebayo Johnson', subject: 'Invoice discrepancy', description: 'The invoice amount does not match the agreed price', status: 'open', priority: 'high', created_at: '2024-01-18', assigned_to: 'You' },
  { id: '2', client_id: '3', client_name: 'Emmanuel Eze', subject: 'Delayed delivery', description: 'Project deliverables are 3 days late', status: 'in_progress', priority: 'medium', created_at: '2024-01-15', assigned_to: 'You' },
  { id: '3', client_id: '2', client_name: 'Chioma Okonkwo', subject: 'App crashing', description: 'Mobile app crashes on login', status: 'resolved', priority: 'urgent', created_at: '2024-01-10', resolved_at: '2024-01-12', assigned_to: 'You' },
]

const DEMO_REFERRALS: ClientReferral[] = [
  { id: '1', referrer_id: '1', referrer_name: 'Adebayo Johnson', referred_name: 'Kunle Adeyemi', referred_company: 'TechStart Hub', referred_phone: '08055566677', referred_email: 'kunle@techstart.ng', status: 'contacted', notes: 'Interested in annual plan', created_at: '2024-01-15' },
  { id: '2', referrer_id: '4', referrer_name: 'Fatima Bello', referred_name: 'Tunde Bakare', referred_company: 'FreshCo Ltd', referred_phone: '08112233445', referred_email: 'tunde@freshco.ng', status: 'converted', notes: 'Closed! ₦200K deal', created_at: '2024-01-08', converted_deal_id: '6' },
  { id: '3', referrer_id: '2', referrer_name: 'Chioma Okonkwo', referred_name: 'Ngozi Peter', referred_company: 'StartupHub', referred_phone: '08099988877', referred_email: 'ngozi@startuphub.ng', status: 'pending', notes: 'Will call next week', created_at: '2024-01-20' },
]

const DEMO_SUGGESTIONS: ClientSuggestion[] = [
  { id: '1', client_id: '1', client_name: 'Adebayo Johnson', type: 'feature', subject: 'API integration', description: 'Would love to see Zapier integration', status: 'reviewed', created_at: '2024-01-15' },
  { id: '2', client_id: '4', client_name: 'Fatima Bello', type: 'compliment', subject: 'Great support!', description: 'Your team is amazing. Sarah helped solve my issue in minutes.', status: 'new', created_at: '2024-01-18' },
  { id: '3', client_id: '3', client_name: 'Emmanuel Eze', type: 'improvement', subject: 'Dashboard customization', description: 'Allow us to reorder dashboard widgets', status: 'implemented', created_at: '2024-01-05' },
]

const DEMO_LTV: ClientLTV[] = [
  { client_id: '1', client_name: 'Adebayo Johnson', company: 'TechCorp Nigeria', total_revenue: 3500000, deal_count: 3, last_purchase: '2024-01-15', avg_deal_value: 1166667, customer_since: '2023-06-15', satisfaction_score: 4.5, referral_count: 2 },
  { client_id: '4', client_name: 'Fatima Bello', company: 'Business Solutions', total_revenue: 2500000, deal_count: 2, last_purchase: '2024-01-10', avg_deal_value: 1250000, customer_since: '2023-03-20', satisfaction_score: 5.0, referral_count: 3 },
  { client_id: '2', client_name: 'Chioma Okonkwo', company: 'StartupNG', total_revenue: 450000, deal_count: 2, last_purchase: '2024-01-05', avg_deal_value: 225000, customer_since: '2023-11-01', satisfaction_score: 4.0, referral_count: 1 },
  { client_id: '3', client_name: 'Emmanuel Eze', company: 'Enterprise Ltd', total_revenue: 1800000, deal_count: 1, last_purchase: '2024-01-12', avg_deal_value: 1800000, customer_since: '2023-09-10', satisfaction_score: 4.2, referral_count: 0 },
]

export default function CRM() {
  const [viewMode, setViewMode] = useState<ViewMode>('deals')
  const [deals, setDeals] = useState<Deal[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showQuickAdd, setShowQuickAdd] = useState<QuickAddType>(null)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const [selectedStage, setSelectedStage] = useState<string>('all')
  const [showDeadDeals, setShowDeadDeals] = useState(false)
  const [postSaleTab, setPostSaleTab] = useState<'overview' | 'complaints' | 'referrals' | 'suggestions' | 'ltv'>('overview')
  const [complaints, setComplaints] = useState<ClientComplaint[]>([])
  const [referrals, setReferrals] = useState<ClientReferral[]>([])
  const [suggestions, setSuggestions] = useState<ClientSuggestion[]>([])
  const [clientLTV, setClientLTV] = useState<ClientLTV[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  const [dealForm, setDealForm] = useState({
    title: '', contact_name: '', contact_phone: '', contact_email: '',
    value: '', stage: 'active' as Deal['stage'], source: 'referral' as Deal['source'], notes: ''
  })
  const [contactForm, setContactForm] = useState({
    full_name: '', phone: '', email: '', company: ''
  })

  useEffect(() => {
    setDeals(DEMO_DEALS)
    setContacts(DEMO_CONTACTS)
    setComplaints(DEMO_COMPLAINTS)
    setReferrals(DEMO_REFERRALS)
    setSuggestions(DEMO_SUGGESTIONS)
    setClientLTV(DEMO_LTV)
  }, [])

  const activeDeals = deals.filter(d => !['won', 'lost'].includes(d.stage))
  const wonDeals = deals.filter(d => d.stage === 'won')
  const hotDeals = deals.filter(d => d.stage === 'hot')
  const lostDeals = deals.filter(d => d.stage === 'lost')

  const totalPipelineValue = activeDeals.reduce((sum, d) => sum + d.value, 0)
  const totalWonValue = wonDeals.reduce((sum, d) => sum + d.value, 0)
  const weightedValue = activeDeals.reduce((sum, d) => sum + (d.value * d.probability / 100), 0)

  const filteredDeals = deals.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.contact_name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStage = selectedStage === 'all' || d.stage === selectedStage
    const matchesActive = showDeadDeals ? true : !['won', 'lost'].includes(d.stage)
    return matchesSearch && matchesStage && matchesActive
  })

  const filteredContacts = contacts.filter(c =>
    c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  )

  const handleAddDeal = () => {
    if (!dealForm.title.trim() || !dealForm.contact_name.trim()) {
      showToast('Please fill in deal title and contact name', 'error')
      return
    }
    const newDeal: Deal = {
      id: crypto.randomUUID(),
      title: dealForm.title,
      contact_name: dealForm.contact_name,
      contact_phone: dealForm.contact_phone,
      contact_email: dealForm.contact_email,
      stage: dealForm.stage,
      value: parseInt(dealForm.value) || 0,
      probability: STAGES.find(s => s.key === dealForm.stage)?.probability || 50,
      created_at: new Date().toISOString(),
      last_contact: new Date().toISOString(),
      notes: dealForm.notes,
      source: dealForm.source,
      assigned_to: 'You'
    }
    setDeals(prev => [newDeal, ...prev])
    setDealForm({ title: '', contact_name: '', contact_phone: '', contact_email: '', value: '', stage: 'active', source: 'referral', notes: '' })
    setShowQuickAdd(null)
    showToast('Deal added! 🎉', 'success')
  }

  const handleAddContact = () => {
    if (!contactForm.full_name.trim()) {
      showToast('Please enter contact name', 'error')
      return
    }
    const newContact: Contact = {
      id: crypto.randomUUID(),
      full_name: contactForm.full_name,
      phone: contactForm.phone,
      email: contactForm.email,
      company: contactForm.company,
      created_at: new Date().toISOString(),
      last_contact: new Date().toISOString(),
      total_deals: 0,
      won_deals: 0
    }
    setContacts(prev => [newContact, ...prev])
    setContactForm({ full_name: '', phone: '', email: '', company: '' })
    setShowQuickAdd(null)
    showToast('Contact added! 👋', 'success')
  }

  const moveDeal = (dealId: string, newStage: Deal['stage']) => {
    setDeals(prev => prev.map(d => d.id === dealId ? {
      ...d,
      stage: newStage,
      probability: STAGES.find(s => s.key === newStage)?.probability || d.probability,
      last_contact: new Date().toISOString()
    } : d))
    showToast(`Moved to ${STAGES.find(s => s.key === newStage)?.label}`, 'success')
  }

  const deleteDeal = (dealId: string) => {
    setDeals(prev => prev.filter(d => d.id !== dealId))
    showToast('Deal deleted', 'info')
  }

  const exportToCSV = () => {
    const headers = ['Title', 'Contact', 'Phone', 'Email', 'Stage', 'Value', 'Source', 'Created', 'Notes']
    const rows = deals.map(d => [
      d.title, d.contact_name, d.contact_phone, d.contact_email,
      d.stage, d.value, d.source, d.created_at, d.notes
    ])
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `avenize-deals-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${deals.length} deals 📊`, 'success')
  }

  const importFromCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').slice(1)
      const newDeals: Deal[] = []

      lines.forEach(line => {
        if (!line.trim()) return
        const [title, contact_name, contact_phone, contact_email, stage, value, source, , notes] = line.split(',')
        newDeals.push({
          id: crypto.randomUUID(),
          title: title?.trim() || 'Untitled',
          contact_name: contact_name?.trim() || 'Unknown',
          contact_phone: contact_phone?.trim() || '',
          contact_email: contact_email?.trim() || '',
          stage: (['hot', 'active', 'proposal', 'negotiation', 'won', 'lost'].includes(stage?.trim()) ? stage?.trim() : 'active') as Deal['stage'],
          value: parseInt(value) || 0,
          probability: 50,
          created_at: new Date().toISOString(),
          last_contact: new Date().toISOString(),
          notes: notes?.trim() || '',
          source: (['referral', 'cold_call', 'website', 'social', 'walk_in', 'other'].includes(source?.trim()) ? source?.trim() : 'other') as Deal['source'],
          assigned_to: 'You'
        })
      })

      setDeals(prev => [...newDeals, ...prev])
      showToast(`Imported ${newDeals.length} deals! 🚀`, 'success')
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount)
  }

  const timeSince = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return `${Math.floor(days / 7)} weeks ago`
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--avenize-black)]">CRM</h1>
          <p className="text-sm text-black/50">Track deals, contacts & pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-lg hover:bg-black/5 flex items-center gap-2 text-sm border border-black/10">
            <Upload size={16} /> Import CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={importFromCSV} />
          <button onClick={exportToCSV} className="px-3 py-2 rounded-lg hover:bg-black/5 flex items-center gap-2 text-sm border border-black/10">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl p-4 text-white">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={16} />
            <span className="text-xs opacity-80">Hot Deals</span>
          </div>
          <p className="text-2xl font-bold">{hotDeals.length}</p>
          <p className="text-xs opacity-80 mt-1">{formatCurrency(hotDeals.reduce((s, d) => s + d.value, 0))}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl p-4 text-white">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} />
            <span className="text-xs opacity-80">Pipeline</span>
          </div>
          <p className="text-2xl font-bold">{activeDeals.length}</p>
          <p className="text-xs opacity-80 mt-1">{formatCurrency(totalPipelineValue)}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl p-4 text-white">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={16} />
            <span className="text-xs opacity-80">Won</span>
          </div>
          <p className="text-2xl font-bold">{wonDeals.length}</p>
          <p className="text-xs opacity-80 mt-1">{formatCurrency(totalWonValue)}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl p-4 text-white">
          <div className="flex items-center gap-2 mb-1">
            <Star size={16} />
            <span className="text-xs opacity-80">Weighted</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(weightedValue)}</p>
          <p className="text-xs opacity-80 mt-1">Expected value</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
          <input
            type="text"
            placeholder="Search deals, contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/10 bg-white text-sm"
          />
        </div>
        <div className="flex gap-2">
          <select value={selectedStage} onChange={(e) => setSelectedStage(e.target.value)} className="px-4 py-2.5 rounded-xl border border-black/10 bg-white text-sm">
            <option value="all">All Stages</option>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button onClick={() => setShowDeadDeals(!showDeadDeals)} className={`px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${showDeadDeals ? 'bg-black text-white' : 'border border-black/10 bg-white'}`}>
            <Filter size={16} /> {showDeadDeals ? 'Active Only' : 'Show All'}
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex gap-1 bg-black/5 p-1 rounded-xl w-fit mb-6">
        <button onClick={() => setViewMode('deals')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${viewMode === 'deals' ? 'bg-white shadow-sm text-[var(--avenize-black)]' : 'text-black/60'}`}>
          Deals ({deals.length})
        </button>
        <button onClick={() => setViewMode('contacts')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${viewMode === 'contacts' ? 'bg-white shadow-sm text-[var(--avenize-black)]' : 'text-black/60'}`}>
          Contacts ({contacts.length})
        </button>
        <button onClick={() => setViewMode('pipeline')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${viewMode === 'pipeline' ? 'bg-white shadow-sm text-[var(--avenize-black)]' : 'text-black/60'}`}>
          Pipeline
        </button>
        <button onClick={() => setViewMode('postsale')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${viewMode === 'postsale' ? 'bg-white shadow-sm text-[var(--avenize-black)]' : 'text-black/60'}`}>
          🎉 Post-Sale
        </button>
      </div>

      {/* Quick Add Bar - Simple like WhatsApp */}
      <div className="bg-white rounded-xl border border-black/10 p-3 mb-6 flex items-center gap-3">
        <button onClick={() => { setShowQuickAdd('deal'); setDealForm({ ...dealForm, stage: 'hot' }) }} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition">
          <Plus size={18} /> 🔥 Hot Deal
        </button>
        <button onClick={() => setShowQuickAdd('deal')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 transition">
          <Plus size={18} /> New Deal
        </button>
        <button onClick={() => setShowQuickAdd('contact')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-50 hover:bg-green-100 text-green-600 transition">
          <Plus size={18} /> Add Contact
        </button>
      </div>

      {/* Quick Add Modal */}
      {showQuickAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowQuickAdd(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-black/10 flex items-center justify-between">
              <h3 className="font-bold text-lg">{showQuickAdd === 'deal' ? '🎯 New Deal' : '👤 New Contact'}</h3>
              <button onClick={() => setShowQuickAdd(null)} className="p-2 hover:bg-black/5 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              {showQuickAdd === 'deal' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Deal Title *</label>
                    <input value={dealForm.title} onChange={e => setDealForm(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g., Enterprise License - ABC Corp" className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Contact Name *</label>
                      <input value={dealForm.contact_name} onChange={e => setDealForm(prev => ({ ...prev, contact_name: e.target.value }))} placeholder="Who is this deal with?" className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Phone</label>
                      <input value={dealForm.contact_phone} onChange={e => setDealForm(prev => ({ ...prev, contact_phone: e.target.value }))} placeholder="080..." className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Value (₦)</label>
                      <input type="number" value={dealForm.value} onChange={e => setDealForm(prev => ({ ...prev, value: e.target.value }))} placeholder="How much?" className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Stage</label>
                      <select value={dealForm.stage} onChange={e => setDealForm(prev => ({ ...prev, stage: e.target.value as Deal['stage'] }))} className="w-full px-4 py-2.5 rounded-xl border border-black/10">
                        {STAGES.slice(0, 4).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Source</label>
                    <select value={dealForm.source} onChange={e => setDealForm(prev => ({ ...prev, source: e.target.value as Deal['source'] }))} className="w-full px-4 py-2.5 rounded-xl border border-black/10">
                      {Object.entries(SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Quick Notes</label>
                    <textarea value={dealForm.notes} onChange={e => setDealForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Quick notes..." rows={2} className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Full Name *</label>
                    <input value={contactForm.full_name} onChange={e => setContactForm(prev => ({ ...prev, full_name: e.target.value }))} placeholder="Contact name" className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Company</label>
                    <input value={contactForm.company} onChange={e => setContactForm(prev => ({ ...prev, company: e.target.value }))} placeholder="Company name" className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Phone</label>
                      <input value={contactForm.phone} onChange={e => setContactForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="080..." className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Email</label>
                      <input value={contactForm.email} onChange={e => setContactForm(prev => ({ ...prev, email: e.target.value }))} placeholder="email@company.com" className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-black/10 flex gap-3">
              <button onClick={() => setShowQuickAdd(null)} className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium">Cancel</button>
              <button onClick={showQuickAdd === 'deal' ? handleAddDeal : handleAddContact} className="flex-1 px-4 py-3 rounded-xl bg-[var(--avenize-black)] text-white font-medium">
                {showQuickAdd === 'deal' ? 'Add Deal' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deals View */}
      {viewMode === 'deals' && (
        <div className="space-y-3">
          {filteredDeals.length === 0 ? (
            <div className="bg-white rounded-xl border border-black/10 p-12 text-center">
              <Briefcase className="w-12 h-12 mx-auto mb-4 text-black/20" />
              <h3 className="font-medium mb-2">No deals found</h3>
              <p className="text-sm text-black/50 mb-4">Create your first deal to get started</p>
              <button onClick={() => setShowQuickAdd('deal')} className="px-4 py-2 bg-[var(--avenize-black)] text-white rounded-lg text-sm">Add First Deal</button>
            </div>
          ) : (
            filteredDeals.map(deal => {
              const stage = STAGES.find(s => s.key === deal.stage)
              return (
                <div key={deal.id} className="bg-white rounded-xl border border-black/10 p-4 hover:shadow-md transition cursor-pointer" onClick={() => { setEditingDeal(deal); setDealForm({ title: deal.title, contact_name: deal.contact_name, contact_phone: deal.contact_phone, contact_email: deal.contact_email, value: deal.value.toString(), stage: deal.stage, source: deal.source, notes: deal.notes }) }}>
                  <div className="flex items-start gap-4">
                    <div className={`w-1 h-full min-h-[80px] rounded-full ${stage?.color}`} />
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium">{deal.title}</h3>
                          <p className="text-sm text-black/60 flex items-center gap-2 mt-1">
                            <User size={14} /> {deal.contact_name}
                            {deal.contact_phone && (<><span className="text-black/30">•</span>{deal.contact_phone}</>)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">{formatCurrency(deal.value)}</p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${stage?.color} ${stage?.textColor}`}>{stage?.label}</span>
                        </div>
                      </div>
                      {deal.notes && <p className="text-sm text-black/50 mt-2 bg-black/5 rounded-lg px-3 py-2">💬 {deal.notes}</p>}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-black/5">
                        <div className="flex items-center gap-2 text-xs text-black/40">
                          <Clock size={12} /> {timeSince(deal.last_contact)}
                          <span className="text-black/20">•</span>{SOURCE_LABELS[deal.source]}
                        </div>
                        <div className="flex items-center gap-1">
                          {deal.contact_phone && (
                            <>
                              <a href={`tel:${deal.contact_phone}`} className="p-2 hover:bg-black/5 rounded-lg" title="Call" onClick={e => e.stopPropagation()}><Phone size={16} className="text-green-600" /></a>
                              <a href={`https://wa.me/${deal.contact_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-black/5 rounded-lg" title="WhatsApp" onClick={e => e.stopPropagation()}><MessageCircle size={16} className="text-green-500" /></a>
                              <a href={`mailto:${deal.contact_email}`} className="p-2 hover:bg-black/5 rounded-lg" title="Email" onClick={e => e.stopPropagation()}><Mail size={16} className="text-blue-500" /></a>
                            </>
                          )}
                          <div className="relative group">
                            <button className="p-2 hover:bg-black/5 rounded-lg" onClick={e => e.stopPropagation()}><MoreVertical size={16} /></button>
                            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-black/10 py-1 hidden group-hover:block z-10 min-w-[150px]">
                              <button onClick={(e) => { e.stopPropagation(); moveDeal(deal.id, 'hot') }} className="w-full px-4 py-2 text-left text-sm hover:bg-black/5 flex items-center gap-2"><Zap size={14} className="text-red-500" /> Mark Hot</button>
                              <button onClick={(e) => { e.stopPropagation(); moveDeal(deal.id, 'won') }} className="w-full px-4 py-2 text-left text-sm hover:bg-black/5 flex items-center gap-2"><Check size={14} className="text-green-500" /> Mark Won</button>
                              <button onClick={(e) => { e.stopPropagation(); moveDeal(deal.id, 'lost') }} className="w-full px-4 py-2 text-left text-sm hover:bg-black/5 flex items-center gap-2"><X size={14} className="text-gray-500" /> Mark Lost</button>
                              <hr className="my-1 border-black/10" />
                              <button onClick={(e) => { e.stopPropagation(); deleteDeal(deal.id) }} className="w-full px-4 py-2 text-left text-sm hover:bg-black/5 flex items-center gap-2 text-red-500"><Trash2 size={14} /> Delete</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Contacts View */}
      {viewMode === 'contacts' && (
        <div className="space-y-3">
          {filteredContacts.length === 0 ? (
            <div className="bg-white rounded-xl border border-black/10 p-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-black/20" />
              <h3 className="font-medium mb-2">No contacts found</h3>
              <p className="text-sm text-black/50 mb-4">Add your first contact</p>
              <button onClick={() => setShowQuickAdd('contact')} className="px-4 py-2 bg-[var(--avenize-black)] text-white rounded-lg text-sm">Add First Contact</button>
            </div>
          ) : (
            filteredContacts.map(contact => (
              <div key={contact.id} className="bg-white rounded-xl border border-black/10 p-4 hover:shadow-md transition">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--avenize-primary)] to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                    {contact.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium">{contact.full_name}</h3>
                    <p className="text-sm text-black/60">{contact.company || 'No company'}</p>
                    <p className="text-xs text-black/40 mt-1">{contact.email} • {contact.phone}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-sm">
                      <span className="text-green-600 font-medium">{contact.won_deals} won</span>
                      <span className="text-black/30">/</span>
                      <span className="text-black/60">{contact.total_deals} deals</span>
                    </div>
                    <p className="text-xs text-black/40 mt-1">Last: {timeSince(contact.last_contact)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {contact.phone && (
                      <>
                        <a href={`tel:${contact.phone}`} className="p-2 hover:bg-black/5 rounded-lg" title="Call"><Phone size={18} className="text-green-600" /></a>
                        <a href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-black/5 rounded-lg" title="WhatsApp"><MessageCircle size={18} className="text-green-500" /></a>
                        <a href={`mailto:${contact.email}`} className="p-2 hover:bg-black/5 rounded-lg" title="Email"><Mail size={18} className="text-blue-500" /></a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pipeline View */}
      {viewMode === 'pipeline' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {STAGES.map(stage => {
              const stageDeals = deals.filter(d => d.stage === stage.key)
              const stageValue = stageDeals.reduce((sum, d) => sum + d.value, 0)
              return (
                <div key={stage.key} className="w-72 flex-shrink-0">
                  <div className={`rounded-xl ${stage.color} ${stage.textColor} p-3 mb-3`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{stage.label}</span>
                      <span className="text-sm opacity-80">{stageDeals.length}</span>
                    </div>
                    <p className="text-sm opacity-80 mt-1">{formatCurrency(stageValue)}</p>
                  </div>
                  <div className="space-y-2">
                    {stageDeals.length === 0 ? (
                      <div className="bg-white rounded-xl border border-dashed border-black/20 p-4 text-center text-sm text-black/40">No deals</div>
                    ) : (
                      stageDeals.map(deal => (
                        <div key={deal.id} className="bg-white rounded-xl border border-black/10 p-3 cursor-pointer hover:shadow-md transition" onClick={() => { setEditingDeal(deal); setDealForm({ title: deal.title, contact_name: deal.contact_name, contact_phone: deal.contact_phone, contact_email: deal.contact_email, value: deal.value.toString(), stage: deal.stage, source: deal.source, notes: deal.notes }) }}>
                          <h4 className="font-medium text-sm truncate">{deal.title}</h4>
                          <p className="text-xs text-black/60 mt-1">{deal.contact_name}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-sm font-bold">{formatCurrency(deal.value)}</span>
                            <span className="text-xs text-black/40">{deal.probability}%</span>
                          </div>
                          <div className="w-full bg-black/10 rounded-full h-1.5 mt-2">
                            <div className={`h-full rounded-full ${stage.color}`} style={{ width: `${deal.probability}%` }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Post-Sale View */}
      {viewMode === 'postsale' && (
        <div>
          {/* Post-Sale Sub-Tabs */}
          <div className="flex gap-1 bg-white border border-black/10 p-1 rounded-xl w-fit mb-6">
            <button onClick={() => setPostSaleTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${postSaleTab === 'overview' ? 'avenize-gradient text-white' : 'text-black/60'}`}>
              📊 Overview
            </button>
            <button onClick={() => setPostSaleTab('complaints')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${postSaleTab === 'complaints' ? 'avenize-gradient text-white' : 'text-black/60'}`}>
              ⚠️ Complaints ({complaints.filter(c => c.status === 'open' || c.status === 'in_progress').length})
            </button>
            <button onClick={() => setPostSaleTab('referrals')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${postSaleTab === 'referrals' ? 'avenize-gradient text-white' : 'text-black/60'}`}>
              🎁 Referrals ({referrals.length})
            </button>
            <button onClick={() => setPostSaleTab('suggestions')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${postSaleTab === 'suggestions' ? 'avenize-gradient text-white' : 'text-black/60'}`}>
              💡 Suggestions ({suggestions.length})
            </button>
            <button onClick={() => setPostSaleTab('ltv')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${postSaleTab === 'ltv' ? 'avenize-gradient text-white' : 'text-black/60'}`}>
              👑 LTV Analysis
            </button>
          </div>

          {/* Overview Tab */}
          {postSaleTab === 'overview' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <AlertCircle size={20} className="text-red-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{complaints.filter(c => c.status === 'open').length}</div>
                    <div className="text-xs text-black/50">Open Complaints</div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <Gift size={20} className="text-green-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{referrals.filter(r => r.status === 'converted').length}</div>
                    <div className="text-xs text-black/50">Referrals Converted</div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <ThumbsUp size={20} className="text-purple-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{suggestions.filter(s => s.type === 'compliment').length}</div>
                    <div className="text-xs text-black/50">Compliments</div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <TrendingUp size={20} className="text-amber-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">₦{(clientLTV.reduce((sum, c) => sum + c.total_revenue, 0) / 1000000).toFixed(1)}M</div>
                    <div className="text-xs text-black/50">Total LTV</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Complaints Tab */}
          {postSaleTab === 'complaints' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => showToast('Complaint form coming soon!', 'info')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium">
                  <Plus size={16} /> New Complaint
                </button>
              </div>
              {complaints.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
                  <AlertCircle size={48} className="mx-auto text-black/20 mb-3" />
                  <p className="text-black/50">No complaints recorded</p>
                  <p className="text-sm text-black/30 mt-1">Great job keeping clients happy! 🎉</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {complaints.map(complaint => (
                    <div key={complaint.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{complaint.subject}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              complaint.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                              complaint.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                              complaint.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>{complaint.priority}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              complaint.status === 'open' ? 'bg-blue-100 text-blue-700' :
                              complaint.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                              complaint.status === 'resolved' ? 'bg-green-100 text-green-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>{complaint.status.replace('_', ' ')}</span>
                          </div>
                          <p className="text-sm text-black/60 mb-2">{complaint.description}</p>
                          <div className="flex items-center gap-4 text-xs text-black/40">
                            <span>👤 {complaint.client_name}</span>
                            <span>📅 {new Date(complaint.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <button onClick={() => {
                          setComplaints(prev => prev.map(c => c.id === complaint.id ? {...c, status: c.status === 'open' ? 'in_progress' : c.status === 'in_progress' ? 'resolved' : 'closed'} : c))
                          showToast('Status updated', 'success')
                        }} className="text-sm text-[var(--avenize-primary)] hover:underline">
                          {complaint.status === 'open' ? 'Start' : complaint.status === 'in_progress' ? 'Resolve' : 'Close'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Referrals Tab */}
          {postSaleTab === 'referrals' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => showToast('Referral form coming soon!', 'info')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500 text-white text-sm font-medium">
                  <Plus size={16} /> Add Referral
                </button>
              </div>
              {referrals.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
                  <Gift size={48} className="mx-auto text-black/20 mb-3" />
                  <p className="text-black/50">No referrals yet</p>
                  <p className="text-sm text-black/30 mt-1">Ask your clients to refer friends!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {referrals.map(referral => (
                    <div key={referral.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <UsersRound size={16} className="text-green-500" />
                            <span className="font-medium">{referral.referred_name}</span>
                            <span className="text-sm text-black/50">from {referral.referrer_name}</span>
                          </div>
                          <p className="text-sm text-black/60">{referral.referred_company}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-black/40">
                            <span>{referral.referred_phone}</span>
                            <span>{referral.referred_email}</span>
                          </div>
                          {referral.notes && <p className="text-sm text-black/50 mt-2 bg-black/5 rounded-lg px-3 py-2">💬 {referral.notes}</p>}
                        </div>
                        <div className="text-right">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            referral.status === 'converted' ? 'bg-green-100 text-green-700' :
                            referral.status === 'contacted' ? 'bg-blue-100 text-blue-700' :
                            referral.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{referral.status.replace('_', ' ')}</span>
                          <p className="text-xs text-black/40 mt-2">{new Date(referral.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Suggestions Tab */}
          {postSaleTab === 'suggestions' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => showToast('Feedback form coming soon!', 'info')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-medium">
                  <Plus size={16} /> Add Feedback
                </button>
              </div>
              {suggestions.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
                  <MessageSquare size={48} className="mx-auto text-black/20 mb-3" />
                  <p className="text-black/50">No suggestions yet</p>
                  <p className="text-sm text-black/30 mt-1">Client feedback will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {suggestions.map(suggestion => (
                    <div key={suggestion.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {suggestion.type === 'compliment' && <Heart size={16} className="text-pink-500" />}
                            {suggestion.type === 'feature' && <Star size={16} className="text-amber-500" />}
                            {suggestion.type === 'improvement' && <TrendingUp size={16} className="text-blue-500" />}
                            {suggestion.type === 'other' && <MessageSquare size={16} className="text-gray-500" />}
                            <span className="font-medium">{suggestion.subject}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              suggestion.type === 'compliment' ? 'bg-pink-100 text-pink-700' :
                              suggestion.type === 'feature' ? 'bg-amber-100 text-amber-700' :
                              suggestion.type === 'improvement' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>{suggestion.type}</span>
                          </div>
                          <p className="text-sm text-black/60 mb-2">{suggestion.description}</p>
                          <div className="flex items-center gap-4 text-xs text-black/40">
                            <span>👤 {suggestion.client_name}</span>
                            <span>📅 {new Date(suggestion.created_at).toLocaleDateString()}</span>
                            <span className={`${
                              suggestion.status === 'new' ? 'text-blue-600' :
                              suggestion.status === 'reviewed' ? 'text-amber-600' :
                              suggestion.status === 'implemented' ? 'text-green-600' :
                              'text-gray-600'
                            }`}>• {suggestion.status}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LTV Tab */}
          {postSaleTab === 'ltv' && (
            <div>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white">
                  <div className="text-sm opacity-80 mb-1">Total LTV</div>
                  <div className="text-2xl font-bold">₦{(clientLTV.reduce((sum, c) => sum + c.total_revenue, 0) / 1000000).toFixed(1)}M</div>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white">
                  <div className="text-sm opacity-80 mb-1">Avg LTV</div>
                  <div className="text-2xl font-bold">₦{(clientLTV.reduce((sum, c) => sum + c.total_revenue, 0) / clientLTV.length / 1000000).toFixed(1)}M</div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white">
                  <div className="text-sm opacity-80 mb-1">Avg Satisfaction</div>
                  <div className="text-2xl font-bold">{clientLTV.reduce((sum, c) => sum + c.satisfaction_score, 0) / clientLTV.length}/5</div>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white">
                  <div className="text-sm opacity-80 mb-1">Total Referrals</div>
                  <div className="text-2xl font-bold">{clientLTV.reduce((sum, c) => sum + c.referral_count, 0)}</div>
                </div>
              </div>

              {/* LTV Table */}
              <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
                <table className="w-full">
                  <thead className="bg-black/5">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-medium text-black/60">Client</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-black/60">Total Revenue</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-black/60">Deals</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-black/60">Avg Value</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-black/60">Satisfaction</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-black/60">Referrals</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-black/60">Since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientLTV.sort((a, b) => b.total_revenue - a.total_revenue).map((client, i) => (
                      <tr key={client.client_id} className="border-t border-black/5">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full avenize-gradient flex items-center justify-center text-white text-sm font-bold">
                              {client.client_name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-sm">{client.client_name}</div>
                              <div className="text-xs text-black/50">{client.company}</div>
                            </div>
                            {i === 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">👑 Top</span>}
                          </div>
                        </td>
                        <td className="text-right px-4 py-3 font-semibold">₦{client.total_revenue.toLocaleString()}</td>
                        <td className="text-right px-4 py-3">{client.deal_count}</td>
                        <td className="text-right px-4 py-3 text-black/60">₦{client.avg_deal_value.toLocaleString()}</td>
                        <td className="text-right px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {[1,2,3,4,5].map(n => (
                              <Star key={n} size={14} className={n <= Math.round(client.satisfaction_score) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
                            ))}
                          </div>
                        </td>
                        <td className="text-right px-4 py-3">
                          {client.referral_count > 0 ? (
                            <span className="text-green-600">+{client.referral_count}</span>
                          ) : (
                            <span className="text-black/30">-</span>
                          )}
                        </td>
                        <td className="text-right px-4 py-3 text-black/50 text-sm">{new Date(client.customer_since).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Deal Modal */}
      {editingDeal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingDeal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-black/10 flex items-center justify-between">
              <h3 className="font-bold text-lg">Edit Deal</h3>
              <button onClick={() => setEditingDeal(null)} className="p-2 hover:bg-black/5 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Deal Title</label>
                <input value={dealForm.title} onChange={e => setDealForm(prev => ({ ...prev, title: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Contact Name</label>
                  <input value={dealForm.contact_name} onChange={e => setDealForm(prev => ({ ...prev, contact_name: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Value (₦)</label>
                  <input type="number" value={dealForm.value} onChange={e => setDealForm(prev => ({ ...prev, value: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Stage</label>
                <select value={dealForm.stage} onChange={e => { setDealForm(prev => ({ ...prev, stage: e.target.value as Deal['stage'] })); setDeals(prev => prev.map(d => d.id === editingDeal.id ? { ...d, stage: e.target.value as Deal['stage'], probability: STAGES.find(s => s.key === e.target.value)?.probability || d.probability } : d)) }} className="w-full px-4 py-2.5 rounded-xl border border-black/10">
                  {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea value={dealForm.notes} onChange={e => setDealForm(prev => ({ ...prev, notes: e.target.value }))} rows={3} className="w-full px-4 py-2.5 rounded-xl border border-black/10" />
              </div>
            </div>
            <div className="p-4 border-t border-black/10 flex gap-3">
              <button onClick={() => { deleteDeal(editingDeal.id); setEditingDeal(null) }} className="px-4 py-3 rounded-xl border border-red-500 text-red-500 font-medium">Delete</button>
              <button onClick={() => { setDeals(prev => prev.map(d => d.id === editingDeal.id ? { ...d, ...dealForm, value: parseInt(dealForm.value) || 0, probability: STAGES.find(s => s.key === dealForm.stage)?.probability || d.probability } : d)); setEditingDeal(null); showToast('Deal updated!', 'success') }} className="flex-1 px-4 py-3 rounded-xl bg-[var(--avenize-black)] text-white font-medium">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Feature Suggestions */}
      <FeatureSuggestions suggestions={[
        { label: 'Tasks', path: '/app/tasks', description: 'Create tasks from deals' },
        { label: 'Finance', path: '/app/finance', description: 'Create invoices' },
        { label: 'Reports', path: '/app/reports', description: 'Sales analytics' },
      ]} />
    </div>
  )
}
