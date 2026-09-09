# Avenize Feature Operational Audit — 2026-09-09

## Audit standard

A feature is operational only when its intended user/business outcome is demonstrated across the full chain:

UI → interaction → business logic → API/RPC/Edge Function → database → auth/RLS → storage/integration → persistence → automation/event → notification → audit/evidence → production journey.

Absence of evidence is not PASS.

Rendering has an additional truth standard: **what is shown must be relevant to the current user, current context, current data and current capability state.** A visually polished component that displays fabricated, stale, generic, unreachable, or contextually irrelevant information is a feature defect, not a cosmetic issue.

Statuses: PASS, PARTIAL, FAIL, NOT_CONNECTED, NOT_CONFIGURED, NOT_PROVABLE.

## Baseline conclusion

The repository has strong backend structure and a growing production control plane, but it does not yet have a machine-enforced semantic feature-operationality layer. Existing engineering checks can therefore be green while individual business capabilities remain incomplete.

## Confirmed findings

### P0 — systemic

1. **No authoritative feature operationality registry.** Module/readiness metadata does not currently describe the complete Avenize product surface or prove end-to-end outcomes.
2. **Feature E2E coverage is insufficient.** `tests/e2e/example.spec.ts` contains multiple skipped tests for 2FA, dashboard truth, CRM persistence, webhook dispatch, automation execution and campaign sending. The comments explicitly describe expected failures. These skips must not count as operational certification.
3. **Module access fails open.** `src/lib/useModuleAccess.ts` contains a fallback that marks a module entitled/ready when the readiness RPC is unavailable. This conflicts with fail-closed production semantics.
4. **Rendering integrity is not yet a release gate.** Current UI auditing shows that some components can render information that looks real but is not derived from the underlying business data or current state. This must be treated as product correctness.

### P0/P1 — Meetings

1. Recording currently captures the local media stream rather than proving a composed/full-room meeting recording.
2. `generate_recording_signed_url` returns the supplied storage path rather than generating a real temporary Storage signed URL.
3. `capture-process` authenticates and converts a capture into `meeting_media` with `processing_status=pending`; it does not itself complete transcription/processing.
4. Live cron jobs include due automations and integrity scanning, but no dedicated meeting capture/transcription processing job was found.
5. The complete recording → transcript → timestamps → intelligence → decisions → actions → tasks chain is not certified.

### P1 — Commercial workflows

1. **CRM/Deals:** UI CRUD is not sufficient evidence of a complete lead → deal → quote → order → invoice → payment workflow.
2. **Quotes:** the UI can mark/send quote state, but the inspected flow does not prove actual customer delivery, response persistence and downstream order creation as one journey.
3. **Payments:** the Payments surface is primarily a payment-record/ledger view; actual gateway checkout is implemented elsewhere through Edge Functions. The two must be tested as one payment lifecycle.
4. **Subscriptions:** live checkout/management/verification functions exist, but the real-money production journey remains credential-gated and therefore not certified.
5. **Invoices/finance:** accounting UI is not enough to certify a complete accounting system; journal-entry integrity, posting, reconciliation and reporting must be demonstrated.

### P1 — Automation

1. `execute-automation` is active and has explicit backend authentication/secret handling.
2. A production cron job runs `execute_due_automations()` every minute.
3. Live `automations` and `automation_runs` currently contain **0 rows**, so the automation capability is not operationally demonstrated with a real production rule/run.
4. Therefore Automation = **NOT_PROVABLE**, not PASS.

### P1 — Marketing / email

1. `campaign-send`, `email-service`, `resend-webhook` and welcome-email infrastructure are active in Supabase.
2. The campaign UI contains incomplete interaction paths and the existing campaign E2E is skipped.
3. Campaign delivery, bounce/failure handling, recipient persistence and attribution must be demonstrated end-to-end.

### P1 — Procurement / inventory / operations

1. Procurement contains UI for RFQs/POs but inspected interactions do not yet prove actual RFQ delivery and purchase-order lifecycle execution.
2. Inventory quantity mutation is split across client operations rather than being proven as an atomic stock-movement transaction.
3. Projects/tasks have substantial CRUD structure but execution-to-outcome chains require certification.

### P1 — Documents / portal / signatures

1. Documents have database/storage structure, but upload, folder, version, permissions, retrieval and workflow use must be tested as one chain.
2. Customer Portal contains customer-facing structures but does not yet prove reliable invitation/delivery and customer action completion.
3. Electronic signatures have signing infrastructure but must prove invite → signer authentication → signature → immutable evidence → downstream state.

### P1 — AI / Sarah / Business Brain

1. `ask-avenize` is deployed and authenticated.
2. The inspected implementation is deterministic/rule-based rather than evidence of a general-purpose reasoning model.
3. AI readiness therefore depends on the intended product contract: advisory answers, correct tenant context, grounded data, safe actions, persistence and audit evidence must each be tested.
4. A text response alone must not certify AI as operational.

### P2 — Communications

1. Chat has real-time messaging structure and persistence, but reactions, unread state, notifications, attachments and cross-module activity should be certified together.
2. Notifications have persistence and RLS, but link/deep-navigation behavior and event correctness need feature-level tests.

### P2 — PWA/mobile

1. PWA manifest and icon configuration exist.
2. Installability is not equivalent to mobile workflow readiness; critical journeys must be exercised on mobile viewport/browser conditions.

### P0/P1 — Rendering / user-relevance audit

The visual audit has now been added to the operational audit rather than treating it as a cosmetic review.

1. **Dashboard trend view contains fabricated chart history.** The trend rendering uses a hard-coded seven-bar series rather than historical revenue/pipeline/project data. It is visually plausible but is not a truthful representation of the user's business trend.
2. **Dashboard progress view contains a hard-coded 70% progress bar.** No verified goal/target denominator is used. This can communicate a false sense of progress and must not be presented as a business KPI until backed by an actual goal and current value.
3. **Dashboard view switching can change representation without changing evidence.** Number/table/breakdown/trend/progress views are presentation modes, but some modes are currently capable of implying historical or goal-based information that the underlying query does not provide.
4. **Dashboard empty state is comparatively strong in intent** because it explicitly avoids fabricating a sparkline when the primary metric is zero; this truthfulness standard must be applied to every chart, KPI, badge, percentage, status, activity feed, recommendation and health indicator across the product.
5. **Rendering relevance must include role, entitlement, selected tools, data freshness and workflow state.** A component should not merely render because its route exists. It should render only when its underlying capability is available and the displayed fact is applicable to the current user.
6. **Static/demo-looking content is a release defect when presented as current business state.** Examples include hard-coded metrics, decorative trend histories, fixed percentages, stale labels, unreachable tabs, placeholder actions and status labels that do not reflect persisted state.
7. **Empty/zero/unknown/loading/error states need semantic distinction.** `0`, “no data yet”, “not configured”, “not connected”, “not authorized”, “failed to load”, and “healthy” are different states and must not collapse into one visual outcome.
8. **User relevance must be tested at the rendered-output level.** Backend correctness alone cannot certify a screen if the final UI shows the wrong entity, wrong metric, wrong time range, wrong tenant, wrong status or an invented visualization.

### Rendering audit contract

For every page/component, the audit must answer:

- Is every displayed number derived from current persisted data?
- Is every chart backed by real data points rather than illustrative values?
- Is every percentage backed by a defined numerator and denominator?
- Is every date/time label derived from the actual record or an explicit reporting period?
- Are labels and actions appropriate to the user's role and permissions?
- Does the component disappear, downgrade, or explain itself when its capability is unavailable?
- Does zero mean zero, or is zero being used to hide unknown/unloaded state?
- Are loading, error, empty, not-configured and unauthorized states distinguishable?
- Do buttons actually perform the action their rendered label promises?
- Are cards, tabs, filters and charts showing data relevant to the selected context rather than generic product content?
- Does mobile rendering preserve the same semantic truth without hiding critical information or actions?

## Live production evidence captured during audit

- Supabase currently exposes a broad active Edge Function surface, including payments, subscriptions, email, CRM activity, deal risk/follow-through, AI, automation, webhooks, capture processing and campaign sending.
- Live `automations` = 0 rows and `automation_runs` = 0 rows.
- Live core business tables inspected (leads, deals, quotes, sales orders, invoices, tasks, notifications, campaigns) currently have no production records; meetings has one record. This means many business journeys cannot be proven from existing production data alone.
- Meeting backend contains substantial RPC/table structure, but structural presence is not being treated as operational PASS.
- Live module entitlement records currently have empty feature JSON objects, while readiness RPCs default missing feature keys to entitled/ready. This reinforces the need for fail-closed readiness and contextual rendering.

## Certification rule

A feature may only become READY after a feature-specific operational contract proves the intended outcome in a controlled test journey against the production-like stack. Skipped tests, placeholder UI, local-only state, static counts, hard-coded visualizations, existence of RPCs, deployed Edge Functions, or populated schemas do not independently constitute readiness.

A rendered component may only be marked visually/semantically READY when the information it presents is traceable to the current user context and an authoritative source of truth. **Polish cannot compensate for incorrect information.**

## Next audit layer

Build the authoritative feature operational contract registry and audit every product domain against it before implementing repairs. The registry must become an input to the Avenize control plane so release certification fails closed when a claimed-ready feature is only structural, partial, disconnected, visually misleading, or unprovable.
