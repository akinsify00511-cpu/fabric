import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const replacements = [
  ['src/pages/HumanResources.tsx', [
    ["supabase.from('leave_requests').select('id', { count: 'exact' }).eq('status', 'pending')", "supabase.from('leave_requests').select('id', { count: 'exact' }).eq('business_id', businessId).eq('status', 'pending')"],
    ["supabase.from('staff_contracts').select('id', { count: 'exact' }).eq('status', 'active')", "supabase.from('staff_contracts').select('id', { count: 'exact' }).eq('business_id', businessId).eq('status', 'active')"],
  ]],
  ['src/pages/FinanceCenter.tsx', [
    ['useEffect(() => {\n    loadStats()\n  }, [])', 'useEffect(() => {\n    if (businessId) void loadStats()\n  }, [businessId])'],
  ]],
  ['src/pages/Approvals.tsx', [
    ["const [historyFilter, setHistoryFilter] = useState('pending')", "const [historyFilter, setHistoryFilter] = useState('all')"],
    ["const filteredHistory = approvals.filter(a => a.status === historyFilter)", "const filteredHistory = historyFilter === 'all' ? approvals.filter(a => a.status !== 'pending') : approvals.filter(a => a.status === historyFilter)"],
  ]],
  ['src/pages/CustomerPortal.tsx', [
    ["      setNewInvitation({\n        token: data[0].token,\n        url: `${window.location.origin}/portal/invite/${data[0].token}`,\n      })\n      showToast('Invitation link created!', 'success')\n      loadData()", "      const invitation = data[0]\n      const { error: emailError } = await supabase.rpc('queue_portal_invitation_email', { p_invitation_id: invitation.id, p_base_url: window.location.origin })\n      setNewInvitation({ token: invitation.token, url: `${window.location.origin}/portal/invite/${invitation.token}` })\n      if (emailError) showToast('Invitation created, but email delivery could not be queued. Send the link manually.', 'error')\n      else showToast('Invitation created and queued for email delivery.', 'success')\n      await loadData()"],
    ["  const resendInvitation = async (invitation: Invitation) => {\n    // In production, this would send an email\n    const url = `${window.location.origin}/portal/invite/${invitation.token}`\n    navigator.clipboard.writeText(url)\n    showToast('Invitation link copied! Send it to the client.', 'success')\n  }", "  const resendInvitation = async (invitation: Invitation) => {\n    const { error } = await supabase.rpc('queue_portal_invitation_email', { p_invitation_id: invitation.id, p_base_url: window.location.origin })\n    if (error) { showToast('Email could not be queued. Copy the invitation link and send it manually.', 'error'); return }\n    showToast('Invitation email queued for delivery.', 'success')\n  }"],
    ["    await supabase.from('portal_invitations').delete().eq('id', invitation.id)\n    showToast('Invitation deleted', 'info')\n    loadData()", "    const { error } = await supabase.from('portal_invitations').delete().eq('id', invitation.id).eq('business_id', staff?.business_id)\n    if (error) { showToast('Invitation was not deleted.', 'error'); return }\n    showToast('Invitation deleted', 'info')\n    await loadData()"],
  ]],
]

let changed = 0
for (const [file, rules] of replacements) {
  const full = path.join(root, file)
  if (!fs.existsSync(full)) continue
  let text = fs.readFileSync(full, 'utf8')
  const before = text
  for (const [from, to] of rules) if (text.includes(from)) text = text.replaceAll(from, to)
  if (text !== before) { fs.writeFileSync(full, text); changed++ }
}
console.log(`operational-hardening-codemod: ${changed} files changed`)
