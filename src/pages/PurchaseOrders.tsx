import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, Package, Truck, FileText, CheckCircle2, Clock, X, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'

interface Vendor { id: string; name: string; payment_terms: string | null }
interface Product { id: string; name: string; sku: string | null; cost: number }
interface POLine {
  id?: string
  product_id: string
  description: string
  quantity: string
  unit_price: string
  received_quantity?: number
}
interface PurchaseOrder {
  id: string
  po_number: string
  vendor_id: string
  vendor_name?: string
  status: string
  total_amount: number
  currency: string
  expected_date: string | null
  notes: string | null
  created_at: string
  lines?: POLine[]
  lines_received?: number
  lines_total?: number
}

const PO_STATUSES = [
  { value: 'draft', label: 'Draft', color: 'var(--av-warning)' },
  { value: 'sent', label: 'Sent', color: 'var(--av-primary)' },
  { value: 'acknowledged', label: 'Acknowledged', color: '#8B5CF6' },
  { value: 'partially_received', label: 'Partial', color: '#F97316' },
  { value: 'received', label: 'Received', color: 'var(--av-success)' },
  { value: 'closed', label: 'Closed', color: 'var(--av-success)' },
  { value: 'cancelled', label: 'Cancelled', color: 'var(--av-danger)' },
]

const fmtMoney = (n: number, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)

export default function PurchaseOrders() {
  const { staff } = useAuth()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PurchaseOrder | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null)
  const [receiveLines, setReceiveLines] = useState<{ id: string; description: string; ordered: number; received: number; receiving: string }[]>([])

  const [form, setForm] = useState({
    vendor_id: '',
    expected_date: '',
    notes: '',
    lines: [{ product_id: '', description: '', quantity: '1', unit_price: '0' }] as POLine[],
  })

  useEffect(() => { fetchAll() }, [staff])

  async function fetchAll() {
    if (!staff?.business_id) return
    const [poRes, venRes, prodRes] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select(`
          *,
          vendor:vendors!vendor_id (name, payment_terms),
          items:purchase_order_items (id, product_id, description, quantity, unit_price, received_quantity)
        `)
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false }),
      supabase.from('vendors').select('id, name, payment_terms').eq('business_id', staff.business_id).eq('is_active', true).order('name'),
      supabase.from('products').select('id, name, sku, cost').eq('business_id', staff.business_id).order('name'),
    ])
    if (poRes.error) console.error('Error loading POs:', poRes.error)
    setOrders((poRes.data || []).map((po: any) => ({
      id: po.id,
      po_number: po.po_number,
      vendor_id: po.vendor_id,
      vendor_name: po.vendor?.name ?? 'Unknown',
      status: po.status,
      total_amount: Number(po.total_amount),
      currency: po.currency || 'NGN',
      expected_date: po.expected_date,
      notes: po.notes,
      created_at: po.created_at,
      lines: (po.items || []).map((it: any) => ({
        id: it.id,
        product_id: it.product_id ?? '',
        description: it.description,
        quantity: String(it.quantity),
        unit_price: String(it.unit_price),
        received_quantity: Number(it.received_quantity) || 0,
      })),
      lines_received: (po.items || []).filter((it: any) => Number(it.received_quantity) >= Number(it.quantity)).length,
      lines_total: (po.items || []).length,
    })))
    setVendors(venRes.data || [])
    setProducts(prodRes.data || [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({
      vendor_id: '',
      expected_date: '',
      notes: '',
      lines: [{ product_id: '', description: '', quantity: '1', unit_price: '0' }],
    })
    setShowModal(true)
  }

  function openEdit(po: PurchaseOrder) {
    setEditing(po)
    setForm({
      vendor_id: po.vendor_id,
      expected_date: po.expected_date ?? '',
      notes: po.notes ?? '',
      lines: po.lines && po.lines.length > 0 ? po.lines.map(l => ({ ...l, quantity: l.quantity, unit_price: l.unit_price })) : [{ product_id: '', description: '', quantity: '1', unit_price: '0' }],
    })
    setShowModal(true)
  }

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, { product_id: '', description: '', quantity: '1', unit_price: '0' }] }))
  }
  function removeLine(idx: number) {
    setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))
  }
  function updateLine(idx: number, field: keyof POLine, value: string) {
    setForm(f => ({
      ...f,
      lines: f.lines.map((l, i) => {
        if (i !== idx) return l
        const updated = { ...l, [field]: value }
        // auto-fill description + price when a product is picked — the officer
        // shouldn't retype what's already on the product record.
        if (field === 'product_id' && value) {
          const p = products.find(p => p.id === value)
          if (p) {
            updated.description = p.name
            updated.unit_price = String(p.cost)
          }
        }
        return updated
      }),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id || !form.vendor_id) return
    const validLines = form.lines.filter(l => l.description && Number(l.quantity) > 0)
    if (validLines.length === 0) { alert('Add at least one line item.'); return }

    try {
      if (editing) {
        // Update PO header + replace lines (simplest correct approach for an
        // editable draft: delete old lines, insert new). Only allow on draft.
        const { error: poErr } = await supabase
          .from('purchase_orders')
          .update({ vendor_id: form.vendor_id, expected_date: form.expected_date || null, notes: form.notes || null })
          .eq('id', editing.id)
        if (poErr) throw poErr
        if (editing.lines) {
          const { error: delErr } = await supabase.from('purchase_order_items').delete().eq('po_id', editing.id)
          if (delErr) throw delErr
        }
        const { error: lineErr } = await supabase.from('purchase_order_items').insert(
          validLines.map(l => ({
            po_id: editing.id,
            product_id: l.product_id || null,
            description: l.description,
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
          }))
        )
        if (lineErr) throw lineErr
      } else {
        // Insert PO, read back id, then insert lines. po_number auto-generates
        // via the generate_po_number trigger.
        const { data: po, error: poErr } = await supabase
          .from('purchase_orders')
          .insert({
            business_id: staff.business_id,
            vendor_id: form.vendor_id,
            expected_date: form.expected_date || null,
            notes: form.notes || null,
            created_by: staff.id,
            status: 'draft',
          })
          .select('id')
          .single()
        if (poErr) throw poErr
        const { error: lineErr } = await supabase.from('purchase_order_items').insert(
          validLines.map(l => ({
            po_id: po.id,
            product_id: l.product_id || null,
            description: l.description,
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
          }))
        )
        if (lineErr) throw lineErr
      }
      setShowModal(false)
      fetchAll()
    } catch (error) {
      console.error('Error saving PO:', error)
      alert('Could not save the purchase order. Please try again.')
    }
  }

  async function advanceStatus(po: PurchaseOrder, newStatus: string) {
    const { error } = await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', po.id)
    if (error) { alert('Could not update status.'); return }
    fetchAll()
  }

  function openReceive(po: PurchaseOrder) {
    setReceivingPO(po)
    setReceiveLines((po.lines || []).map(l => ({
      id: l.id!,
      description: l.description,
      ordered: Number(l.quantity),
      received: Number(l.received_quantity) || 0,
      receiving: '',
    })))
    setShowReceiveModal(true)
  }

  // Record a goods receipt: inserts goods_receipts + goods_receipt_lines rows.
  // The apply_goods_receipt trigger then bumps received_quantity, advances PO
  // status, and increments products.stock automatically.
  async function handleReceiveSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id || !receivingPO) return
    const lines = receiveLines.filter(l => Number(l.receiving) > 0)
    if (lines.length === 0) { alert('Enter a received quantity for at least one line.'); return }
    try {
      const { data: gr, error: grErr } = await supabase
        .from('goods_receipts')
        .insert({
          business_id: staff.business_id,
          po_id: receivingPO.id,
          received_by: staff.id,
          status: 'completed',
        })
        .select('id')
        .single()
      if (grErr) throw grErr
      const { error: lineErr } = await supabase.from('goods_receipt_lines').insert(
        lines.map(l => ({ goods_receipt_id: gr.id, po_item_id: l.id, quantity_received: Number(l.receiving) }))
      )
      if (lineErr) throw lineErr
      setShowReceiveModal(false)
      fetchAll()
    } catch (error) {
      console.error('Error recording receipt:', error)
      alert('Could not record the goods receipt. Please try again.')
    }
  }

  async function remove(po: PurchaseOrder) {
    if (po.status !== 'draft') { alert('Only draft POs can be deleted.'); return }
    if (!confirm(`Delete PO ${po.po_number}?`)) return
    const { error } = await supabase.from('purchase_orders').delete().eq('id', po.id)
    if (error) { alert('Could not delete the PO.'); return }
    fetchAll()
  }

  const filtered = orders.filter(po =>
    (statusFilter === 'all' || po.status === statusFilter) &&
    (po.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
     po.vendor_name?.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[var(--av-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Purchase Orders</h1>
          <p className="text-sm text-black/60 mt-1">Create POs, send to vendors, and record goods received</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition"
        >
          <Plus size={18} />
          New PO
        </button>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No purchase orders yet"
          description="Create a PO to order goods from a vendor — status and stock update automatically"
          action={{ label: 'New PO', onClick: openCreate }}
        />
      ) : (
        <>
          <div className="bg-white rounded-xl p-4 shadow-sm mb-6 flex gap-3">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
              <input
                type="text"
                placeholder="Search by PO number or vendor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[var(--av-primary)] transition"
            >
              <option value="all">All statuses</option>
              {PO_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            {filtered.map(po => {
              const status = PO_STATUSES.find(s => s.value === po.status)
              const isExpanded = expandedId === po.id
              const canReceive = ['sent', 'acknowledged', 'partially_received'].includes(po.status)
              return (
                <div key={po.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-[#F8F9FA]/50 transition"
                    onClick={() => setExpandedId(isExpanded ? null : po.id)}
                  >
                    {isExpanded ? <ChevronDown size={18} className="text-black/40" /> : <ChevronRight size={18} className="text-black/40" />}
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-black">{po.po_number}</span>
                        <span className="px-2 py-0.5 rounded-lg text-xs font-medium" style={{ background: (status?.color || '#999') + '1A', color: status?.color }}>
                          {status?.label || po.status}
                        </span>
                      </div>
                      <p className="text-sm text-black/60">{po.vendor_name} · {new Date(po.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-black">{fmtMoney(po.total_amount, po.currency)}</p>
                      {po.lines_total! > 0 && (
                        <p className="text-xs text-black/40">{po.lines_received}/{po.lines_total} lines received</p>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-black/5 p-4 bg-[#F8F9FA]/30">
                      {po.lines && po.lines.length > 0 && (
                        <table className="w-full mb-4 text-sm">
                          <thead>
                            <tr className="text-left text-xs text-black/40 uppercase">
                              <th className="pb-2">Item</th>
                              <th className="pb-2 text-right">Qty</th>
                              <th className="pb-2 text-right">Unit Price</th>
                              <th className="pb-2 text-right">Received</th>
                              <th className="pb-2 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {po.lines.map((l, i) => (
                              <tr key={i} className="border-t border-black/5">
                                <td className="py-2">{l.description}</td>
                                <td className="py-2 text-right">{l.quantity}</td>
                                <td className="py-2 text-right">{fmtMoney(Number(l.unit_price), po.currency)}</td>
                                <td className="py-2 text-right">
                                  {Number(l.received_quantity) || 0}
                                  {Number(l.received_quantity) >= Number(l.quantity) && <CheckCircle2 size={12} className="inline ml-1 text-[var(--av-success)]" />}
                                </td>
                                <td className="py-2 text-right font-medium">{fmtMoney(Number(l.quantity) * Number(l.unit_price), po.currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {po.notes && <p className="text-sm text-black/60 mb-3">Notes: {po.notes}</p>}
                      <div className="flex gap-2">
                        {po.status === 'draft' && (
                          <button onClick={() => advanceStatus(po, 'sent')} className="flex items-center gap-1 px-3 py-1.5 bg-[var(--av-primary)] text-white rounded-lg text-sm font-medium hover:bg-[var(--av-primary-hover)] transition">
                            <Truck size={14} /> Send to Vendor
                          </button>
                        )}
                        {canReceive && (
                          <button onClick={() => openReceive(po)} className="flex items-center gap-1 px-3 py-1.5 bg-[var(--av-success)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition">
                            <Package size={14} /> Record Receipt
                          </button>
                        )}
                        {po.status === 'received' && (
                          <button onClick={() => advanceStatus(po, 'closed')} className="flex items-center gap-1 px-3 py-1.5 border border-black/10 rounded-lg text-sm font-medium hover:bg-black/5 transition">
                            Close PO
                          </button>
                        )}
                        {po.status === 'draft' && (
                          <>
                            <button onClick={() => openEdit(po)} className="flex items-center gap-1 px-3 py-1.5 border border-black/10 rounded-lg text-sm font-medium hover:bg-black/5 transition">
                              <Edit size={14} /> Edit
                            </button>
                            <button onClick={() => remove(po)} className="flex items-center gap-1 px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 transition">
                              <Trash2 size={14} /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* PO create/edit modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? `Edit ${editing.po_number}` : 'New Purchase Order'} size="lg">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Vendor *</label>
              <select
                required
                value={form.vendor_id}
                onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition bg-white"
              >
                <option value="">Select a vendor...</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.payment_terms ? ` (${v.payment_terms})` : ''}</option>)}
              </select>
              {vendors.length === 0 && <p className="text-xs text-[var(--av-danger)] mt-1">No vendors yet — add one in Vendors.</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Expected Date</label>
              <input
                type="date"
                value={form.expected_date}
                onChange={(e) => setForm({ ...form, expected_date: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Line Items</label>
              <button type="button" onClick={addLine} className="text-sm text-[var(--av-primary)] font-medium hover:underline flex items-center gap-1">
                <Plus size={14} /> Add Line
              </button>
            </div>
            <div className="space-y-2">
              {form.lines.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <select
                    value={line.product_id}
                    onChange={(e) => updateLine(idx, 'product_id', e.target.value)}
                    className="w-40 px-2 py-2 rounded-lg border border-black/10 text-sm bg-white"
                  >
                    <option value="">Custom item</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="Description"
                    required
                    value={line.description}
                    onChange={(e) => updateLine(idx, 'description', e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-black/10 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    required
                    min="0.001"
                    step="any"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                    className="w-20 px-2 py-2 rounded-lg border border-black/10 text-sm text-right"
                  />
                  <input
                    type="number"
                    placeholder="Unit ₦"
                    required
                    min="0"
                    step="0.01"
                    value={line.unit_price}
                    onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                    className="w-28 px-2 py-2 rounded-lg border border-black/10 text-sm text-right"
                  />
                  <span className="w-28 text-right text-sm font-medium py-2">
                    {fmtMoney(Number(line.quantity) * Number(line.unit_price))}
                  </span>
                  {form.lines.length > 1 && (
                    <button type="button" onClick={() => removeLine(idx)} className="p-2 hover:bg-red-50 rounded-lg transition">
                      <X size={16} className="text-red-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-3 text-right">
              <div>
                <p className="text-xs text-black/40">Total</p>
                <p className="text-lg font-bold text-black">
                  {fmtMoney(form.lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0))}
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              placeholder="Delivery instructions, etc."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-black/10 rounded-xl font-medium hover:bg-black/5 transition">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition">
              {editing ? 'Save Changes' : 'Create Draft PO'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Goods receipt modal */}
      <Modal isOpen={showReceiveModal} onClose={() => setShowReceiveModal(false)} title={`Record Receipt — ${receivingPO?.po_number}`} size="md">
        <form onSubmit={handleReceiveSubmit} className="p-6 space-y-4">
          <p className="text-sm text-black/60">Enter the quantity received for each line. Stock and PO status update automatically.</p>
          <div className="space-y-2">
            {receiveLines.map((l, idx) => (
              <div key={l.id} className="flex items-center gap-3 p-2 rounded-lg bg-[#F8F9FA]">
                <div className="flex-1">
                  <p className="text-sm font-medium text-black">{l.description}</p>
                  <p className="text-xs text-black/40">Ordered: {l.ordered} · Already received: {l.received}</p>
                </div>
                <input
                  type="number"
                  min="0"
                  max={l.ordered - l.received > 0 ? l.ordered - l.received : undefined}
                  step="any"
                  placeholder="0"
                  value={l.receiving}
                  onChange={(e) => setReceiveLines(prev => prev.map((x, i) => i === idx ? { ...x, receiving: e.target.value } : x))}
                  className="w-24 px-2 py-2 rounded-lg border border-black/10 text-sm text-right"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setShowReceiveModal(false)} className="flex-1 px-4 py-2 border border-black/10 rounded-xl font-medium hover:bg-black/5 transition">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-[var(--av-success)] text-white rounded-xl font-medium hover:opacity-90 transition">Record Receipt</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
