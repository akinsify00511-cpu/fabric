import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Product } from '../lib/types'
import { useAuth } from '../lib/AuthContext'

// Local type for demo products
type DemoProduct = {
  id: string
  name: string
  price: number
  stock: number
  sku?: string
  category?: string
}

// Demo products
const DEMO_PRODUCTS: DemoProduct[] = [
  { id: '1', name: 'Widget Pro', price: 29.99, stock: 150, sku: 'WGT-001', category: 'Electronics' },
  { id: '2', name: 'Gadget Plus', price: 49.99, stock: 75, sku: 'GDT-002', category: 'Electronics' },
  { id: '3', name: 'Smart Module', price: 99.99, stock: 30, sku: 'SMD-003', category: 'Components' },
  { id: '4', name: 'Basic Kit', price: 19.99, stock: 200, sku: 'KIT-004', category: 'Starter' },
  { id: '5', name: 'Premium Bundle', price: 199.99, stock: 15, sku: 'BDL-005', category: 'Bundle' },
]

export default function Inventory() {
  const { isDemo } = useAuth()
  const [products, setProducts] = useState<DemoProduct[]>([])
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')

  const load = async () => {
    if (isDemo) {
      setProducts(DEMO_PRODUCTS)
      return
    }
    try {
      const { data } = await supabase.from('products').select('*').order('name')
      if (data && data.length > 0) {
        setProducts(data as DemoProduct[])
      } else {
        setProducts(DEMO_PRODUCTS)
      }
    } catch {
      setProducts(DEMO_PRODUCTS)
    }
  }

  useEffect(() => {
    load()
  }, [isDemo])

  const addProduct = async () => {
    if (!name.trim()) return
    if (isDemo) {
      const newProduct: DemoProduct = { id: `demo-${Date.now()}`, name, price: Number(price) || 0, stock: Number(stock) || 0 }
      setProducts(prev => [...prev, newProduct])
      setName('')
      setPrice('')
      setStock('')
      return
    }
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

  const adjustStock = async (product: DemoProduct, delta: number) => {
    if (isDemo) {
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: Math.max(0, p.stock + delta) } : p))
      return
    }
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
      <h1 className="text-xl font-medium text-[var(--avenize-black)] mb-6">Inventory</h1>

      <div className="bg-white rounded-2xl border border-black/5 p-4 mb-6 space-y-3">
        <p className="text-sm font-medium text-[var(--avenize-black)]">Add product</p>
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
          <button onClick={addProduct} className="rounded-lg bg-[var(--avenize-black)] text-white px-4 py-2 text-sm">
            Add
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5">
        {products.map((p) => {
          const low = p.stock <= 20 // Default low stock threshold for demo
          return (
            <div key={p.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <p className="text-[var(--avenize-black)]">{p.name}</p>
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
