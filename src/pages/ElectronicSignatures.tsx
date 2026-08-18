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
  signing_token?: string
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-[#9AA0A6]/10 text-[#9AA0A6]',
  pending: 'bg-[var(--av-warning)]/10 text-[var(--av-warning)]',
  viewed: 'bg-[var(--av-primary)]/10 text-[var(--av-primary)]',
  signed: 'bg-[var(--av-success)]/10 text-[var(--av-success)]',
  declined: 'bg-[var(--av-danger)]/10 text-[var(--av-danger)]',
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
      // Fetch requests with their signers in a single joined query so the
      // list view shows signer avatars/progress without a second round-trip.
      const { data, error } = await supabase
        .from('signature_requests')
        .select(`
          *,
          signers:signature_signers (
            id, name, email, order_index, status, signed_at, signing_token
          )
        `)
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Normalise DB shape (snake_case) into the page's existing UI shape so
      // the rest of the component keeps working without a wider rewrite.
      setRequests((data || []).map(r => ({
        id: r.id,
        title: r.title,
        description: r.description ?? '',
        document_name: r.document_name,
        document_url: r.document_url,
        status: r.status,
        order_index: 1,
        expires_at: r.expires_at,
        created_at: r.created_at,
        signers: (r.signers || []).map((sg: any) => ({
          id: sg.id,
          name: sg.name,
          email: sg.email,
          order: sg.order_index,
          status: sg.status,
          signed_at: sg.signed_at ?? '',
          signing_token: sg.signing_token,
        })),
      })))
    } catch (error) {
      console.error('Error loading signature requests:', error)
      setRequests([])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staff?.business_id) return

    const validSigners = formData.signers.filter(s => s.name && s.email)
    if (validSigners.length === 0) {
      alert('Add at least one signer before creating the request.')
      return
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + formData.expires_in_days)

    try {
      // Insert the request, then its signers in a normalized two-step write.
      // (Supabase can't return the parent id in a single nested insert unless
      // the child FK is exposed, so we read the id back explicitly.)
      const { data: created, error: reqError } = await supabase
        .from('signature_requests')
        .insert({
          title: formData.title,
          description: formData.description || null,
          document_name: formData.document_name,
          document_url: formData.document_url || '/docs/default.pdf',
          business_id: staff.business_id,
          created_by: staff.id,
          status: 'draft',
          expires_at: expiresAt.toISOString(),
        })
        .select('id')
        .single()

      if (reqError) throw reqError

      const signerRows = validSigners.map((s, idx) => ({
        request_id: created.id,
        business_id: staff.business_id,
        name: s.name,
        email: s.email,
        order_index: idx + 1,
        status: 'pending',
        signer_type: 'external_email',
      }))

      const { error: signersError } = await supabase
        .from('signature_signers')
        .insert(signerRows)

      if (signersError) throw signersError

      setShowModal(false)
      resetForm()
      fetchRequests()
    } catch (error) {
      console.error('Error creating signature request:', error)
      alert('Could not create the signature request. Please try again.')
    }
  }

  const updateStatus = async (id: string, status: SignatureRequest['status']) => {
    // Persist the status change so it survives reloads and is visible to
    // every staff member tracking the request.
    try {
      const { error } = await supabase
        .from('signature_requests')
        .update({ status })
        .eq('id', id)
      if (error) throw error
      setRequests(prev => prev.map(r =>
        r.id === id ? { ...r, status } : r
      ))
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Could not update the request status. Please try again.')
    }
  }

  const copySigningLink = (signer: Signer) => {
    if (!signer.signing_token) return
    const url = `${window.location.origin}/sign/${signer.signing_token}`
    navigator.clipboard.writeText(url)
    alert(`Signing link copied for ${signer.name}:\n${url}`)
  }

  // Email every signer their unique signing link via the
  // send-signature-request edge function. Falls back to a plain status
  // flip if the function is unreachable so the admin can still copy links.
  const sendForSigning = async (request: SignatureRequest) => {
    if (!confirm(`Email signing links to ${request.signers.length} signer(s)?`)) return
    try {
      const { data, error } = await supabase.functions.invoke('send-signature-request', {
        body: { request_id: request.id },
      })
      if (error) throw error
      if (data?.warning) {
        alert(data.warning)
      } else if (data?.success) {
        alert(`Sent signing emails to ${data.sent} of ${data.total} signer(s).`)
      }
      fetchRequests()
    } catch (err) {
      console.error('send-signature-request failed:', err)
      alert('Could not email signers. Check your email provider settings, or copy the signing link manually.')
    }
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
        <div className="w-8 h-8 border-2 border-[var(--av-primary)] border-t-transparent rounded-full animate-spin" />
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
          className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition"
        >
          <Plus size={18} />
          New Request
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--av-primary)]/10 flex items-center justify-center">
              <FileSignature size={20} className="text-[var(--av-primary)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-black/60">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--av-warning)]/10 flex items-center justify-center">
              <Clock size={20} className="text-[var(--av-warning)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.pending}</p>
              <p className="text-xs text-black/60">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--av-success)]/10 flex items-center justify-center">
              <CheckCircle size={20} className="text-[var(--av-success)]" />
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
              className="w-full pl-10 pr-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[var(--av-primary)] transition"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 bg-[#F8F9FA] rounded-xl border-0 focus:ring-2 focus:ring-[var(--av-primary)] transition"
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
          gamified={!(searchQuery || filterStatus !== 'all')}
          hint={!(searchQuery || filterStatus !== 'all') ? "Signature requests make agreements official — your first one sends a secure signing link and tracks completion." : undefined}
          tip={!(searchQuery || filterStatus !== 'all') ? "Add the document, the signers, and Avenize generates the signing link and audit trail." : undefined}
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
                            className="w-8 h-8 rounded-full bg-[var(--av-primary)]/10 flex items-center justify-center text-xs font-medium text-[var(--av-primary)] border-2 border-white"
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
                          onClick={() => sendForSigning(request)}
                          className="p-2 hover:bg-[var(--av-primary)]/10 rounded-lg transition"
                          title="Send for signing"
                        >
                          <Send size={16} className="text-[var(--av-primary)]" />
                        </button>
                      )}
                      {request.status !== 'draft' && request.signers.length > 0 && (
                        <button
                          onClick={() => copySigningLink(request.signers[0])}
                          className="p-2 hover:bg-[var(--av-primary)]/10 rounded-lg transition"
                          title={`Copy signing link for ${request.signers[0].name}`}
                        >
                          <Link size={16} className="text-[var(--av-primary)]" />
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
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
              placeholder="e.g., Service Agreement"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
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
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
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
              className="w-full px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Signers</label>
              <button
                type="button"
                onClick={addSigner}
                className="text-sm text-[var(--av-primary)] hover:underline"
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
                    className="flex-1 px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
                    placeholder="Signer name"
                  />
                  <input
                    type="email"
                    value={signer.email}
                    onChange={(e) => updateSigner(index, 'email', e.target.value)}
                    className="flex-1 px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-[var(--av-primary)] transition"
                    placeholder="signer@email.com"
                  />
                  {formData.signers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSigner(index)}
                      className="p-2 hover:bg-[var(--av-danger-soft)] rounded-xl transition"
                    >
                      <Trash2 size={16} className="text-[var(--av-danger)]" />
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
              className="flex-1 px-4 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] transition"
            >
              Create Request
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
