import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const files = {
  hr: path.join(root, 'src/pages/HumanResources.tsx'),
  finance: path.join(root, 'src/pages/FinanceCenter.tsx'),
  approvals: path.join(root, 'src/pages/Approvals.tsx'),
  portal: path.join(root, 'src/pages/CustomerPortal.tsx'),
  dashboard: path.join(root, 'src/pages/Dashboard.tsx'),
}

function replaceOnce(text, from, to) {
  return text.includes(from) && !text.includes(to) ? text.replace(from, to) : text
}
function collapse(text, line) {
  const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(?:${escaped}\\n){2,}`, 'g'), `${line}\\n`)
}
function update(file, transform) {
  if (!fs.existsSync(file)) return false
  const before = fs.readFileSync(file, 'utf8')
  const after = transform(before)
  if (after === before) return false
  fs.writeFileSync(file, after)
  return true
}

let changed = 0
changed += update(files.hr, text => text
  .replace("supabase.from('leave_requests').select('id', { count: 'exact' }).eq('status', 'pending')", "supabase.from('leave_requests').select('id', { count: 'exact' }).eq('business_id', businessId).eq('status', 'pending')")
  .replace("supabase.from('staff_contracts').select('id', { count: 'exact' }).eq('status', 'active')", "supabase.from('staff_contracts').select('id', { count: 'exact' }).eq('business_id', businessId).eq('status', 'active')"))

changed += update(files.approvals, text => text
  .replace("const [historyFilter, setHistoryFilter] = useState('pending')", "const [historyFilter, setHistoryFilter] = useState('all')")
  .replace("const filteredHistory = approvals.filter(a => a.status === historyFilter)", "const filteredHistory = historyFilter === 'all' ? approvals.filter(a => a.status !== 'pending') : approvals.filter(a => a.status === historyFilter)"))

changed += update(files.portal, text => text
  .replace("      setNewInvitation({\n        token: data[0].token,\n        url: `${window.location.origin}/portal/invite/${data[0].token}`,\n      })\n      showToast('Invitation link created!', 'success')\n      loadData()", "      const invitation = data[0]\n      const { error: emailError } = await supabase.functions.invoke('portal-invitation-send', { body: { invitation_id: invitation.id, base_url: window.location.origin } })\n      setNewInvitation({ token: invitation.token, url: `${window.location.origin}/portal/invite/${invitation.token}` })\n      if (emailError) showToast('Invitation created, but email delivery failed. Copy the link and send it manually.', 'error')\n      else showToast('Invitation created and email sent.', 'success')\n      await loadData()")
  .replace("  const resendInvitation = async (invitation: Invitation) => {\n    // In production, this would send an email\n    const url = `${window.location.origin}/portal/invite/${invitation.token}`\n    navigator.clipboard.writeText(url)\n    showToast('Invitation link copied! Send it to the client.', 'success')\n  }", "  const resendInvitation = async (invitation: Invitation) => {\n    const { error } = await supabase.functions.invoke('portal-invitation-send', { body: { invitation_id: invitation.id, base_url: window.location.origin } })\n    if (error) { showToast('Email delivery failed. Copy the invitation link and send it manually.', 'error'); return }\n    showToast('Invitation email sent.', 'success')\n  }")
  .replace("    await supabase.from('portal_invitations').delete().eq('id', invitation.id)\n    showToast('Invitation deleted', 'info')\n    loadData()", "    const { error } = await supabase.from('portal_invitations').delete().eq('id', invitation.id).eq('business_id', staff?.business_id)\n    if (error) { showToast('Invitation was not deleted.', 'error'); return }\n    showToast('Invitation deleted', 'info')\n    await loadData()"))

changed += update(files.finance, text => {
  text = text.replace("useEffect(() => {\n    loadStats()\n  }, [])", "useEffect(() => {\n    if (businessId) void loadStats()\n  }, [businessId])")
  text = text.replace("    setLoading(true)\n    try {", "    setLoading(true)\n    setLoadError(null)\n    try {")
  text = text.replace("      setStats({\n        totalDebtors:", "      if (debtorsRes.error || creditorsRes.error || vatRes.error || bankRes.error) throw (debtorsRes.error || creditorsRes.error || vatRes.error || bankRes.error)\n      setStats({\n        totalDebtors:")
  text = text.replace("    } catch (err) {\n      console.error(err)\n    }", "    } catch (err) {\n      console.error(err)\n      setLoadError('Finance data could not be loaded. Figures are unavailable until the source is reachable.')\n    }")
  if (!text.includes('const [loadError')) text = text.replace('  const [loading, setLoading] = useState(true)', '  const [loading, setLoading] = useState(true)\n  const [loadError, setLoadError] = useState<string | null>(null)')
  if (!text.includes('if (loadError) return')) text = text.replace('  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-black" /></div>', '  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-black" /></div>\n  if (loadError) return <div className="p-6 rounded-2xl border border-[var(--av-danger)]/20 bg-[var(--av-danger-soft)] text-sm">{loadError}</div>')
  const errorLine = "      if (debtorsRes.error || creditorsRes.error || vatRes.error || bankRes.error) throw (debtorsRes.error || creditorsRes.error || vatRes.error || bankRes.error)"
  const renderLine = '  if (loadError) return <div className="p-6 rounded-2xl border border-[var(--av-danger)]/20 bg-[var(--av-danger-soft)] text-sm">{loadError}</div>'
  text = collapse(text, errorLine)
  text = collapse(text, renderLine)
  return text
})

changed += update(files.dashboard, text => {
  text = text.replace("    load().catch(() => setLoading(false))", "    load().catch(() => { setLoadError('Dashboard data could not be loaded. Metrics are unavailable until the source is reachable.'); setLoading(false) })")
  if (!text.includes('const [loadError')) text = text.replace('  const [loading, setLoading] = useState(true)', '  const [loading, setLoading] = useState(true)\n  const [loadError, setLoadError] = useState<string | null>(null)')
  if (!text.includes('if (loadError) return')) text = text.replace('  return (\n    <div className="mx-auto max-w-7xl', '  if (loadError) return <div className="p-6 rounded-2xl border border-[var(--av-danger)]/20 bg-[var(--av-danger-soft)] text-sm">{loadError}</div>\n\n  return (\n    <div className="mx-auto max-w-7xl')
  text = text.replace("              ) : recommended === 'progress' ? (\n                <div className=\"w-full\">\n                  <div className=\"flex justify-between text-sm\"><span>Monthly goal</span><span>{money(primaryMetric.value)}</span></div>\n                  <div className=\"mt-3 h-4 overflow-hidden rounded-full bg-[var(--av-surface-3)]\"><div className=\"h-full rounded-full bg-[var(--av-primary)]\" style={{ width: '70%' }} /></div>\n                </div>", "              ) : recommended === 'progress' ? (\n                <div className=\"w-full py-8 text-center\"><p className=\"text-sm font-medium\">Goal progress unavailable</p><p className=\"mt-1 text-xs text-[var(--av-text-muted)]\">No authoritative goal denominator is connected to this metric.</p></div>")
  text = text.replace("                <div className=\"w-full\">\n                  <div className=\"flex h-28 items-end gap-2\">\n                    {[42, 55, 48, 68, 60, 82, Math.max(18, Math.min(100, 60 + primaryMetric.change))].map((h, i) => (\n                      <div key={i} className=\"flex-1 rounded-t-md bg-[var(--av-primary)]\" style={{ height: `${h}%` }} />\n                    ))}\n                  </div>\n                  <div className=\"mt-2 flex justify-between text-[10px] text-[var(--av-text-muted)]\"><span>7 months ago</span><span>Now</span></div>\n                </div>", "                <div className=\"w-full py-8 text-center\"><div className=\"text-4xl font-semibold\">{money(primaryMetric.value)}</div><p className=\"mt-2 text-xs text-[var(--av-text-muted)]\">Current period value. Historical trend is unavailable because no authoritative time-series is connected to this card.</p></div>")
  const renderLine = '  if (loadError) return <div className="p-6 rounded-2xl border border-[var(--av-danger)]/20 bg-[var(--av-danger-soft)] text-sm">{loadError}</div>'
  text = collapse(text, renderLine)
  return text
})

console.log(`operational-hardening-codemod: ${changed} files changed`)
