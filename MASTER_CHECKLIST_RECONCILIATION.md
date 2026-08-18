# Avenize Master Checklist — Reality Reconciliation (Session 23, 2026-08-18)

**Protocol:** Verified reality before acting, per the established audit method. The
prior sessions built the majority of the consolidated master directive; this report
maps each P0/P1 item to its ACTUAL state in the codebase (not the checklist's claims),
so effort goes to genuinely-missing work rather than re-doing completed work.

Baseline: tsc clean, vite build 0 warnings, vitest 226/226, schema-drift 0, HEAD 1b237cc.

## Legend
- ✅ DONE — verified in code; no action.
- ⚠️ PARTIAL — exists but has a real gap (actioned below).
- ❌ MISSING — genuinely not built (actioned below).
- ⏸️ BLOCKED — needs external data/decision (§22 anti-fabrication) or explicitly deferred.

---

## P0 — Critical (public-launch gate)

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | Rebrand FABRIC→Avenize | ⚠️ | UI/manifest/SEO/Landing clean (Sessions 17/20/21). 5 migration SQL *comment headers* still say "FABRIC Layer 1" (internal-only, never rendered) + the repo dir is `fabric`. Quick fix. |
| 2 | Approved UI/UX replacement | ⚠️ | `AVENIZE-DESIGN-SPECIFICATION.md` exists + brand tokens applied app-wide (Session 10/16/17/18). But: 138 pages, 4 overlapping "dashboard" surfaces (Dashboard, CompanyHome, ExecutiveCockpit, OwnerIntelligence), duplicate EmptyState component, and no documented "approved flow → route" map. The directive says "don't preserve old UI because it works." REAL cleanup work, but risky to do blindly without the approved mockups — needs the approved assets located. |
| 3 | Identity architecture (Person/Business/Membership/account-type) | ⚠️ | `organizations` + `organization_memberships` + `businesses.{organization_id,parent_business_id,entity_type}` exist (migration 20260817150000). `staff` is the Person↔Business membership. BUT: no `account_type` dimension (owner/staff/consultant/vendor/expert/partner) — everyone is "staff" with a `role`. The directive's core conceptual complaint ("everyone can effectively become staff") is REAL. |
| 4 | Multiple roles per user | ✅ | `staff_functional_roles` (027) is many-to-many; `useToolAccess` aggregates the UNION of tools across all assigned functional roles. "Owner + Finance + Sales" works today. |
| 5 | Personalized experience (role-aware) | ⚠️ | `useExperienceContext` (Session 21) + role-aware Dashboard focus mode (owner/manager/staff views, Session 21 P0.4 #6). BUT: only 3 role views; no dedicated Sales/Finance/HR/Operations personalized surfaces per the directive's per-role list. |
| 6 | "My Work" command center | ✅ | `CompanyHome` ("My Work" tab) — pending approvals + tasks + notifications + attention items (Session 17/21). |
| 7 | Business Intelligence Core | ✅ | The deterministic Intelligence Engine: governed metrics (086), business health (093), recommendations (091), data quality (089), EBITDA (this session), context graph (087). NOT a chatbot — pure SQL over real tables (§22). |
| 8 | Business Diagnostic Engine | ✅ | `compute_business_health` (093) answers what/category-health; `run_recommendation_rules` (091) + `run_behavior_recommendation_rules` answer why/what-to-do; financial impact in `expected_impact` JSONB. Root-cause narrative (the "why") is the deferred generative layer (Phase 3). |
| 9 | Avenize Business Health Score™ | ✅ | `compute_business_health` (093) — overall + 6 dimensions (financial/sales/customers/operations/people/projects), explainable breakdown, honest insufficient-data. `BusinessHealthCard` shows the score + plain-language label. |
| 10 | Business Memory | ✅ | `organizational_memory` + `decision_log` (064); recommendation outcome loop (088) records actions taken + actual vs expected impact. |
| 11 | Action Engine | ✅ | Recommendations → "Act → Create task" (Session 14f §14); automation engine creates tasks/notifications (007); reversal/undo (Reversal.tsx). |
| 12 | 7-day full-access trial | ✅ | Server-side `trial_ends_at`/`trial_started_at` (049) + `is_business_in_trial()`; `TrialBanner` countdown; 7-day auto-start trigger. |
| 13 | Autonomous trial experience (feature discovery) | ❌ | Self-instrumentation infra exists (Session 21 #14: `feature_activation`, `onboarding_funnel`, usage events) but NO feature-discovery engine consumes it ("You haven't explored Finance" / "Inventory could find ₦X in trapped capital"). Genuine gap. |
| 14 | Pricing engine (founding pricing + 30-50% future increase arch) | ⚠️ | 5-tier pricing (Pricing.tsx, Session 17). BUT: no explicit "2026 Founding Pricing" language, no price-lock config, no future-pricing-tier configuration surface for a 30-50% increase. Architecturally the plans are in `business_entitlements.features` so a price change is config — but the founding-period framing + price-lock is missing. |
| 15 | AI plan recommendation at trial end | ❌ | ZERO callers. `feature_activation` data exists but nothing recommends a plan ("Based on how you use Avenize, we recommend Business"). Genuine, buildable P0 gap. |
| 16 | Self-service support | ⚠️ | `SarahChat` rebranded "Help Guide" (Session 4, rule-based). Contextual help exists via `useToolOnboarding`. No real AI assistant (deferred generative layer). Honest about being rule-based. |
| 17 | Autonomous error detection | ✅ | `platform_error_events` + `errorCapture.ts` (window.onerror/unhandledrejection) + PlatformOpsDashboard (realtime) + integration health checker + paging (Session 22/this session). |
| 18 | Notification system | ✅ | `notification_preferences` (036) + `NotificationBell` + categories + email/in-app. Digest delivery (this session). |
| 29 | Security (server-side auth, RLS, UI-hiding≠security) | ✅ | RLS attack suite (04_rls_attack_suite.sql), cross-tenant fix (080), MFA enforcement (Session 10), `is_platform_admin` boundary, `get_current_staff` everywhere. permissions.ts explicitly documents "RLS is the security boundary; client is UX only." |
| 30 | Database architecture (dedup, FK, indexes, RLS review) | ✅ | Duplicate tables reconciled (this session §1); migration matrix; 112/112 migrations apply (Session 15); schema-drift CI gate. |
| 31 | Technical debt (dead code, dupes) | ⚠️ | Dead code purged (Session 10/12). Remaining: duplicate EmptyState pair, 138 pages (some legacy). Tied to #2 cleanup. |
| 33 | UX quality control (all states) | ✅ | Loading/empty/error/success states across pages; honest empty states are a recurring standard (§21). |

## P1 (intelligence/personalization) — all ✅ or tied to P0 gaps above.

## P2/P3 (network/marketplace) — ⏸️ explicitly "not required for v1, build progressively."

| # | Item | State | Evidence |
|---|---|---|---|
| 19 | Business Network foundation | ⏸️ | No business/vendor profiles. Architecture-not-features (deferred per directive). |
| 20 | Business Need Engine | ⏸️ | No need taxonomy. Deferred. |
| 21 | B2B matching | ⏸️ | Deferred. |
| 22 | B2B advertising | ⏸️ | Deferred. |
| 23 | RFQ system | ⚠️ | `purchase_requests`/`rfqs`/`rfq_line_items` exist (Session 7) but internal procurement only — not the B2B "I Need Something → find vendors" network. |
| 24 | Business Graph | ✅ (partial) | `business_relationships` + `recursive_neighbors` (060/087) — the internal entity graph. Not the cross-business network graph. |
| 25 | Vendor reputation | ⏸️ | `Vendors.tsx` exists (internal supplier CRUD) but no reputation/scoring. Deferred. |
| 26 | Business benchmarking | ⏸️ | `sector_benchmark` RPC (Session 21) — internal/sector only. External benchmark data BLOCKED (§22). |
| 27 | Industry intelligence framework | ⚠️ | Industry captured at onboarding + industry-default tool seeding. No extensible per-industry intelligence layer. |
| 28 | Expert network | ⏸️ | Deferred. |

---

## Prioritized action list (genuine gaps only, buildable without external data)

1. **P0 #15 — AI plan recommendation** (buildable NOW, high value, zero callers). Uses existing `feature_activation` + `onboarding_funnel` data to recommend a plan at trial end with an evidence-based rationale. **← START HERE.**
2. **P0 #13 — Autonomous trial feature-discovery engine** (buildable NOW; consumes the same self-instrumentation data to surface "you haven't explored X" + value estimates).
3. **P0 #1 — Finish FABRIC rebrand** (migration comment headers; trivial).
4. **P0 #3 — Account-type dimension** (owner/staff/consultant/vendor/expert/partner on the Person↔Business membership; addresses the "everyone is staff" conceptual complaint). Medium, schema + RLS.
5. **P0 #14 — Founding-pricing framing + price-lock** (copy + config, not architecture).
6. **P0 #2 — UI cleanup / approved-flow map** (needs the approved mockups/assets located first — ask the user; doing this blind risks regressions across 138 pages).

Items #2 and #16 (real AI assistant) need either the approved assets or the generative-AI decision; flagged, not started blind.
