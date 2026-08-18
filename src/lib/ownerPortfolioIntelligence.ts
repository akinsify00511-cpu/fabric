export type PortfolioBusinessSnapshot = {
  subsidiaryId: string
  businessName: string
  revenueMinor: number
  grossProfitMinor: number
  marketingSpendMinor: number
  customers: number
  openDecisions: number
  highPriorityMarkets: number
  currency: string
}

export type OwnerPortfolioSignal = {
  subsidiaryId: string
  businessName: string
  health: 'strong' | 'watch' | 'attention'
  reasons: string[]
  priority: number
}

export function buildOwnerPortfolioSignals(snapshots: PortfolioBusinessSnapshot[]): OwnerPortfolioSignal[] {
  return snapshots.map((snapshot) => {
    const reasons: string[] = []
    if (snapshot.revenueMinor <= 0) reasons.push('No recorded revenue')
    if (snapshot.grossProfitMinor < 0) reasons.push('Negative gross profit')
    if (snapshot.marketingSpendMinor > 0 && snapshot.revenueMinor > 0 && snapshot.revenueMinor / snapshot.marketingSpendMinor < 2) reasons.push('Marketing efficiency requires review')
    if (snapshot.openDecisions > 0) reasons.push(`${snapshot.openDecisions} decision(s) require attention`)
    if (snapshot.highPriorityMarkets > 0) reasons.push(`${snapshot.highPriorityMarkets} market opportunity signal(s)`)

    const health: OwnerPortfolioSignal['health'] = snapshot.grossProfitMinor < 0
      ? 'attention'
      : reasons.length >= 2
        ? 'watch'
        : 'strong'

    const priority = (health === 'attention' ? 100 : health === 'watch' ? 60 : 20) + snapshot.openDecisions * 5 + snapshot.highPriorityMarkets * 3
    return { subsidiaryId: snapshot.subsidiaryId, businessName: snapshot.businessName, health, reasons, priority }
  }).sort((a, b) => b.priority - a.priority)
}
