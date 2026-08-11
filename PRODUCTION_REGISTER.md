# Avenize Production Feature Register (§9)

> **Single source of truth for "is this real?"** — cross-checked against the
> stricter §9 production bar, not the looser §13.1 "exists" bar.
>
> "Exists" (§13.1) = has a page and tables. "Production" (this register) =
> reads/writes real Supabase data end-to-end, verified by a dependency audit.
>
> Generated 2026-08-10. Verification method: every table/RPC referenced by
> each module's page file was matched against `CREATE TABLE` / `CREATE
> FUNCTION` statements in `supabase/migrations/*.sql`. **0 gaps found** for
> all modules marked Production below.

## Status definitions

| Status | Meaning |
|---|---|
| ✅ Production | Persists real data end-to-end. Verified: all referenced tables/RPCs exist in migrations. |
| 🟡 Beta | Built (UI + storage) but missing an infrastructure dependency (pg_net / pg_cron / Edge Function). Not fully real until the dependency ships. |
| 🔴 Not started | No code, or page-only with no persistence, or needs an external dependency not yet integrated. |

## ✅ Production modules (the 19 that pass the §9 bar)

These read/write real Supabase data. Each was verified: its page file references
only tables/RPCs defined in migrations.

| Module | Min plan tier | Persistence verified | Notes |
|---|---|---|---|
| Finance | Starter | transactions, invoices, budgets, cashflow, accounting | closest to real |
| Chat | Starter | messages, channels | |
| CRM | Professional | deals, contacts, quotes, properties | |
| Tasks | Professional | tasks, tickets | |
| HR | Professional | staff, contracts, recruitment, appraisals | |
| Projects | Professional | projects, operations | |
| Inventory | Professional | inventory, stock_movements | |
| Knowledge | Professional | kb_pages, kb_spaces | |
| Approvals | Professional | approvals, approval_actions | |
| Calendar | Professional | events, appointments | |
| Legal | Professional | legal_contracts, legal_cases, legal_obligations | migration 0404 |
| Procurement | Professional | purchase_requests, rfqs, rfq_line_items | migration 0404 |
| Intelligence | Professional | calls real RPCs (run_simulation, etc.) | Applied layer only — no generative AI |
| Market Index | Professional | calls market_intelligence RPC | |
| Org Memory | Professional | organizational_memory, decision_log | migration 0404 |
| Reality Gap | Professional | reality_gaps | migration 0404 |
| Self-Audit | Professional | calls run_system_health_audit | |
| Executive Cockpit | Professional | reads real transactions/deals/staff | |
| Company Wall | Professional | recognition, announcements, events, polls | |

## 🟡 Beta (built, blocked on infra — NOT fully real yet)

| Feature | Blocker | Status in `features.ts` |
|---|---|---|
| Webhooks | needs `pg_net` extension + dispatch Edge Function | beta |
| Automations | needs `pg_cron` extension + execute Edge Function | beta |

> These are UI + storage only. A customer can save a webhook config / automation
> rule, but nothing dispatches/executes it. **Do not mark `module_ready: true`
> until the infra dependency ships.** They are currently `module_status.ready = false`.

## 🔴 Not started (no code, or external dependency not integrated)

Per `src/lib/features.ts` — the client register, confirmed accurate:

| Feature | Status | What's missing |
|---|---|---|
| SSO/SAML | contact_sales | SAML config in Supabase Auth + IdP setup |
| embedded Paystack | coming_soon | paystack-initialize Edge Function |
| push notifications | coming_soon | VAPID keys + push backend |
| WhatsApp | coming_soon | WhatsApp Business API approval + Meta costs |
| SMS | coming_soon | SMS provider (Termii/Africa's Talking) + Edge Function |
| Open Banking | coming_soon | Mono/Okra integration |
| NRS/FIRS e-invoicing | coming_soon | NRS accreditation |
| invoice factoring | planning | lender partnership |
| **AI Copilot** | coming_soon | LLM integration (OpenAI/Anthropic) + per-call costs |
| receipt OCR | coming_soon | Vision API integration |
| offline mode | coming_soon | IndexedDB + service worker |
| native mobile | planning | React Native build |
| multi-language | coming_soon | wire i18n + translations |

## The intelligence split (important)

"Intelligence" in the addenda is **two different things**:

1. **Applied Intelligence** (deterministic, Postgres-only) — threshold rules,
   anomaly detection, aggregation over real tables. **No LLM, no per-call cost,
   no hallucination surface.** Buildable NOW as a Reports/Insights module. This
   is what the IntelligenceHub/Market/Self-Audit/Reality-Gap modules deliver.

2. **Generative AI Copilot** — calls an external LLM, interprets natural
   language, drafts content. Real dependency, real cost, real hallucination risk.
   **🔴 Not started.** Phase 3 only — after core ERP is real and there's
   verified transaction data to reason over. An AI copilot on partially-fake
   modules will confidently report on numbers that don't exist.

## Reconciliation of the three status sources

Before this audit, "can this user see X?" had **three parallel sources**:

1. `src/lib/features.ts` — hardcoded client object (feature-level: 2FA, webhooks…)
2. `module_status` table — DB-driven (module-level: finance, crm…) [Session 8 gate]
3. `PLAN_ENTITLEMENTS` in `useToolAccess.ts` — hardcoded (defaulted everyone to Professional)

**Fixed:** `useToolAccess` now derives the plan tool-set from `business_entitlements.features`
(the same DB JSONB `has_feature()` and `can_access_module()` read), eliminating source #3.
`features.ts` remains the feature-level register (independent concern: infra-ready vs not);
`module_status` is the module-level readiness gate. They cover different axes and must not
contradict — the only overlap (`automations`, `webhooks`) is consistent: `features.ts` says
beta, `module_status.ready` says false.
