import { useState, useEffect } from 'react'
import { FileText, Send, Clock, Check, X, DollarSign, Plus, Edit2, Trash2, Download } from 'lucide-react'
import { useToast } from '../components/Toast'
import { useAuth } from '../lib/AuthContext'
import { isDemoMode, getDeals } from '../lib/Storage'
import { DEMO_DEALS } from '../lib/DemoData'
import { generateQuotePDF } from '../lib/PDFGenerator'

type Quote = {
  id: string
  quote_number: string
  deal_id?: string
  client_name: string
  client_email?: string
  client_address?: string
  title: string
  items: { description: string; quantity: number; unit_price: number; total: number }[]
  subtotal: number
  vat_amount: number
  total: number
  valid_until: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted'
  created_at: string
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount)
}

export default function Quotes() {
  const { success, error } = useToast()
  const { staff } = useAuth()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [deals, setDeals] = useState<any[]>([])
  const [showNewQuote, setShowNewQuote] = useState(false)
  const [convertingDeal, setConvertingDeal] = useState<string | null>(null)
  
  const [newQuote, setNewQuote] = useState({
    client_name: '',
    client_email: '',
    client_address: '',
    title: '',
    items: [{ description: '', quantity: 1, unit_price: 0, total: 0 }],
    valid_days: 30,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const loadedDeals = await getDeals()
    if (loadedDeals.length > 0) {
      setDeals(loadedDeals)
    } else if (isDemoMode()) {
      setDeals(DEMO_DEALS)
    }
    
    const storedQuotes = localStorage.getItem('avenize_quotes')
    if (storedQuotes) {
      setQuotes(JSON.parse(storedQuotes))
    }
  }

  const saveQuotes = (updatedQuotes: Quote[]) => {
    setQuotes(updatedQuotes)
    localStorage.setItem('avenize_quotes', JSON.stringify(updatedQuotes))
  }

  const convertDealToQuote = (deal: any) => {
    setConvertingDeal(deal.id)
    setNewQuote({
      client_name: deal.contact || deal.company || 'Customer',
      client_email: deal.email || '',
      client_address: '',
      title: deal.title,
      items: [{ description: deal.title, quantity: 1, unit_price: deal.value, total: deal.value }],
      valid_days: 30,
    })
    setShowNewQuote(true)
  }

  const createQuote = () => {
    if (!newQuote.title.trim()) {
      error('Please enter a quote title')
      return
    }

    const subtotal = newQuote.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0)
    const vat_amount = subtotal * 0.075
    const total = subtotal + vat_amount

    const quote: Quote = {
      id: crypto.randomUUID(),
      quote_number: `QT-${Date.now().toString().slice(-6)}`,
      deal_id: convertingDeal || undefined,
      client_name: newQuote.client_name,
      client_email: newQuote.client_email,
      client_address: newQuote.client_address,
      title: newQuote.title,
      items: newQuote.items.map(item => ({
        ...item,
        total: item.unit_price * item.quantity,
      })),
      subtotal,
      vat_amount,
      total,
      valid_until: new Date(Date.now() + newQuote.valid_days * 24 * 60 * 60 * 1000).toISOString(),
      status: 'draft',
      created_at: new Date().toISOString(),
    }

    saveQuotes([quote, ...quotes])
    success('Quote created successfully')
    setShowNewQuote(false)
    setConvertingDeal(null)
    setNewQuote({
      client_name: '', client_email: '', client_address: '', title: '',
      items: [{ description: '', quantity: 1, unit_price: 0, total: 0 }],
      valid_days: 30,
    })
  }

  const sendQuote = (quoteId: string) => {
    const updatedQuotes = quotes.map(q => 
      q.id === quoteId ? { ...q, status: 'sent' as const } : q
    )
    saveQuotes(updatedQuotes)
    success('Quote sent to client')
  }

  const acceptQuote = (quoteId: string) => {
    const updatedQuotes = quotes.map(q => 
      q.id === quoteId ? { ...q, status: 'accepted' as const } : q
    )
    saveQuotes(updatedQuotes)
    success('Quote accepted!')
  }

  const rejectQuote = (quoteId: string) => {
    const updatedQuotes = quotes.map(q => 
      q.id === quoteId ? { ...q, status: 'rejected' as const } : q
    )
    saveQuotes(updatedQuotes)
  }

  const deleteQuote = (quoteId: string) => {
    saveQuotes(quotes.filter(q => q.id !== quoteId))
    success('Quote deleted')
  }

  const addItem = () => {
    setNewQuote({
      ...newQuote,
      items: [...newQuote.items, { description: '', quantity: 1, unit_price: 0, total: 0 }],
    })
  }

  const updateItem = (index: number, field: string, value: any) => {
    const items = [...newQuote.items]
    items[index] = { ...items[index], [field]: value }
    items[index].total = items[index].unit_price * items[index].quantity
    setNewQuote({ ...newQuote, items })
  }

  const removeItem = (index: number) => {
    if (newQuote.items.length > 1) {
      setNewQuote({
        ...newQuote,
        items: newQuote.items.filter((_, i) => i !== index),
      })
    }
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-white text-black',
    sent: 'bg-blue-100 text-blue-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    converted: 'bg-purple-100 text-purple-700',
  }

  const statusLabels: Record<string, string> = {
    draft: 'Draft', sent: 'Sent', accepted: 'Accepted',
    rejected: 'Rejected', converted: 'Converted to Invoice',
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Quotes</h1>
          <p className="text-black">Create and manage quotes for your deals</p>
        </div>
        <button
          onClick={() => setShowNewQuote(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600 transition"
        >
          <Plus size={18} />
          New Quote
        </button>
      </div>

      {deals.filter(d => !['won', 'lost'].includes(d.stage)).length > 0 && (
        <div className="bg-white rounded-xl border border-white p-4 mb-6">
          <h2 className="font-bold text-black mb-4">Convert Deals to Quotes</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {deals.filter(d => !['won', 'lost'].includes(d.stage)).slice(0, 6).map((deal) => (
              <div key={deal.id} className="flex items-center justify-between p-3 rounded-lg border border-white hover:border-indigo-200 transition">
                <div>
                  <p className="font-medium text-black text-sm">{deal.title}</p>
                  <p className="text-xs text-black">₦{deal.value.toLocaleString()}</p>
                </div>
                <button
                  onClick={() => convertDealToQuote(deal)}
                  className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition"
                >
                  Quote
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-white p-4">
        <h2 className="font-bold text-black mb-4">All Quotes</h2>
        
        {quotes.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto text-black mb-4" />
            <p className="text-black mb-4">No quotes yet. Create your first quote!</p>
            <button
              onClick={() => setShowNewQuote(true)}
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition"
            >
              Create Quote
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map((quote) => (
              <div key={quote.id} className="border border-white rounded-lg p-4 hover:bg-white transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-black">{quote.quote_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[quote.status]}`}>
                        {statusLabels[quote.status]}
                      </span>
                    </div>
                    <p className="font-medium text-black">{quote.title}</p>
                    <p className="text-sm text-black">{quote.client_name}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-black">
                      <span>Valid until: {new Date(quote.valid_until).toLocaleDateString('en-NG')}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-indigo-600">{formatCurrency(quote.total)}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white">
                  {quote.status === 'draft' && (
                    <button onClick={() => sendQuote(quote.id)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition">
                      <Send size={14} /> Send
                    </button>
                  )}
                  {quote.status === 'sent' && (
                    <>
                      <button onClick={() => acceptQuote(quote.id)} className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 transition">
                        <Check size={14} /> Accept
                      </button>
                      <button onClick={() => rejectQuote(quote.id)} className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-medium hover:bg-red-200 transition">
                        <X size={14} /> Reject
                      </button>
                    </>
                  )}
                  {quote.status === 'accepted' && (
                    <button className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white rounded-lg text-xs font-medium hover:bg-purple-600 transition">
                      <FileText size={14} /> Convert to Invoice
                    </button>
                  )}
                  <button 
                    onClick={async () => await generateQuotePDF({ ...quote, business_id: staff?.business_id })}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white text-black rounded-lg text-xs font-medium hover:bg-white transition"
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button onClick={() => deleteQuote(quote.id)} className="flex items-center gap-1 px-3 py-1.5 hover:bg-red-50 text-red-500 rounded-lg text-xs transition ml-auto">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewQuote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between p-4 border-b border-white">
              <h3 className="text-lg font-bold">{convertingDeal ? 'Convert Deal to Quote' : 'New Quote'}</h3>
              <button onClick={() => { setShowNewQuote(false); setConvertingDeal(null); }} className="p-2 hover:bg-white rounded-lg"><X size={20} /></button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-1">Client Name *</label>
                  <input type="text" value={newQuote.client_name} onChange={(e) => setNewQuote({ ...newQuote, client_name: e.target.value })} className="w-full rounded-lg border border-black px-3 py-2" placeholder="Client name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">Email</label>
                  <input type="email" value={newQuote.client_email} onChange={(e) => setNewQuote({ ...newQuote, client_email: e.target.value })} className="w-full rounded-lg border border-black px-3 py-2" placeholder="client@company.com" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-black mb-1">Quote Title *</label>
                <input type="text" value={newQuote.title} onChange={(e) => setNewQuote({ ...newQuote, title: e.target.value })} className="w-full rounded-lg border border-black px-3 py-2" placeholder="e.g. Software License" />
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-black">Items</label>
                  <button onClick={addItem} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">+ Add Item</button>
                </div>
                
                <div className="space-y-2">
                  {newQuote.items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <input type="text" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} className="flex-1 rounded-lg border border-black px-3 py-2 text-sm" placeholder="Description" />
                      <input type="number" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} className="w-20 rounded-lg border border-black px-3 py-2 text-sm" placeholder="Qty" />
                      <input type="number" value={item.unit_price} onChange={(e) => updateItem(index, 'unit_price', parseInt(e.target.value) || 0)} className="w-32 rounded-lg border border-black px-3 py-2 text-sm" placeholder="Price" />
                      <button onClick={() => removeItem(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-black mb-1">Valid For (Days)</label>
                <select value={newQuote.valid_days} onChange={(e) => setNewQuote({ ...newQuote, valid_days: parseInt(e.target.value) })} className="w-full rounded-lg border border-black px-3 py-2">
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>
              
              <div className="bg-white rounded-lg p-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-black">Subtotal</span>
                  <span>{formatCurrency(newQuote.items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0))}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-black">VAT (7.5%)</span>
                  <span>{formatCurrency(newQuote.items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0) * 0.075)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-black">
                  <span>Total</span>
                  <span className="text-indigo-600">{formatCurrency(newQuote.items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0) * 1.075)}</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 p-4 border-t border-white">
              <button onClick={() => { setShowNewQuote(false); setConvertingDeal(null); }} className="flex-1 px-4 py-2 border border-black rounded-lg hover:bg-white">Cancel</button>
              <button onClick={createQuote} className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-medium">Create Quote</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
