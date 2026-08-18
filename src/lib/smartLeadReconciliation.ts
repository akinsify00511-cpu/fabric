import type { CleanLead } from './smartLeadImport'

export type ExistingLead = CleanLead & { id: string; updatedAt?: string }
export type LeadMatch = { imported: CleanLead; existing: ExistingLead; confidence: number; matchedBy: 'email' | 'phone' | 'name' }
export type LeadReconciliation = { creates: CleanLead[]; matches: LeadMatch[] }

const norm = (value?: string) => value?.trim().toLowerCase()

export function reconcileLeads(imported: CleanLead[], existing: ExistingLead[]): LeadReconciliation {
  const byEmail = new Map(existing.filter(x => x.email).map(x => [norm(x.email)!, x]))
  const byPhone = new Map(existing.filter(x => x.phone).map(x => [x.phone!.replace(/\D/g, ''), x]))
  const byName = new Map(existing.filter(x => x.name).map(x => [norm(x.name)!, x]))
  const creates: CleanLead[] = []
  const matches: LeadMatch[] = []
  for (const lead of imported) {
    const email = norm(lead.email)
    const phone = lead.phone?.replace(/\D/g, '')
    const existingLead = (email && byEmail.get(email)) || (phone && byPhone.get(phone)) || (lead.name && byName.get(norm(lead.name)!))
    if (!existingLead) { creates.push(lead); continue }
    const matchedBy = email && byEmail.get(email) ? 'email' : phone && byPhone.get(phone) ? 'phone' : 'name'
    matches.push({ imported: lead, existing: existingLead, matchedBy, confidence: matchedBy === 'email' || matchedBy === 'phone' ? 1 : 0.9 })
  }
  return { creates, matches }
}

export type ReconciliationAction = 'create' | 'update' | 'keep_existing' | 'skip'
export function resolveReconciliation(matches: LeadMatch[], actions: Record<string, ReconciliationAction>) {
  return matches.map(match => ({ id: match.existing.id, imported: match.imported, action: actions[match.existing.id] ?? 'keep_existing' as ReconciliationAction }))
}
