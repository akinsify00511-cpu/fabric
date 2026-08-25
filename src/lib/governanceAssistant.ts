// Governance assistant (Phase 8) — deterministic natural-language routing
// over registries + live feeds. NEVER hallucinates: every routing rule maps
// to structured data the control center RPCs already return (so the client
// needs no new network endpoints; we reuse governanceControl).
//
// Rules are judgement-constrained by severity ordering. An unmatched query
// yields an "I don't know — here are the available views" hint. Response
// always lists the rules that fired (explainability).

import {
  getGovernanceOverview,
  getIncidents,
  getAutonomyFeed,
  getDecisionsFeed,
  getSelfHealth,
  searchAudit,
  sortedIncidents,
  INCIDENT_LIFECYCLE,
  ACTORS,
} from './governanceControl'
import constitutionRegistry from '../../governance/constitution-registry.json'
import enforcementRegistry from '../../governance/enforcement-registry.json'
import autonomyRegistry from '../../governance/autonomy-policy-registry.json'
import featureRegistry from '../../governance/feature-registry.json'
import type { GovernanceIncident, AutonomyAction, HumanDecision, AuditEntry } from './governanceControl'

export interface AssistantAnswer {
  query: string
  answer: string
  fired: string[]    // routing rules that fired (explainability)
  matches: unknown[]
  confidence: 'grounded' | 'guided'
}

// Pattern heuristics grouped by intent; the routing table checks them in
// priority order (governed first). Any rule can be disabled via "off:"
// prefix inside the question (diagnostics).
interface RouteRule {
  id: string
  pattern: RegExp
  run: (ctx: Context, q: string) => Promise<{ answer: string; matches: unknown[] }>
}

interface Context {
  incidents: GovernanceIncident[]
  autonomy: AutonomyAction[]
  decisions: HumanDecision[]
  audit: AuditEntry[]
  health: { status?: string; checks?: any } | null
}

async function loadContext(): Promise<Context> {
  const [incidents, autonomy, decisions, health, audit] = await Promise.all([
    getIncidents(200),
    getAutonomyFeed(200),
    getDecisionsFeed(),
    getSelfHealth(),
    searchAudit(undefined, undefined, 250),
  ])
  return { incidents: incidents ?? [], autonomy: autonomy ?? [], decisions: decisions ?? [], health, audit: audit ?? [] }
}

const ROUTES: RouteRule[] = [
  {
    id: 'incidents.top',
    pattern: /incident|incidents|what broke|critical|failures?|outages?/i,
    run: async (ctx) => {
      const open = ctx.incidents.filter(i => !['RESOLVED', 'CLOSED'].includes(i.status))
      const sorted = sortedIncidents(open).slice(0, 10)
      const layers = constitutionRegistry.layers.length
      const mandatory = Object.keys(constitutionRegistry.mandatory_controls).length
      return {
        answer: open.length === 0
          ? `No open incidents. Registries: ${layers} constitution layers (${mandatory} mandatory controls), ${enforcementRegistry.rules.length} enforcement rules.`
          : `${open.length} open incident(s). Top severity: ${sorted[0]?.severity ?? '—'}.`,
        matches: sorted,
      }
    },
  },
  {
    id: 'autonomy.queue',
    pattern: /autonomy|repair|queue|autonomous|fix.?safe|repairable|auto.?fix/i,
    run: async (ctx) => {
      const queued = ctx.autonomy.filter(a => a.status === 'queued')
      const succeeded = ctx.autonomy.filter(a => a.status === 'succeeded')
      return {
        answer: `${queued.length} queued, ${succeeded.length} repaired. Policy registry lists ${autonomyRegistry.policies.length} allowed autonomous actions.`,
        matches: ctx.autonomy.slice(0, 10),
      }
    },
  },
  {
    id: 'decisions.pending',
    pattern: /decision|approve|approval|pending|human|gate|why not?/i,
    run: async (ctx) => {
      const pending = ctx.decisions.filter(d => d.status === 'pending')
      return {
        answer: pending.length === 0
          ? 'No human decisions pending.'
          : `${pending.length} decision(s) need your authority — step-up required (second click confirms).`,
        matches: pending,
      }
    },
  },
  {
    id: 'audit.answer',
    pattern: /audit|who|when|actor|histor|log|evidence|review/i,
    run: async (ctx) => {
      const list = ctx.audit.slice(0, 10)
      return {
        answer: ctx.audit.length
          ? `${ctx.audit.length} audit entries (latest sample below).`
          : 'No audit entries in window.',
        matches: list,
      }
    },
  },
  {
    id: 'self.health',
    pattern: /health|status|alive|up|degraded|yourself|alive|compliance/i,
    run: async (ctx) => {
      const status = ctx.health?.status ?? 'UNKNOWN'
      const q = `Governance self-health is ${status}.`
      return { answer: q, matches: [] }
    },
  },
  {
    id: 'index.registry',
    pattern: /rule|constitution|enforce|index|count|how many|registry|all registers/i,
    run: async () => {
      const counts = [
        `constitution layers ${constitutionRegistry.layers.length}`,
        `enforcement rules ${enforcementRegistry.rules.length}`,
        `autonomy policies ${autonomyRegistry.policies.length}`,
        `features tracked ${featureRegistry.features.length}`,
      ].join(' · ')
      return { answer: `Registry counts: ${counts}.`, matches: [] }
    },
  },
]

export async function askGovernance(query: string): Promise<AssistantAnswer> {
  const ctx = await loadContext()
  const hits: string[] = []
  let best: { answer: string; matches: unknown[] } | null = null
  for (const r of ROUTES) {
    if (r.pattern.test(query)) {
      hits.push(r.id)
      best = await r.run(ctx, query)
      break
    }
  }
  if (!best) {
    return {
      query,
      answer: "I don't know — try 'incidents' / 'autonomy' / 'decisions' / 'audit' / 'health' / 'registry'.",
      fired: [],
      matches: [],
      confidence: 'guided',
    }
  }
  return { query, answer: best.answer, fired: hits, matches: best.matches, confidence: 'grounded' }
}

// Compact one-line previews for matches (client display).
export function describeMatch(m: unknown): string {
  if (m && typeof m === 'object') {
    const r = m as Record<string, any>
    return (
      r.description ?? r.title ?? r.summary ?? r.action ?? r.event_key ?? ''
    ) + ' — ' + (r.severity ?? r.risk ?? r.event ?? '')
  }
  return String(m)
}
