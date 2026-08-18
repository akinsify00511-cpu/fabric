export type CrmRecordKind = 'lead' | 'contact' | 'opportunity' | 'customer'

export type ScopedCrmRecord = {
  id: string
  organizationId: string
  subsidiaryId: string
  crmScopeId: string
  kind: CrmRecordKind
  createdAt: string
}

export type PortfolioCrmSummary = {
  subsidiaryId: string
  crmScopeId: string
  leads: number
  contacts: number
  opportunities: number
  customers: number
}

export function assertCrmRecordScope(record: ScopedCrmRecord, expected: { organizationId: string; subsidiaryId: string; crmScopeId: string }) {
  if (record.organizationId !== expected.organizationId) throw new Error('CRM record belongs to another organization')
  if (record.subsidiaryId !== expected.subsidiaryId) throw new Error('CRM record belongs to another subsidiary')
  if (record.crmScopeId !== expected.crmScopeId) throw new Error('CRM record belongs to another CRM scope')
  return true
}

export function aggregatePortfolioCrm(records: ScopedCrmRecord[]): PortfolioCrmSummary[] {
  const groups = new Map<string, PortfolioCrmSummary>()
  for (const record of records) {
    const key = `${record.subsidiaryId}:${record.crmScopeId}`
    const summary = groups.get(key) ?? {
      subsidiaryId: record.subsidiaryId,
      crmScopeId: record.crmScopeId,
      leads: 0,
      contacts: 0,
      opportunities: 0,
      customers: 0,
    }
    if (record.kind === 'lead') summary.leads += 1
    if (record.kind === 'contact') summary.contacts += 1
    if (record.kind === 'opportunity') summary.opportunities += 1
    if (record.kind === 'customer') summary.customers += 1
    groups.set(key, summary)
  }
  return [...groups.values()]
}
