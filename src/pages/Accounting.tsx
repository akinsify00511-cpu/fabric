import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import {
  Plus, FileText, Wallet, CreditCard,
  TrendingUp, Receipt, X, Trash2, Building2,
  BarChart3, PieChart
} from 'lucide-react'

type Account = {
  id: string
  code: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  parent_id: string | null
  description: string | null
  opening_balance: number
  balance?: number
}

type JournalEntry = {
  id: string
  entry_number: string
  date: string
  description: string | null
  status: 'draft' | 'posted' | 'void'
  total: number
}

type JournalLineInput = {
  account_id: string
  debit: string
  credit: string
  description: string
}

const ACCOUNT_TYPES = [
  { id: 'asset', label: 'Assets', icon: Wallet, color: 'text-[var(--av-primary)]', bg: 'bg-[var(--av-primary-soft)]' },
  { id: 'liability', label: 'Liabilities', icon: CreditCard, color: 'text-[var(--av-danger)]', bg: 'bg-[var(--av-danger-soft)]' },
  { id: 'equity', label: 'Equity', icon: Building2, color: 'text-purple-600', bg: 'bg-purple-50' },
  { id: 'revenue', label: 'Revenue', icon: TrendingUp, color: 'text-[var(--av-success)]', bg: 'bg-[var(--av-success-soft)]' },
  { id: 'expense', label: 'Expenses', icon: Receipt, color: 'text-orange-600', bg: 'bg-orange-50' },
]

export default function Accounting() {
  
  const { showToast } = useToast()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [,setSelectedEntry] = useState<JournalEntry | null>(null)
  const [,setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [activeTab, setActiveTab] = useState<'chart' | 'journal' | 'reports'>('chart')
  const [reportType, setReportType] = useState<'balance' | 'income'>('balance')
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [showNewAccount, setShowNewAccount] = useState(false)

  // New Account state
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<Account['type']>('asset')
  const [newOpening, setNewOpening] = useState('0')

  // New Entry state
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
  const [entryDesc, setEntryDesc] = useState('')
  const [newEntryLines, setNewEntryLines] = useState<JournalLineInput[]>([
    { account_id: '', debit: '', credit: '', description: '' },
    { account_id: '', debit: '', credit: '', description: '' },
  ])

  const load = async () => {
    setLoading(true)
    const [{ data: accountsData }, { data: entriesData }] = await Promise.all([
      supabase.from('accounts').select('*').order('code'),
      supabase.from('journal_entries').select('*').order('date', { ascending: false }).limit(50),
    ])
    setAccounts((accountsData as Account[]) ?? [])
    setEntries((entriesData as JournalEntry[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  

  const createAccount = async () => {
    if (creating) return
    setCreating(true)
    if (!newCode.trim() || !newName.trim()) {
      showToast('Enter code and name', 'error')
      setCreating(false)
      return
    }
    try {
      const { error } = await supabase.from('accounts').insert({
        code: newCode,
        name: newName,
        type: newType,
        opening_balance: Number(newOpening) || 0,
      })
      if (error) throw error
      showToast('Account created!', 'success')
      setNewCode('')
      setNewName('')
      setNewOpening('0')
      setShowNewAccount(false)
      load()
    } catch  {
      showToast('Failed to create account', 'error')
    } finally {
      setCreating(false)
    }
  }

  const createEntry = async () => {
    const totalDebit = newEntryLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
    const totalCredit = newEntryLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      showToast('Debits must equal credits', 'error')
      return
    }

    const { error } = await supabase.from('journal_entries').insert({
      date: entryDate,
      description: entryDesc,
    })

    if (error) {
      showToast('Failed to create entry', 'error')
    } else {
      showToast('Journal entry created!', 'success')
      resetEntryForm()
      load()
    }
  }

  const resetEntryForm = () => {
    setShowNewEntry(false)
    setEntryDate(new Date().toISOString().split('T')[0])
    setEntryDesc('')
    setNewEntryLines([
      { account_id: '', debit: '', credit: '', description: '' },
      { account_id: '', debit: '', credit: '', description: '' },
    ])
  }

  const addLine = () => {
    setNewEntryLines([...newEntryLines, { account_id: '', debit: '', credit: '', description: '' }])
  }

  const updateLine = (index: number, field: string, value: string) => {
    const updated = [...newEntryLines]
    ;(updated[index] as any)[field] = value
    setNewEntryLines(updated)
  }

  const removeLine = (index: number) => {
    if (newEntryLines.length > 2) {
      setNewEntryLines(newEntryLines.filter((_, i) => i !== index))
    }
  }

  const accountsByType = ACCOUNT_TYPES.map((type) => ({
    ...type,
    accounts: accounts.filter((a) => a.type === type.id),
  }))

  const totalDebit = newEntryLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
  const totalCredit = newEntryLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)

  // Calculate financial summary
  const assets = accounts.filter((a) => a.type === 'asset').reduce((sum, a) => sum + (a.opening_balance || 0), 0)
  const liabilities = accounts.filter((a) => a.type === 'liability').reduce((sum, a) => sum + (a.opening_balance || 0), 0)
  const equity = accounts.filter((a) => a.type === 'equity').reduce((sum, a) => sum + (a.opening_balance || 0), 0)
  const revenue = accounts.filter((a) => a.type === 'revenue').reduce((sum, a) => sum + (a.opening_balance || 0), 0)
  const expenses = accounts.filter((a) => a.type === 'expense').reduce((sum, a) => sum + (a.opening_balance || 0), 0)

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-black">Accounting</h1>
          <p className="text-sm text-black mt-0.5">Double-entry bookkeeping</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewAccount(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-black/10 text-sm hover:bg-black/10"
          >
            <Plus size={14} />
            Account
          </button>
          <button
            onClick={() => setShowNewEntry(true)}
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium"
          >
            <Plus size={14} />
            New Entry
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-black/[0.06] mb-6 w-fit">
        {[
          { id: 'chart', label: 'Chart of Accounts', icon: PieChart },
          { id: 'journal', label: 'Journal', icon: FileText },
          { id: 'reports', label: 'Reports', icon: BarChart3 },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-[var(--av-primary)] text-white'
                  : 'text-black hover:text-black'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* CHART OF ACCOUNTS */}
      {activeTab === 'chart' && (
        <div className="space-y-4">
          {accountsByType.map((type) => (
            <div key={type.id} className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
              <div className={`px-4 py-3 ${type.bg} flex items-center gap-2`}>
                <type.icon size={16} className={type.color} />
                <span className={`text-sm font-medium ${type.color}`}>{type.label}</span>
                <span className="text-xs text-black ml-auto">{type.accounts.length} accounts</span>
              </div>
              {type.accounts.length === 0 ? (
                <p className="px-4 py-3 text-sm text-black">No accounts</p>
              ) : (
                <div className="divide-y divide-black/[0.04]">
                  {type.accounts.map((account) => (
                    <div key={account.id} className="px-4 py-2 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-black w-12">{account.code}</span>
                        <span className="text-black">{account.name}</span>
                      </div>
                      <span className="text-black/60 font-mono">
                        {account.opening_balance?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* JOURNAL */}
      {activeTab === 'journal' && (
        <div className="bg-white rounded-2xl border border-black/[0.06]">
          <div className="px-4 py-3 border-b border-black/[0.06]">
            <h2 className="text-sm font-medium">Journal Entries</h2>
          </div>
          <div className="divide-y divide-black/[0.04]">
            {entries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setSelectedEntry(entry)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-black/10 transition"
              >
                <div>
                  <p className="text-sm font-medium text-black">{entry.entry_number}</p>
                  <p className="text-xs text-black">{entry.description || 'No description'}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-black">{new Date(entry.date).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
            {entries.length === 0 && (
              <div className="px-4 py-8 text-center text-black">
                <FileText size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No journal entries yet</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Report Type Toggle */}
          <div className="flex gap-1 bg-white rounded-xl p-1 border border-black/[0.06] w-fit">
            <button
              onClick={() => setReportType('balance')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                reportType === 'balance' ? 'bg-[var(--av-primary)] text-white' : 'text-black'
              }`}
            >
              Balance Sheet
            </button>
            <button
              onClick={() => setReportType('income')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                reportType === 'income' ? 'bg-[var(--av-primary)] text-white' : 'text-black'
              }`}
            >
              Income Statement
            </button>
          </div>

          {/* Balance Sheet */}
          {reportType === 'balance' && (
            <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
              <div className="px-6 py-4 border-b border-black/[0.06]">
                <h2 className="text-lg font-semibold">Balance Sheet</h2>
                <p className="text-xs text-black">As of {new Date().toLocaleDateString()}</p>
              </div>

              {/* Assets */}
              <div className="px-6 py-4 border-b border-black/[0.06]">
                <p className="text-sm font-medium text-[var(--av-primary)] mb-3">ASSETS</p>
                {accountsByType.find((t) => t.id === 'asset')?.accounts.map((a) => (
                  <div key={a.id} className="flex justify-between py-1.5 text-sm">
                    <span className="text-black/70">{a.name}</span>
                    <span className="font-mono">{a.opening_balance?.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 mt-2 border-t border-black/10 font-medium">
                  <span>Total Assets</span>
                  <span className="font-mono">{assets.toLocaleString()}</span>
                </div>
              </div>

              {/* Liabilities */}
              <div className="px-6 py-4 border-b border-black/[0.06]">
                <p className="text-sm font-medium text-[var(--av-danger)] mb-3">LIABILITIES</p>
                {accountsByType.find((t) => t.id === 'liability')?.accounts.map((a) => (
                  <div key={a.id} className="flex justify-between py-1.5 text-sm">
                    <span className="text-black/70">{a.name}</span>
                    <span className="font-mono">{a.opening_balance?.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 mt-2 border-t border-black/10 font-medium">
                  <span>Total Liabilities</span>
                  <span className="font-mono">{liabilities.toLocaleString()}</span>
                </div>
              </div>

              {/* Equity */}
              <div className="px-6 py-4">
                <p className="text-sm font-medium text-purple-600 mb-3">EQUITY</p>
                {accountsByType.find((t) => t.id === 'equity')?.accounts.map((a) => (
                  <div key={a.id} className="flex justify-between py-1.5 text-sm">
                    <span className="text-black/70">{a.name}</span>
                    <span className="font-mono">{a.opening_balance?.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 mt-2 border-t border-black/10 font-medium">
                  <span>Total Equity</span>
                  <span className="font-mono">{equity.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Income Statement */}
          {reportType === 'income' && (
            <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
              <div className="px-6 py-4 border-b border-black/[0.06]">
                <h2 className="text-lg font-semibold">Income Statement</h2>
                <p className="text-xs text-black">For the period ending {new Date().toLocaleDateString()}</p>
              </div>

              {/* Revenue */}
              <div className="px-6 py-4 border-b border-black/[0.06]">
                <p className="text-sm font-medium text-[var(--av-success)] mb-3">REVENUE</p>
                {accountsByType.find((t) => t.id === 'revenue')?.accounts.map((a) => (
                  <div key={a.id} className="flex justify-between py-1.5 text-sm">
                    <span className="text-black/70">{a.name}</span>
                    <span className="font-mono text-[var(--av-success)]">{a.opening_balance?.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 mt-2 border-t border-black/10 font-medium text-[var(--av-success)]">
                  <span>Total Revenue</span>
                  <span className="font-mono">{revenue.toLocaleString()}</span>
                </div>
              </div>

              {/* Expenses */}
              <div className="px-6 py-4 border-b border-black/[0.06]">
                <p className="text-sm font-medium text-[var(--av-danger)] mb-3">EXPENSES</p>
                {accountsByType.find((t) => t.id === 'expense')?.accounts.map((a) => (
                  <div key={a.id} className="flex justify-between py-1.5 text-sm">
                    <span className="text-black/70">{a.name}</span>
                    <span className="font-mono text-[var(--av-danger)]">{a.opening_balance?.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 mt-2 border-t border-black/10 font-medium text-[var(--av-danger)]">
                  <span>Total Expenses</span>
                  <span className="font-mono">{expenses.toLocaleString()}</span>
                </div>
              </div>

              {/* Net Income */}
              <div className="px-6 py-4 bg-[var(--av-success-soft)]">
                <div className="flex justify-between font-bold text-lg">
                  <span>NET INCOME</span>
                  <span className="font-mono text-[var(--av-success)]">{(revenue - expenses).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Account Modal */}
      {showNewAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b border-black/[0.06] flex items-center justify-between">
              <h2 className="font-semibold">New Account</h2>
              <button onClick={() => setShowNewAccount(false)} className="p-2 hover:bg-black/[0.05] rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Account Code</label>
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="e.g., 1100"
                  className="w-full px-4 py-2 rounded-xl border border-black/10"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Account Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Cash"
                  className="w-full px-4 py-2 rounded-xl border border-black/10"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as Account['type'])}
                  className="w-full px-4 py-2 rounded-xl border border-black/10"
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Opening Balance</label>
                <input
                  value={newOpening}
                  onChange={(e) => setNewOpening(e.target.value)}
                  type="number"
                  className="w-full px-4 py-2 rounded-xl border border-black/10"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-3">
              <button onClick={() => setShowNewAccount(false)} className="px-4 py-2 rounded-lg border border-black/10">Cancel</button>
              <button onClick={createAccount} disabled={creating} className="px-4 py-2 rounded-lg bg-[var(--av-primary)] text-white font-medium disabled:opacity-50">{creating ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* New Journal Entry Modal */}
      {showNewEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl my-8">
            <div className="px-6 py-4 border-b border-black/[0.06] flex items-center justify-between">
              <h2 className="font-semibold">New Journal Entry</h2>
              <button onClick={resetEntryForm} className="p-2 hover:bg-black/[0.05] rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium block mb-1">Date</label>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-black/10"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium block mb-1">Description</label>
                  <input
                    value={entryDesc}
                    onChange={(e) => setEntryDesc(e.target.value)}
                    placeholder="Entry description"
                    className="w-full px-4 py-2 rounded-xl border border-black/10"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Journal Lines</label>
                  <button onClick={addLine} className="text-xs text-[var(--av-accent)]">+ Add Line</button>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs text-black font-medium px-1">
                    <span className="col-span-5">Account</span>
                    <span className="col-span-3 text-right">Debit</span>
                    <span className="col-span-3 text-right">Credit</span>
                    <span className="col-span-1"></span>
                  </div>
                  {newEntryLines.map((line, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <select
                        value={line.account_id}
                        onChange={(e) => updateLine(i, 'account_id', e.target.value)}
                        className="col-span-5 px-3 py-2 rounded-lg border border-black/10 text-sm"
                      >
                        <option value="">Select account...</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                        ))}
                      </select>
                      <input
                        value={line.debit}
                        onChange={(e) => updateLine(i, 'debit', e.target.value)}
                        placeholder="0.00"
                        type="number"
                        className="col-span-3 px-3 py-2 rounded-lg border border-black/10 text-sm text-right"
                      />
                      <input
                        value={line.credit}
                        onChange={(e) => updateLine(i, 'credit', e.target.value)}
                        placeholder="0.00"
                        type="number"
                        className="col-span-3 px-3 py-2 rounded-lg border border-black/10 text-sm text-right"
                      />
                      <button
                        onClick={() => removeLine(i)}
                        className="col-span-1 p-2 text-red-400 hover:bg-[var(--av-danger-soft)] rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-black/[0.06]">
                <div className="text-right">
                  <div className="text-sm text-black">Debit: <span className="font-mono">{totalDebit.toFixed(2)}</span></div>
                  <div className="text-sm text-black">Credit: <span className="font-mono">{totalCredit.toFixed(2)}</span></div>
                  {Math.abs(totalDebit - totalCredit) > 0.01 && (
                    <div className="text-xs text-[var(--av-danger)] mt-1">⚠️ Debits must equal credits</div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-3">
              <button onClick={resetEntryForm} className="px-4 py-2 rounded-lg border border-black/10">Cancel</button>
              <button
                onClick={createEntry}
                disabled={Math.abs(totalDebit - totalCredit) > 0.01}
                className="px-4 py-2 rounded-lg bg-[var(--av-primary)] text-white font-medium disabled:opacity-50"
              >
                Create Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
