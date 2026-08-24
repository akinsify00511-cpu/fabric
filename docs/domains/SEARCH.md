# DOMAIN: SEARCH

**Purpose:** unified search that respects tenant isolation, permissions, relevance,
recency, and ranking.

**Current state (verified):** PARTIAL — three working search surfaces exist:
transcript full-text search (GIN-indexed transcript_segments, search_transcripts
RPC, membership-guarded); Riverways global_search (platform-admin, searches
users/orgs/RPCs/incidents/events); command palette (Cmd/Ctrl+K — `mod` modifier,
client-side navigation search). Knowledge search covers title + body.

**Gap (honest):** no single tenant-scoped business search RPC that searches across
people/leads/contacts/meetings/objectives/quotes/orders/activities in one query.

**Specification for the unified layer (when scheduled):**

- ONE RPC: `business_search(p_query, p_types[], p_limit)` — membership-guarded,
  SECURITY DEFINER, searches an explicit allowlist of tenant tables scoped by the
  caller's business (never cross-tenant), each with a per-type permission check.
- Entities in scope: staff (people), contacts, leads, meetings, strategic_objectives,
  quotes, sales_orders, tasks, business_events (activities).
- Ranking: exact-match boost > prefix > substring; recency tiebreaker; per-type
  caps so one noisy type can't flood results.
- UI: the command palette becomes the entry point (it already exists — compose,
  don't add a new page per Constitution Article III).
- All results link to canonical routes; no result leaks a record the user can't open
  (RLS is the backstop; the RPC pre-filters).

**Permissions:** membership-guarded; per-type authorization (e.g. payroll-adjacent
entities never in scope).

**Events:** search queries may emit usage events (feature adoption) — fire-and-forget.

**Failure states:** empty query → no call; no results → honest empty state.

**Security:** threat model §4/§5 (IDOR/tenant escape) — the allowlist + business
scoping is the control.

**Tests required before shipping:** cross-tenant denial, per-type permission,
ranking contract, empty-query no-op.

**Definition of Done:** one search entry point, tenant-safe, permission-respecting,
with ranked results across the scoped entity set.
