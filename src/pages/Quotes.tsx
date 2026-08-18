import { useState, useEffect } from 'react'
import { FileText, Send, Clock, Check, X, DollarSign, Plus, Edit2, Trash2, Download } from 'lucide-react'
import { useToast } from '../components/Toast'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { logUsageEvent } from '../lib/useUsageTracking'
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
    if (!staff?.business_id) return
    try {
      const { data: dealsData } = await supabase
        .from('deals')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })
      if (dealsData) setDeals(dealsData)

      const { data: quotesData, error: qErr } = await supabase
        .from('quotes')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })
      if (qErr) throw qErr
      if (quotesData) setQuotes(quotesData as Quote[])
    } catch (err) {
      console.error('Failed to load quotes:', err)
      error('Could not load quotes. Please try again.')
    }
  }

  const persistQuote = async (id: string, updates: Partial<Quote>) => {
    const { error: updErr } = await supabase.from('quotes').update(updates).eq('id', id)
    if (updErr) console.error('Failed to update quote:', updErr)
  }

  const convertToInvoice = async (quote: Quote) => {
    if (!staff?.business_id) return
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        business_id: staff.business_id,
        invoice_number: invoiceNumber,
        client_name: quote.client_name,
        client_email: quote.client_email,
        subtotal: quote.subtotal,
        tax: quote.vat_amount,
        total: quote.total,
        status: 'draft',
        due_date: quote.valid_until ? new Date(quote.valid_until).toISOString().split('T')[0] : null,
        deal_id: quote.deal_id || null,
      })
      .select()
      .single()
    if (invErr || !invoice) {
      error('Could not create the invoice.')
      return
    }
    if (quote.items && quote.items.length > 0) {
      const items = quote.items.map((it) => ({
        invoice_id: invoice.id,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total: it.total,
      }))
      const { error: itemsErr } = await supabase.from('invoice_items').insert(items)
      if (itemsErr) console.error('Failed to insert invoice items:', itemsErr)
    }
    await persistQuote(quote.id, { status: 'converted' })
    success(`Converted to invoice ${invoiceNumber}`)
    // #14: conversion is the terminal milestone of the quote workflow.
    if (staff?.business_id) {
      logUsageEvent({ businessId: staff.business_id, staffId: staff.id, moduleKey: 'quotes', action: 'workflow_complete', context: { workflow: 'quote', milestone: 'converted' } })
    }
    loadData()
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

  const createQuote = async () => {
    if (!newQuote.title.trim()) {
      error('Please enter a quote title')
      return
    }
    if (!staff?.business_id) {
      error('No business context')
      return
    }

    const subtotal = newQuote.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0)
    const vat_amount = subtotal * 0.075
    const total = subtotal + vat_amount

    const quoteId = crypto.randomUUID()
    const quote: Quote = {
      id: quoteId,
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

    const { error: insertErr } = await supabase.from('quotes').insert({
      id: quoteId,
      business_id: staff.business_id,
      quote_number: quote.quote_number,
      deal_id: quote.deal_id || null,
      client_name: quote.client_name,
      client_email: quote.client_email || null,
      client_address: quote.client_address || null,
      title: quote.title,
      items: quote.items,
      subtotal,
      vat_amount,
      total,
      valid_until: quote.valid_until,
      status: 'draft',
    })

    if (insertErr) {
      error('Failed to create quote')
      return
    }
    setQuotes([quote, ...quotes])
    success('Quote created successfully')
    // #14: a new quote marks the start of the quote workflow (draft→sent→accepted/converted).
    if (staff?.business_id) {
      logUsageEvent({ businessId: staff.business_id, staffId: staff.id, moduleKey: 'quotes', action: 'workflow_start', context: { workflow: 'quote' } })
    }
    setShowNewQuote(false)
    setConvertingDeal(null)
    setNewQuote({
      client_name: '', client_email: '', client_address: '', title: '',
      items: [{ description: '', quantity: 1, unit_price: 0, total: 0 }],
      valid_days: 30,
    })
  }

  const sendQuote = async (quoteId: string) => {
    await persistQuote(quoteId, { status: 'sent' })
    setQuotes(quotes.map(q => q.id === quoteId ? { ...q, status: 'sent' as const } : q))
    success('Quote sent to client')
    if (staff?.business_id) {
      logUsageEvent({ businessId: staff.business_id, staffId: staff.id, moduleKey: 'quotes', action: 'workflow_complete', context: { workflow: 'quote', milestone: 'sent' } })
    }
  }

  const acceptQuote = async (quoteId: string) => {
    await persistQuote(quoteId, { status: 'accepted' })
    setQuotes(quotes.map(q => q.id === quoteId ? { ...q, status: 'accepted' as const } : q))
    success('Quote accepted!')
  }

  const rejectQuote = async (quoteId: string) => {
    await persistQuote(quoteId, { status: 'rejected' })
    setQuotes(quotes.map(q => q.id === quoteId ? { ...q, status: 'rejected' as const } : q))
  }

  const deleteQuote = async (quoteId: string) => {
    const { error: delErr } = await supabase.from('quotes').delete().eq('id', quoteId)
    if (delErr) {
      error('Failed to delete quote')
      return
    }
    setQuotes(quotes.filter(q => q.id !== quoteId))
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
    draft: 'bg-[var(--av-surface)] text-[var(--av-text)]',
    sent: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]',
    accepted: 'bg-[var(--av-success-soft)] text-[var(--av-success)]',
    rejected: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
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
          <h1 className="text-2xl font-bold text-[var(--av-text)]">Quotes</h1>
          <p className="text-[var(--av-text)]">Create and manage quotes for your deals</p>
        </div>
        <button
          onClick={() => setShowNewQuote(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#4285F4] text-white rounded-lg font-medium hover:bg-[#4285F4] transition"
        >
          <Plus size={18} />
          New Quote
        </button>
      </div>

      {deals.filter(d => !['won', 'lost'].includes(d.stage)).length > 0 && (
        <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-surface)] p-4 mb-6">
          <h2 className="font-bold text-[var(--av-text)] mb-4">Convert Deals to Quotes</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {deals.filter(d => !['won', 'lost'].includes(d.stage)).slice(0, 6).map((deal) => (
              <div key={deal.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--av-surface)] hover:border-[#4285F4]/20 transition">
                <div>
                  <p className="font-medium text-[var(--av-text)] text-sm">{deal.title}</p>
                  <p className="text-xs text-[var(--av-text)]">₦{deal.value.toLocaleString()}</p>
                </div>
                <button
                  onClick={() => convertDealToQuote(deal)}
                  className="px-3 py-1 bg-[#4285F4]/5 text-[#4285F4] rounded-lg text-xs font-medium hover:bg-[#4285F4]/10 transition"
                >
                  Quote
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-surface)] p-4">
        <h2 className="font-bold text-[var(--av-text)] mb-4">All Quotes</h2>

        {quotes.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto text-[var(--av-text)] mb-4" />
            <p className="text-[var(--av-text)] mb-4">No quotes yet. Create your first quote!</p>
            <button
              onClick={() => setShowNewQuote(true)}
              className="px-4 py-2 bg-[#4285F4] text-white rounded-lg text-sm font-medium hover:bg-[#4285F4] transition"
            >
              Create Quote
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map((quote) => (
              <div key={quote.id} className="border border-[var(--av-surface)] rounded-lg p-4 hover:bg-[var(--av-surface)] transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-[var(--av-text)]">{quote.quote_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[quote.status]}`}>
                        {statusLabels[quote.status]}
                      </span>
                    </div>
                    <p className="font-medium text-[var(--av-text)]">{quote.title}</p>
                    <p className="text-sm text-[var(--av-text)]">{quote.client_name}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--av-text)]">
                      <span>Valid until: {new Date(quote.valid_until).toLocaleDateString('en-NG')}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-[#4285F4]">{formatCurrency(quote.total)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--av-surface)]">
                  {quote.status === 'draft' && (
                    <button onClick={() => sendQuote(quote.id)} className="flex items-center gap-1 px-3 py-1.5 bg-[var(--av-primary-soft)] text-white rounded-lg text-xs font-medium hover:bg-[var(--av-primary)] transition">
                      <Send size={14} /> Send
                    </button>
                  )}
                  {quote.status === 'sent' && (
                    <>
                      <button onClick={() => acceptQuote(quote.id)} className="flex items-center gap-1 px-3 py-1.5 bg-[var(--av-success)] text-white rounded-lg text-xs font-medium hover:bg-[var(--av-success)] transition">
                        <Check size={14} /> Accept
                      </button>
                      <button onClick={() => rejectQuote(quote.id)} className="flex items-center gap-1 px-3 py-1.5 bg-[var(--av-danger-soft)] text-[var(--av-danger)] rounded-lg text-xs font-medium hover:bg-[var(--av-danger-soft)] transition">
                        <X size={14} /> Reject
                      </button>
                    </>
                  )}
                  {quote.status === 'accepted' && (
                    <button onClick={() => convertToInvoice(quote)} className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white rounded-lg text-xs font-medium hover:bg-purple-600 transition">
                      <FileText size={14} /> Convert to Invoice
                    </button>
                  )}
                  <button
                    onClick={async () => await generateQuotePDF({ ...quote, business_id: staff?.business_id })}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[var(--av-surface)] text-[var(--av-text)] rounded-lg text-xs font-medium hover:bg-[var(--av-surface)] transition"
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button onClick={() => deleteQuote(quote.id)} className="flex items-center gap-1 px-3 py-1.5 hover:bg-[var(--av-danger-soft)] text-[var(--av-danger)] rounded-lg text-xs transition ml-auto">
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
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between p-4 border-b border-[var(--av-surface)]">
              <h3 className="text-lg font-bold">{convertingDeal ? 'Convert Deal to Quote' : 'New Quote'}</h3>
              <button onClick={() => { setShowNewQuote(false); setConvertingDeal(null); }} className="p-2 hover:bg-[var(--av-surface-elevated)] rounded-lg"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--av-text)] mb-1">Client Name *</label>
                  <input type="text" value={newQuote.client_name} onChange={(e) => setNewQuote({ ...newQuote, client_name: e.target.value })} className="w-full rounded-lg border border-[var(--av-border-strong)] px-3 py-2" placeholder="Client name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--av-text)] mb-1">Email</label>
                  <input type="email" value={newQuote.client_email} onChange={(e) => setNewQuote({ ...newQuote, client_email: e.target.value })} className="w-full rounded-lg border border-[var(--av-border-strong)] px-3 py-2" placeholder="client@company.com" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--av-text)] mb-1">Quote Title *</label>
                <input type="text" value={newQuote.title} onChange={(e) => setNewQuote({ ...newQuote, title: e.target.value })} className="w-full rounded-lg border border-[var(--av-border-strong)] px-3 py-2" placeholder="e.g. Software License" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[var(--av-text)]">Items</label>
                  <button onClick={addItem} className="text-sm text-[#4285F4] hover:text-[#4285F4] font-medium">+ Add Item</button>
                </div>

                <div className="space-y-2">
                  {newQuote.items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <input type="text" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} className="flex-1 rounded-lg border border-[var(--av-border-strong)] px-3 py-2 text-sm" placeholder="Description" />
                      <input type="number" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} className="w-20 rounded-lg border border-[var(--av-border-strong)] px-3 py-2 text-sm" placeholder="Qty" />
                      <input type="number" value={item.unit_price} onChange={(e) => updateItem(index, 'unit_price', parseInt(e.target.value) || 0)} className="w-32 rounded-lg border border-[var(--av-border-strong)] px-3 py-2 text-sm" placeholder="Price" />
                      <button onClick={() => removeItem(index)} className="p-2 text-[var(--av-danger)] hover:bg-[var(--av-danger-soft)] rounded-lg"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--av-text)] mb-1">Valid For (Days)</label>
                <select value={newQuote.valid_days} onChange={(e) => setNewQuote({ ...newQuote, valid_days: parseInt(e.target.value) })} className="w-full rounded-lg border border-[var(--av-border-strong)] px-3 py-2">
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>

              <div className="bg-[var(--av-surface-elevated)] rounded-lg p-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[var(--av-text)]">Subtotal</span>
                  <span>{formatCurrency(newQuote.items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0))}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[var(--av-text)]">VAT (7.5%)</span>
                  <span>{formatCurrency(newQuote.items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0) * 0.075)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-[var(--av-border-strong)]">
                  <span>Total</span>
                  <span className="text-[#4285F4]">{formatCurrency(newQuote.items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0) * 1.075)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-4 border-t border-[var(--av-surface)]">
              <button onClick={() => { setShowNewQuote(false); setConvertingDeal(null); }} className="flex-1 px-4 py-2 border border-[var(--av-border-strong)] rounded-lg hover:bg-[var(--av-surface)]">Cancel</button>
              <button onClick={createQuote} className="flex-1 px-4 py-2 bg-[#4285F4] text-white rounded-lg hover:bg-[#4285F4] font-medium">Create Quote</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
