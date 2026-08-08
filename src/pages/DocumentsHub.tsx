import { useState, useEffect } from 'react'
import { 
  Folder, File, FileText, Image, FileSpreadsheet, Upload,
  Download, Search, Filter, MoreVertical, Trash2, Edit,
  Copy, Share2, Eye, FolderPlus, Grid, List, Clock, Star
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'

interface Document {
  id: string
  name: string
  type: string
  size: number
  folder_id: string | null
  url: string
  mime_type: string
  is_starred: boolean
  created_at: string
  updated_at: string
}

interface FolderItem {
  id: string
  name: string
  parent_id: string | null
  created_at: string
}

const FILE_ICONS: Record<string, React.ElementType> = {
  'folder': Folder,
  'pdf': FileText,
  'doc': FileText,
  'docx': FileText,
  'xls': FileSpreadsheet,
  'xlsx': FileSpreadsheet,
  'csv': FileSpreadsheet,
  'png': Image,
  'jpg': Image,
  'jpeg': Image,
  'gif': Image,
  'default': File,
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function DocumentsHub() {
  const { staff } = useAuth()
  const [documents, setDocuments] = useState<Document[]>([])
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([])

  useEffect(() => {
    fetchDocuments()
    fetchFolders()
  }, [staff, currentFolder])

  const fetchDocuments = async () => {
    if (!staff?.business_id) return
    
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('business_id', staff.business_id)
        .is('folder_id', currentFolder ? undefined : null)
        .order('is_starred', { ascending: false })
        .order('updated_at', { ascending: false })

      if (error) {
        // Use demo data if table doesn't exist
        setDocuments(getDemoDocuments())
      } else {
        setDocuments(data || [])
      }
    } catch (error) {
      setDocuments(getDemoDocuments())
    } finally {
      setLoading(false)
    }
  }

  const fetchFolders = async () => {
    if (!staff?.business_id) return
    
    try {
      const { data, error } = await supabase
        .from('document_folders')
        .select('*')
        .eq('business_id', staff.business_id)
        .is('parent_id', currentFolder ? undefined : null)
        .order('name')

      if (error) {
        setFolders(getDemoFolders())
      } else {
        setFolders(data || [])
      }
    } catch (error) {
      setFolders(getDemoFolders())
    }
  }

  const getDemoDocuments = (): Document[] => [
    {
      id: '1',
      name: 'Annual Report 2024.pdf',
      type: 'pdf',
      size: 2457600,
      folder_id: null,
      url: '/docs/annual-report.pdf',
      mime_type: 'application/pdf',
      is_starred: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '2',
      name: 'Employee Handbook.docx',
      type: 'docx',
      size: 524288,
      folder_id: null,
      url: '/docs/handbook.docx',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      is_starred: false,
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '3',
      name: 'Q4 Financials.xlsx',
      type: 'xlsx',
      size: 1048576,
      folder_id: null,
      url: '/docs/q4-financials.xlsx',
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      is_starred: true,
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '4',
      name: 'Office Photos.zip',
      type: 'zip',
      size: 15728640,
      folder_id: null,
      url: '/docs/office-photos.zip',
      mime_type: 'application/zip',
      is_starred: false,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]

  const getDemoFolders = (): FolderItem[] => [
    {
      id: 'f1',
      name: 'Contracts',
      parent_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'f2',
      name: 'HR Documents',
      parent_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'f3',
      name: 'Marketing',
      parent_id: null,
      created_at: new Date().toISOString(),
    },
  ]

  const getFileIcon = (type: string) => {
    return FILE_ICONS[type] || FILE_ICONS.default
  }

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staff?.business_id || !newFolderName.trim()) return

    try {
      const newFolder = {
        name: newFolderName,
        business_id: staff.business_id,
        parent_id: currentFolder,
      }

      try {
        const { error } = await supabase
          .from('document_folders')
          .insert([newFolder])

        if (error) throw error
      } catch (dbError) {
        console.warn('DB insert failed:', dbError)
        setFolders(prev => [...prev, { ...newFolder, id: Date.now().toString(), created_at: new Date().toISOString() } as FolderItem])
      }

      setShowNewFolderModal(false)
      setNewFolderName('')
      fetchFolders()
    } catch (error) {
      console.error('Error creating folder:', error)
    }
  }

  const toggleStar = async (docId: string) => {
    setDocuments(prev => prev.map(d => 
      d.id === docId ? { ...d, is_starred: !d.is_starred } : d
    ))
  }

  const toggleSelect = (docId: string) => {
    setSelectedDocuments(prev => 
      prev.includes(docId) 
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    )
  }

  const navigateToFolder = (folderId: string | null) => {
    setCurrentFolder(folderId)
    setSelectedDocuments([])
  }

  const filteredItems = [...folders, ...documents].filter(item => {
    if ('name' in item) {
      return item.name.toLowerCase().includes(searchQuery.toLowerCase())
    }
    return false
  })

  const stats = {
    totalDocs: documents.length,
    folders: folders.length,
    starred: documents.filter(d => d.is_starred).length,
    totalSize: documents.reduce((acc, d) => acc + d.size, 0),
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Documents</h1>
          <p className="text-sm text-black/60 mt-1">
            Manage your business documents and files
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewFolderModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-black/10 rounded-xl font-medium hover:bg-black/5 transition"
          >
            <FolderPlus size={18} />
            New Folder
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#4285F4] text-white rounded-xl font-medium hover:bg-[#3367D6] transition"
          >
            <Upload size={18} />
            Upload
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      {currentFolder && (
        <div className="flex items-center gap-2 mb-4 text-sm">
          <button
            onClick={() => navigateToFolder(null)}
            className="text-[#4285F4] hover:underline"
          >
            All Documents
          </button>
          <span className="text-black/40">/</span>
          <span className="text-black/60">Current Folder</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#4285F4]/10 flex items-center justify-center">
              <File size={20} className="text-[#4285F4]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalDocs}</p>
              <p className="text-xs text-black/60">Documents</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#8B5CF6]/10 flex items-center justify-center">
              <Folder size={20} className="text-[#8B5CF6]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.folders}</p>
              <p className="text-xs text-black/60">Folders</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FBBC05]/10 flex items-center justify-center">
              <Star size={20} className="text-[#FBBC05]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.starred}</p>
              <p className="text-xs text-black/60">Starred</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#34A853]/10 flex items-center justify-center">
              <Download size={20} className="text-[#34A853]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatFileSize(stats.totalSize)}</p>
              <p className="text-xs text-black/60">Total Size</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & View */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[#4285F4] transition"
            />
          </div>
          <div className="flex items-center gap-1 bg-[#F8F9FA] rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition ${viewMode === 'grid' ? 'bg-white shadow-sm' : ''}`}
            >
              <Grid size={18} className={viewMode === 'grid' ? 'text-[#4285F4]' : 'text-black/40'} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition ${viewMode === 'list' ? 'bg-white shadow-sm' : ''}`}
            >
              <List size={18} className={viewMode === 'list' ? 'text-[#4285F4]' : 'text-black/40'} />
            </button>
          </div>
        </div>
      </div>

      {/* Documents Grid/List */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={File}
          title="No documents"
          description={searchQuery ? "Try a different search" : "Upload your first document or create a folder"}
          action={{
            label: "Upload Document",
            onClick: () => setShowUploadModal(true)
          }}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-4 gap-4">
          {/* Folders */}
          {folders.map(folder => {
              return (
              <div
                key={folder.id}
                onClick={() => navigateToFolder(folder.id)}
                className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="w-12 h-12 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center">
                    <Folder size={24} className="text-[#8B5CF6]" />
                  </div>
                  <button className="p-1 opacity-0 group-hover:opacity-100 transition">
                    <MoreVertical size={16} className="text-black/40" />
                  </button>
                </div>
                <h3 className="font-medium text-black truncate">{folder.name}</h3>
                <p className="text-xs text-black/60 mt-1">Folder</p>
              </div>
              )
          })}
          {/* Documents */}
          {documents.map(doc => {
            const Icon = getFileIcon(doc.type)
            return (
              <div
                key={doc.id}
                className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="w-12 h-12 rounded-xl bg-[#4285F4]/10 flex items-center justify-center">
                    <Icon size={24} className="text-[#4285F4]" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleStar(doc.id) }}
                      className="p-1 opacity-0 group-hover:opacity-100 transition"
                    >
                      <Star size={16} className={doc.is_starred ? 'text-[#FBBC05] fill-[#FBBC05]' : 'text-black/40'} />
                    </button>
                    <button className="p-1 opacity-0 group-hover:opacity-100 transition">
                      <MoreVertical size={16} className="text-black/40" />
                    </button>
                  </div>
                </div>
                <h3 className="font-medium text-black truncate" title={doc.name}>{doc.name}</h3>
                <div className="flex items-center gap-2 mt-1 text-xs text-black/60">
                  <span>{formatFileSize(doc.size)}</span>
                  <span>•</span>
                  <span>{formatDate(doc.updated_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#F8F9FA]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase w-8">
                  <input type="checkbox" className="rounded" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Modified</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-black/60 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {folders.map(folder => (
                <tr key={folder.id} className="hover:bg-[#F8F9FA]/50 transition cursor-pointer" onClick={() => navigateToFolder(folder.id)}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Folder size={20} className="text-[#8B5CF6]" />
                      <span className="font-medium text-black">{folder.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-black/60">—</td>
                  <td className="px-4 py-3 text-sm text-black/60">{formatDate(folder.created_at)}</td>
                  <td className="px-4 py-3">
                    <button className="p-2 hover:bg-black/5 rounded-lg transition">
                      <MoreVertical size={16} className="text-black/60" />
                    </button>
                  </td>
                </tr>
              ))}
              {documents.map(doc => {
                const Icon = getFileIcon(doc.type)
                return (
                  <tr key={doc.id} className="hover:bg-[#F8F9FA]/50 transition">
                    <td className="px-4 py-3">
                      <input 
                        type="checkbox" 
                        className="rounded"
                        checked={selectedDocuments.includes(doc.id)}
                        onChange={() => toggleSelect(doc.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Icon size={20} className="text-[#4285F4]" />
                        <span className="font-medium text-black">{doc.name}</span>
                        {doc.is_starred && <Star size={14} className="text-[#FBBC05] fill-[#FBBC05]" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-black/60">{formatFileSize(doc.size)}</td>
                    <td className="px-4 py-3 text-sm text-black/60">{formatDate(doc.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-2 hover:bg-black/5 rounded-lg transition">
                          <Eye size={16} className="text-black/60" />
                        </button>
                        <button className="p-2 hover:bg-black/5 rounded-lg transition">
                          <Download size={16} className="text-black/60" />
                        </button>
                        <button className="p-2 hover:bg-black/5 rounded-lg transition">
                          <MoreVertical size={16} className="text-black/60" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New Folder Modal */}
      <Modal
        isOpen={showNewFolderModal}
        onClose={() => {
          setShowNewFolderModal(false)
          setNewFolderName('')
        }}
        title="Create New Folder"
      >
        <form onSubmit={handleCreateFolder} className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Folder Name</label>
            <input
              type="text"
              required
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[#4285F4] transition"
              placeholder="e.g., Contracts 2025"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowNewFolderModal(false)}
              className="flex-1 px-4 py-2 border border-black/10 rounded-xl font-medium hover:bg-black/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-[#4285F4] text-white rounded-xl font-medium hover:bg-[#3367D6] transition"
            >
              Create
            </button>
          </div>
        </form>
      </Modal>

      {/* Upload Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Upload Documents"
      >
        <div className="p-6">
          <div className="border-2 border-dashed border-[#4285F4]/30 rounded-xl p-8 text-center hover:border-[#4285F4]/50 transition cursor-pointer">
            <Upload size={48} className="mx-auto text-[#4285F4] mb-4" />
            <p className="font-medium text-black mb-2">Drop files here or click to upload</p>
            <p className="text-sm text-black/60">Supports PDF, DOC, DOCX, XLS, XLSX, PNG, JPG up to 50MB</p>
          </div>
          <button
            onClick={() => setShowUploadModal(false)}
            className="w-full mt-4 px-4 py-2 border border-black/10 rounded-xl font-medium hover:bg-black/5 transition"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  )
}
