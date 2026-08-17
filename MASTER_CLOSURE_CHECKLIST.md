# Avenize Master Build / Closure Checklist

The single source of truth for what is actually done, partial, or blocked — for every major capability, across three outcome levels.

**Outcome levels:**
- **End-user** — what a person using Avenize experiences (does the feature work for them, is it honest, is the UI right)
- **Business-owner** — what the business owner/admin controls + sees (gating, analytics, configuration, permissions)
- **Builder** — what the platform operator needs (deployment, cross-business intelligence, infra, the production bar)

**Status legend:**
- ✅ Done — implemented + verified (tsc/build/tests/CI green)
- 🟡 Partial — implemented but incomplete, unverified in production, or a known gap remains
- 🔴 Blocked — needs work that is out of scope, needs the live DB, or needs sourced external data
- ⬜ Not started — in the PRD but no implementation

> **Deploy caveat (applies to every DB-backed item):** migrations `080`–`20260101000012` must be applied to the live Supabase (project `kgsgqvatyleetyquffya`) before any DB-backed feature is effective. The frontend degrades gracefully (best-effort, non-blocking §24) until then. Items marked ✅ are verified in the codebase + CI, NOT necessarily on the live DB.

---

## Phase 1 — Stabilize production (P0)

### 1. Supabase production synchronization
| Level | Status | Outcome |
|---|---|---|
| End-user | 🔴 | New users cannot onboard until `create_business_and_owner` is deployed; app degrades to a graceful "not yet configured" message. |
| Business-owner | 🔴 | Module gate treats unknowns as not-ready (safe-closed default) until `can_access_module` is deployed — most modules hidden. |
| Builder | 🔴 | **HIGHEST-PRIORITY ACTION:** apply migrations `080`–`20260101000012` to live Supabase. Verify RPCs callable, RLS policies, `platform_admins` seeded with the operator email. |

### 2. Analytics 401 (record_analytics_event)
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Analytics events no longer 401 (fixed in earlier session — routed through supabase client w/ correct auth). |
| Business-owner | ✅ | Owner intelligence reads the resulting telemetry. |
| Builder | ✅ | `usage_events` table + `logUsageEvent` helper capture telemetry; CI green. |

### 3. Authentication / session persistence
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Refresh keeps you on your page; logout/login restores business/staff; onboarding flash fixed (Session 12). |
| Business-owner | ✅ | Already-onboarded users are never sent back through onboarding. |
| Builder | 🟡 | Browser-side sign-in persistence branch verified via typecheck/build/tests; live-session end-to-end (expired-session loops, SW cache) needs production testing. |

### 4. Onboarding completion state
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Onboarding completes + persists; self-intro role captured; emits `onboarding_complete` telemetry. |
| Business-owner | ✅ | Owner sees onboarding completion in Owner Intelligence. |
| Builder | ✅ | `completeSetup` session guard + `/onboarding` `RequireSession` defense verified. Onboarding conversion in Builder Dashboard. |

### 5. Service-worker / cache
| Level | Status | Outcome |
|---|---|---|
| End-user | 🟡 | `sw.js` cache-pruning fix merged (PR #10); old-bundle-on-refresh not independently verified in production. |
| Business-owner | n/a | |
| Builder | 🟡 | SW does not serve an old onboarding bundle by design; needs production SW verification. |

### 6. Malformed routes
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Dead links (`/app/people`, `/app/dashboard`, `/app/profile`, awards/kudos/polls) fixed as alias routes (Session 12). |
| Business-owner | ✅ | All `/app/*` links resolve. |
| Builder | ✅ | Route-vs-reference drift scan (reusable method) in AGENTS.md; no dead links. |

### 7. Stale FABRIC / old UI references
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Product terminology renamed to Avenize; old "FABRIC" references removed in the UI surface. |
| Business-owner | ✅ | |
| Builder | ✅ | |

---

## Phase 2 — Finish the new UI (P1)

### 8. Workspace selection (personalization controls the whole app)
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Selected tools appear; deselected tools disappear; selection persists after refresh + logout/login (Session: workspace personalization). |
| Business-owner | ✅ | Role permissions still override personalization; personalization can never grant unauthorized access; direct URL access remains protected (`RequireModule` + RLS). |
| Builder | ✅ | New users get sensible defaults; `user_workspace_selections` table; telemetry on select/deselect. |

### 9. Adaptive Experience Context
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | One authoritative context (role, permissions, selected tools, complexity) drives sidebar/dashboard/search. |
| Business-owner | ✅ | Owner's selections + role flow across all screens. |
| Builder | ✅ | `useExperienceContext` is the single source (Session: adaptive experience). |

### 10. Adaptive Dashboard
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Dashboard connects to workspace selection; shows only relevant KPI groups; "attention" is contextual; quick actions adapt (Session: adaptive dashboard). |
| Business-owner | ✅ | Adapts to role, company size, active modules. |
| Builder | ✅ | Capability-driven sections; `RepresentationEngine` lets users choose view (Session 16). |

### 11. Progressive complexity
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Solo/small-business experience hides department/approval machinery; advanced features reveal as the business grows (Session: progressive complexity). |
| Business-owner | ✅ | No forced manual hiding for businesses that don't need it. |
| Builder | ✅ | Automatic complexity transitions based on team size + active modules. |

### 12. Website → onboarding → app UX continuity
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Same terminology, visual language, value proposition, information hierarchy across landing → onboarding → app (Session 17). |
| Business-owner | ✅ | Onboarding naturally leads into the personalized workspace. |
| Builder | ✅ | Mobile + desktop follow the same design system; no "marketing site → generic SaaS dashboard" disconnect. |

### 13. Mobile UI consistency
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Mobile build (Android APK + iOS simulator) green in CI; shares brand tokens with web (Session 12). |
| Business-owner | ✅ | |
| Builder | 🟡 | APK is debug-keystore-signed (not Play-Store ready); iOS is simulator-only (not installable on real iPhones). Real-device distribution needs a release keystore / Apple Developer certs. |

---

## Phase 3 — Make Avenize intelligent (P1)

### 14. Platform self-instrumentation
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Telemetry captures module switching-off, onboarding abandonment, setup abandonment, ignored automations, feature activation/reuse, workflow completion/abandonment. |
| Business-owner | ✅ | Owner sees adoption + reuse + quick-turnoff in Owner Intelligence. |
| Builder | ✅ | `usage_events` + 6 RPCs; wired into Onboarding/Quotes/workspace-selection. 7 tests. CI green. |

### 15. Owner-only intelligence section
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Ordinary users never see it (client UX gate + RPC gate + RLS — defense-in-depth). |
| Business-owner | ✅ | `/app/owner-intelligence` surfaces onboarding completion, feature adoption, quick-turnoff, ignored automations, workflow funnel. Owner/admin gated. |
| Builder | ✅ | `owner_intelligence` RPC; #21 boundary (operational/usage only, never walled content). 14 tests. Cross-tenant leak from #14 fixed. |

### 16. Sector / module analytics
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Owner sees how their business compares to its sector (anonymized, sample-size labels). |
| Business-owner | ✅ | `sector_benchmark` RPC — anonymized sector aggregate vs own metrics. |
| Builder | 🔴 | **External** market variance (emerging sector behavior, product-market gaps, new-feature opportunities, positioning) blocked on sourced external data — NOT fabricated (§22). First-party sector benchmark is done. |

### 17. Market reality-gap analytics
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Reality Gap page surfaces said-vs-used (`said_vs_used`). |
| Business-owner | ✅ | "What you said you need vs what you actually use." |
| Builder | 🔴 | External market comparison (Avenize vs. competitors) needs sourced external data — blocked (§22). |

### 18. Behavior-driven recommendations
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | USAGE-001 (selected-but-unused), USAGE-002 (workflow abandonment), SECTOR-001 (sector-popular-not-enabled) surface as actionable recommendations in the Cockpit. |
| Business-owner | ✅ | Recommendations are specific (name the module/workflow), small-data-guarded, with accept/reject/act. |
| Builder | ✅ | `run_behavior_recommendation_rules` + cron wiring. 8 tests. |

### 19. Builder / board dashboard (#34)
| Level | Status | Outcome |
|---|---|---|
| End-user | n/a | Not a customer surface. |
| Business-owner | n/a | A business owner is NOT a platform admin and gets "unauthorized." |
| Builder | ✅ | `/builder` — platform-wide onboarding conversion, module adoption, sector×module heatmap. `platform_admins` allowlist gate. Aggregate-only (#21). 11 tests. |

### 20. Cross-module intelligence (deterministic)
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Recommendation engine (8 financial/operational rules + 3 behavior rules) runs hourly; surfaces in Cockpit + MPR. Outcome loop (accept→act→outcome→effectiveness). Automation execution engine is real (007: deal/invoice/task/staff triggers fire live). |
| Business-owner | ✅ | Governed metrics, Business Health score, OKR progress, risk register, monthly review — all deterministic SQL over real data. `automation_health` RPC surfaces success/failure rates + recent runs on Owner Intelligence. Scheduled automations now fire hourly. |
| Builder | 🟡 | `module_status.automations` reason corrected (was stale — the engine was always real). Scheduled-automation executor + pg_cron added. NL querying + proactive surfacing remain Phase-3 generative (deferred per §33). |

### Intelligence foundation (§28, tenant isolation, walled content)
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Tenant-isolated intelligence store (RLS, business-scoped). |
| Business-owner | ✅ | Owner analytics cannot expose customer content; sensitive/walled groups excluded from general intelligence by construction. |
| Builder | ✅ | Separate intelligence permissions; no proactive AI surfacing from privileged data; #21 boundary enforced + tested. |

---

## Phase 4 — Product depth (P2)

### Security / compliance
| Capability | Status | Notes |
|---|---|---|
| 2FA (TOTP) | ✅ | Enforced at login (Session 10 MFA gate); backup codes hashed. |
| Biometric auth | ⬜ | Not started. |
| Enterprise SSO | 🟡 | `module_status.sso = false`; settings page exists, no IdP wired. |
| Auto provisioning/deprovisioning | ⬜ | Not started. |
| Compliance roadmap | ⬜ | Not started. |
| Disaster recovery docs | ✅ | Trust & Recovery page (`trust_health`); DR posture documented honestly (Supabase-managed backups). |
| Data residency | ⬜ | Not started (Supabase region only). |

### Localization / accessibility
| Capability | Status | Notes |
|---|---|---|
| Multi-language | 🟡 | `LocaleContext` scaffolded; `multiLanguage: true` flag in features.ts; ~19/137 pages use `useLocale`. Not fully applied. |
| Local date/number/currency formatting | ✅ | `LocaleContext` formatCurrency/formatDate; RepresentationEngine formatting. |
| Screen-reader support | ✅ | Lighthouse accessibility 100 (Session 18); aria-labels added. |
| Adjustable text size | ⬜ | Not started. |
| Color-contrast compliance | ✅ | WCAG AA verified (Session 18); BRAND colors tested against soft-tint backgrounds. |

### Engagement / retention
| Capability | Status | Notes |
|---|---|---|
| Contextual help | ✅ | Help Guide (SarahChat rebranded); ToolOnboardingPopup per-tool coachmarks. |
| Feature walkthroughs | ✅ | `useToolOnboarding` hook (Session 3). |
| Recognition / gamification | 🟡 | GamificationContext exists; Company Wall has recognition. Partial. |
| Weekly/monthly digest | ✅ | Monthly Performance Review (`/app/review`, printable). |
| Referral / invite mechanics | ✅ | Invite flow (`/join/:inviteId`, `accept_invite` RPC). |

### Extensibility / integrations
| Capability | Status | Notes |
|---|---|---|
| Public API coverage | 🟡 | `module_status.api = false`; API key management page exists; key issuance/gating not enforced server-side (no edge fn validates the hash). |
| Webhooks | 🟡 | `dispatch-webhooks` edge fn exists; `automations` not ready (no execution engine); pg_net/pg_cron need manual enable on live DB. |
| Integration gallery | 🟡 | Integrations page exists; Termii SMS + WhatsApp routing fixed (Session 10); Paystack/Flutterwave live. |

### Core architecture
| Capability | Status | Notes |
|---|---|---|
| Multi-location | 🟡 | Partial — locations referenced in some tables. |
| Multi-currency | 🟡 | Currency settings exist; not end-to-end. |
| Multi-entity consolidation | ⬜ | Single-business only (`module_status.multi_company = false`). |
| Shared identifiers across modules | ✅ | Context graph (Session 13: `link_entities`, `business_relationships`). |
| Reusable approval primitive | ✅ | `ApprovalRouter` + `approvals` engine (Session 7); SoD fix (Session 5). |
| Document versioning / co-editing | ⬜ | Not started. |
| Audit trails | ✅ | `audit_row_change` triggers extended to intelligence tables (Session 14, `trust_health`). |
| Data retention / deletion controls | ⬜ | Not started. |

### Automation health (#20 partial)
| Level | Status | Outcome |
|---|---|---|
| End-user | ✅ | Automations page exists; runs table (`automation_runs.status` = success/failed) tracks outcomes. Data-trigger automations (deal/invoice/task/staff) fire live via Postgres triggers. Scheduled automations fire hourly via pg_cron. |
| Business-owner | ✅ | Ignored automations + automation health (success rate, recent runs, never-run) surfaced in Owner Intelligence. |
| Builder | 🟡 | `module_status.automations` reason corrected (was stale — the engine was always real). Scheduled executor + `automation_health` RPC added. Real trigger execution now: data-triggers via Postgres triggers, scheduled via pg_cron. The remaining "not ready" is only until the migration is applied to live DB. |

---

## Business-module completeness (tracked separately — PRD requirements)

### Sales
| Capability | Status | Notes |
|---|---|---|
| Contacts / deals | ✅ | CRM + deals; `emit_deal_won` fixed (Session 13). |
| Industry terminology | 🟡 | Partial. |
| Deal-product linking | ✅ | Quotes → invoices; deal lineage. |
| Proposals / contracts | ✅ | Legal module (Session 7); Quotes (Session 4). |
| E-signature | ✅ | Full signing flow (Session 4: `/sign/:token`, RPCs). |
| Time / billing | ✅ | Time tracking + invoices. |
| Scheduling links | ✅ | Public appointments (`/book/:slug`). |
| Campaign ROI tied to revenue | 🟡 | `CampaignConverted` event added (Session 15); ROI attribution partial. |
| Automatic lead routing | ⬜ | Not started. |

### Inventory / POS
| Capability | Status | Notes |
|---|---|---|
| Product catalog | ✅ | Products + inventory (two stock models). |
| Stock levels | ✅ | `products.stock` + `inventory`. |
| Low-stock alerts | ✅ | `InventoryLow` event fixed (Session 15); INV-001 recommendation. |
| BOM / manufacturing | ⬜ | Not started. |
| Vendors / procurement | ✅ | Vendors + POs + RFQ (Sessions 2, 7). |
| Purchase orders | ✅ | PO lifecycle + goods receipt (`apply_goods_receipt`). |
| POS | ⬜ | Not started. |
| Barcode scanning | ⬜ | Not started. |
| Receipt printing | ⬜ | Not started. |
| Offline transaction capture | ⬜ | Not started. |
| Local payment rails | ✅ | Paystack + Flutterwave. |

### Work / projects
| Capability | Status | Notes |
|---|---|---|
| Task dependencies | ⬜ | Not started. |
| Subtasks | 🟡 | Partial. |
| Milestones | ✅ | Projects Nigeria. |
| Capacity / workload | ✅ | `capacity_intelligence` RPC. |
| Project templates | ⬜ | Not started. |
| Portfolio dashboard | ✅ | Projects + Executive Cockpit. |
| Goal cascading | ✅ | OKR engine (Session 14: objectives → key results → metric links). |

### Intelligence (generative layer)
| Capability | Status | Notes |
|---|---|---|
| Natural-language querying | 🔴 | Phase 3 generative — deferred per §33 (build only after core modules have real paying customers + transaction history). |
| Cross-department automation | 🟡 | Event bus coordinates; execution engine incomplete. |
| Proactive surfacing | ✅ | Critical recommendations notify the owner (Session 14); Cockpit feed. |
| Automation health | ✅ | `automation_health` RPC + scheduled executor (see #20 above). |
| Deterministic fallback views | ✅ | All intelligence is deterministic SQL over real tables (§22/§38). |

---

## Verification baseline (this closure)
- **tsc:** clean (0 errors)
- **vite build:** 0 warnings
- **vitest:** 150/150 passing (was 61 at Session 9 → +89 across the intelligence phases)
- **schema drift:** 0 (frontend `.from()`/`.rpc()` references all backed by migrations)
- **CI:** Schema Drift ✅, CI ✅ (migrations apply clean), Vercel ✅
- **Commits this session:** #14 telemetry, #18 owner intelligence + cross-tenant fix, #16/#17 sector + behavior rules, #19/#34 builder dashboard, #20 automation health + scheduled executor — all on main, all CI green.

## What "done" means here
Every ✅ in this checklist is verified in the codebase with tsc clean, build succeeding, tests passing, and CI green. It does NOT mean the live database has the migrations applied, or that production end-to-end testing has run. The deploy caveat (apply `080`–`20260101000012` to live Supabase) is the single remaining blocker for every DB-backed ✅ to become real for actual users. Everything marked 🔴 (external data, generative AI) is deliberately deferred — fabricating it would violate the §22 anti-hallucination rule that has governed the entire intelligence build.
