import { useState, useEffect } from 'react'
import {
  Package, Plus, Wrench, MapPin, User, Calendar,
  RefreshCw, Search, Filter, ChevronDown, Edit2,
  Trash2, Eye, AlertTriangle, CheckCircle, Clock
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface AssetCategory {
  id: string
  name: string
  code: string
}

interface Asset {
  id: string
  name: string
  description: string
  serial_number: string
  barcode: string
  category: AssetCategory
  category_id: string
  status: string
  location: string
  assigned_to: any
  assigned_date: string
  purchase_date: string
  purchase_cost: number
  current_value: number
  condition: string
  maintenance_count: number
  next_maintenance: string
  created_at: string
}

interface MaintenanceRecord {
  id: string
  asset_id: string
  type: string
  title: string
  status: string
  scheduled_date: string
  completed_date: string
  cost: number
}

export default function AssetManagementPage() {
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'
  const [assets, setAssets] = useState<Asset[]>([])
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  useEffect(() => {
    loadData()
  }, [staff?.business_id])

  async function loadData() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      const { data: cats } = await supabase
        .from('asset_categories')
        .select('*')
        .eq('business_id', staff.business_id)
        .eq('is_active', true)

      const { data: asts } = await supabase
        .from('assets')
        .select('*, category:asset_categories(*), assigned_to:staff(full_name, email)')
        .eq('business_id', staff.business_id)
        .order('name')

      const assetsWithCats: Asset[] = (asts || []).map(a => ({
        ...a,
        category: cats?.find(c => c.id === a.category_id) || a.category,
      }))

      setAssets(assetsWithCats)
      setCategories(cats || [])
    } catch (e) {
      console.error('Failed to load assets:', e)
    } finally {
      setLoading(false)
    }
  }

  const filteredAssets = assets.filter(a => {
    const matchesSearch = !search || 
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.serial_number?.toLowerCase().includes(search.toLowerCase()) ||
      a.barcode?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = filterStatus === 'all' || a.status === filterStatus
    const matchesCategory = filterCategory === 'all' || a.category_id === filterCategory
    return matchesSearch && matchesStatus && matchesCategory
  })

  const statusConfig: Record<string, { bg: string; text: string }> = {
    active: { bg: 'bg-green-100', text: 'text-green-600' },
    in_maintenance: { bg: 'bg-amber-100', text: 'text-amber-600' },
    retired: { bg: 'bg-white', text: 'text-black' },
    disposed: { bg: 'bg-red-100', text: 'text-red-600' },
    lost: { bg: 'bg-red-100', text: 'text-red-600' },
  }

  // Stats
  const totalAssets = assets.length
  const activeAssets = assets.filter(a => a.status === 'active').length
  const inMaintenance = assets.filter(a => a.status === 'in_maintenance').length
  const totalValue = assets.reduce((sum, a) => sum + (a.current_value || a.purchase_cost || 0), 0)

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br to-[var(--av-primary)] to-[var(--av-accent)] flex items-center justify-center">
            <Package size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Asset Management</h1>
            <p className="text-sm text-black">Track and manage company assets</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary, var(--av-primary))] text-white text-sm"
          >
            <Plus size={16} />
            Add Asset
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Assets" value={totalAssets.toString()} icon={<Package size={18} />} color="bg-[var(--av-primary)]" />
        <StatCard title="Active" value={activeAssets.toString()} icon={<CheckCircle size={18} />} color="bg-green-500" />
        <StatCard title="In Maintenance" value={inMaintenance.toString()} icon={<Wrench size={18} />} color="bg-amber-500" />
        <StatCard title="Total Value" value={`₦${totalValue.toLocaleString()}`} icon={<Package size={18} />} color="bg-purple-500" />
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-black/10"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2 rounded-lg border border-black/10"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="in_maintenance">In Maintenance</option>
          <option value="retired">Retired</option>
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="px-4 py-2 rounded-lg border border-black/10"
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Assets Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-12 text-black">
            <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
            Loading...
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="col-span-full text-center py-12 text-black bg-white rounded-2xl ">
            <Package size={48} className="mx-auto mb-4 text-black/50" />
            <p className="font-medium mb-2">No assets found</p>
            <p className="text-sm">Add your first asset to get started</p>
          </div>
        ) : (
          filteredAssets.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              statusConfig={statusConfig}
              isAdmin={isAdmin}
              onUpdate={() => loadData()}
            />
          ))
        )}
      </div>

      {/* Add Asset Modal */}
      {showModal && (
        <AssetModal
          categories={categories}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadData() }}
        />
      )}
    </div>
  )
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className="bg-white rounded-xl  p-4">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center text-white mb-3`}>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-black">{title}</div>
    </div>
  )
}

function AssetCard({ 
  asset, statusConfig, isAdmin, onUpdate 
}: { 
  asset: Asset
  statusConfig: Record<string, { bg: string; text: string }>
  isAdmin: boolean
  onUpdate: () => void
}) {
  const status = statusConfig[asset.status] || statusConfig.active
  const [showMenu, setShowMenu] = useState(false)

  async function handleStatusChange(newStatus: string) {
    try {
      await supabase.from('assets').update({ status: newStatus }).eq('id', asset.id)
      onUpdate()
    } catch (e) {
      console.error('Failed to update status:', e)
    }
    setShowMenu(false)
  }

  return (
    <div className="bg-white rounded-xl  overflow-hidden hover:shadow-lg transition">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r to-[var(--av-primary)]/5 to-[var(--av-accent)]/5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${status.bg} ${status.text}`}>
                {asset.status.replace('_', ' ')}
              </span>
            </div>
            <h3 className="font-semibold">{asset.name}</h3>
            <div className="text-sm text-black">{asset.category?.name}</div>
          </div>
          {isAdmin && (
            <div className="relative">
              <button 
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 rounded hover:bg-black/10"
              >
                <ChevronDown size={16} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
                  {asset.status !== 'active' && (
                    <button onClick={() => handleStatusChange('active')} className="w-full px-3 py-2 text-left text-sm hover:bg-black/10">
                      Mark Active
                    </button>
                  )}
                  {asset.status !== 'in_maintenance' && (
                    <button onClick={() => handleStatusChange('in_maintenance')} className="w-full px-3 py-2 text-left text-sm hover:bg-black/10">
                      Send to Maintenance
                    </button>
                  )}
                  {asset.status !== 'retired' && (
                    <button onClick={() => handleStatusChange('retired')} className="w-full px-3 py-2 text-left text-sm hover:bg-black/10">
                      Retire Asset
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="p-4 space-y-3">
        {asset.serial_number && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-black">S/N:</span>
            <span className="font-mono">{asset.serial_number}</span>
          </div>
        )}
        {asset.location && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin size={14} className="text-black" />
            <span>{asset.location}</span>
          </div>
        )}
        {asset.assigned_to && (
          <div className="flex items-center gap-2 text-sm">
            <User size={14} className="text-black" />
            <span>{asset.assigned_to.full_name}</span>
          </div>
        )}
        {(asset.purchase_cost || asset.current_value) && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-black">Value:</span>
            <span className="font-medium">
              ₦{(asset.current_value || asset.purchase_cost)?.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-black/[0.02] flex items-center justify-between text-xs text-black">
        <span>Added {new Date(asset.created_at).toLocaleDateString()}</span>
        {asset.next_maintenance && (
          <span className="flex items-center gap-1 text-amber-600">
            <Clock size={12} />
            Maintenance due
          </span>
        )}
      </div>
    </div>
  )
}

function AssetModal({
  categories, onClose, onSuccess
}: {
  categories: AssetCategory[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { staff } = useAuth()
  const [form, setForm] = useState({
    name: '',
    category_id: categories[0]?.id || '',
    serial_number: '',
    barcode: '',
    location: '',
    description: '',
    purchase_date: '',
    purchase_cost: '',
    status: 'active',
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id) return

    setSubmitting(true)
    try {
      await supabase.from('assets').insert({
        ...form,
        business_id: staff.business_id,
        purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : null,
        current_value: form.purchase_cost ? parseFloat(form.purchase_cost) : null,
      })
      onSuccess()
    } catch (e) {
      console.error('Failed to add asset:', e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-black/[0.06]">
          <h2 className="text-lg font-bold">Add New Asset</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Asset Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10"
              placeholder="e.g., MacBook Pro 16"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <select
              value={form.category_id}
              onChange={e => setForm({ ...form, category_id: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10"
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Serial Number</label>
              <input
                type="text"
                value={form.serial_number}
                onChange={e => setForm({ ...form, serial_number: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Barcode</label>
              <input
                type="text"
                value={form.barcode}
                onChange={e => setForm({ ...form, barcode: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={e => setForm({ ...form, location: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10"
              placeholder="e.g., Lagos Office, Room 201"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Purchase Date</label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={e => setForm({ ...form, purchase_date: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Purchase Cost (₦)</label>
              <input
                type="number"
                value={form.purchase_cost}
                onChange={e => setForm({ ...form, purchase_cost: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10 resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 px-4 py-3 rounded-xl bg-[var(--av-primary, var(--av-primary))] text-white font-medium disabled:opacity-50">
              {submitting ? 'Adding...' : 'Add Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
