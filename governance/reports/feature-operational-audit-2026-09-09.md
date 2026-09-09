# Avenize Feature Operational Audit — 2026-09-09

## Audit standard

A feature is operational only when its intended user/business outcome is demonstrated across the full chain:

UI → interaction → business logic → API/RPC/Edge Function → database → auth/RLS → storage/integration → persistence → automation/event → notification → audit/evidence → production journey.

Absence of evidence is not PASS.

Statuses: PASS, PARTIAL, FAIL, NOT_CONNECTED, NOT_CONFIGURED, NOT_PROVABLE.

## Baseline conclusion

The repository has strong backend structure and a growing production control plane, but it does not yet have a machine-enforced semantic feature-operationality layer. Existing engineering checks can therefore be green while individual business capabilities remain incomplete.

## Confirmed findings

### P0 — systemic readiness/control

1. **No authoritative feature operationality registry.** Module/readiness metadata does not currently describe the complete Avenize product surface or prove end-to-end outcomes.
2. **Feature E2E coverage is insufficient.** `tests/e2e/example.spec.ts` contains skipped tests for 2FA, dashboard truth, CRM persistence, webhook dispatch, automation execution and campaign sending. The comments explicitly describe expected failures. These skips must not count as operational certification.
3. **Module access is not actually using the intended readiness model.** Live `can_access_module()` and `list_accessible_modules()` return `ready=true` unconditionally and default entitlement to `true` when a feature key is absent. Live `business_entitlements` has 7 rows whose `features` values are `{}`. This means the intended entitled + ready gate is not authoritative in production.
4. **Client module access also fails open when the RPC is missing.** `useModuleAccess.ts` deliberately returns `entitled=true, ready=true` on a missing module RPC. This is incompatible with a production fail-closed readiness gate.

### P0 — Payments

1. **Invoice Paystack initialization is broken against the live schema.** Live `paystack-initialize` inserts pending state into `payments_paystack`, but that table does not exist in the live public schema. The live payment ledger is `payment_transactions`, which is what `paystack-verify` and `paystack-webhook` read.
2. **Invoice Paystack initialization has an authorization flaw.** The JWT-protected `paystack-initialize` function does not resolve the authenticated user's business before accepting `invoice_id`, and direct mode accepts caller-supplied `business_id`, `amount_kobo` and `email`. Authentication is present; tenant authorization is not.
3. **Subscription checkout is a separate, better-structured path.** Live `subscription-checkout` resolves active staff membership, reads the sellable pricing tier, adds the configured 7.5% VAT, initializes Paystack and writes `payment_transactions` plus `subscription_provider_attempts`. The Paystack webhook then verifies signature/provider amount/currency and settles the subscription. This path is structurally strong but still requires a real-money production journey before PASS.

### P0/P1 — Meetings

1. Recording currently captures the local media stream rather than proving a composed/full-room meeting recording.
2. `generate_recording_signed_url` returns the supplied storage path rather than generating a real temporary Storage signed URL.
3. `capture-process` authenticates and converts a capture into `meeting_media` with `processing_status=pending`; it does not itself complete transcription/processing.
4. Live Edge Functions include rich meeting capture infrastructure, but `transcribe-audio` is **absent from the live function list** even though repository history/docs reference it.
5. No verified production worker/cron chain currently proves capture → transcription → transcript → timestamps → intelligence → decisions/actions → tasks.
6. Meeting analytics and intelligence tables/RPCs exist, but actual event population and customer-visible evidence are not certified.

**Status: PARTIAL / NOT_CERTIFIED.**

### P1 — Commercial workflows

1. **CRM/Deals:** contacts are persisted, but the inspected CRM implementation keeps deals in local React state; deal create/update/delete/persistence are not durable.
2. **Quotes:** quote records are persisted and can change status, but customer delivery, acceptance and downstream order conversion are not proven as one journey.
3. **Sales orders:** backend structures exist, but the complete quote → order → fulfilment/invoice/payment lifecycle is not certified.
4. **Invoices/finance:** invoice creation and manual payment recording are materially improved by server-side RPCs that recompute totals, lock invoice rows and prevent overpayment. This is not the same as a fully proven customer payment lifecycle.
5. **Payments:** the general ledger UI is not proof of gateway settlement. The broken `paystack-initialize` path is a P0 blocker for invoice payment; subscription checkout is a separate path.
6. **Subscriptions:** live checkout/management/verification/webhook infrastructure exists, but real-money production proof remains required.

### P1 — Accounting

1. `Accounting.tsx` labels itself “Double-entry bookkeeping” and validates balanced debit/credit totals in browser state.
2. `createEntry()` inserts only a `journal_entries` header; the collected journal lines are not persisted by the inspected code.
3. Reports calculate balances from account `opening_balance` values rather than a verified posted debit/credit ledger.
4. Live `accounts` and `journal_entries` are empty.

**Status: FAIL for accounting-grade value.**

### P1 — Automation

1. `execute-automation` is active and has explicit backend authentication/secret handling.
2. A production cron job runs the due-automation path every minute.
3. Live `automations` and `automation_runs` contain 0 rows.
4. The engine is structurally present but there is no production evidence of a configured rule executing.

**Status: NOT_PROVABLE.**

### P1 — Marketing / email

1. `campaign-send`, `email-service`, `resend-webhook` and welcome-email infrastructure are active.
2. `campaign-send` resolves active business email contacts and queues `email_sends`/`email_events`, then invokes `email-service`.
3. `email-service` can call Resend when configured, but it marks individual events failed when templates/provider configuration fail.
4. `campaign-send` currently decides the campaign is `sent` based on the internal HTTP response being successful, not on all/any provider deliveries actually succeeding. This can produce a false campaign-level “sent” status while individual sends failed.
5. Recipient selection is not proven to be campaign-specific: the live function loads all active `email_contacts` for the business.
6. Existing campaign E2E coverage remains skipped and stale.

**Status: PARTIAL / NOT_CERTIFIED.**

### P1 — Webhooks / integrations

1. Live `dispatch-webhooks` is active and now requires `business_id + secret`, blocks private/internal URLs and applies configured outbound auth headers.
2. Webhook configuration and delivery-log UI exists.
3. The UI displays `${window.location.origin}/functions/v1/dispatch-webhooks`; no verified Vercel proxy route was established during this audit, so the displayed endpoint cannot be assumed to be the real callable Supabase function URL.
4. Existing webhook dispatch E2E coverage is skipped.

**Status: PARTIAL / NOT_CERTIFIED.**

### P1 — AI / Sarah / Business Brain

1. Live `ask-avenize` is JWT-protected, resolves staff/business membership, reads business health/metrics/recommendations/next-best-action/invoice context, persists copilot messages and emits platform activity.
2. The implementation is deterministic/rule-based (`provider: native`), not evidence of a general-purpose generative model.
3. `parse-intent` is deterministic NLP; it proposes actions but deliberately exposes no mutation capability.
4. The AI response/action loop is not certified end-to-end, especially for grounded mutations, approval, audit evidence and downstream business state.

**Status: PARTIAL.**

### P1 — Search

1. Search UI calls `search_indexes` directly and supports fuzzy sorting, autocomplete, saved searches and keyboard navigation.
2. Result routing is incomplete: contacts, tasks, staff, invoices, projects and documents are mapped; quotes, payments and inventory are displayed as searchable entity types but have no explicit destination mapping in the inspected route map.
3. `indexEntity()` does not visibly supply `business_id` while declaring a `business_id,entity_type,entity_id` conflict target; this requires live verification.
4. Search therefore cannot be certified as a complete tenant-scoped universal search experience.

**Status: PARTIAL / NOT_PROVABLE.**

### P1 — Procurement / inventory / operations

1. Procurement contains UI for RFQs and purchase orders, but inspected interactions do not prove actual RFQ delivery and purchase-order lifecycle execution.
2. Inventory quantity mutation and movement recording are separate client operations; atomicity/reconciliation is not proven.
3. Nigerian Jobs/Projects core CRUD is real, including persisted job stage changes, but materials, labor, milestones, communications and variations are not certified as a complete persisted execution workflow.
4. Tasks have real Supabase CRUD and activity logging; assignment/review/time tracking/comments/automation notification chains remain to be certified.

### P1 — Documents / portal / signatures

1. Documents have database/storage structures, but upload, folder, version, permissions and retrieval need an end-to-end journey.
2. Customer Portal exposes customer-facing data structures but does not prove reliable invitation/delivery and customer action completion.
3. Electronic signatures have request/signing structures but invite → signer authentication → signature → immutable evidence → downstream state is not certified.

### P2 — Calendar / communications

1. Calendar has real event range loading plus create/update/delete persistence.
2. Attendee handling is not proven as a durable invitation/acceptance/notification workflow.
3. Chat has real-time messaging structures, but attachments, reactions, unread state, notification integration and cross-module activity require certification.
4. Notifications persist and have ownership RLS, but event correctness and deep navigation require testing.

### P2 — PWA/mobile

1. PWA manifest and icon configuration exist.
2. Installability is not equivalent to mobile workflow readiness; critical workflows must be exercised at mobile viewport/device conditions, including meetings, forms, search, payments and offline/reconnect behavior where promised.

## Live production evidence captured during this audit

- Live Edge Function inventory currently contains 20 active functions spanning payments, subscriptions, email, CRM activity, AI, automation, webhooks, capture processing and campaign sending.
- `transcribe-audio` is not among the live functions.
- Live `automations` = 0 and `automation_runs` = 0.
- Live `business_subscriptions` = 0.
- Live `payments_paystack` table is absent; `payment_transactions` exists.
- Live core business data is sparse: businesses 7, staff 7, meetings 1, events 1, payment_transactions 2, analytics_events 154, audit_logs 28, business_events 2, business_health_scores 5, channels 2; most inspected CRM/finance/operations tables currently have 0 rows.
- Sparse production data is not itself a product defect, but it prevents passive observation from proving most journeys. Controlled isolated E2E journeys are required.

## Security/control observations

- RLS is enabled broadly and many business-facing policies scope through `get_current_staff()` or `auth.uid()`.
- Some `public` role policies are actually authenticated-user scoped by `auth.uid()` or business membership and are not automatically vulnerabilities merely because the role name is `public`.
- Service/system insert policies exist for audit logs and notifications and should remain tightly controlled at the function boundary.
- The strongest current security concern discovered in this pass is the tenant-authorization gap in `paystack-initialize`, not the mere presence of public-role policy rows.

## Existing test-suite integrity finding

The E2E suite contains multiple `test.skip()` cases for exactly the product areas where operational readiness is most uncertain: 2FA, dashboard real data, CRM deals, webhooks, automations and campaign email. Several comments are stale and still describe old Edge Function deployment blockers even though corresponding functions are now live. Green CI therefore cannot be treated as product readiness.

## Readiness matrix — current evidence

| Capability | Current status | Primary evidence/gap |
|---|---|---|
| Auth/onboarding | PARTIAL | Auth baseline exists; full first-run business journey needs production proof |
| Dashboard/command center | NOT_CERTIFIED | real-data truth still not proven |
| CRM contacts | PARTIAL | durable CRUD, broader lifecycle not certified |
| CRM deals | FAIL | local state implementation |
| Leads/capture | PARTIAL | live capture/intent infrastructure, full journey not proven |
| Quotes | PARTIAL | persistence exists; delivery/acceptance/order chain not proven |
| Sales orders | NOT_PROVABLE | lifecycle not certified |
| Finance/invoicing | PARTIAL | server-side invoice/payment recording is real |
| Invoice Paystack | FAIL | missing `payments_paystack` table + authorization gap |
| Subscription checkout | PARTIAL | strong structural chain; real-money E2E pending |
| Accounting | FAIL | journal lines not persisted; reports not ledger-derived |
| Meetings | PARTIAL | rich backend; recording/transcription chain incomplete |
| Tasks | PARTIAL | real CRUD; execution integrations unproven |
| Calendar | PARTIAL | durable CRUD; collaboration workflow incomplete |
| Automations | NOT_PROVABLE | engine live; zero configured/run evidence |
| Email campaigns | PARTIAL | queue/provider path live; campaign-level success semantics weak |
| Webhooks | PARTIAL | secure dispatch engine live; callable endpoint/delivery E2E unproven |
| Search | PARTIAL | rich UI; route/indexing/tenant E2E incomplete |
| AI/Sarah | PARTIAL | grounded deterministic reasoning; general agent action loop unproven |
| Documents | PARTIAL | structure exists; full file workflow not certified |
| Signatures | PARTIAL | structures exist; full signer evidence chain not certified |
| Customer portal | PARTIAL | data views exist; invitation/action journey incomplete |
| Procurement | FAIL/PARTIAL | RFQ/PO lifecycle incomplete |
| Inventory | PARTIAL | stock operations exist; atomic/reconciliation workflow unproven |
| Projects/jobs | PARTIAL | job CRUD/stage real; execution sub-resources unproven |
| Chat | PARTIAL | real-time core; collaboration depth not certified |
| Notifications | PARTIAL | persistence/ownership exists; event/deep-link correctness unproven |
| PWA/mobile | STRUCTURAL PASS / NOT_CERTIFIED | manifest/installability only |
| Module entitlement/readiness | FAIL | live readiness RPCs hard-code ready=true/default entitlement true |

## Certification rule

A feature may only become READY after a feature-specific operational contract proves the intended outcome in a controlled test journey against the production-like stack. Skipped tests, placeholder UI, local-only state, static counts, existence of RPCs, deployed Edge Functions, or populated schemas do not independently constitute readiness.

## Audit-only boundary

No product repair is included in this report. Repair work must be performed in separate implementation changes, then each affected capability must be re-audited against the same operational contract before being promoted to PASS.

## Next audit layer

1. Complete the authoritative feature inventory across every route/tool, including secondary/admin/portal surfaces.
2. Map each feature to its actual client calls, RPCs, tables, storage buckets, Edge Functions, triggers, cron jobs, notifications and audit events.
3. Convert every high-value capability into executable operational E2E contracts.
4. Remove/replace stale skipped readiness tests with fail-closed operational assertions.
5. Feed the registry into the production control plane.
6. Only after the audit registry is complete, begin separate P0/P1 repairs and re-audit continuously.
