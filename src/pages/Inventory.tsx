import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Product } from '../lib/types'

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([])
  const [name, setName] = useState('')

  const load = async () => {
    const { data } = await supabase.from('products').select('*').order('name')
    setProducts((data as Product[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  const addProduct = async () => {
    if (!name.trim()) return
    await supabase.from('products').insert({ name, unit_price: 0, stock_qty: 0 })
    setName('')
    load()
  }

  const adjustStock = async (product: Product, delta: number) => {
    const newQty = Math.max(0, product.stock_qty + delta)
    await supabase.from('products').update({ stock_qty: newQty }).eq('id', product.id)
    await supabase.from('stock_movements').insert({
      product_id: product.id,
      change: delta,
      reason: delta > 0 ? 'manual stock in' : 'manual stock out',
    })
    load()
  }

  return (
    <div>
      <h1 className="text-xl font-medium text-[var(--fabric-black)] mb-6">Inventory</h1>

      <div className="flex gap-2 mb-6">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New product name"
          className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
        />
        <button onClick={addProduct} className="rounded-lg bg-[var(--fabric-black)] text-white px-4 py-2 text-sm">
          Add product
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5">
        {products.map((p) => {
          const low = p.stock_qty <= p.low_stock_threshold
          return (
            <div key={p.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <p className="text-[var(--fabric-black)]">{p.name}</p>
                {low && <p className="text-xs text-red-600 mt-0.5">Low stock</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-black/60 w-10 text-right">{p.stock_qty}</span>
                <button onClick={() => adjustStock(p, -1)} className="w-7 h-7 rounded-full bg-black/5 text-black/60">
                  −
                </button>
                <button onClick={() => adjustStock(p, 1)} className="w-7 h-7 rounded-full bg-black/5 text-black/60">
                  +
                </button>
              </div>
            </div>
          )
        })}
        {products.length === 0 && <p className="px-4 py-3 text-sm text-black/40">No products yet.</p>}
      </div>
    </div>
  )
}
