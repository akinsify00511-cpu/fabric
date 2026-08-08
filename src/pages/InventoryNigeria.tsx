// ============================================
// INVENTORY PAGE - NIGERIAN CONSTRUCTION/REAL ESTATE
// Three stock locations: Raw Materials, Finished Goods, Site Materials
// Nigerian units: sheets, liters, kg, bags, gallons
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import FeatureSuggestions from '../components/FeatureSuggestions'
import EntitlementGate from '../components/EntitlementGate'
import {
  Package, Plus, Search, Filter, AlertTriangle, TrendingDown,
  ArrowUpDown, ChevronDown, Edit2, Trash2, MapPin,
  Factory, Warehouse, Truck, ShoppingCart, ArrowDown
} from 'lucide-react'

type StockLocation = 'raw_materials' | 'finished_goods' | 'site_materials'
type StockUnit = 'sheets' | 'liters' | 'kg' | 'bags' | 'gallons' | 'units' | 'rolls' | 'bundles'

interface StockItem {
  id: string
  sku: string
  name: string
  description?: string
  category: string
  location: StockLocation
  quantity: number
  unit: StockUnit
  reorder_point: number
  cost_price: number // Naira
  sell_price: number // Naira
  supplier?: string
  last_restocked?: string
  created_at: string
  staff_id: string
  business_id: string
}

interface StockMovement {
  id: string
  item_id: string
  item_name: string
  type: 'received' | 'allocated' | 'used' | 'returned' | 'sold'
  quantity: number
  from_location?: StockLocation
  to_location?: StockLocation
  reference?: string // job number, invoice, etc.
  notes?: string
  created_at: string
}

const LOCATION_LABELS: Record<StockLocation, { label: string; icon: React.ReactNode; desc: string }> = {
  raw_materials: { label: 'Raw Materials', icon: <Factory size={16} />, desc: 'Factory inputs' },
  finished_goods: { label: 'Finished Goods', icon: <Warehouse size={16} />, desc: 'Warehouse stock' },
  site_materials: { label: 'Site Materials', icon: <Truck size={16} />, desc: 'Allocated to jobs' },
}

const UNIT_LABELS: Record<StockUnit, string> = {
  sheets: 'Sheets',
  liters: 'Liters',
  kg: 'Kilograms',
  bags: 'Bags',
  gallons: 'Gallons',
  units: 'Units',
  rolls: 'Rolls',
  bundles: 'Bundles',
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function InventoryNigeria() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  
  const [items, setItems] = useState<StockItem[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [locationFilter, setLocationFilter] = useState<StockLocation | 'all'>('all')
  const [showLowStock, setShowLowStock] = useState(false)
  const [showNewItem, setShowNewItem] = useState(false)
  const [showMovement, setShowMovement] = useState(false)
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)
  
  // New item form
  const [newItem, setNewItem] = useState({
    name: '',
    sku: '',
    category: '',
    location: 'raw_materials' as StockLocation,
    quantity: 0,
    unit: 'sheets' as StockUnit,
    reorder_point: 0,
    cost_price: 0,
    sell_price: 0,
    supplier: '',
  })

  // Movement form
  const [movement, setMovement] = useState({
    type: 'received' as StockMovement['type'],
    quantity: 0,
    from_location: '' as StockLocation | '',
    to_location: '' as StockLocation | '',
    reference: '',
    notes: '',
  })

  const loadInventory = useCallback(async () => {
    if (!staff?.business_id) return
    
    setLoading(true)
    try {
      const { data: itemsData, error: itemsError } = await supabase
        .from('inventory')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('name')

      const { data: movesData, error: movesError } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (itemsError) throw itemsError
      if (movesError) throw movesError

      setItems((itemsData as StockItem[]) ?? [])
      setMovements((movesData as StockMovement[]) ?? [])
    } catch (err) {
      console.error('Failed to load inventory:', err)
      showToast('Failed to load inventory', 'error')
    } finally {
      setLoading(false)
    }
  }, [staff?.business_id, showToast])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  const createItem = async () => {
    if (!staff?.business_id || !staff?.id) return
    if (!newItem.name || !newItem.sku) {
      showToast('Name and SKU required', 'error')
      return
    }

    try {
      const { data, error } = await supabase
        .from('inventory')
        .insert({
          ...newItem,
          staff_id: staff.id,
          business_id: staff.business_id,
        })
        .select()
        .single()

      if (error) throw error

      setItems(prev => [...prev, data as StockItem])
      setShowNewItem(false)
      setNewItem({
        name: '', sku: '', category: '', location: 'raw_materials',
        quantity: 0, unit: 'sheets', reorder_point: 0,
        cost_price: 0, sell_price: 0, supplier: '',
      })
      showToast('Item added!', 'success')
    } catch (err) {
      console.error('Failed to create item:', err)
      showToast('Failed to add item', 'error')
    }
  }

  const recordMovement = async () => {
    if (!staff?.business_id || !staff?.id || !selectedItem) return
    if (movement.quantity <= 0) {
      showToast('Enter quantity', 'error')
      return
    }

    try {
      // Update item quantity
      const quantityChange = movement.type === 'received' || movement.type === 'returned'
        ? movement.quantity
        : -movement.quantity

      const newQuantity = selectedItem.quantity + quantityChange

      await supabase
        .from('inventory')
        .update({ quantity: newQuantity })
        .eq('id', selectedItem.id)

      // Record movement
      const { data, error } = await supabase
        .from('stock_movements')
        .insert({
          item_id: selectedItem.id,
          item_name: selectedItem.name,
          type: movement.type,
          quantity: movement.quantity,
          from_location: movement.from_location || undefined,
          to_location: movement.to_location || undefined,
          reference: movement.reference || undefined,
          notes: movement.notes || undefined,
          staff_id: staff.id,
          business_id: staff.business_id,
        })
        .select()
        .single()

      if (error) throw error

      setItems(prev => prev.map(i => 
        i.id === selectedItem.id ? { ...i, quantity: newQuantity } : i
      ))
      setMovements(prev => [data as StockMovement, ...prev])
      
      setShowMovement(false)
      setMovement({
        type: 'received', quantity: 0,
        from_location: '', to_location: '', reference: '', notes: '',
      })
      
      showToast('Movement recorded!', 'success')
    } catch (err) {
      console.error('Failed to record movement:', err)
      showToast('Failed to record', 'error')
    }
  }

  const filteredItems = items.filter(item => {
    if (locationFilter !== 'all' && item.location !== locationFilter) return false
    if (showLowStock && item.quantity > item.reorder_point) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      )
    }
    return true
  })

  // Stats
  const stats = {
    totalItems: items.length,
    totalValue: items.reduce((sum, i) => sum + (i.quantity * i.cost_price), 0),
    lowStock: items.filter(i => i.quantity <= i.reorder_point).length,
    outOfStock: items.filter(i => i.quantity === 0).length,
  }

  // Group by location
  const byLocation = {
    raw_materials: items.filter(i => i.location === 'raw_materials'),
    finished_goods: items.filter(i => i.location === 'finished_goods'),
    site_materials: items.filter(i => i.location === 'site_materials'),
  }

  return (
    <EntitlementGate feature="inventory" modal={true}>
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">Inventory</h1>
          <p className="text-sm text-black">Track materials across locations</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowMovement(true)}
            disabled={!selectedItem}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-black/10 text-sm font-medium disabled:opacity-50"
          >
            <ArrowDown size={16} />
            Record Movement
          </button>
          <button
            onClick={() => setShowNewItem(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
          >
            <Plus size={16} />
            Add Item
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <p className="text-xs text-black mb-1">Total Items</p>
          <p className="text-2xl font-bold">{stats.totalItems}</p>
        </div>
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <p className="text-xs text-black mb-1">Stock Value</p>
          <p className="text-lg font-bold text-[var(--av-primary, #4285F4)]">{formatCurrency(stats.totalValue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <p className="text-xs text-black mb-1">Low Stock</p>
          <p className="text-2xl font-bold text-orange-600">{stats.lowStock}</p>
        </div>
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <p className="text-xs text-black mb-1">Out of Stock</p>
          <p className="text-2xl font-bold text-red-600">{stats.outOfStock}</p>
        </div>
      </div>

      {/* Location Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setLocationFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
            locationFilter === 'all' ? 'avenize-gradient text-white' : 'bg-white border border-black/10'
          }`}
        >
          All ({items.length})
        </button>
        {Object.entries(LOCATION_LABELS).map(([key, loc]) => (
          <button
            key={key}
            onClick={() => setLocationFilter(key as StockLocation)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              locationFilter === key ? 'avenize-gradient text-white' : 'bg-white border border-black/10'
            }`}
          >
            {loc.icon}
            {loc.label} ({byLocation[key as StockLocation].length})
          </button>
        ))}
        <button
          onClick={() => setShowLowStock(!showLowStock)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            showLowStock ? 'bg-orange-100 text-orange-700' : 'bg-white border border-black/10'
          }`}
        >
          <AlertTriangle size={14} />
          Low Stock ({stats.lowStock})
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search items by name, SKU, or category..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/10 text-sm bg-white"
        />
      </div>

      {/* Items List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-black/[0.06] p-4 animate-pulse">
              <div className="h-5 bg-black/10 rounded w-1/3 mb-2" />
              <div className="h-4 bg-black/10 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-[var(--av-primary, #4285F4)]/10 flex items-center justify-center mx-auto mb-4">
            <Package size={24} className="text-[var(--av-primary, #4285F4)]" />
          </div>
          <h3 className="font-semibold mb-2">No items found</h3>
          <p className="text-sm text-black mb-4">
            {searchQuery ? 'Try adjusting your search' : 'Add your first inventory item'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowNewItem(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl avenize-gradient text-white font-medium"
            >
              <Plus size={16} />
              Add Item
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => {
            const isLow = item.quantity <= item.reorder_point
            const isOut = item.quantity === 0
            
            return (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={`bg-white rounded-xl border p-4 cursor-pointer transition-colors ${
                  selectedItem?.id === item.id
                    ? 'border-[var(--av-primary, #4285F4)] ring-1 ring-[var(--av-primary, #4285F4)]'
                    : isOut
                    ? 'border-red-200'
                    : isLow
                    ? 'border-orange-200 hover:border-orange-300'
                    : 'border-black/[0.06] hover:border-[var(--av-primary, #4285F4)]/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-black">{item.sku}</span>
                      <span className="px-2 py-0.5 rounded text-xs bg-white">
                        {LOCATION_LABELS[item.location].label}
                      </span>
                    </div>
                    <h3 className="font-medium">{item.name}</h3>
                    {item.category && (
                      <p className="text-xs text-black">{item.category}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-bold ${
                      isOut ? 'text-red-600' : isLow ? 'text-orange-600' : 'text-black'
                    }`}>
                      {item.quantity}
                      <span className="text-xs font-normal text-black ml-1">
                        {UNIT_LABELS[item.unit]}
                      </span>
                    </p>
                    {isLow && (
                      <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                        <AlertTriangle size={10} />
                        Reorder at {item.reorder_point}
                      </span>
                    )}
                    <p className="text-xs text-black mt-1">
                      {formatCurrency(item.cost_price)}/{UNIT_LABELS[item.unit]}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recent Movements */}
      {movements.length > 0 && (
        <div className="mt-6">
          <h2 className="font-medium mb-3">Recent Movements</h2>
          <div className="bg-white rounded-xl border border-black/[0.06] divide-y divide-black/5">
            {movements.slice(0, 10).map((m) => (
              <div key={m.id} className="p-3 flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${
                  m.type === 'received' ? 'bg-green-500' :
                  m.type === 'used' ? 'bg-red-500' :
                  m.type === 'allocated' ? 'bg-blue-500' :
                  m.type === 'returned' ? 'bg-yellow-500' :
                  'bg-white0'
                }`} />
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{m.type}</span>
                    {' '}{m.quantity}x {m.item_name}
                    {m.reference && <span className="text-black"> ({m.reference})</span>}
                  </p>
                </div>
                <span className="text-xs text-black">
                  {new Date(m.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Item Modal */}
      {showNewItem && (
        <div className="fixed inset-0 bg-black/100 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <h2 className="font-semibold">Add Inventory Item</h2>
              <button onClick={() => setShowNewItem(false)} className="p-2 hover:bg-black/[0.05] rounded-lg">×</button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Item Name *</label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Aluminum Sheets 0.5mm"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">SKU *</label>
                  <input
                    type="text"
                    value={newItem.sku}
                    onChange={(e) => setNewItem(prev => ({ ...prev, sku: e.target.value }))}
                    placeholder="e.g., ALU-05MM"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <input
                    type="text"
                    value={newItem.category}
                    onChange={(e) => setNewItem(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="e.g., Construction Materials"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <select
                  value={newItem.location}
                  onChange={(e) => setNewItem(prev => ({ ...prev, location: e.target.value as StockLocation }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                >
                  <option value="raw_materials">Raw Materials (Factory)</option>
                  <option value="finished_goods">Finished Goods (Warehouse)</option>
                  <option value="site_materials">Site Materials</option>
                </select>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Quantity</label>
                  <input
                    type="number"
                    value={newItem.quantity || ''}
                    onChange={(e) => setNewItem(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Unit</label>
                  <select
                    value={newItem.unit}
                    onChange={(e) => setNewItem(prev => ({ ...prev, unit: e.target.value as StockUnit }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  >
                    {Object.entries(UNIT_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Reorder Point</label>
                  <input
                    type="number"
                    value={newItem.reorder_point || ''}
                    onChange={(e) => setNewItem(prev => ({ ...prev, reorder_point: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Cost Price (₦)</label>
                  <input
                    type="number"
                    value={newItem.cost_price || ''}
                    onChange={(e) => setNewItem(prev => ({ ...prev, cost_price: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sell Price (₦)</label>
                  <input
                    type="number"
                    value={newItem.sell_price || ''}
                    onChange={(e) => setNewItem(prev => ({ ...prev, sell_price: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Supplier</label>
                <input
                  type="text"
                  value={newItem.supplier}
                  onChange={(e) => setNewItem(prev => ({ ...prev, supplier: e.target.value }))}
                  placeholder="Supplier name"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowNewItem(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-black/10 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={createItem}
                  className="flex-1 px-4 py-2.5 rounded-xl avenize-gradient text-white font-medium"
                >
                  Add Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Movement Modal */}
      {showMovement && selectedItem && (
        <div className="fixed inset-0 bg-black/100 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <h2 className="font-semibold">Record Movement</h2>
              <button onClick={() => setShowMovement(false)} className="p-2 hover:bg-black/[0.05] rounded-lg">×</button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="bg-white rounded-xl p-3">
                <p className="font-medium">{selectedItem.name}</p>
                <p className="text-sm text-black">
                  Current: {selectedItem.quantity} {UNIT_LABELS[selectedItem.unit]}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Movement Type</label>
                <select
                  value={movement.type}
                  onChange={(e) => setMovement(prev => ({ ...prev, type: e.target.value as StockMovement['type'] }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                >
                  <option value="received">Received (Stock In)</option>
                  <option value="allocated">Allocated to Job</option>
                  <option value="used">Used in Production</option>
                  <option value="returned">Returned to Stock</option>
                  <option value="sold">Sold</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Quantity</label>
                <input
                  type="number"
                  value={movement.quantity || ''}
                  onChange={(e) => setMovement(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Reference (Job #, Invoice #)</label>
                <input
                  type="text"
                  value={movement.reference}
                  onChange={(e) => setMovement(prev => ({ ...prev, reference: e.target.value }))}
                  placeholder="e.g., JOB-123456"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={movement.notes}
                  onChange={(e) => setMovement(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm resize-none"
                  rows={2}
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowMovement(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-black/10 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={recordMovement}
                  className="flex-1 px-4 py-2.5 rounded-xl avenize-gradient text-white font-medium"
                >
                  Record
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Feature Suggestions */}
      <FeatureSuggestions suggestions={[
        { label: 'Finance', path: '/app/finance', description: 'Track inventory value' },
        { label: 'Projects', path: '/app/projects', description: 'Use in projects' },
        { label: 'Reports', path: '/app/reports', description: 'Stock analytics' },
      ]} />
    </div>
    </EntitlementGate>
  )
}
