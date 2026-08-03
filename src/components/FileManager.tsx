import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Upload, File, Image, Film, Music, Archive, FileText, Trash2,
  Download, Share2, Eye, Search, Grid, List, FolderOpen, X, Copy, ExternalLink
} from 'lucide-react'

type FileAttachment = {
  id: string
  filename: string
  original_filename: string
  file_size: number
  mime_type: string
  storage_path: string
  category: string
  tags: string[]
  is_public: boolean
  download_count: number
  created_at: string
  uploader_name?: string
}

const CATEGORY_ICONS: Record<string, any> = {
  image: Image,
  video: Film,
  audio: Music,
  document: FileText,
  archive: Archive,
  general: File,
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export default function FileManager({ onSelect }: { onSelect?: (file: FileAttachment) => void }) {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<FileAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [selectedFile, setSelectedFile] = useState<FileAttachment | null>(null)
  const [dragging, setDragging] = useState(false)

  const loadFiles = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('file_attachments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    setFiles((data as FileAttachment[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadFiles()
  }, [])

  const getCategory = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document'
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return 'archive'
    return 'general'
  }

  const uploadFile = async (file: File) => {
    if (!staff) return

    setUploading(true)
    const ext = file.name.split('.').pop()
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
    const path = `files/${staff.business_id}/${filename}`

    const { error: uploadError } = await supabase.storage
      .from('files')
      .upload(path, file)

    if (uploadError) {
      showToast('Failed to upload file', 'error')
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('files')
      .getPublicUrl(path)

    const category = getCategory(file.type)

    const { error: dbError } = await supabase.from('file_attachments').insert({
      business_id: staff.business_id,
      uploader_id: staff.id,
      filename,
      original_filename: file.name,
      file_size: file.size,
      mime_type: file.type,
      storage_path: path,
      category,
    })

    if (dbError) {
      showToast('Failed to save file info', 'error')
    } else {
      showToast('File uploaded!', 'success')
      loadFiles()
    }
    setUploading(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach(uploadFile)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach(uploadFile)
  }

  const downloadFile = async (file: FileAttachment) => {
    const { data } = await supabase.storage
      .from('files')
      .download(file.storage_path)

    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = file.original_filename
      a.click()
      URL.revokeObjectURL(url)

      // Update download count
      await supabase
        .from('file_attachments')
        .update({
          download_count: file.download_count + 1,
          last_downloaded_at: new Date().toISOString(),
        })
        .eq('id', file.id)
      loadFiles()
    }
  }

  const deleteFile = async (file: FileAttachment) => {
    if (!confirm(`Delete "${file.original_filename}"?`)) return

    await supabase.storage.from('files').remove([file.storage_path])
    await supabase.from('file_attachments').delete().eq('id', file.id)
    showToast('File deleted', 'info')
    loadFiles()
    setSelectedFile(null)
  }

  const copyLink = (file: FileAttachment) => {
    const link = `${window.location.origin}/files/${file.id}`
    navigator.clipboard.writeText(link)
    showToast('Link copied!', 'success')
  }

  const filteredFiles = files.filter((f) => {
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false
    if (searchQuery && !f.original_filename.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const categories = ['all', 'image', 'document', 'video', 'audio', 'archive', 'general']

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-black/[0.06] flex items-center justify-between gap-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-black/10 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-black/[0.05]' : ''}`}
          >
            <Grid size={18} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-black/[0.05]' : ''}`}
          >
            <List size={18} />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl avenize-gradient text-white text-sm font-medium disabled:opacity-50"
        >
          <Upload size={16} />
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {/* Category Filters */}
      <div className="px-4 py-2 border-b border-black/[0.06] flex gap-2 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize whitespace-nowrap ${
              categoryFilter === cat
                ? 'avenize-gradient text-white'
                : 'bg-black/[0.05] text-black/60'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex-1 overflow-y-auto p-4 transition-colors ${
          dragging ? 'bg-[var(--avenize-accent-end)]/10' : ''
        }`}
      >
        {loading ? (
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="aspect-square rounded-xl bg-black/5 animate-pulse" />
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FolderOpen size={48} className="text-black/20 mb-3" />
            <p className="text-black/50">No files yet</p>
            <p className="text-xs text-black/30 mt-1">
              Drop files here or click Upload
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredFiles.map((file) => {
              const Icon = CATEGORY_ICONS[file.category] || File
              return (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className="group aspect-square rounded-xl border border-black/[0.06] p-3 flex flex-col items-center justify-center text-center hover:border-[var(--avenize-accent-end)] transition-colors bg-white"
                >
                  <div className="w-12 h-12 rounded-lg bg-black/[0.05] flex items-center justify-center mb-2">
                    <Icon size={24} className="text-black/40" />
                  </div>
                  <p className="text-xs font-medium truncate w-full">{file.original_filename}</p>
                  <p className="text-xs text-black/30 mt-0.5">{formatFileSize(file.file_size)}</p>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFiles.map((file) => {
              const Icon = CATEGORY_ICONS[file.category] || File
              return (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-black/[0.06] hover:border-[var(--avenize-accent-end)] transition-colors bg-white text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-black/[0.05] flex items-center justify-center shrink-0">
                    <Icon size={20} className="text-black/40" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.original_filename}</p>
                    <p className="text-xs text-black/40">
                      {formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-black/[0.05] capitalize">
                    {file.category}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Drop overlay */}
      {dragging && (
        <div className="absolute inset-0 bg-[var(--avenize-accent-end)]/20 border-2 border-dashed border-[var(--avenize-accent-end)] rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload size={48} className="mx-auto mb-2 text-[var(--avenize-accent-end)]" />
            <p className="font-medium">Drop files to upload</p>
          </div>
        </div>
      )}

      {/* File Detail Modal */}
      {selectedFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-black/[0.05] flex items-center justify-center">
                    {React.createElement(CATEGORY_ICONS[selectedFile.category] || File, { size: 24, className: 'text-black/40' })}
                  </div>
                  <div>
                    <p className="font-medium">{selectedFile.original_filename}</p>
                    <p className="text-sm text-black/50">{formatFileSize(selectedFile.file_size)}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-2 hover:bg-black/[0.05] rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-black/50">Type</span>
                  <span>{selectedFile.mime_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-black/50">Downloads</span>
                  <span>{selectedFile.download_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-black/50">Uploaded</span>
                  <span>{new Date(selectedFile.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-black/[0.06] flex gap-2">
              <button
                onClick={() => downloadFile(selectedFile)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl avenize-gradient text-white font-medium"
              >
                <Download size={16} />
                Download
              </button>
              <button
                onClick={() => copyLink(selectedFile)}
                className="p-2 rounded-xl border border-black/10 hover:bg-black/[0.02]"
              >
                <Copy size={16} />
              </button>
              <button
                onClick={() => deleteFile(selectedFile)}
                className="p-2 rounded-xl border border-red-200 text-red-500 hover:bg-red-50"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Need to import React for JSX
import React from 'react'
