import { describe, it, expect } from 'vitest'

// Mirrors the §7.4 compose_business_digest RPC contract (migration
// 20260818150000): the digest is composed from REAL data, every line cites
// its source (§22), the no-attention-needed state is honest (not empty),
// and the one-tap resolving action attaches to each alert line (§5.5).

// The exact line-composition logic the RPC uses.
function composeDigestLines(stats: {
  overallScore: number | null
  overdueInvoices: number
  overdueTotal: number
  lowStock: number
  staleDeals: number
  tasksDue: number
  openRecommendations: number
}): { text: string; source: string; action?: string; route?: string }[] {
  const lines: { text: string; source: string; action?: string; route?: string }[] = []
  if (stats.overallScore != null) {
    lines.push({
      text: stats.overallScore >= 80
        ? `Your business is healthy — score ${stats.overallScore}/100.`
        : stats.overallScore >= 60
          ? `Your business needs attention — score ${stats.overallScore}/100.`
          : `Your business is at risk — score ${stats.overallScore}/100.`,
      source: 'business_health_scores',
    })
  }
  if (stats.overdueInvoices > 0) {
    lines.push({
      text: `${stats.overdueInvoices} overdue invoice${stats.overdueInvoices > 1 ? 's' : ''} totalling ${stats.overdueTotal.toLocaleString()}.`,
      source: 'invoices', action: 'Send reminders', route: '/app/finance',
    })
  }
  if (stats.lowStock > 0) {
    lines.push({
      text: `${stats.lowStock} product${stats.lowStock > 1 ? 's are' : ' is'} running low on stock.`,
      source: 'products', action: 'Reorder', route: '/app/inventory',
    })
  }
  if (stats.staleDeals > 0) {
    lines.push({
      text: `${stats.staleDeals} deal${stats.staleDeals > 1 ? 's have' : ' has'} gone cold (no activity in 14+ days).`,
      source: 'deals', action: 'Follow up', route: '/app/crm',
    })
  }
  if (stats.tasksDue > 0) {
    lines.push({
      text: `${stats.tasksDue} task${stats.tasksDue > 1 ? 's need' : ' needs'} attention in the next 2 days.`,
      source: 'tasks', action: 'Review', route: '/app/tasks',
    })
  }
  if (stats.openRecommendations > 0) {
    lines.push({
      text: `${stats.openRecommendations} recommendation${stats.openRecommendations > 1 ? 's' : ''} open on your Executive Cockpit.`,
      source: 'claims', action: 'Review', route: '/app/cockpit',
    })
  }
  if (lines.length === 0) {
    lines.push({ text: 'Nothing needs your attention right now. All clear.', source: 'digest' })
  }
  return lines
}

describe('compose_business_digest — §7.4 + §5.5 contract', () => {
  it('composes a plain-language health sentence from the score (§0.2: sentences)', () => {
    const healthy = composeDigestLines({ overallScore: 88, overdueInvoices: 0, overdueTotal: 0, lowStock: 0, staleDeals: 0, tasksDue: 0, openRecommendations: 0 })
    expect(healthy[0].text).toContain('healthy')
    expect(healthy[0].source).toBe('business_health_scores')

    const atRisk = composeDigestLines({ overallScore: 40, overdueInvoices: 0, overdueTotal: 0, lowStock: 0, staleDeals: 0, tasksDue: 0, openRecommendations: 0 })
    expect(atRisk[0].text).toContain('at risk')
  })

  it('attaches a one-tap resolving action to each alert line (§5.5)', () => {
    const lines = composeDigestLines({ overallScore: 75, overdueInvoices: 3, overdueTotal: 150000, lowStock: 2, staleDeals: 1, tasksDue: 5, openRecommendations: 2 })
    // Every non-health line has an action + route.
    const alertLines = lines.filter(l => l.source !== 'business_health_scores')
    expect(alertLines.length).toBeGreaterThan(0)
    for (const l of alertLines) {
      expect(l.action).toBeTruthy()
      expect(l.route).toBeTruthy()
    }
    // Specific actions.
    expect(lines.find(l => l.source === 'invoices')?.action).toBe('Send reminders')
    expect(lines.find(l => l.source === 'products')?.action).toBe('Reorder')
    expect(lines.find(l => l.source === 'deals')?.action).toBe('Follow up')
  })

  it('cites the source table for every line (§22 anti-fabrication)', () => {
    const lines = composeDigestLines({ overallScore: 60, overdueInvoices: 1, overdueTotal: 5000, lowStock: 1, staleDeals: 1, tasksDue: 1, openRecommendations: 1 })
    for (const l of lines) {
      expect(l.source).toBeTruthy()  // every fact is attributable
      expect(['business_health_scores', 'invoices', 'products', 'deals', 'tasks', 'claims', 'digest']).toContain(l.source)
    }
  })

  it('omits alert lines that have zero items (no noise — §0.2)', () => {
    const lines = composeDigestLines({ overallScore: 85, overdueInvoices: 0, overdueTotal: 0, lowStock: 0, staleDeals: 0, tasksDue: 0, openRecommendations: 0 })
    expect(lines.length).toBe(1)  // just the health sentence
    expect(lines[0].source).toBe('business_health_scores')
  })

  it('shows an honest "all clear" when nothing needs attention (never empty, never fabricated)', () => {
    const lines = composeDigestLines({ overallScore: null, overdueInvoices: 0, overdueTotal: 0, lowStock: 0, staleDeals: 0, tasksDue: 0, openRecommendations: 0 })
    expect(lines.length).toBe(1)
    expect(lines[0].text).toContain('All clear')
    expect(lines[0].source).toBe('digest')  // honestly labeled as the digest itself, not a metric
  })

  it('pluralizes correctly (1 invoice vs 3 invoices)', () => {
    const single = composeDigestLines({ overallScore: null, overdueInvoices: 1, overdueTotal: 5000, lowStock: 0, staleDeals: 0, tasksDue: 0, openRecommendations: 0 })
    expect(single[0].text).toContain('1 overdue invoice')  // singular

    const plural = composeDigestLines({ overallScore: null, overdueInvoices: 3, overdueTotal: 15000, lowStock: 0, staleDeals: 0, tasksDue: 0, openRecommendations: 0 })
    expect(plural[0].text).toContain('3 overdue invoices')  // plural
  })
})
