import { useState, useEffect, useCallback } from 'react'
import {
  Search, Clock, FileText, User, DollarSign, Briefcase,
  Folder, Tag, Bookmark, Filter, X, Plus, Star,
  TrendingUp, Calendar, ChevronRight
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { search, saveSearch, getSavedSearches, type SearchResult, type SavedSearch } from '../lib/auditLogger'
import { supabase } from '../lib/supabase'

const ENTITY_COLORS: Record<string, string> = {
  contacts: 'bg-blue-100 text-blue-600',
  tasks: 'bg-green-100 text-green-600',
  staff: 'bg-purple-100 text-purple-600',
  invoices: 'bg-amber-100 text-amber-600',
  quotes: 'bg-teal-100 text-teal-600',
  projects: 'bg-pink-100 text-pink-600',
  documents: 'bg-indigo-100 text-indigo-600',
  payments: 'bg-emerald-100 text-emerald-600',
  inventory: 'bg-orange-100 text-orange-600',
}

const ENTITY_ICONS: Record<string, any> = {
  contacts: User,
  tasks: FileText,
  staff: Briefcase,
  invoices: DollarSign,
  quotes: FileText,
  projects: Folder,
  documents: Folder,
  payments: DollarSign,
  inventory: Tag,
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [entityFilter, setEntityFilter] = useState<string[]>([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')

  // Load saved searches
  useEffect(() => {
    getSavedSearches().then(data => setSavedSearches(data))
    
    // Load recent searches from localStorage
    try {
      const recent = JSON.parse(localStorage.getItem('recent_searches') || '[]')
      setRecentSearches(recent.slice(0, 5))
    } catch {}
  }, [])

  // Search on submit
  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return
    setLoading(true)

    try {
      const searchResults = await search(searchQuery, entityFilter.length > 0 ? entityFilter : undefined)
      setResults(searchResults)

      // Save to recent searches
      const recent = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 10)
      setRecentSearches(recent)
      localStorage.setItem('recent_searches', JSON.stringify(recent))
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setLoading(false)
    }
  }, [entityFilter, recentSearches])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        handleSearch(query)
      } else {
        setResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, handleSearch])

  async function handleSaveSearch() {
    if (!saveName.trim() || !query.trim()) return

    const savedId = await saveSearch(saveName, 'mixed', { query, entityFilter })
    if (savedId) {
      const data = await getSavedSearches()
      setSavedSearches(data)
      setShowSaveModal(false)
      setSaveName('')
    }
  }

  function loadSavedSearch(saved: SavedSearch) {
    if (saved.filters.query) {
      setQuery(saved.filters.query)
      if (saved.filters.entityFilter) {
        setEntityFilter(saved.filters.entityFilter)
      }
    }
  }

  const entityTypes = [...new Set(results.map(r => r.entityType))]

  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* Search Header */}
      <div className="sticky top-0 bg-white z-10 pb-4 mb-6">
        <div className="relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40" />
          <input
            type="text"
            placeholder="Search everything..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-12 pr-12 py-4 rounded-2xl border border-black/10 text-lg focus:outline-none focus:border-[var(--avenize-primary)]"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-black/5"
            >
              <X size={20} className="text-black/40" />
            </button>
          )}
        </div>

        {/* Entity Filters */}
        {results.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-sm text-black/50 py-1">Filter:</span>
            {entityTypes.map(type => {
              const isActive = entityFilter.includes(type)
              const Icon = ENTITY_ICONS[type] || FileText
              return (
                <button
                  key={type}
                  onClick={() => setEntityFilter(
                    isActive 
                      ? entityFilter.filter(t => t !== type)
                      : [...entityFilter, type]
                  )}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm transition ${
                    isActive 
                      ? 'bg-[var(--avenize-primary)] text-white' 
                      : 'bg-black/5 text-black/60 hover:bg-black/10'
                  }`}
                >
                  <Icon size={12} />
                  {type}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Results / Empty State */}
      {loading ? (
        <div className="text-center py-20">
          <div className="w-12 h-12 mx-auto rounded-full border-4 border-black/10 border-t-[var(--avenize-primary)] animate-spin mb-4" />
          <p className="text-black/50">Searching...</p>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-3">
          {/* Result Actions */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-black/50">
              {results.length} results{entityFilter.length > 0 && ` in ${entityFilter.join(', ')}`}
            </span>
            <button
              onClick={() => setShowSaveModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/5 text-sm hover:bg-black/10"
            >
              <Bookmark size={14} />
              Save Search
            </button>
          </div>

          {/* Results List */}
          {results.map((result) => {
            const Icon = ENTITY_ICONS[result.entityType] || FileText
            const colorClass = ENTITY_COLORS[result.entityType] || 'bg-gray-100 text-gray-600'

            return (
              <button
                key={result.id}
                onClick={() => {
                  // Navigate to the entity
                  const routeMap: Record<string, string> = {
                    contacts: `/app/crm?contact=${result.entityId}`,
                    tasks: `/app/tasks?id=${result.entityId}`,
                    staff: `/app/people?staff=${result.entityId}`,
                    invoices: `/app/finance?id=${result.entityId}`,
                    projects: `/app/projects?id=${result.entityId}`,
                    documents: `/app/documents?id=${result.entityId}`,
                  }
                  navigate(routeMap[result.entityType] || '/app')
                }}
                className="w-full p-4 bg-white rounded-xl border border-black/[0.06] hover:border-[var(--avenize-primary)] hover:shadow-lg transition text-left"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg ${colorClass} flex items-center justify-center shrink-0`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 rounded bg-black/5 text-black/50 uppercase">
                        {result.entityType}
                      </span>
                      {result.rank > 0.8 && (
                        <span className="flex items-center gap-1 text-xs text-amber-500">
                          <Star size={10} className="fill-amber-500" />
                          Relevant
                        </span>
                      )}
                    </div>
                    <div className="font-medium">{result.title}</div>
                    <div className="text-sm text-black/50 line-clamp-2 mt-1">
                      {result.content?.slice(0, 150)}...
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-black/30 shrink-0 mt-3" />
                </div>
              </button>
            )
          })}
        </div>
      ) : query.trim() ? (
        <div className="text-center py-20">
          <Search size={48} className="mx-auto text-black/20 mb-4" />
          <h3 className="text-lg font-medium mb-2">No results found</h3>
          <p className="text-black/50">Try different keywords or check your filters</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Saved Searches */}
          {savedSearches.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-black/50 mb-3 flex items-center gap-2">
                <Bookmark size={14} />
                Saved Searches
              </h3>
              <div className="space-y-2">
                {savedSearches.map(saved => (
                  <button
                    key={saved.id}
                    onClick={() => loadSavedSearch(saved)}
                    className="w-full p-3 rounded-xl bg-black/[0.02] hover:bg-black/[0.05] transition text-left flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium">{saved.name}</div>
                      <div className="text-xs text-black/40">
                        Used {saved.use_count} times
                      </div>
                    </div>
                    <Tag size={14} className="text-black/30" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-black/50 mb-3 flex items-center gap-2">
                <Clock size={14} />
                Recent Searches
              </h3>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(term)}
                    className="px-3 py-1.5 rounded-full bg-black/[0.02] hover:bg-black/[0.05] text-sm transition"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-medium text-black/50 mb-3">Quick Access</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: User, label: 'Contacts', color: 'bg-blue-50 text-blue-500' },
                { icon: FileText, label: 'Tasks', color: 'bg-green-50 text-green-500' },
                { icon: DollarSign, label: 'Invoices', color: 'bg-amber-50 text-amber-500' },
                { icon: Folder, label: 'Projects', color: 'bg-pink-50 text-pink-500' },
                { icon: Briefcase, label: 'Staff', color: 'bg-purple-50 text-purple-500' },
                { icon: Tag, label: 'Inventory', color: 'bg-orange-50 text-orange-500' },
                { icon: Calendar, label: 'Calendar', color: 'bg-teal-50 text-teal-500' },
                { icon: TrendingUp, label: 'Reports', color: 'bg-indigo-50 text-indigo-500' },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const routes: Record<string, string> = {
                      Contacts: '/app/crm',
                      Tasks: '/app/tasks',
                      Invoices: '/app/finance',
                      Projects: '/app/projects',
                      Staff: '/app/people',
                      Inventory: '/app/inventory',
                      Calendar: '/app/calendar',
                      Reports: '/app/reports',
                    }
                    navigate(routes[item.label] || '/app')
                  }}
                  className={`p-4 rounded-xl ${item.color} flex flex-col items-center gap-2`}
                >
                  <item.icon size={24} />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save Search Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-4">Save Search</h2>
            <input
              type="text"
              placeholder="Search name..."
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-black/10 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSearch}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--avenize-primary)] text-white font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
