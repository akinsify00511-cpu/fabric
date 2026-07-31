import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Product } from '../lib/types'

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([])
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')

  const load = async () => {
    const { data } = await supabase.from('products').select('*').order('name')
    setProducts((data as Product[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  const addProduct = async () => {
    if (!name.trim()) return
    await supabase.from('products').insert({
      name,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
    })
    setName('')
    setPrice('')
    setStock('')
    load()
  }

  const adjustStock = async (product: Product, delta: number) => {
    const newQty = Math.max(0, product.stock + delta)
    await supabase.from('products').update({ stock: newQty }).eq('id', product.id)
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

      <div className="bg-white rounded-2xl border border-black/5 p-4 mb-6 space-y-3">
        <p className="text-sm font-medium text-[var(--fabric-black)]">Add product</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Product name"
            className="flex-1 min-w-40 rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price"
            type="number"
            className="w-24 rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <input
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="Stock"
            type="number"
            className="w-20 rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <button onClick={addProduct} className="rounded-lg bg-[var(--fabric-black)] text-white px-4 py-2 text-sm">
            Add
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5">
        {products.map((p) => {
          const low = p.stock <= p.low_stock_threshold
          return (
            <div key={p.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <p className="text-[var(--fabric-black)]">{p.name}</p>
                <p className="text-xs text-black/40">${p.price}</p>
                {low && <p className="text-xs text-red-600 mt-0.5">Low stock</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-black/60 w-10 text-right">{p.stock}</span>
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
