import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Users, Plus, Trash2, Copy, Mail, Check, X,
  FileText, MessageSquare, FolderKanban, CheckCircle2
} from 'lucide-react'

type Invitation = {
  id: string
  email: string
  name: string | null
  token: string
  can_view_invoices: boolean
  can_view_quotes: boolean
  can_view_projects: boolean
  can_submit_tickets: boolean
  status: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

type Contact = {
  id: string
  name: string | null
  email: string
  company: string | null
}

export default function CustomerPortal() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [newInvitation, setNewInvitation] = useState<{ token: string; url: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [canViewInvoices, setCanViewInvoices] = useState(true)
  const [canViewQuotes, setCanViewQuotes] = useState(true)
  const [canViewProjects, setCanViewProjects] = useState(false)
  const [canSubmitTickets, setCanSubmitTickets] = useState(true)

  const loadData = async () => {
    setLoading(true)

    const { data: invitesData } = await supabase
      .from('portal_invitations')
      .select('*')
      .eq('business_id', staff?.business_id)
      .order('created_at', { ascending: false })

    const { data: contactsData } = await supabase
      .from('contacts')
      .select('id, name, email, company')
      .eq('business_id', staff?.business_id)
      .order('name')

    setInvitations((invitesData as Invitation[]) ?? [])
    setContacts((contactsData as Contact[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [staff?.business_id])

  const createInvitation = async () => {
    if (!email.trim()) {
      showToast('Enter an email address', 'error')
      return
    }

    setSaving(true)
    const { data, error } = await supabase.rpc('generate_portal_invitation', {
      p_email: email,
      p_name: name || null,
      p_can_view_invoices: canViewInvoices,
      p_can_view_quotes: canViewQuotes,
      p_can_view_projects: canViewProjects,
      p_can_submit_tickets: canSubmitTickets,
    })

    if (error || !data) {
      showToast('Failed to create invitation', 'error')
    } else {
      setNewInvitation({
        token: data[0].token,
        url: `${window.location.origin}/portal/invite/${data[0].token}`,
      })
      showToast('Invitation link created!', 'success')
      loadData()
    }
    setSaving(false)
  }

  const selectContact = (contact: Contact) => {
    setEmail(contact.email)
    setName(contact.name || contact.company || '')
  }

  const resendInvitation = async (invitation: Invitation) => {
    // In production, this would send an email
    const url = `${window.location.origin}/portal/invite/${invitation.token}`
    navigator.clipboard.writeText(url)
    showToast('Invitation link copied! Send it to the client.', 'success')
  }

  

  const deleteInvitation = async (invitation: Invitation) => {
    if (!confirm(`Delete invitation for ${invitation.email}?`)) return

    await supabase.from('portal_invitations').delete().eq('id', invitation.id)
    showToast('Invitation deleted', 'info')
    loadData()
  }

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/portal/invite/${token}`
    navigator.clipboard.writeText(url)
    showToast('Link copied!', 'success')
  }

  const resetForm = () => {
    setEmail('')
    setName('')
    setCanViewInvoices(true)
    setCanViewQuotes(true)
    setCanViewProjects(false)
    setCanSubmitTickets(true)
    setNewInvitation(null)
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-black/10 rounded w-48" />
        <div className="h-64 bg-black/10 rounded" />
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-black">Customer Portal</h1>
          <p className="text-sm text-black mt-0.5">Give clients self-service access</p>
        </div>
        <button
          onClick={() => {
            resetForm()
            setShowInviteModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
        >
          <Plus size={16} />
          Invite Client
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-purple-900">Client Self-Service Portal</h3>
            <p className="text-sm text-purple-700 mt-1">
              Invite clients to view their invoices, track project progress, and submit support tickets — without needing to email you.
            </p>
            <div className="flex items-center gap-4 mt-3">
              <span className="flex items-center gap-1 text-xs text-purple-600">
                <FileText size={12} /> Invoices
              </span>
              <span className="flex items-center gap-1 text-xs text-purple-600">
                <FolderKanban size={12} /> Projects
              </span>
              <span className="flex items-center gap-1 text-xs text-purple-600">
                <MessageSquare size={12} /> Tickets
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Invitations List */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        <div className="p-4 border-b border-black/[0.06]">
          <h2 className="font-medium">Client Access</h2>
        </div>

        {invitations.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-12 h-12 mx-auto text-black/50 mb-3" />
            <p className="text-black">No client invitations yet</p>
            <p className="text-xs text-black mt-1">Invite clients to give them portal access</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04]">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      invitation.status === 'accepted'
                        ? 'bg-green-100'
                        : invitation.status === 'pending'
                        ? 'bg-yellow-100'
                        : 'bg-black/[0.05]'
                    }`}>
                      {invitation.status === 'accepted' ? (
                        <Check className="w-5 h-5 text-[var(--av-success)]" />
                      ) : invitation.status === 'pending' ? (
                        <Mail className="w-5 h-5 text-[var(--av-warning)]" />
                      ) : (
                        <X className="w-5 h-5 text-black" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {invitation.name || invitation.email}
                        </p>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          invitation.status === 'accepted'
                            ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]'
                            : invitation.status === 'pending'
                            ? 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]'
                            : 'bg-black/[0.05]'
                        }`}>
                          {invitation.status}
                        </span>
                      </div>
                      <p className="text-sm text-black">{invitation.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {invitation.can_view_invoices && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--av-primary-soft)] text-[var(--av-primary)]">
                            <FileText size={10} className="inline mr-0.5" /> Invoices
                          </span>
                        )}
                        {invitation.can_view_projects && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">
                            <FolderKanban size={10} className="inline mr-0.5" /> Projects
                          </span>
                        )}
                        {invitation.can_submit_tickets && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--av-success-soft)] text-[var(--av-success)]">
                            <MessageSquare size={10} className="inline mr-0.5" /> Tickets
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {invitation.status === 'pending' && (
                      <button
                        onClick={() => resendInvitation(invitation)}
                        className="p-2 hover:bg-black/[0.05] rounded-lg"
                        title="Copy invite link"
                      >
                        <Copy size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => deleteInvitation(invitation)}
                      className="p-2 hover:bg-[var(--av-danger-soft)] rounded-lg text-[var(--av-danger)]"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="p-6 border-b border-black/[0.06] flex items-center justify-between">
              <h2 className="font-semibold">
                {newInvitation ? 'Invitation Created!' : 'Invite Client'}
              </h2>
              <button
                onClick={() => {
                  setShowInviteModal(false)
                  resetForm()
                }}
                className="p-2 hover:bg-black/[0.05] rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              {newInvitation ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[var(--av-success-soft)] border border-[var(--av-success)]/30">
                    <div className="flex items-center gap-2 text-[var(--av-success)]">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium">Invitation ready!</span>
                    </div>
                    <p className="text-sm text-[var(--av-success)] mt-1">
                      Share this link with {email}. It expires in 30 days.
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Invitation Link</label>
                    <div className="flex gap-2">
                      <code className="flex-1 px-4 py-3 rounded-xl bg-black/[0.05] font-mono text-xs break-all">
                        {newInvitation.url}
                      </code>
                      <button
                        onClick={() => copyLink(newInvitation.token)}
                        className="px-3 py-2 rounded-xl border border-black/10 hover:bg-black/10"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-black/[0.02]">
                    <p className="text-sm text-black/60">
                      <strong>Note:</strong> This link will be sent manually. In production, 
                      we'd integrate with an email provider to send it automatically.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Quick Select Contact */}
                  {contacts.length > 0 && (
                    <div>
                      <label className="text-sm font-medium block mb-2">Quick Select Contact</label>
                      <div className="flex flex-wrap gap-2">
                        {contacts.slice(0, 6).map((contact) => (
                          <button
                            key={contact.id}
                            onClick={() => selectContact(contact)}
                            className={`px-3 py-1.5 rounded-full text-sm border transition ${
                              email === contact.email
                                ? 'avenize-gradient text-white border-transparent'
                                : 'border-black/10 hover:bg-black/10'
                            }`}
                          >
                            {contact.name || contact.email}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-1">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="client@company.com"
                        className="w-full px-4 py-3 rounded-xl border border-black/10"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1">Name (optional)</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Client Name"
                        className="w-full px-4 py-3 rounded-xl border border-black/10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-2">Permissions</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canViewInvoices}
                          onChange={(e) => setCanViewInvoices(e.target.checked)}
                          className="rounded"
                        />
                        <div>
                          <span className="text-sm">View Invoices</span>
                          <p className="text-xs text-black">Allow viewing and downloading invoices</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canViewQuotes}
                          onChange={(e) => setCanViewQuotes(e.target.checked)}
                          className="rounded"
                        />
                        <div>
                          <span className="text-sm">View Quotes</span>
                          <p className="text-xs text-black">Allow viewing proposals and quotes</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canViewProjects}
                          onChange={(e) => setCanViewProjects(e.target.checked)}
                          className="rounded"
                        />
                        <div>
                          <span className="text-sm">View Projects</span>
                          <p className="text-xs text-black">Allow tracking project progress</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canSubmitTickets}
                          onChange={(e) => setCanSubmitTickets(e.target.checked)}
                          className="rounded"
                        />
                        <div>
                          <span className="text-sm">Submit Tickets</span>
                          <p className="text-xs text-black">Allow creating support requests</p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowInviteModal(false)
                  resetForm()
                }}
                className="px-4 py-2 rounded-lg border border-black/10"
              >
                {newInvitation ? 'Done' : 'Cancel'}
              </button>
              {!newInvitation && (
                <button
                  onClick={createInvitation}
                  disabled={saving || !email}
                  className="px-4 py-2 rounded-lg avenize-gradient text-white font-medium disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Invitation'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
