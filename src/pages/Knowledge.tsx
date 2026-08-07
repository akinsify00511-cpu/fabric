import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Book, Plus, Search, ChevronRight, ChevronDown, FileText, Folder,
  MoreHorizontal, Trash2, Edit3, Eye, Copy, ArrowLeft, Save, Clock,
  User, Home
} from 'lucide-react'

type KBSpace = {
  id: string
  name: string
  description: string | null
  icon_emoji: string
  is_default: boolean
}

type KBPage = {
  id: string
  space_id: string
  parent_id: string | null
  title: string
  content: any | null
  icon_emoji: string | null
  slug: string | null
  is_published: boolean
  is_archived: boolean
  created_by: string
  updated_at: string
  depth?: number
  children?: KBPage[]
}

// Demo data
const DEMO_SPACES: KBSpace[] = [
  { id: '1', name: 'Getting Started', description: 'Onboarding guides and tutorials', icon_emoji: '🚀', is_default: true },
  { id: '2', name: 'Product Documentation', description: 'Feature guides and how-tos', icon_emoji: '📖', is_default: false },
  { id: '3', name: 'Company Policies', description: 'Internal policies and procedures', icon_emoji: '📋', is_default: false },
]

const DEMO_PAGES: KBPage[] = [
  { id: 'p1', space_id: '1', parent_id: null, title: 'Welcome to Avenize', content: 'Welcome! This guide will help you get started...', icon_emoji: '👋', slug: 'welcome', is_published: true, is_archived: false, created_by: 'admin', updated_at: new Date().toISOString() },
  { id: 'p2', space_id: '1', parent_id: 'p1', title: 'Setting up your workspace', content: 'Learn how to configure your workspace...', icon_emoji: null, slug: 'setup', is_published: true, is_archived: false, created_by: 'admin', updated_at: new Date().toISOString() },
  { id: 'p3', space_id: '1', parent_id: 'p1', title: 'Inviting team members', content: 'Add your team to collaborate...', icon_emoji: null, slug: 'invite', is_published: true, is_archived: false, created_by: 'admin', updated_at: new Date().toISOString() },
  { id: 'p4', space_id: '2', parent_id: null, title: 'CRM Basics', content: 'Learn about the CRM module...', icon_emoji: '📊', slug: 'crm-basics', is_published: true, is_archived: false, created_by: 'admin', updated_at: new Date().toISOString() },
  { id: 'p5', space_id: '2', parent_id: null, title: 'Invoicing Guide', content: 'How to create and send invoices...', icon_emoji: '💰', slug: 'invoicing', is_published: true, is_archived: false, created_by: 'admin', updated_at: new Date().toISOString() },
]

export default function Knowledge() {
  const { staff, isDemo } = useAuth()
  const { showToast } = useToast()
  const [spaces, setSpaces] = useState<KBSpace[]>([])
  const [selectedSpace, setSelectedSpace] = useState<KBSpace | null>(null)
  const [pages, setPages] = useState<KBPage[]>([])
  const [selectedPage, setSelectedPage] = useState<KBPage | null>(null)
  const [editingPage, setEditingPage] = useState<KBPage | null>(null)
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<KBPage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showNewPage, setShowNewPage] = useState(false)
  const [newPageTitle, setNewPageTitle] = useState('')
  const [newPageParent, setNewPageParent] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [history, setHistory] = useState<{ title: string; content: any }[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Build nested page tree
  const buildTree = (pages: KBPage[]): KBPage[] => {
    const map = new Map<string, KBPage>()
    const roots: KBPage[] = []

    pages.forEach((p) => map.set(p.id, { ...p, children: [] }))
    pages.forEach((p) => {
      const node = map.get(p.id)!
      if (p.parent_id && map.has(p.parent_id)) {
        map.get(p.parent_id)!.children!.push(node)
      } else {
        roots.push(node)
      }
    })

    return roots
  }

  const loadSpaces = async () => {
    if (isDemo) {
      setSpaces(DEMO_SPACES)
      if (!selectedSpace) setSelectedSpace(DEMO_SPACES[0])
      return
    }
    try {
      const { data } = await supabase.from('kb_spaces').select('*').order('is_default', { ascending: false })
      if (data && data.length > 0) {
        setSpaces(data as KBSpace[])
        if (!selectedSpace) setSelectedSpace(data[0] as KBSpace)
      } else {
        setSpaces(DEMO_SPACES)
        if (!selectedSpace) setSelectedSpace(DEMO_SPACES[0])
      }
    } catch {
      setSpaces(DEMO_SPACES)
      if (!selectedSpace) setSelectedSpace(DEMO_SPACES[0])
    }
  }

  const loadPages = async (spaceId: string) => {
    if (isDemo) {
      const spacePages = DEMO_PAGES.filter(p => p.space_id === spaceId)
      const tree = buildTree(spacePages)
      setPages(tree)
      setLoading(false)
      return
    }
    try {
      const { data } = await supabase
        .from('kb_pages')
        .select('*')
        .eq('space_id', spaceId)
        .eq('is_archived', false)
        .order('created_at')

      if (data && data.length > 0) {
        const tree = buildTree(data as KBPage[])
        setPages(tree)
      } else {
        const spacePages = DEMO_PAGES.filter(p => p.space_id === spaceId)
        const tree = buildTree(spacePages)
        setPages(tree)
      }
    } catch {
      const spacePages = DEMO_PAGES.filter(p => p.space_id === spaceId)
      const tree = buildTree(spacePages)
      setPages(tree)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadSpaces()
  }, [])

  useEffect(() => {
    if (selectedSpace) {
      setLoading(true)
      loadPages(selectedSpace.id)
    }
  }, [selectedSpace?.id])

  const selectPage = async (page: KBPage) => {
    // Save current edits if any
    if (editingPage) {
      await savePage()
    }

    setSelectedPage(page)
    setEditingPage({ ...page })

    // Load content if needed
    if (!page.content) {
      const { data } = await supabase.from('kb_pages').select('content').eq('id', page.id).single()
      if (data) {
        setEditingPage((prev) => prev ? { ...prev, content: data.content } : null)
      }
    }

    // Load history
    const { data: versions } = await supabase
      .from('kb_page_versions')
      .select('title, content')
      .eq('page_id', page.id)
      .order('version_number', { ascending: false })
      .limit(10)
    setHistory((versions as any[]) ?? [])
  }

  const savePage = async () => {
    if (!editingPage) return
    setSaving(true)

    const { error } = await supabase
      .from('kb_pages')
      .update({
        title: editingPage.title,
        content: editingPage.content,
        last_edited_by: staff?.id,
      })
      .eq('id', editingPage.id)

    if (error) {
      showToast('Failed to save', 'error')
    } else {
      showToast('Saved!', 'success')
      // Save version
      const versionCount = history.length + 1
      await supabase.from('kb_page_versions').insert({
        page_id: editingPage.id,
        title: editingPage.title,
        content: editingPage.content,
        version_number: versionCount,
        created_by: staff?.id,
      })
      setHistory((prev) => [{ title: editingPage.title, content: editingPage.content }, ...prev].slice(0, 10))
    }
    setSaving(false)
  }

  const createPage = async () => {
    if (!newPageTitle.trim() || !selectedSpace) return

    const { data, error } = await supabase
      .from('kb_pages')
      .insert({
        space_id: selectedSpace.id,
        parent_id: newPageParent,
        title: newPageTitle,
        icon_emoji: '📄',
        created_by: staff?.id,
        last_edited_by: staff?.id,
      })
      .select()
      .single()

    if (error) {
      showToast('Failed to create page', 'error')
    } else {
      showToast('Page created!', 'success')
      setNewPageTitle('')
      setNewPageParent(null)
      setShowNewPage(false)
      await loadPages(selectedSpace.id)
      selectPage(data as KBPage)
    }
  }

  const deletePage = async (pageId: string) => {
    if (!confirm('Archive this page?')) return
    await supabase.from('kb_pages').update({ is_archived: true }).eq('id', pageId)
    showToast('Page archived', 'info')
    if (selectedPage?.id === pageId) {
      setSelectedPage(null)
      setEditingPage(null)
    }
    if (selectedSpace) await loadPages(selectedSpace.id)
  }

  const duplicatePage = async (page: KBPage) => {
    const { data, error } = await supabase
      .from('kb_pages')
      .insert({
        space_id: page.space_id,
        parent_id: page.parent_id,
        title: `${page.title} (copy)`,
        content: page.content,
        icon_emoji: page.icon_emoji,
        created_by: staff?.id,
        last_edited_by: staff?.id,
      })
      .select()
      .single()

    if (!error && selectedSpace) {
      await loadPages(selectedSpace.id)
      showToast('Page duplicated!', 'success')
    }
  }

  const searchPages = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const { data } = await supabase
      .from('kb_pages')
      .select('*, kb_spaces(name)')
      .ilike('title', `%${query}%`)
      .eq('is_archived', false)
      .limit(20)
    setSearchResults((data as KBPage[]) ?? [])
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => searchPages(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery, searchPages])

  const toggleExpand = (pageId: string) => {
    setExpandedPages((prev) => {
      const next = new Set(prev)
      if (next.has(pageId)) next.delete(pageId)
      else next.add(pageId)
      return next
    })
  }

  const renderPageTree = (pages: KBPage[], depth = 0) => {
    return pages.map((page) => (
      <div key={page.id}>
        <button
          onClick={() => selectPage(page)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition ${
            selectedPage?.id === page.id
              ? 'bg-[var(--avenize-accent-end)]/10 text-[var(--avenize-accent-end)]'
              : 'hover:bg-black/[0.02] text-black/60'
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {page.children && page.children.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(page.id) }}
              className="p-0.5 hover:bg-black/[0.05] rounded"
            >
              {expandedPages.has(page.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
          {page.icon_emoji ? (
            <span className="text-sm">{page.icon_emoji}</span>
          ) : (
            <FileText size={14} className="text-black/30" />
          )}
          <span className="truncate flex-1 text-left">{page.title || 'Untitled'}</span>
          {page.children && page.children.length > 0 && (
            <span className="text-xs text-black/30">{page.children.length}</span>
          )}
        </button>
        {expandedPages.has(page.id) && page.children && (
          <div>{renderPageTree(page.children, depth + 1)}</div>
        )}
      </div>
    ))
  }

  return (
    <div className="flex h-[calc(100vh-140px)] md:h-[calc(100vh-80px)]">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-white border-r border-black/[0.06] flex flex-col transition-all overflow-hidden`}>
        {/* Search */}
        <div className="p-3 border-b border-black/[0.06]">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search pages..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-black/10 focus:outline-none focus:ring-2 focus:ring-[var(--avenize-accent-end)]/30"
            />
          </div>
        </div>

        {/* Spaces */}
        <div className="border-b border-black/[0.06]">
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-medium text-black/40 uppercase tracking-wide">Spaces</span>
            <button
              onClick={async () => {
                const name = prompt('Space name:')
                if (!name?.trim()) return
                const icon = prompt('Icon emoji (default: 📁):') || '📁'
                if (isDemo) {
                  const newSpace = { id: `space-${Date.now()}`, name, icon_emoji: icon, is_default: false, description: '' }
                  setSpaces([...spaces, newSpace])
                  showToast('Space created', 'success')
                } else {
                  const { error } = await supabase.from('kb_spaces').insert({
                    name,
                    icon_emoji: icon,
                    business_id: staff?.business_id,
                  })
                  if (error) {
                    showToast('Failed to create space', 'error')
                  } else {
                    loadSpaces()
                    showToast('Space created', 'success')
                  }
                }
              }}
              className="p-1 hover:bg-black/[0.05] rounded text-black/30 hover:text-black/50"
            >
              <Plus size={14} />
            </button>
          </div>
          {spaces.map((space) => (
            <button
              key={space.id}
              onClick={() => setSelectedSpace(space)}
              className={`w-full px-3 py-2 flex items-center gap-2 text-sm transition ${
                selectedSpace?.id === space.id
                  ? 'bg-[var(--avenize-accent-end)]/10 text-[var(--avenize-accent-end)]'
                  : 'hover:bg-black/[0.02] text-black/60'
              }`}
            >
              <span>{space.icon_emoji}</span>
              <span className="truncate">{space.name}</span>
            </button>
          ))}
        </div>

        {/* Pages Tree */}
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-medium text-black/40 uppercase tracking-wide">Pages</span>
            <button
              onClick={() => setShowNewPage(true)}
              className="p-1 hover:bg-black/[0.05] rounded text-black/30 hover:text-black/50"
            >
              <Plus size={14} />
            </button>
          </div>
          {loading ? (
            <div className="px-3 py-4 text-xs text-black/30 text-center">Loading...</div>
          ) : pages.length === 0 ? (
            <div className="px-3 py-4 text-xs text-black/30 text-center">
              No pages yet.<br />Create your first page!
            </div>
          ) : (
            renderPageTree(pages)
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--avenize-offwhite)]">
        {searchQuery ? (
          /* Search Results */
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-sm font-medium text-black/40 mb-4">Search results for "{searchQuery}"</h2>
            {searchResults.length === 0 ? (
              <p className="text-sm text-black/40">No pages found</p>
            ) : (
              <div className="space-y-2">
                {searchResults.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => {
                      setSearchQuery('')
                      const space = spaces.find((s) => s.id === page.space_id)
                      if (space) setSelectedSpace(space)
                      selectPage(page)
                    }}
                    className="w-full text-left bg-white rounded-xl p-4 border border-black/[0.06] hover:border-black/[0.12] transition"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {page.icon_emoji && <span>{page.icon_emoji}</span>}
                      <span className="font-medium text-gray-900">{page.title}</span>
                    </div>
                    <p className="text-xs text-black/40">in {(page as any).kb_spaces?.name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : selectedPage && editingPage ? (
          /* Page Editor */
          <div className="flex-1 flex flex-col">
            {/* Toolbar */}
            <div className="px-6 py-3 bg-white border-b border-black/[0.06] flex items-center gap-2">
              <button
                onClick={() => { setSelectedPage(null); setEditingPage(null) }}
                className="p-2 hover:bg-black/[0.05] rounded-lg text-black/40 hover:text-black/60 md:hidden"
              >
                <ArrowLeft size={18} />
              </button>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-black/[0.05] rounded-lg text-black/40 hover:text-black/60 hidden md:block"
              >
                <Book size={18} />
              </button>
              <div className="flex-1" />
              <button
                onClick={() => duplicatePage(selectedPage)}
                className="p-2 hover:bg-black/[0.05] rounded-lg text-black/40 hover:text-black/60"
                title="Duplicate"
              >
                <Copy size={16} />
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className="p-2 hover:bg-black/[0.05] rounded-lg text-black/40 hover:text-black/60"
                title="History"
              >
                <Clock size={16} />
              </button>
              <button
                onClick={() => deletePage(selectedPage.id)}
                className="p-2 hover:bg-red-50 rounded-lg text-red-400"
                title="Archive"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={savePage}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-y-auto px-6 py-8">
              <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-black/[0.06] p-8 shadow-sm">
                {/* Title */}
                <input
                  value={editingPage.title}
                  onChange={(e) => setEditingPage((prev) => prev ? { ...prev, title: e.target.value } : null)}
                  placeholder="Untitled"
                  className="w-full text-3xl font-bold text-gray-900 mb-8 border-none outline-none placeholder:text-black/20"
                />

                {/* Simple Editor UI */}
                <div className="space-y-4">
                  {/* Toolbar */}
                  <div className="flex items-center gap-1 pb-4 border-b border-black/[0.06]">
                    {[
                      { label: 'H1', action: () => {} },
                      { label: 'H2', action: () => {} },
                      { label: 'H3', action: () => {} },
                      { label: '—', action: () => {} },
                      { label: '•', action: () => {} },
                      { label: '1.', action: () => {} },
                      { label: '—', action: () => {} },
                      { label: 'B', bold: true, action: () => {} },
                      { label: 'I', italic: true, action: () => {} },
                      { label: '🔗', action: () => {} },
                    ].map((item, i) => (
                      <button
                        key={i}
                        onClick={item.action}
                        className={`w-8 h-8 flex items-center justify-center text-sm rounded hover:bg-black/[0.05] ${
                          item.bold ? 'font-bold' : item.italic ? 'italic' : ''
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {/* Content Area */}
                  <textarea
                    value={editingPage.content?.content?.[0]?.content?.[0]?.text || ''}
                    onChange={(e) => {
                      const newContent = {
                        type: 'doc',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: e.target.value }],
                          },
                        ],
                      }
                      setEditingPage((prev) => prev ? { ...prev, content: newContent } : null)
                    }}
                    placeholder="Start writing, or type '/' for commands..."
                    className="w-full min-h-[400px] text-base text-black/80 resize-none outline-none placeholder:text-black/30"
                  />
                </div>

                {/* Meta */}
                <div className="mt-8 pt-4 border-t border-black/[0.06] flex items-center gap-4 text-xs text-black/40">
                  <span className="flex items-center gap-1">
                    <User size={12} />
                    Last edited {new Date(selectedPage.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Welcome / Empty State */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 rounded-2xl avenize-gradient flex items-center justify-center text-white text-3xl mx-auto mb-6">
                📚
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Knowledge Base</h2>
              <p className="text-sm text-black/50 mb-6">
                Your team's documentation hub. Create pages, organize with spaces, and keep everything in one place.
              </p>
              <button
                onClick={() => setShowNewPage(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium hover:opacity-90 transition"
              >
                <Plus size={16} />
                Create your first page
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Page Modal */}
      {showNewPage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create new page</h3>
            <input
              value={newPageTitle}
              onChange={(e) => setNewPageTitle(e.target.value)}
              placeholder="Page title"
              className="w-full px-4 py-3 rounded-xl border border-black/10 mb-3 focus:outline-none focus:ring-2 focus:ring-[var(--avenize-accent-end)]/30"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createPage()}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowNewPage(false); setNewPageTitle(''); setNewPageParent(null) }}
                className="flex-1 px-4 py-2 rounded-lg border border-black/10 text-sm hover:bg-black/[0.02]"
              >
                Cancel
              </button>
              <button
                onClick={createPage}
                className="flex-1 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium hover:opacity-90"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed right-0 top-0 bottom-0 w-80 bg-white border-l border-black/[0.06] shadow-xl z-50 flex flex-col">
          <div className="px-4 py-3 border-b border-black/[0.06] flex items-center justify-between">
            <h3 className="font-medium">Page History</h3>
            <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-black/[0.05] rounded">
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {history.length === 0 ? (
              <p className="text-sm text-black/40 text-center py-8">No history yet</p>
            ) : (
              history.map((v, i) => (
                <div key={i} className="p-3 rounded-xl bg-black/[0.02]">
                  <p className="text-sm font-medium text-gray-900">{v.title}</p>
                  <p className="text-xs text-black/40 mt-1">Version {history.length - i}</p>
                  <button
                    onClick={() => {
                      setEditingPage((prev) => prev ? { ...prev, content: v.content } : null)
                      setShowHistory(false)
                    }}
                    className="text-xs text-[var(--avenize-accent-end)] mt-2"
                  >
                    Restore this version
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
