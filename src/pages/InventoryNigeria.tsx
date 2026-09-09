import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Package, Plus, Search, X } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

type Product = {
  id: string
  name: string
  sku: string | null
  price: number
  cost: number | null
  stock: number | null
  low_stock_threshold: number | null
  business_id: string
}

type Movement = {
  id: string
  product_id: string
  change: number
  reason: string | null
  created_at: string
}

const money = (n: number) => new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', maximumFractionDigits: 0,
}).format(n)

export default function InventoryNigeria() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const businessId = staff?.business_id
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [showItem, setShowItem] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [selected, setSelected] = useState<Product | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', sku: '', price: '', cost: '', stock: '0', low_stock_threshold: '0' })
  const [adjust, setAdjust] = useState({ change: '', reason: '' })

  const load = useCallback(async () => {
    if (!businessId) {
      setProducts([])
      setMovements([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const [productResult, movementResult] = await Promise.all([
      supabase.from('products').select('id,name,sku,price,cost,stock,low_stock_threshold,business_id').eq('business_id', businessId).order('name'),
      supabase.from('stock_movements').select('id,product_id,change,reason,created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(200),
    ])
    if (productResult.error || movementResult.error) {
      setProducts([])
      setMovements([])
      setError('Inventory data could not be loaded. The source is unavailable.')
    } else {
      setProducts((productResult.data ?? []) as Product[])
      setMovements((movementResult.data ?? []) as Movement[])
    }
    setLoading(false)
  }, [businessId])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return products.filter((product) => {
      const matchesSearch = !needle || product.name.toLowerCase().includes(needle) || (product.sku ?? '').toLowerCase().includes(needle)
      const stock = Number(product.stock ?? 0)
      const threshold = Number(product.low_stock_threshold ?? 0)
      return matchesSearch && (!lowOnly || stock <= threshold)
    })
  }, [products, query, lowOnly])

  async function createItem() {
    if (!businessId || !form.name.trim()) {
      showToast('Product name is required.', 'error')
      return
    }
    setSaving(true)
    const { error: insertError } = await supabase.from('products').insert({
      business_id: businessId,
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      price: Number(form.price) || 0,
      cost: Number(form.cost) || 0,
      stock: Number(form.stock) || 0,
      low_stock_threshold: Number(form.low_stock_threshold) || 0,
    })
    if (insertError) {
      showToast('Product was not saved.', 'error')
    } else {
      showToast('Product created.', 'success')
      setShowItem(false)
      setForm({ name: '', sku: '', price: '', cost: '', stock: '0', low_stock_threshold: '0' })
      await load()
    }
    setSaving(false)
  }

  async function adjustStock() {
    const change = Number(adjust.change)
    if (!businessId || !selected || !Number.isInteger(change) || change === 0) {
      showToast('Enter a non-zero whole-unit adjustment.', 'error')
      return
    }
    setSaving(true)
    const { data, error: rpcError } = await supabase.rpc('adjust_inventory_stock', {
      p_business_id: businessId,
      p_product_id: selected.id,
      p_change: change,
      p_reason: adjust.reason.trim() || 'Manual stock adjustment',
    })
    if (rpcError) {
      showToast(rpcError.message || 'Stock adjustment failed.', 'error')
    } else {
      showToast(`Stock updated to ${data}.`, 'success')
      setShowAdjust(false)
      setAdjust({ change: '', reason: '' })
      await load()
    }
    setSaving(false)
  }

  const lowCount = products.filter((product) => Number(product.stock ?? 0) <= Number(product.low_stock_threshold ?? 0)).length
  const value = products.reduce((sum, product) => sum + Number(product.stock ?? 0) * Number(product.cost ?? 0), 0)

  return (
    <div className="pb-20">
      <div className="flex flex-wrap justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-medium">Inventory</h1>
          <p className="text-sm opacity-70 mt-1">Products and atomic stock movements</p>
        </div>
        <button onClick={() => setShowItem(true)} className="px-4 py-2 rounded-lg avenize-gradient text-white flex items-center gap-2">
          <Plus size={16} /> Product
        </button>
      </div>

      {error && <div className="p-4 mb-5 rounded-xl border border-[var(--av-danger)]/20 bg-[var(--av-danger-soft)] text-sm">{error}</div>}

      {!error && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-2xl border p-4"><p className="text-xs opacity-60">Products</p><p className="text-2xl font-semibold">{products.length}</p></div>
          <div className="rounded-2xl border p-4"><p className="text-xs opacity-60">Low stock</p><p className="text-2xl font-semibold">{lowCount}</p></div>
          <div className="rounded-2xl border p-4"><p className="text-xs opacity-60">Stock cost value</p><p className="text-2xl font-semibold">{money(value)}</p><p className="text-[11px] opacity-50">Current quantity × recorded unit cost</p></div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-3 opacity-50" />
          <input className="w-full border rounded-lg pl-9 p-2" placeholder="Search products" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <button onClick={() => setLowOnly((valueState) => !valueState)} className={`px-3 py-2 rounded-lg border text-sm ${lowOnly ? 'avenize-gradient text-white' : ''}`}>
          <AlertTriangle size={14} className="inline mr-1" /> Low stock
        </button>
      </div>

      <div className="rounded-2xl border divide-y">
        {loading && <div className="p-8 text-center opacity-60">Loading inventory…</div>}
        {!loading && !error && visible.map((product) => {
          const stock = Number(product.stock ?? 0)
          const threshold = Number(product.low_stock_threshold ?? 0)
          return (
            <div key={product.id} className="p-4 flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-medium">{product.name}</p>
                <p className="text-xs opacity-60">{product.sku || 'No SKU'} · {money(Number(product.cost ?? 0))} unit cost</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className={`font-semibold ${stock <= threshold ? 'text-[var(--av-danger)]' : ''}`}>{stock} units</p>
                  <p className="text-xs opacity-50">reorder {threshold}</p>
                </div>
                <button onClick={() => { setSelected(product); setShowAdjust(true) }} className="px-3 py-2 rounded-lg border text-sm">Adjust</button>
              </div>
            </div>
          )
        })}
        {!loading && !error && visible.length === 0 && <div className="p-8 text-center opacity-60">No products match this view.</div>}
      </div>

      <section className="mt-6 rounded-2xl border p-5">
        <h2 className="font-medium mb-3">Recent stock movements</h2>
        {movements.slice(0, 10).map((movement) => (
          <div key={movement.id} className="py-2 flex justify-between text-sm">
            <span>{products.find((product) => product.id === movement.product_id)?.name || 'Product'} · {movement.reason || 'Stock adjustment'}</span>
            <span className="flex items-center gap-1">{movement.change > 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />} {movement.change > 0 ? '+' : ''}{movement.change}</span>
          </div>
        ))}
        {!loading && movements.length === 0 && <p className="text-sm opacity-60">No stock movements recorded.</p>}
      </section>

      {showItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--av-surface-elevated)] border p-6">
            <div className="flex justify-between mb-4"><h2 className="font-semibold">New product</h2><button onClick={() => setShowItem(false)}><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <input className="border rounded-lg p-2 col-span-2" placeholder="Name" value={form.name} onChange={(event) => setForm((state) => ({ ...state, name: event.target.value }))} />
              <input className="border rounded-lg p-2" placeholder="SKU" value={form.sku} onChange={(event) => setForm((state) => ({ ...state, sku: event.target.value }))} />
              <input className="border rounded-lg p-2" type="number" placeholder="Sell price" value={form.price} onChange={(event) => setForm((state) => ({ ...state, price: event.target.value }))} />
              <input className="border rounded-lg p-2" type="number" placeholder="Unit cost" value={form.cost} onChange={(event) => setForm((state) => ({ ...state, cost: event.target.value }))} />
              <input className="border rounded-lg p-2" type="number" placeholder="Opening stock" value={form.stock} onChange={(event) => setForm((state) => ({ ...state, stock: event.target.value }))} />
              <input className="border rounded-lg p-2" type="number" placeholder="Low stock threshold" value={form.low_stock_threshold} onChange={(event) => setForm((state) => ({ ...state, low_stock_threshold: event.target.value }))} />
            </div>
            <button disabled={saving} onClick={() => void createItem()} className="w-full mt-4 py-2 rounded-lg avenize-gradient text-white">{saving ? 'Saving…' : 'Create product'}</button>
          </div>
        </div>
      )}

      {showAdjust && selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[var(--av-surface-elevated)] border p-6">
            <div className="flex justify-between mb-4"><h2 className="font-semibold">Adjust {selected.name}</h2><button onClick={() => setShowAdjust(false)}><X size={18} /></button></div>
            <p className="text-sm opacity-60 mb-3">Current stock: {selected.stock ?? 0}. The adjustment and movement ledger are committed atomically.</p>
            <input className="w-full border rounded-lg p-2 mb-3" type="number" step="1" placeholder="Change (+/- units)" value={adjust.change} onChange={(event) => setAdjust((state) => ({ ...state, change: event.target.value }))} />
            <input className="w-full border rounded-lg p-2" placeholder="Reason" value={adjust.reason} onChange={(event) => setAdjust((state) => ({ ...state, reason: event.target.value }))} />
            <button disabled={saving} onClick={() => void adjustStock()} className="w-full mt-4 py-2 rounded-lg avenize-gradient text-white">{saving ? 'Updating…' : 'Apply adjustment'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
