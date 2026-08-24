# AVENIZE EXCELLENCE CONSTITUTION

**Status:** Binding standard of exceptionality for the Avenize product. **Version:** 1.0 (2026-08-24)
**Hierarchy position:** Subordinate only to `docs/constitution/AVENIZE_PRODUCT_CONSTITUTION.md`;
superior to every architecture document, domain specification, design artifact, and line of code.
**Purpose:** to state, operationally and measurably, the level of exceptionality Avenize must have —
so that every contributor (human or AI) is held to a global, world-class bar, not a local "it works
on my machine" bar.

---

## Preamble — The Standard We Are Held To

Avenize is held to the standard of the best software products in the world — the products whose
quality users feel without being told: the invisibility of Google Workspace, the speed of Linear,
the reliability of Zoom, the correctness of Stripe, the coherence of Notion.

"World-class" in this document is never aspirational language. Every clause below is measurable:
it names a test, a budget, a gate, or an observable behavior. If a clause cannot be verified, it
does not belong in this constitution.

The constitution's core insight, learned the hard way across 54 sessions: **a page can look
implemented while the journey is actually broken.** Avenize is therefore audited, specified, and
accepted by **user journey**, never by page.

---

## Article I — The Journey Rule (the supreme completeness rule)

1. **No feature is considered complete until its entire user journey works from entry point to
   business outcome.** A rendered page is not completeness. A merged PR is not completeness.
   A passing build is not completeness. An applied migration is not completeness. Completeness is
   a user starting at the entry point and arriving at the business outcome, with every step in
   between working against real infrastructure.
2. Every product capability is defined as a **journey map**: `Entry → Steps → Business Outcome →
   Acceptance evidence`. A capability without a journey map is unspecified; a journey without
   acceptance evidence is unverified; an unverified journey is incomplete.
3. The canonical journeys (initial, non-exhaustive):
   - **Meetings:** Schedule → Join → Video/Audio/Text → Capture → End → Post-meeting record →
     Follow-up → CRM → Objective.
   - **Sales:** Lead → Request → Quote → Customer → Payment → Revenue.
   - **Onboarding:** Signup → Company → Membership → Data → Objective → First value.
   - **Payment:** Pricing → Checkout → Paystack → Verification → Subscription → Entitlement →
     Email receipt.
4. Audits are conducted **by journey, not by page**. When a gap is found anywhere in a journey,
   the whole journey is marked incomplete, and the gap is recorded with its journey context —
   never as an isolated page defect.
5. **UI is never evidence of capability.** A card labeled "Video", "Transcript", or "AI" is a
   claim, not a feature. Each claimed capability requires an executable acceptance test that
   exercises the real behavior (see Article V).

## Article II — The Exceptionality Bar (six measurable dimensions)

Every user-facing surface is judged on all six. Failing one fails the surface.

1. **Correctness** — real data, real behavior, server-authoritative truth. Every number on screen
   is traceable to a record. Nothing is computed client-side that the server must own.
2. **Coherence** — one organism. New capability composes on canonical systems (tasks,
   notifications, claims, events, meetings, identity). No parallel stores, no second permission
   models, no duplicate concepts.
3. **Completeness** — the whole journey including the unglamorous states: loading, empty, error,
   permission-denied, offline, expired-session-mid-action, last-item-deleted, first-run.
4. **Candor** — honest states everywhere. Insufficient data is shown as insufficient. A capability
   that does not exist is never implied by the UI. Failure is surfaced, never swallowed.
5. **Craft** — design-constitution compliance: tokens only, no hardcoded hex, motion with
   restraint, typography and spacing discipline, no AI-slop patterns.
6. **Care** — edge cases are part of the design, not afterthoughts: slow networks, small screens,
   screen readers, long names, empty databases, interrupted writes.

## Article III — Experience Standards (measurable)

1. **Performance.** Initial route JS on the first-paint path stays within the enforced bundle
   budget (verified via `vite build --manifest` eager-graph inspection — a dynamic-only dependency
   trapped in an eager chunk is a constitutional violation). Interactions respond in <100ms.
   Intelligence surfaces load progressively with skeletons. Public surfaces target Lighthouse
   ≥90 performance / 100 accessibility.
2. **Accessibility.** WCAG 2.2 AA minimum: contrast verified against the *rendered* background
   (not white), full keyboard operability, labeled controls, visible focus, and
   `prefers-reduced-motion` respected.
3. **Reliability.** Normal operation produces **zero console errors**. A console wall of doomed
   requests is a defect class (the schema-availability circuit breaker exists precisely because
   of this). No user action fails silently — every mutation result is inspected.
4. **Responsiveness.** Every surface is usable at 360px width. Touch targets ≥44px. The mobile
   experience is a first-class surface, not a scaled-down afterthought.

## Article IV — The Five Non-Negotiables of Any User-Facing Capability

A capability may not ship, and may not be claimed, unless all five hold:

1. **It works end-to-end against real infrastructure** — real Postgres, real auth, real storage,
   real provider where applicable. Mock-only paths are development scaffolding, never shipped
   behavior.
2. **Its failure states are designed and honest** — each failure mode has a user-visible state
   and a usable recovery path.
3. **Its empty states teach** — a first-empty state is a gamified first step with guidance and an
   action, never a dead-end notice.
4. **Its data lands in the canonical model** — no side stores, no localStorage as a system of
   record, no parallel tables.
5. **Its outcome is observable** — a structured event is emitted; the outcome is visible in
   analytics/activity surfaces.

## Article V — Acceptance Evidence (how claims are proven)

1. Every journey owns an **acceptance suite**: executable tests mapped to journey steps (unit →
   integration → e2e → live-production smoke). The suite is the contract; the implementation is
   negotiable, the contract is not.
2. Real-behavior tests are mandatory for claimed capabilities. Example (meetings): two users
   join; both see video; both hear audio; chat persists; capture persists; refresh/reconnect does
   not corrupt the meeting.
3. A capability that cannot yet meet the bar is labeled honestly — hidden behind
   `module_status.ready = false` or marked beta — rather than shipped as theater.
4. The bar is **ratcheted**: once a journey passes, its acceptance suite becomes a permanent
   regression gate in CI. The standard only moves upward.

## Article VI — Accountability

1. Every work session reports in the constitutional vocabulary: **IMPLEMENTED / FIXED /
   DISCOVERED / REMAINING / BLOCKED / TESTED / PRODUCTION VERIFIED / REGRESSIONS / RISKS.**
   Reporting only wins is a constitutional violation (Product Constitution, Article I.4).
2. "Done" claims name their evidence: the test run, the probe output, the production check.
   Unverifiable claims are reported as unverified.
3. When reality falls short of this constitution, the honest state is recorded in the governing
   document (quality gate, runbook, or journey map) — the document tells the truth even when the
   truth is "Production: FAIL".

## Article VII — Amendments

1. This constitution changes only by explicit, documented decision, committed with rationale and
   recorded in AGENTS.md.
2. A lower layer may never silently override this standard. When an implementation constraint
   forces a conflict, stop, document the conflict, and resolve per the governance hierarchy
   (Product Constitution, Article IX).
