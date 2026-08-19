// Discovery Intelligence — pure, testable classification/aggregation logic.
// Phase B: SEO / AEO / GEO / AIO as one product layer.
//
// §22 anti-fabrication contract: every function computes ONLY from recorded
// observations/referrals. Missing data produces null (honest), never a
// synthetic number. The SQL RPCs in migration 20260819090000 mirror these
// rules server-side; keep them in sync.

export interface DiscoveryObservation {
  engine: string
  avenizePresent: boolean
  avenizeCited: boolean
  competitors?: { name: string; cited?: boolean; position?: number | null }[]
  observedAt?: string
}

/** NULL when nothing observed — honest insufficient data, not 0%. */
export function presenceRate(observations: DiscoveryObservation[]): number | null {
  if (observations.length === 0) return null
  const present = observations.filter((o) => o.avenizePresent).length
  return Math.round((1000 * present) / observations.length) / 10
}

/** Share of observations where the brand was cited as a source. */
export function citationRate(observations: DiscoveryObservation[]): number | null {
  if (observations.length === 0) return null
  const cited = observations.filter((o) => o.avenizeCited).length
  return Math.round((1000 * cited) / observations.length) / 10
}

/** Competitor citation counts across observations (B9 — who gets cited?). */
export function competitorCitationCounts(
  observations: DiscoveryObservation[],
): { name: string; cited: number }[] {
  const counts = new Map<string, number>()
  for (const o of observations) {
    for (const c of o.competitors ?? []) {
      if (!c?.name || !c.cited) continue
      counts.set(c.name, (counts.get(c.name) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, cited]) => ({ name, cited }))
    .sort((a, b) => b.cited - a.cited)
}

/**
 * The B9 content-gap verdict: a competitor is cited on a query where the
 * brand is absent → an opportunity to build the authoritative piece.
 */
export function isContentGap(o: {
  avenizePresent: boolean
  competitors?: { name: string; cited?: boolean }[]
}): boolean {
  return !o.avenizePresent && (o.competitors ?? []).some((c) => c?.cited)
}

export type BrandCheckSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical'

/** Words following "is a/an/the" — the category a statement assigns. */
function categoryTerms(text: string): string[] {
  const m = text.toLowerCase().match(/\bis (?:a|an|the) ([a-z0-9 ]+)/)
  if (!m) return []
  return m[1].replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 2)
}

/**
 * B8 AI Brand Truth Monitor — deterministic mismatch severity.
 * Name overlap must never mask a category error: the truth's category phrase
 * (terms after "is a/an/the") is compared against the statement's category
 * phrase separately from overall term coverage.
 *   - categories extracted and disjoint → contradiction: high; critical when
 *     the brand itself is also absent (a wholly different identity)
 *   - decent overall coverage with a compatible/absent category → none
 *   - no category assertion and zero overlap → medium (incomplete)
 *   - otherwise → low
 * Deterministic, explainable, no LLM guessing.
 */
export function classifyBrandMismatch(expected: string, aiStatement: string): {
  mismatch: boolean
  severity: BrandCheckSeverity
  correction: string | null
} {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
  const stop = new Set(['is', 'a', 'an', 'the', 'and', 'of', 'for', 'in', 'on', 'to', 'with', 'by'])
  const expectedTerms = norm(expected)
    .split(/\s+/)
    .filter((t) => t.length > 3 && !stop.has(t))
  const stmt = norm(aiStatement)
  if (!stmt.trim()) return { mismatch: false, severity: 'none', correction: null }

  const matched = expectedTerms.filter((t) => stmt.includes(t))
  const coverage = expectedTerms.length === 0 ? 1 : matched.length / expectedTerms.length

  const truthCat = categoryTerms(expected)
  const stmtCat = categoryTerms(aiStatement)
  const categoryContradiction =
    truthCat.length > 0 &&
    stmtCat.length > 0 &&
    !stmtCat.some((t) => truthCat.includes(t))

  const correction = `Correct the record: ${expected.trim()}`

  if (categoryContradiction) {
    return { mismatch: true, severity: coverage === 0 ? 'critical' : 'high', correction }
  }
  if (coverage >= 0.5) return { mismatch: false, severity: 'none', correction: null }
  if (stmtCat.length === 0 && coverage === 0) {
    return { mismatch: true, severity: 'medium', correction }
  }
  return { mismatch: true, severity: 'low', correction }
}

/** Opportunity priority (B10): intent × gap × cluster weight, 0–100. */
export function opportunityPriority(input: {
  isGap: boolean
  intent?: string | null
  competitorCitations?: number
  clusterPriority?: number // 1–5 from the target
}): number {
  let score = 0
  if (input.isGap) score += 40
  const intent = (input.intent ?? '').toLowerCase()
  if (intent.includes('transaction')) score += 25
  else if (intent.includes('commercial')) score += 20
  else if (intent.includes('information')) score += 10
  score += Math.min(input.competitorCitations ?? 0, 5) * 4
  score += (input.clusterPriority ?? 3) * 3
  return Math.min(100, score)
}

/** B14 ROI rollup: attributed revenue from explicitly linked referrals. */
export function rollupAttribution(
  referrals: { source?: string | null; entityId?: string | null }[],
): { total: number; linked: number; bySource: { source: string; visits: number; linked: number }[] } {
  const bySource = new Map<string, { visits: number; linked: number }>()
  let linked = 0
  for (const r of referrals) {
    const key = r.source?.trim() || 'direct'
    const entry = bySource.get(key) ?? { visits: 0, linked: 0 }
    entry.visits += 1
    if (r.entityId) {
      entry.linked += 1
      linked += 1
    }
    bySource.set(key, entry)
  }
  return {
    total: referrals.length,
    linked,
    bySource: [...bySource.entries()]
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.visits - a.visits),
  }
}

/** Parse UTM/referrer provenance from a URL + document referrer (capture). */
export function parseAttribution(url: string, referrer?: string | null): {
  source: string | null
  medium: string | null
  campaign: string | null
  landingPath: string | null
  referrer: string | null
} {
  try {
    const u = new URL(url)
    const source = u.searchParams.get('utm_source')
    const medium = u.searchParams.get('utm_medium')
    const campaign = u.searchParams.get('utm_campaign')
    // Known AI answer engines → classify as ai-citation when no explicit UTM.
    const ref = referrer || null
    let derivedSource = source
    let derivedMedium = medium
    if (!derivedSource && ref) {
      const host = new URL(ref).hostname
      if (/chatgpt|openai/.test(host)) { derivedSource = 'chatgpt'; derivedMedium = derivedMedium || 'ai-citation' }
      else if (/perplexity/.test(host)) { derivedSource = 'perplexity'; derivedMedium = derivedMedium || 'ai-citation' }
      else if (/claude/.test(host)) { derivedSource = 'claude'; derivedMedium = derivedMedium || 'ai-citation' }
      else if (/gemini|bard/.test(host)) { derivedSource = 'gemini'; derivedMedium = derivedMedium || 'ai-citation' }
      else if (/google\./.test(host)) { derivedSource = 'google'; derivedMedium = derivedMedium || 'organic' }
      else if (/bing\./.test(host)) { derivedSource = 'bing'; derivedMedium = derivedMedium || 'organic' }
      else derivedSource = host
    }
    return {
      source: derivedSource,
      medium: derivedMedium,
      campaign,
      landingPath: u.pathname,
      referrer: ref,
    }
  } catch {
    return { source: null, medium: null, campaign: null, landingPath: null, referrer: referrer || null }
  }
}
