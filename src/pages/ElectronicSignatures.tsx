import { useState, useEffect } from 'react'
import { 
  FileSignature, Plus, Search, Filter, Send, Clock,
  CheckCircle, XCircle, User, Building2, Eye, Download,
  MoreVertical, Trash2, Edit, Copy, Link, Mail
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'

interface SignatureRequest {
  id: string
  title: string
  description: string
  document_name: string
  document_url: string
  status: 'draft' | 'pending' | 'viewed' | 'signed' | 'declined' | 'expired'
  order_index: number
  expires_at: string
  created_at: string
  signers: Signer[]
}

interface Signer {
  id: string
  name: string
  email: string
  order: number
  status: 'pending' | 'viewed' | 'signed' | 'declined'
  signed_at: string
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-[#9AA0A6]/10 text-[#9AA0A6]',
  pending: 'bg-[#FBBC05]/10 text-[#FBBC05]',
  viewed: 'bg-[#4285F4]/10 text-[#4285F4]',
  signed: 'bg-[#34A853]/10 text-[#34A853]',
  declined: 'bg-[#EA4335]/10 text-[#EA4335]',
  expired: 'bg-[#9AA0A6]/10 text-[#9AA0A6]',
}

export default function ElectronicSignatures() {
  const { staff } = useAuth()
  const [requests, setRequests] = useState<SignatureRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingRequest, setEditingRequest] = useState<SignatureRequest | null>(null)

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    document_name: '',
    document_url: '',
    expires_in_days: 7,
    signers: [{ name: '', email: '' }],
  })

  useEffect(() => {
    fetchRequests()
  }, [staff])

  const fetchRequests = async () => {
    if (!staff?.business_id) return
    
    try {
      // Check if signature_requests table exists
      const { data, error } = await supabase
        .from('signature_requests')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      if (error) {
        // Table might not exist - use demo data
        setRequests(getDemoRequests())
      } else {
        setRequests(data || [])
      }
    } catch (error) {
      // Use demo data if table doesn't exist
      setRequests(getDemoRequests())
    } finally {
      setLoading(false)
    }
  }

  const getDemoRequests = (): SignatureRequest[] => [
    {
      id: '1',
      title: 'Service Agreement - ABC Corp',
      description: 'Annual service contract for 2025',
      document_name: 'service-agreement-2025.pdf',
      document_url: '/docs/service-agreement.pdf',
      status: 'pending',
      order_index: 1,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      signers: [
        { id: '1', name: 'John Adeyemi', email: 'john@abccorp.com', order: 1, status: 'pending', signed_at: '' },
      ],
    },
    {
      id: '2',
      title: 'NDA - Tech Startup Ltd',
      description: 'Non-disclosure agreement for partnership discussions',
      document_name: 'nda-2025.pdf',
      document_url: '/docs/nda.pdf',
      status: 'signed',
      order_index: 1,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      signers: [
        { id: '2', name: 'Sarah Okonkwo', email: 'sarah@techstartup.com', order: 1, status: 'signed', signed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
      ],
    },
    {
      id: '3',
      title: 'Employment Contract - New Hire',
      description: 'Employment agreement for incoming senior developer',
      document_name: 'employment-contract.pdf',
      document_url: '/docs/employment.pdf',
      status: 'draft',
      order_index: 1,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      signers: [],
    },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staff?.business_id) return

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + formData.expires_in_days)

    try {
      const newRequest = {
        title: formData.title,
        description: formData.description,
        document_name: formData.document_name,
        document_url: formData.document_url || '/docs/default.pdf',
        business_id: staff.business_id,
        created_by: staff.id,
        status: 'draft',
        order_index: 1,
        expires_at: expiresAt.toISOString(),
        signers: formData.signers.filter(s => s.name && s.email).map((s, i) => ({
          name: s.name,
          email: s.email,
          order: i + 1,
          status: 'pending',
          signed_at: '',
        })),
      }

      // Try to insert into database
      try {
        const { error } = await supabase
          .from('signature_requests')
          .insert([newRequest])

        if (error) throw error
      } catch (dbError) {
        // If DB insert fails, add to local state for demo
        console.warn('Database insert failed, using demo mode:', dbError)
        setRequests(prev => [{
          ...newRequest,
          id: Date.now().toString(),
          created_at: new Date().toISOString(),
          signers: (newRequest.signers || []).map((s, i) => ({ ...s, id: `signer-${i}` })),
        } as SignatureRequest, ...prev])
      }

      setShowModal(false)
      resetForm()
      fetchRequests()
    } catch (error) {
      console.error('Error creating signature request:', error)
    }
  }

  const updateStatus = async (id: string, status: SignatureRequest['status']) => {
    setRequests(prev => prev.map(r => 
      r.id === id ? { ...r, status } : r
    ))
  }

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      document_name: '',
      document_url: '',
      expires_in_days: 7,
      signers: [{ name: '', email: '' }],
    })
  }

  const addSigner = () => {
    setFormData(prev => ({
      ...prev,
      signers: [...prev.signers, { name: '', email: '' }],
    }))
  }

  const removeSigner = (index: number) => {
    setFormData(prev => ({
      ...prev,
      signers: prev.signers.filter((_, i) => i !== index),
    }))
  }

  const updateSigner = (index: number, field: 'name' | 'email', value: string) => {
    setFormData(prev => ({
      ...prev,
      signers: prev.signers.map((s, i) => 
        i === index ? { ...s, [field]: value } : s
      ),
    }))
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const filteredRequests = requests.filter(request => {
    const matchesSearch = 
      request.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.document_name.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = filterStatus === 'all' || request.status === filterStatus

    return matchesSearch && matchesStatus
  })

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending' || r.status === 'viewed').length,
    signed: requests.filter(r => r.status === 'signed').length,
    draft: requests.filter(r => r.status === 'draft').length,
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
          <h1 className="text-2xl font-bold text-black">Electronic Signatures</h1>
          <p className="text-sm text-black/60 mt-1">
            Send documents for digital signature
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#4285F4] text-white rounded-xl font-medium hover:bg-[#3367D6] transition"
        >
          <Plus size={18} />
          New Request
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#4285F4]/10 flex items-center justify-center">
              <FileSignature size={20} className="text-[#4285F4]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-black/60">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FBBC05]/10 flex items-center justify-center">
              <Clock size={20} className="text-[#FBBC05]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.pending}</p>
              <p className="text-xs text-black/60">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#34A853]/10 flex items-center justify-center">
              <CheckCircle size={20} className="text-[#34A853]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.signed}</p>
              <p className="text-xs text-black/60">Signed</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#9AA0A6]/10 flex items-center justify-center">
              <Edit size={20} className="text-[#9AA0A6]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.draft}</p>
              <p className="text-xs text-black/60">Drafts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
            <input
              type="text"
              placeholder="Search signature requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[#4285F4] transition"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[#4285F4] transition"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="viewed">Viewed</option>
            <option value="signed">Signed</option>
            <option value="declined">Declined</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No signature requests"
          description={searchQuery || filterStatus !== 'all'
            ? "Try adjusting your filters"
            : "Create your first signature request"
          }
          action={{
            label: "New Request",
            onClick: () => setShowModal(true)
          }}
        />
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#F8F9FA]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Document</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Signers</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase">Expires</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-black/60 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredRequests.map(request => (
                <tr key={request.id} className="hover:bg-[#F8F9FA]/50 transition">
                  <td className="px-4 py-3">
                    <p className="font-medium text-black">{request.title}</p>
                    <p className="text-sm text-black/60">{request.document_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    {request.signers.length > 0 ? (
                      <div className="flex -space-x-2">
                        {request.signers.slice(0, 3).map((signer, i) => (
                          <div
                            key={signer.id}
                            className="w-8 h-8 rounded-full bg-[#4285F4]/10 flex items-center justify-center text-xs font-medium text-[#4285F4] border-2 border-white"
                            title={signer.name}
                          >
                            {signer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                        ))}
                        {request.signers.length > 3 && (
                          <div className="w-8 h-8 rounded-full bg-[#F8F9FA] flex items-center justify-center text-xs font-medium text-black/60 border-2 border-white">
                            +{request.signers.length - 3}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-black/40">No signers added</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[request.status]}`}>
                      {request.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-black/60">
                    {formatDate(request.expires_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {request.status === 'draft' && (
                        <button
                          onClick={() => updateStatus(request.id, 'pending')}
                          className="p-2 hover:bg-[#4285F4]/10 rounded-lg transition"
                          title="Send for signing"
                        >
                          <Send size={16} className="text-[#4285F4]" />
                        </button>
                      )}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          resetForm()
        }}
        title="Create Signature Request"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Document Title *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[#4285F4] transition"
              placeholder="e.g., Service Agreement"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[#4285F4] transition"
              placeholder="Brief description of the document..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Document Name *</label>
            <input
              type="text"
              required
              value={formData.document_name}
              onChange={(e) => setFormData({ ...formData, document_name: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[#4285F4] transition"
              placeholder="e.g., contract-2025.pdf"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Expires In (Days)</label>
            <input
              type="number"
              min="1"
              max="90"
              value={formData.expires_in_days}
              onChange={(e) => setFormData({ ...formData, expires_in_days: parseInt(e.target.value) || 7 })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[#4285F4] transition"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Signers</label>
              <button
                type="button"
                onClick={addSigner}
                className="text-sm text-[#4285F4] hover:underline"
              >
                + Add Signer
              </button>
            </div>
            <div className="space-y-2">
              {formData.signers.map((signer, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={signer.name}
                    onChange={(e) => updateSigner(index, 'name', e.target.value)}
                    className="flex-1 px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[#4285F4] transition"
                    placeholder="Signer name"
                  />
                  <input
                    type="email"
                    value={signer.email}
                    onChange={(e) => updateSigner(index, 'email', e.target.value)}
                    className="flex-1 px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[#4285F4] transition"
                    placeholder="signer@email.com"
                  />
                  {formData.signers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSigner(index)}
                      className="p-2 hover:bg-red-50 rounded-xl transition"
                    >
                      <Trash2 size={16} className="text-red-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setShowModal(false)
                resetForm()
              }}
              className="flex-1 px-4 py-2 border border-black/10 rounded-xl font-medium hover:bg-black/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-[#4285F4] text-white rounded-xl font-medium hover:bg-[#3367D6] transition"
            >
              Create Request
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
