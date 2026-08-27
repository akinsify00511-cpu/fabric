# AVENIZE PRODUCT CONSTITUTION

**Status:** Supreme governing law of the Avenize product. **Version:** 1.0 (2026-08-24)
**Hierarchy position:** This document outranks every other specification, convention, and
implementation. When code conflicts with this constitution, the code is wrong.

Governance hierarchy (a lower layer may never silently override a higher one):

```text
PRODUCT CONSTITUTION (this file)
  → docs/constitution/AVENIZE_EXCELLENCE_CONSTITUTION.md (the world-class standard;
    Journey Rule: no feature is complete until its entire user journey works from
    entry point to business outcome)
    → docs/architecture/AVENIZE_MASTER_PRODUCT_ARCHITECTURE.md
      → docs/domains/*.md (domain specifications)
        → docs/constitution/AVENIZE_DESIGN_CONSTITUTION.md + design system
          → implementation (src/, supabase/)
```

---

## Article I — Truth Before Action (NEVER ASSUME)

1. Existing code is not proof of correctness. Existing UI is not proof a feature works.
   Existing migrations are not proof production has them. A passing build is not proof of
   production readiness.
2. Every claim about system behavior must be established by inspection or execution:
   read the migration, call the RPC, probe the endpoint, run the test.
3. External reports (audits, checklists, AI conversations) are hypotheses, not facts.
   Verify each claim against the tree before acting on it. (Precedent: Sessions 31, 52 —
   most externally-reported "gaps" were stale.)
4. Reporting must expose truth: state IMPLEMENTED / FIXED / DISCOVERED / REMAINING /
   BLOCKED / TESTED / PRODUCTION VERIFIED / REGRESSIONS / RISKS. Never report only wins.

## Article II — One Source of Truth Per Concept

1. Every business concept has exactly ONE canonical representation:
   one table, one RPC, one component, one config source.
2. Duplication discovered → identify the authoritative implementation, migrate
   dependencies, remove the duplicate, add regression tests. Never maintain two
   competing sources of truth indefinitely. (Precedents: recurring_costs vs
   recurring_expenses; PLAN_PRICES vs Pricing.tsx vs business_entitlements CHECK —
   all consolidated into `pricing_tiers`.)
3. Generated artifacts (e.g. `supabase/contract/production_contract.json`, the contract
   seed migration) are deterministic outputs of generators. Edit the generator, never
   the artifact. Regeneration must produce an empty `git diff`.

## Article III — Composition Over Creation

1. Before building, audit what exists. New capabilities compose on canonical systems:
   tasks (work), notifications (alerts), claims (intelligence), business_events
   (telemetry), meetings (activity), get_current_staff (identity).
2. Never create a parallel system for something a canonical system already does
   (no second task store, no second notification system, no second event bus,
   no second permission model).
3. The product grows through coherent systems, not page proliferation. A missing
   capability is first mapped to its owning domain; a new route is the last resort.

## Article IV — Security Boundaries Are Non-Negotiable

1. **Postgres RLS is the only authorization boundary.** Client-side gates
   (`permissions.ts`, RequireModule, itemVisible) are UX, never security.
2. Every SECURITY DEFINER function that takes a business-scoped parameter MUST verify
   caller membership (`get_current_staff()`); RLS does not protect SECURITY DEFINER.
3. The browser never holds privileged credentials (no service-role key, no provider
   secret keys) and never decides payment success — the `payment_transactions` ledger
   settled by verified webhooks is the only payment truth.
4. Private storage is served by short-lived signed URLs behind a membership-verifying
   RPC. `getPublicUrl` on a private bucket is a constitutional violation.
5. Security fails CLOSED: unknown module → denied; missing gate RPC → not accessible;
   unverified webhook → rejected; degraded authz infra → restricted screen.
6. Tenant isolation is inviolable. Cross-tenant access must be proven to fail by test,
   not assumed from policy inspection.

## Article V — Honesty In Data (Anti-Fabrication)

1. The system never invents business information: no fabricated metrics, ratings,
   benchmarks, urgency, or "similar problems". When data is insufficient, show an honest
   empty/insufficient-data state, never a plausible-looking guess.
2. Small-sample guards: metrics below their minimum sample are NULL with an explicit
   insufficient-data note, not a number.
3. Provenance is labeled: FACT / INFERENCE / ESTIMATE / RECOMMENDATION. AI inference
   never silently becomes authoritative business fact; USER ENTERED, SYSTEM CAPTURED,
   AI INFERRED, and USER CONFIRMED are distinct states.
4. AI/LLM output quotes only assembled-context values. The extraction contract is
   "If you cannot identify the field, use null. Do not fabricate."

## Article VI — Resilience By Design

1. Ancillary features are best-effort and non-blocking: telemetry, analytics, activity
   feeds, and intelligence panels must degrade gracefully (honest null/empty) when their
   backing migration is not yet deployed — never crash the host workflow.
2. One failing sub-system degrades one slot, never the whole surface (per-engine
   EXCEPTION isolation precedent in `business_brain`).
3. The schema-availability circuit breaker silences known-missing endpoints for the
   session instead of flooding the console with doomed requests.
4. Automatic remediation is permitted only for safe, known failure classes (transient
   retry, stale-state refresh, reconciliation). Every automatic repair is logged.
   Never auto-perform high-risk financial or authorization changes.

## Article VII — Event-Driven Organism

1. Important business/system actions produce structured, tenant-aware, timestamped
   events on the canonical buses (`business_events`, `platform_activity_events`).
2. Event emission is fire-and-forget from the user's perspective; a telemetry failure
   never breaks a business write.
3. Payloads are sanitized at the boundary — credential-shaped keys are stripped before
   persistence.

## Article VIII — Verification Is The Definition of Done

1. A feature is DONE only when verified: build green, tests green, security gates green,
   and — where infrastructure permits — production-verified. "Implemented" is not a
   terminal state.
2. Every migration must apply cleanly AND idempotently (twice) against bare postgres:15.
3. Critical workflows are tested against realistic infrastructure (real Postgres with
   membership fixtures), not exclusively mocks.
4. The production smoke gate (`scripts/verify-production.sh`) is the definition of a
   successful deploy: a Vercel build alone is never "production".

## Article IX — Personalization Constitution

1. **Every authenticated human user receives an experience derived from their verified
   identity, business membership, role, permissions, responsibilities, business context,
   entitlements, preferences, and relevant activity.** No user is shown a generic
   experience when sufficient verified context exists to provide a more relevant one.
2. **The canonical context contract is ONE object.** All consumers — navigation, home
   surface, notifications, quick actions, recommendations, assistance — derive from the
   authoritative `my_context()` object (server-assembled; see docs/domains/PERSONAL_EXPERIENCE.md).
   No screen re-invents identity/membership/role/who-am-I ad hoc.
3. **Personalization may change presentation, prioritization, recommendations, workspace
   configuration, and assistance, but must NEVER:**
   - grant any permission the user does not already hold, or bypass RLS (Article IV);
   - alter subscription entitlements or the plan gate (SECURITY DEFINER is never a
     personalization lever);
   - expose any information outside the user's authorized scope — including cross-tenant,
     other-business, walled (legal/disciplinary/payroll/board), or other-person's data.
4. **A returning user is never re-onboarded.** The identity resolver
   (`resolve_current_user_context()`) is the sole authority over member vs onboarding
   classification; membership wins over any transient fetch/RLS artifact.
5. **Responsibilities scope attention.** "What matters to this person" is derived from
   their role, department/team, reporting lines, position, and held scopes — never from
   unfettered cross-business aggregation. Personal support (AI memory) assembles only
   facts within the user's own authorized scope; it is never surveillance, and every
   memory entry is labelled with its source (SYSTEM CAPTURED / AI INFERRED / USER ENTERED /
   USER CONFIRMED).
6. **Personal goals re-use governed metrics when possible** so progress is a real number
   or an honest insufficient-data note (Article V) — never an invented figure.
7. **The Personalization Constitution is applied ON the existing architecture by
   composition** (Article III) — existing canonical objects (staff, roles, assignments,
   entitlements, preferences, events) are consumed, never duplicated into parallel
   `user_*` tables.

## Article X — Amendments

1. This constitution changes only by explicit, documented decision. Amendments are
   committed with rationale in the commit message and recorded in AGENTS.md.
2. When an implementation constraint forces a conflict, stop, document the conflict
   (current behavior, required behavior, constitutional requirement, resolution, risk),
   and resolve per the hierarchy — never patch silently.
