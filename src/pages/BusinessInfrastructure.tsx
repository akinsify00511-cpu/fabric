// ============================================
// BUSINESS INFRASTRUCTURE PAGE
// Manage branches, assets, loans, and recurring costs
// ============================================

import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import {
  Building2, Package, CreditCard, RefreshCw, Plus, ChevronRight,
  MapPin, Phone, Users, TrendingUp, DollarSign, Clock
} from 'lucide-react'

type TabType = 'branches' | 'assets' | 'loans' | 'recurring'

interface Branch {
  id: string
  name: string
  address?: string
  phone?: string
  is_active: boolean
}

interface Asset {
  id: string
  name: string
  category: string
  current_value: number
  status: string
  location?: string
}

interface Loan {
  id: string
  lender: string
  type: string
  remaining_balance: number
  monthly_payment: number
  status: string
}

interface RecurringCost {
  id: string
  name: string
  category: string
  amount: number
  frequency: string
  next_due_date?: string
}

export default function BusinessInfrastructure() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  
  const [activeTab, setActiveTab] = useState<TabType>('branches')
  const [loading, setLoading] = useState(true)
  
  const [branches, setBranches] = useState<Branch[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [recurringCosts, setRecurringCosts] = useState<RecurringCost[]>([])

  useEffect(() => {
    loadData()
  }, [staff])

  const loadData = async () => {
    if (!staff?.business_id) return
    
    setLoading(true)
    
    try {
      const [branchesRes, assetsRes, loansRes, costsRes] = await Promise.all([
        supabase.from('branches').select('*').eq('business_id', staff.business_id),
        supabase.from('assets').select('*').eq('business_id', staff.business_id),
        supabase.from('loans').select('*').eq('business_id', staff.business_id),
        supabase.from('recurring_costs').select('*').eq('business_id', staff.business_id),
      ])

      if (branchesRes.data) setBranches(branchesRes.data)
      if (assetsRes.data) setAssets(assetsRes.data)
      if (loansRes.data) setLoans(loansRes.data)
      if (costsRes.data) setRecurringCosts(costsRes.data)
      
    } catch (error) {
      console.error('Error loading data:', error)
      showToast('Failed to load data', 'error')
    }
    
    setLoading(false)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount || 0)
  }

  const getTotalAssets = () => assets.reduce((sum, a) => sum + (a.current_value || 0), 0)
  const getTotalLoans = () => loans.filter(l => l.status === 'active').reduce((sum, l) => sum + (l.remaining_balance || 0), 0)
  const getMonthlyRecurring = () => {
    return recurringCosts
      .filter(c => c.frequency === 'monthly')
      .reduce((sum, c) => sum + (c.amount || 0), 0)
  }

  const tabs = [
    { key: 'branches' as TabType, label: 'Branches', icon: Building2, count: branches.length },
    { key: 'assets' as TabType, label: 'Assets', icon: Package, count: assets.length },
    { key: 'loans' as TabType, label: 'Loans', icon: CreditCard, count: loans.length },
    { key: 'recurring' as TabType, label: 'Recurring', icon: RefreshCw, count: recurringCosts.length },
  ]

  if (loading) {
    return (
      <div className="pb-20">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-black/5 rounded w-48"></div>
          <div className="h-32 bg-black/5 rounded-2xl"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--avenize-black)]">Business Infrastructure</h1>
          <p className="text-sm text-black/50 mt-0.5">Manage branches, assets, loans & costs</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl text-sm font-medium">
          <Plus size={16} />
          Add New
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={16} className="text-blue-500" />
            <span className="text-xs text-black/50">Branches</span>
          </div>
          <div className="text-2xl font-medium">{branches.length}</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package size={16} className="text-emerald-500" />
            <span className="text-xs text-black/50">Total Assets</span>
          </div>
          <div className="text-2xl font-medium">{formatCurrency(getTotalAssets())}</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard size={16} className="text-red-500" />
            <span className="text-xs text-black/50">Total Loans</span>
          </div>
          <div className="text-2xl font-medium">{formatCurrency(getTotalLoans())}</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw size={16} className="text-amber-500" />
            <span className="text-xs text-black/50">Monthly Costs</span>
          </div>
          <div className="text-2xl font-medium">{formatCurrency(getMonthlyRecurring())}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-black/[0.06] mb-6 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.key
                ? 'avenize-gradient text-white'
                : 'text-black/50 hover:text-black'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.key ? 'bg-white/20' : 'bg-black/10'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'branches' && (
        <div className="space-y-3">
          {branches.length === 0 ? (
            <div className="bg-white rounded-2xl border border-black/[0.06] p-8 text-center">
              <Building2 size={48} className="mx-auto text-black/20 mb-4" />
              <p className="text-black/50">No branches yet</p>
              <p className="text-xs text-black/30 mt-1">Add your first branch location</p>
            </div>
          ) : (
            branches.map(branch => (
              <div key={branch.id} className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Building2 size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium">{branch.name}</div>
                    <div className="flex items-center gap-4 text-xs text-black/50 mt-1">
                      {branch.address && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} /> {branch.address}
                        </span>
                      )}
                      {branch.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={12} /> {branch.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight size={20} className="text-black/30" />
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'assets' && (
        <div className="space-y-3">
          {assets.length === 0 ? (
            <div className="bg-white rounded-2xl border border-black/[0.06] p-8 text-center">
              <Package size={48} className="mx-auto text-black/20 mb-4" />
              <p className="text-black/50">No assets recorded</p>
              <p className="text-xs text-black/30 mt-1">Track equipment, property, and vehicles</p>
            </div>
          ) : (
            assets.map(asset => (
              <div key={asset.id} className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Package size={20} className="text-emerald-600" />
                  </div>
                  <div>
                    <div className="font-medium">{asset.name}</div>
                    <div className="flex items-center gap-4 text-xs text-black/50 mt-1">
                      <span className="bg-black/5 px-2 py-0.5 rounded">{asset.category}</span>
                      <span className={`px-2 py-0.5 rounded ${
                        asset.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {asset.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{formatCurrency(asset.current_value)}</div>
                  <div className="text-xs text-black/50">Current value</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'loans' && (
        <div className="space-y-3">
          {loans.length === 0 ? (
            <div className="bg-white rounded-2xl border border-black/[0.06] p-8 text-center">
              <CreditCard size={48} className="mx-auto text-black/20 mb-4" />
              <p className="text-black/50">No loans recorded</p>
              <p className="text-xs text-black/30 mt-1">Track bank loans and liabilities</p>
            </div>
          ) : (
            loans.map(loan => (
              <div key={loan.id} className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                    <CreditCard size={20} className="text-red-600" />
                  </div>
                  <div>
                    <div className="font-medium">{loan.lender}</div>
                    <div className="flex items-center gap-4 text-xs text-black/50 mt-1">
                      <span className="bg-black/5 px-2 py-0.5 rounded">{loan.type.replace('_', ' ')}</span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> Monthly: {formatCurrency(loan.monthly_payment)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{formatCurrency(loan.remaining_balance)}</div>
                  <div className="text-xs text-black/50">Balance</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'recurring' && (
        <div className="space-y-3">
          {recurringCosts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-black/[0.06] p-8 text-center">
              <RefreshCw size={48} className="mx-auto text-black/20 mb-4" />
              <p className="text-black/50">No recurring costs</p>
              <p className="text-xs text-black/30 mt-1">Track rent, utilities, subscriptions</p>
            </div>
          ) : (
            recurringCosts.map(cost => (
              <div key={cost.id} className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <RefreshCw size={20} className="text-amber-600" />
                  </div>
                  <div>
                    <div className="font-medium">{cost.name}</div>
                    <div className="flex items-center gap-4 text-xs text-black/50 mt-1">
                      <span className="bg-black/5 px-2 py-0.5 rounded">{cost.category}</span>
                      <span className="capitalize">{cost.frequency}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{formatCurrency(cost.amount)}</div>
                  <div className="text-xs text-black/50">/{cost.frequency === 'monthly' ? 'mo' : cost.frequency === 'yearly' ? 'yr' : 'qtr'}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
