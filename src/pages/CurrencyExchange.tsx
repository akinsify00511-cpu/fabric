import { useState, useEffect } from 'react'
import {
  DollarSign, RefreshCw, TrendingUp, TrendingDown, 
  ArrowRightLeft, Calculator, Calendar, Save, Trash2,
  ChevronDown, AlertCircle
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface ExchangeRate {
  id: string
  base_currency: string
  target_currency: string
  rate: number
  source: string
  effective_from: string
  effective_to?: string
  created_at: string
}

const CURRENCIES = [
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬' },
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', flag: '🇮🇳' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', flag: '🇬🇭' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪' },
]

export default function CurrencyExchangePage() {
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedBase, setSelectedBase] = useState('USD')
  
  // Converter state
  const [amount, setAmount] = useState(1000)
  const [fromCurrency, setFromCurrency] = useState('USD')
  const [toCurrency, setToCurrency] = useState('NGN')
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null)

  // Form state
  const [newRate, setNewRate] = useState({
    base_currency: 'USD',
    target_currency: 'NGN',
    rate: 0,
    source: 'manual',
  })

  useEffect(() => {
    loadRates()
  }, [staff?.business_id])

  async function loadRates() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      const { data } = await supabase
        .from('exchange_rates')
        .select('*')
        .order('base_currency')
        .order('target_currency')

      setRates(data || [])
    } catch (e) {
      console.error('Failed to load rates:', e)
    } finally {
      setLoading(false)
    }
  }

  // Auto-calculate conversion
  useEffect(() => {
    calculateConversion()
  }, [amount, fromCurrency, toCurrency, rates])

  function calculateConversion() {
    if (fromCurrency === toCurrency) {
      setConvertedAmount(amount)
      return
    }

    const rate = rates.find(r => 
      r.base_currency === fromCurrency && r.target_currency === toCurrency
    )

    if (rate) {
      setConvertedAmount(amount * Number(rate.rate))
    } else {
      // Try inverse
      const inverseRate = rates.find(r => 
        r.base_currency === toCurrency && r.target_currency === fromCurrency
      )
      if (inverseRate) {
        setConvertedAmount(amount / Number(inverseRate.rate))
      } else {
        setConvertedAmount(null)
      }
    }
  }

  async function handleAddRate() {
    if (!staff?.business_id) return

    try {
      const { error } = await supabase
        .from('exchange_rates')
        .insert({
          base_currency: newRate.base_currency,
          target_currency: newRate.target_currency,
          rate: newRate.rate,
          source: newRate.source,
          effective_from: new Date().toISOString().split('T')[0],
        })

      if (error) throw error

      setShowAddModal(false)
      setNewRate({ base_currency: 'USD', target_currency: 'NGN', rate: 0, source: 'manual' })
      loadRates()
    } catch (e) {
      console.error('Failed to add rate:', e)
    }
  }

  async function handleDeleteRate(id: string) {
    if (!confirm('Delete this exchange rate?')) return

    try {
      await supabase.from('exchange_rates').delete().eq('id', id)
      loadRates()
    } catch (e) {
      console.error('Failed to delete rate:', e)
    }
  }

  function swapCurrencies() {
    setFromCurrency(toCurrency)
    setToCurrency(fromCurrency)
  }

  const fromCurrencyData = CURRENCIES.find(c => c.code === fromCurrency)
  const toCurrencyData = CURRENCIES.find(c => c.code === toCurrency)

  // Group rates by base currency
  const groupedRates = rates.reduce((acc, rate) => {
    if (!acc[rate.base_currency]) {
      acc[rate.base_currency] = []
    }
    acc[rate.base_currency].push(rate)
    return acc
  }, {} as Record<string, ExchangeRate[]>)

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <DollarSign size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--avenize-black)]">Currency Exchange</h1>
            <p className="text-sm text-black/50">Manage exchange rates and convert currencies</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm"
          >
            <TrendingUp size={16} />
            Add Rate
          </button>
        )}
      </div>

      {/* Currency Converter */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Calculator size={18} />
          Currency Converter
        </h2>

        <div className="grid md:grid-cols-3 gap-6">
          {/* From */}
          <div>
            <label className="block text-sm font-medium text-black/50 mb-2">From</label>
            <div className="relative">
              <select
                value={fromCurrency}
                onChange={(e) => setFromCurrency(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-black/10 appearance-none"
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.code} - {c.name}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 pointer-events-none" />
            </div>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full mt-2 px-4 py-3 rounded-xl border border-black/10 text-2xl font-bold"
              placeholder="0.00"
            />
          </div>

          {/* Swap Button */}
          <div className="flex items-center justify-center">
            <button
              onClick={swapCurrencies}
              className="w-12 h-12 rounded-full bg-[var(--avenize-primary)] text-white flex items-center justify-center hover:scale-110 transition"
            >
              <ArrowRightLeft size={20} />
            </button>
          </div>

          {/* To */}
          <div>
            <label className="block text-sm font-medium text-black/50 mb-2">To</label>
            <div className="relative">
              <select
                value={toCurrency}
                onChange={(e) => setToCurrency(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-black/10 appearance-none"
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.code} - {c.name}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 pointer-events-none" />
            </div>
            <div className="mt-2 px-4 py-3 rounded-xl border border-black/10 text-2xl font-bold bg-black/[0.02]">
              {convertedAmount !== null ? (
                <span className="text-emerald-600">
                  {toCurrencyData?.symbol}{convertedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              ) : (
                <span className="text-black/30">Rate not available</span>
              )}
            </div>
          </div>
        </div>

        {/* Current Rate */}
        {convertedAmount !== null && rates.find(r => r.base_currency === fromCurrency && r.target_currency === toCurrency) && (
          <div className="mt-4 p-3 bg-black/[0.02] rounded-lg text-sm text-black/50">
            1 {fromCurrency} = {rates.find(r => r.base_currency === fromCurrency && r.target_currency === toCurrency)?.rate} {toCurrency}
          </div>
        )}
      </div>

      {/* Exchange Rates Table */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        <div className="p-4 border-b border-black/[0.06]">
          <h2 className="font-semibold">Current Exchange Rates</h2>
          <p className="text-sm text-black/50">Base currency: {selectedBase}</p>
        </div>

        {/* Currency Tabs */}
        <div className="flex overflow-x-auto border-b border-black/[0.06]">
          {Object.keys(groupedRates).map(currency => (
            <button
              key={currency}
              onClick={() => setSelectedBase(currency)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 ${
                selectedBase === currency 
                  ? 'border-[var(--avenize-primary)] text-[var(--avenize-primary)]' 
                  : 'border-transparent text-black/50 hover:text-black/70'
              }`}
            >
              {currency}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-12 text-center text-black/40">
            <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
            Loading rates...
          </div>
        ) : !groupedRates[selectedBase] || groupedRates[selectedBase].length === 0 ? (
          <div className="p-12 text-center text-black/40">
            <DollarSign size={32} className="mx-auto mb-2" />
            <p>No rates configured for {selectedBase}</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {groupedRates[selectedBase].map(rate => {
              const targetData = CURRENCIES.find(c => c.code === rate.target_currency)
              return (
                <div key={rate.id} className="p-4 flex items-center justify-between hover:bg-black/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-black/5 flex items-center justify-center text-lg">
                      {targetData?.flag || '💱'}
                    </div>
                    <div>
                      <div className="font-medium">
                        {rate.target_currency}
                        <span className="text-black/50 ml-2">{targetData?.name}</span>
                      </div>
                      <div className="text-xs text-black/40">
                        Updated {new Date(rate.created_at).toLocaleDateString()}
                        {rate.source !== 'manual' && ` • Source: ${rate.source}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xl font-bold">{Number(rate.rate).toFixed(4)}</div>
                      <div className="text-xs text-black/40">1 {rate.base_currency}</div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteRate(rate.id)}
                        className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Rate Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="text-lg font-bold">Add Exchange Rate</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Base Currency</label>
                <select
                  value={newRate.base_currency}
                  onChange={(e) => setNewRate({ ...newRate, base_currency: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Target Currency</label>
                <select
                  value={newRate.target_currency}
                  onChange={(e) => setNewRate({ ...newRate, target_currency: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Exchange Rate</label>
                <input
                  type="number"
                  step="0.0001"
                  value={newRate.rate || ''}
                  onChange={(e) => setNewRate({ ...newRate, rate: Number(e.target.value) })}
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                  placeholder="e.g., 1550.00"
                />
                <p className="text-xs text-black/40 mt-1">
                  1 {newRate.base_currency} = {newRate.rate || '?'} {newRate.target_currency}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Source</label>
                <select
                  value={newRate.source}
                  onChange={(e) => setNewRate({ ...newRate, source: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                >
                  <option value="manual">Manual</option>
                  <option value="cbn">Central Bank</option>
                  <option value="xe.com">XE.com</option>
                  <option value="openexchangerates">Open Exchange Rates</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-black/[0.06] flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRate}
                disabled={!newRate.rate}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--avenize-primary)] text-white font-medium disabled:opacity-50"
              >
                Save Rate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
