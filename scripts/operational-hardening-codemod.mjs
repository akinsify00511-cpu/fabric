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
]

let changed = 0
for (const [file, rules] of replacements) {
  const full = path.join(root, file)
  if (!fs.existsSync(full)) continue
  let text = fs.readFileSync(full, 'utf8')
  const before = text
  for (const [from, to] of rules) {
    if (text.includes(from)) text = text.replaceAll(from, to)
  }
  if (text !== before) { fs.writeFileSync(full, text); changed++ }
}
console.log(`operational-hardening-codemod: ${changed} files changed`)
