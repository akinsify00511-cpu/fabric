export type ImpactDomain = 'marketing' | 'sales' | 'operations' | 'finance' | 'crm' | 'owner'

export type BusinessImpact = {
  sourceDomain: ImpactDomain
  targetDomain: ImpactDomain
  subsidiaryId: string
  title: string
  reason: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  actionRequired: boolean
}

export function deriveCrossFunctionalImpacts(
  subsidiaryId: string,
  sourceDomain: ImpactDomain,
  signal: { title: string; reason: string; priority: BusinessImpact['priority'] },
): BusinessImpact[] {
  const targets: Record<ImpactDomain, ImpactDomain[]> = {
    marketing: ['sales', 'finance', 'owner'],
    sales: ['marketing', 'operations', 'finance', 'owner'],
    operations: ['sales', 'finance', 'owner'],
    finance: ['marketing', 'sales', 'operations', 'owner'],
    crm: ['sales', 'marketing', 'owner'],
    owner: ['marketing', 'sales', 'operations', 'finance'],
  }

  return targets[sourceDomain].map((targetDomain) => ({
    sourceDomain,
    targetDomain,
    subsidiaryId,
    title: `${signal.title} affects ${targetDomain}`,
    reason: signal.reason,
    priority: signal.priority,
    actionRequired: signal.priority === 'high' || signal.priority === 'critical',
  }))
}
