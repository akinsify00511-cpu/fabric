# AVENIZE — MASTER PRODUCTION CLOSURE + DIGITAL MARKETING OS
### Unified build specification (merge of: Social Media Management checklist + Full Digital Marketing OS checklist + Production Closure checklist)

**Mission:** Take the existing Avenize codebase to a fully production-capable business operating system, and make Digital Marketing a first-class business domain inside it — owned by Avenize, not by a third-party SaaS.

---

## NON-NEGOTIABLE RULES (apply to every phase)

1. **Do not rebuild functioning systems.** Audit first, then extend. Every capability area below lists the existing infrastructure it MUST compose on.
2. **No fake/demo functionality.** No mock data, no stubbed "success," no UI implying a capability the backend doesn't support (§22 anti-fabrication).
3. **A feature is complete only when the whole chain works:**
   `UI → interaction → business logic → API/Edge Function → DB/RPC → RLS/security → storage/integration → persistence → realtime/notification → error handling → audit → production verification`
   A page, a button, a modal, a table, or a stub is NOT a feature.
4. **Composition over duplication (§2/§0.5).** Before writing any new table/RPC/page, check the inventory in §A. NEVER create a parallel system (no second event bus, no second notifications table, no second approvals engine, no second tasks table, no second media bucket).
5. **Security model:** RLS is the real authorization boundary (`business_id IN (SELECT business_id FROM get_current_staff())`). Every SECURITY DEFINER RPC MUST verify membership via `get_current_staff()`. Client-side gates are UX only. Never `getPublicUrl()` on private buckets — signed URLs after a membership check. Secrets never reach the browser.
6. **Graceful degradation (§24):** every client wrapper is best-effort/non-blocking — the app must never crash because a migration isn't deployed yet.
7. **Honest states (§21/§22):** insufficient data → say so (NULL, not 0). No fabricated numbers, urgency, or recommendations. FACT/INFERENCE/UNKNOWN evidence tagging on intelligence outputs.
8. **Idempotent migrations:** `CREATE TABLE IF NOT EXISTS`, `DROP ... IF EXISTS` before re-creating policies/constraints/overloaded functions, `CREATE OR REPLACE FUNCTION`, `ON CONFLICT` where applicable. Every migration must apply cleanly TWICE against postgres:15.
9. **Module gate registration:** any new module must be registered in `module_plan_tiers` + `module_status` (migration `20260101000005`), gated via `can_access_module`/`RequireModule`, mapped in Shell `ROUTE_MODULE`, and set `ready=true` ONLY when it persists real data end-to-end. Unknown modules fail closed.
10. **Schema-drift rule:** every `.from('table')` and `.rpc('fn')` in the frontend must have a backing migration — CI fails otherwise. Verify before shipping.
11. **Verification per commit:** `npx tsc -b --noEmit` clean, `npx vite build` 0 warnings, `npx vitest run` green, schema-drift 0, new migrations apply clean + idempotent (local postgres:15 Docker test, ON_ERROR_STOP=1, run twice).

---

## A. COMPOSITION-FIRST INVENTORY (what already exists — build ON this)

| Capability area | Existing infrastructure to reuse (DO NOT duplicate) |
|---|---|
| Social posts/scheduling shell | `social_posts`, `social_metrics`, `brand_assets` tables (migration `003_social_media.sql`) + `src/pages/Social.tsx` (draft/scheduled/published/failed states exist — no publishing engine, no OAuth, no platform adapters yet) |
| Email marketing | `email_contacts`, `email_templates`, `email_campaigns`, `email_sends`, `email_link_clicks`, `email_sequences`, `email_sequence_steps`, `email_sequence_enrollments` (migration `009`) + Campaigns.tsx + `send-email` Edge Function + Resend provider wiring (migration `052`) + template extension (`20260101000001`) |
| Leads | `leads` table (migrations 041/075) + Leads.tsx + LeadCapture.tsx |
| CRM / revenue attribution | `contacts`, `deals` (stage model), `invoices`, `payments` + CRM.tsx |
| Automation engine | `automations`, `automation_runs` (migration 007) + `execute_automation_action` + `run_due_automations` + `automation_health` + retry/DLQ (`20260101000013`) — Trigger→Condition→Action ALREADY EXISTS |
| Event bus (nervous system) | `business_events` + `emit_business_event` (058/059/090) — marketing events must emit here, not a new bus |
| Approvals | `approvals` engine (039) + `start_approval_protocol` + ApprovalRouter component + `is_approval_required` threshold config (20260818170000) — social/marketing approval chains MUST use this |
| Notifications | `notifications` table + NotificationBell (priority ordering already in place) |
| Business intelligence | `claims` (recommendation lifecycle + expected/actual impact), `kpi_metrics`, `business_health_scores`, `business_brain`, `diagnose_business`, `next_best_action`, `business_value_ledger`, `organizational_memory`, `decision_log` |
| Analytics/telemetry | `usage_events` + self-instrumentation RPCs + `analytics_events` (migration 111) |
| AI processing | `transcribe-audio`, `parse-intent` Edge Functions (OpenAI via server-side key) — the AI content engine must call through server-side Edge Functions, never from the browser |
| Communications | `send-sms`, `send-whatsapp`, `send-email`, `dispatch-webhooks` Edge Functions + provider wiring (040/052) |
| Monetization/gating | `business_entitlements`, `module_plan_tiers`, `module_status`, `can_access_module`, pricing_tiers |
| Platform ops | `platform_ops`, `platform_integration_status` (register new social-platform integration health HERE for the builder view, not customer pages) |
| Multi-company | `organizations`, `organization_memberships`, `businesses.parent_business_id`, SubsidiarySwitcher in Shell |
| Storage pattern | `storage.buckets` + signed-URL flow; meeting-recordings/avatars/documents buckets already exist |

---

## B. PHASE 0 — BASELINE AUDIT (before writing any code)

1. Audit current repo. Produce a working matrix:
   `Feature | UI | Handler | Backend | DB | RLS | Storage | Integration | Persistence | Error handling | Audit | Production`
2. Classify each item: production / partial / frontend-only / backend-only / infra-dependent / duplicate / dead / mock / stub.
3. Identify undeployed migrations, broken frontend/backend contracts, dead routes, RLS gaps.
4. Do not mark anything green until it passes the entire chain.

---

## C. MERGED MASTER CHECKLIST (the two checklists unified + production closure)

### SECTION 1 — SOCIAL MEDIA MANAGEMENT (Avenize-owned; no Buffer/Hootsuite/Sprout)

**Constraint:** The ONLY unavoidable external dependency is each social network's official API (Meta, LinkedIn, TikTok, X, YouTube). Avenize owns everything else.

Extend `social_posts`/`social_metrics` (migration 003) — do not create parallel social tables.

- 🔴 Social Command Center (`Social` module): accounts, today's posts, scheduled, awaiting approval, published, failed, performance, leads generated, campaigns, content opportunities.
- 🔴 Social account management + OAuth connection system per platform (Facebook, Instagram, LinkedIn, TikTok, X, YouTube where permitted).
- 🔴 Secure token storage/rotation — encrypted at rest via a server-side RPC (pgcrypto), NEVER returned to the browser; token expiry detection + re-authentication flow.
- 🔴 Platform capability detection (per-platform feature map: what publishing/analytics/inbox the API actually permits; UI adapts per platform).
- 🔴 Content composer: caption editor, media library, hashtag management, platform-specific content transformation (one content → LinkedIn long-form / Instagram carousel caption / TikTok short caption / X short-form).
- 🔴 Content calendar (week grid: platform, campaign, pillar, media, caption, status, owner, approval state, scheduled time).
- 🔴 Draft management + brand voice + content pillars + content categories + campaigns.
- 🔴 Approval workflow — reuse the existing `approvals` engine (creator → marketing manager → business approval → scheduled → published; every step audit-logged).
- 🔴 Scheduling engine (ours): scheduled post → publishing queue → platform adapter → platform API → published → status/webhook → analytics.
- 🔴 Publishing queue + publishing worker (Edge Function) + retry with backoff + failed-post handling + post history + publishing status.
- 🔴 Rate-limit handling + API failure handling + token-expiry recovery per platform adapter.
- 🔴 Social analytics (extend `social_metrics`): impressions, reach, engagement, engagement rate, clicks, shares, saves, video views where available.
- 🔴 Social → CRM attribution: social activity → lead → contact → deal → revenue (`leads` + `contacts` + `deals`). UTM tracking + lead attribution.
- 🔴 Social lead capture + social inbox + comment/message management WHERE APIs permit → intent detection → create lead/opportunity/follow-up task.
- 🔴 AI caption generation, AI content repurposing, AI campaign generation, AI content calendar, best-time recommendations, content performance scoring — all via server-side Edge Functions (never expose the key).
- 🔴 Social permissions (team collaboration), full audit trail, platform-specific compliance controls.
- Register module in the two-flag gate; keep `ready=false` until publish actually works against at least one real platform sandbox.

### SECTION 2 — FULL DIGITAL MARKETING OS (first-class domain)

Marketing must connect: `Marketing → Leads → CRM → Sales → Revenue → Finance → Intelligence`. Not a standalone marketing app.

**2.1 Marketing Command Center (new `Marketing` module home)**
- 🔴 Marketing health, campaign performance, leads, qualified leads, opportunities, revenue attributed, CAC, CPL, CPA, ROAS, ROI, website traffic, SEO visibility, social/email/content performance, marketing budget, spend vs budget, forecast, upcoming campaigns, tasks requiring attention, AI recommendations.
- 🔴 Marketing strategy: objectives, revenue targets, target markets, ICP, personas, customer segments, positioning, value propositions, channel/campaign strategy, content pillars, marketing calendar, quarterly/annual plans.

**2.2 Content Marketing**
- 🔴 Content management: articles, blog posts, landing pages, case studies, whitepapers, e-books, guides, videos, podcasts, webinars, infographics, carousels, email content, social content.
- 🔴 AI content engine (server-side): content briefs, articles, repurposing (article→social campaign, video→clips, case study→campaign), email sequences, ad variations, brand-voice enforcement, content quality scoring.

**2.3 SEO Operating System**
- 🔴 Keyword intelligence: research, groups, search intent, difficulty, volume, rank tracking, competitor rankings, SERP monitoring, content gaps, opportunities, cannibalization detection.
- 🔴 On-page: title/meta/H1-H2 analysis, internal links, image alt text, schema recommendations, content optimization, readability, search-intent matching.
- 🔴 Technical: sitemap, robots.txt, canonicals, redirects, broken links, 404 monitoring, page speed, Core Web Vitals, indexation, duplicate content.

**2.4 Paid Advertising (official APIs only)**
- 🔴 Meta/Google/LinkedIn/TikTok Ads: campaign creation/monitoring, ad groups, ads, creative management, audiences, budgets, comparison.
- 🔴 Metrics: spend, impressions, reach, CPM, CPC, CTR, CPL, CPA, CAC, conversion rate, ROAS, revenue, profit contribution.

**2.5 Lead Generation (build on existing `leads`)**
- 🔴 Capture: website forms, landing pages, social leads, ad leads, WhatsApp leads, email leads, QR codes, AICapture, manual, imports.
- 🔴 Intelligence: scoring, qualification, intent detection, duplicate detection, enrichment, source/campaign attribution, routing, assignment.

**2.6 Marketing Automation (build on existing automation engine 007/20260101000013)**
- 🔴 Trigger→Condition→Action composed over the EXISTING engine. Reference flow: lead submits form → score → if commercial → create CRM contact/opportunity → assign → send communication → follow-up task → notify → track outcome (all via `emit_business_event`).

**2.7 Email Marketing (build on existing migration 009 + send-email/Resend)**
- 🔴 Campaigns, templates, drag/drop composer, segments, lists, personalization, drip campaigns, sequences, A/B testing, scheduling, open/click tracking, unsubscribe, bounce handling, delivery tracking, revenue attribution.

**2.8 Landing Page Builder**
- 🔴 Builder, templates, forms, CTA blocks, conversion tracking, A/B testing, SEO controls, analytics, custom domains where supported.

**2.9 Conversion Rate Optimization**
- 🔴 Funnel: traffic → landing page → form → lead → opportunity → customer. Drop-off detection, CTA/form analysis, page performance, A/B testing, AI recommendations.

**2.10 Attribution (link to CRM/Finance)**
- 🔴 Channel → campaign → content → lead → deal → revenue. Marketing-sourced/influenced revenue, CAC, CPL, CPA, ROAS, ROI, revenue per channel/campaign/content.

**2.11 Website Analytics**
- 🔴 Visitors, sessions, sources, campaigns, landing pages, events, funnels, form submissions, CTA clicks, devices, geography, user journeys (first-party tracking, not a GA dependency).

**2.12 Competitor Intelligence (legitimate data sources only; no unauthorized scraping)**
- 🔴 Competitor profiles, keywords, content, ads, social activity, positioning, gaps.

**2.13 Marketing Budget (link to Finance)**
- 🔴 Marketing/campaign/channel budgets, actual spend, variance, forecast, spend alerts, ROI, profit contribution.

### SECTION 3 — PRODUCTION CLOSURE (non-marketing core, merged from the closure checklist)

- 3.1 🔴 Quick Capture multimodal: clip/file (picker→validate→Storage→attach→interpret→business event→persist), voice (SpeechRecognition→transcript→intent→confirm→event, permission/fallback/recovery), image (picker/camera→validate→compress→upload→OCR where appropriate→interpret→persist).
- 3.2 🔴 Generative AI Copilot (separate from deterministic engine): conversational interface, business-context retrieval, permission-aware actions, confirmation before consequential actions, AI audit trail, usage/cost tracking, rate limits, safety guardrails, never bypasses RLS.
- 3.3 🔴 Autonomous trial intelligence: unused-feature detection + value estimation + personalized recommendations (build on `feature_discovery`/`trial_assistance`/`recommend_plan` already shipped — extend, don't rebuild).
- 3.4 🔴 Account types + role experiences: owner/staff/consultant/vendor/expert/partner with account-type onboarding, permissions, navigation, dashboards + function experiences (sales/finance/HR/ops/marketing/procurement/projects/executive) on ONE underlying business graph.
- 3.5 🔴 Multi-company/subsidiary OS: parent/subsidiary dashboards, consolidated KPIs/revenue/expenses/profit/cash/CRM/intelligence/health, cross-company reporting, group approvals, intercompany transactions (build on organizations/org memberships already merged).
- 3.6 🔴 OCR/intelligent documents: receipt/invoice upload → OCR → vendor/amount/date/line-items → confidence → human confirmation → transaction + audit.
- 3.7 🔴 Document management: version history, restore, revision comparison, conflict resolution, activity history.
- 3.8 🔴 Offline capability: detection, local persistence, offline create/update, sync queue, background sync, conflict resolution, retry, offline UX (extend presenceQueue pattern).
- 3.9 🔴 Multi-location: hierarchy, permissions, filtering, location dashboards/inventory/staff/finance/reporting.
- 3.10 🔴 Multi-currency: transaction vs base currency, FX rates, conversion, currency-aware invoices, cross-currency consolidation.
- 3.11 🔴 Communications completion: WhatsApp production config (templates, incoming/outgoing, delivery/retry/failure, CRM linkage, webhooks), SMS production provider (delivery/retry/cost), push (browser + mobile subscriptions, delivery, retry, routing).
- 3.12 🔴 Enterprise auth: SSO/SAML (IdP config, metadata, org mapping, provisioning/deprovisioning, role mapping), Passkeys/WebAuthn.
- 3.13 🔴 Platform automation completion: production migration, trigger verification, scheduled execution, retry/DLQ/monitoring; webhooks live dispatch, delivery history, retry, signature verification.
- 3.14 🔴 Data governance: user/business export, deletion workflows, retention policies, scheduled deletion, recovery policy, data residency.
- 3.15 🔴 Disaster recovery (test, don't just document): automated backups + verification, restore procedure + testing, point-in-time recovery, edge-function recovery, RTO/RPO runbook.
- 3.16 🔴 Feature flags/rollback: flags, per-org/per-role rollout, kill switches, progressive rollout, emergency rollback, config audit.
- 3.17 🔴 Mobile production: Android signing/Play build/push/deep links/real-device QA; iOS signing/TestFlight/push/deep links/App Store release.
- 3.18 🔴 UI/UX finalization: consolidate duplicate dashboards/EmptyStates/navigation, resolve Dashboard/CompanyHome/ExecutiveCockpit/OwnerIntelligence into coherent IA (BusinessHome is the foundation — already shipped; extend it).
- 3.19 🔴 Localization: translation catalogue, hardcoded-string removal, language switching, localized notifications/emails, locale QA.
- 3.20 🔴 Accessibility: text size, keyboard nav, screen-reader, focus states, contrast, reduced motion, accessible forms/dialogs/tables/charts.
- 3.21 🔴 Industry intelligence: industry KPIs/health models/recommendations/workflows/benchmarks, extensible without rewriting the engine.

### SECTION 4 — INTELLIGENCE APEX (the differentiators)

- 4.1 🔴 **AI Marketing Director:** reads Marketing + CRM + Sales + Finance + Customers + Products + Projects + Business Health (compose on `business_brain`/`diagnose_business`/`claims`) → recommendation ("commercial roofing leads convert 43% better — shift 20% of budget") → user Review→Edit→Approve → executes approved actions (campaign/content/ad/schedule/monitor/report). NEVER executes consequential financial/marketing actions without permission + confirmation.
- 4.2 🔴 **Closed-loop Business Intelligence:** MARKET → STRATEGY → CONTENT → CAMPAIGN → ADVERTISING → TRAFFIC → LEADS → CRM → SALES → REVENUE → FINANCE → INTELLIGENCE → RECOMMENDATION → APPROVAL → ACTION → MEASUREMENT ↺ (all on the existing event bus + claims lifecycle).

### SECTION 5 — DEFERRED (do not let these distract from closure)

⏸️ Business Network, external B2B matching/marketplace, vendor reputation network, expert network, external business graph. Roadmap items.

---

## D. ACCEPTANCE STANDARD (per feature)

1. UI accessible — 2. Control executes — 3. Real business logic — 4. Correct backend — 5. Actually persisted — 6. RLS/permissions/tenant isolation enforced — 7. Files stored + recoverable — 8. Official integration actually works — 9. Failure handling — 10. Safe retry — 11. Audit recorded — 12. Correct notification — 13. Survives refresh/re-login — 14. Real production data — 15. Real user completes end-to-end.

## E. STATUS TAXONOMY (mandatory in every report)

🟢 PRODUCTION VERIFIED · 🟡 IMPLEMENTED — LIVE VERIFICATION REQUIRED · 🟠 PARTIALLY IMPLEMENTED · 🔴 FRONTEND/SCAFFOLD ONLY · ⚫ NOT IMPLEMENTED · ⏸️ DEFERRED

Never report "implemented" because code was written. Update the matrix each cycle; name the next highest-impact incomplete capability.

## F. SEQUENCING (gains ground fastest)

1. **First:** Section 3.1 (capture) + Section 1 (social core: OAuth/token store → composer → approval → scheduling → publishing queue → one real platform adapter → analytics → CRM attribution) — this proves the Avenize-owned marketing pattern end-to-end on existing tables.
2. **Then:** 2.5 leads + 2.6 automation + 2.7 email (existing infra lights up immediately), 2.10 attribution, 2.1 command center, 4.1 AI Marketing Director.
3. **Then:** 3.5 multi-company (deferred DB work unblocks), 3.3 trial intel, 3.4 role experiences.
4. **Parallel-safe:** 2.2 content, 2.3 SEO, 2.8 landing, 2.9 CRO, 2.11 analytics; 3.6–3.13 closure items.
5. **Gate before declaring done:** Section D acceptance standard passes on a real user's full workflow.

**Objective:** not more pages — every visible capability real, connected, secure, persistent, measurable, production-verifiable. Do not build a collection of screens. Build the operating system.
