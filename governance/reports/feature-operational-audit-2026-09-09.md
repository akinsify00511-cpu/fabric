# Avenize Feature Operational Audit — 2026-09-09

## Audit standard

A feature is operational only when its intended user/business outcome is demonstrated across the full chain:

UI → interaction → business logic → API/RPC/Edge Function → database → auth/RLS → storage/integration → persistence → automation/event → notification → audit/evidence → production journey.

Absence of evidence is not PASS.

Statuses: PASS, PARTIAL, FAIL, NOT_CONNECTED, NOT_CONFIGURED, NOT_PROVABLE.

## Baseline conclusion

The repository has strong backend structure and a growing production control plane, but it does not yet have a machine-enforced semantic feature-operationality layer. Existing engineering checks can therefore be green while individual business capabilities remain incomplete.

## Confirmed findings

### P0 — systemic

1. **No authoritative feature operationality registry.** Module/readiness metadata does not currently describe the complete Avenize product surface or prove end-to-end outcomes.
2. **Feature E2E coverage is insufficient.** `tests/e2e/example.spec.ts` contains multiple skipped tests for 2FA, dashboard truth, CRM persistence, webhook dispatch, automation execution and campaign sending. The comments explicitly describe expected failures. These skips must not count as operational certification.
3. **Module access fails open.** `src/lib/useModuleAccess.ts` contains a fallback that marks a module entitled/ready when the readiness RPC is unavailable. This conflicts with fail-closed production semantics.

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

## Live production evidence captured during audit

- Supabase currently exposes a broad active Edge Function surface, including payments, subscriptions, email, CRM activity, deal risk/follow-through, AI, automation, webhooks, capture processing and campaign sending.
- Live `automations` = 0 rows and `automation_runs` = 0 rows.
- Live core business tables inspected (leads, deals, quotes, sales orders, invoices, tasks, notifications, campaigns) currently have no production records; meetings has one record. This means many business journeys cannot be proven from existing production data alone.
- Meeting backend contains substantial RPC/table structure, but structural presence is not being treated as operational PASS.

## Certification rule

A feature may only become READY after a feature-specific operational contract proves the intended outcome in a controlled test journey against the production-like stack. Skipped tests, placeholder UI, local-only state, static counts, existence of RPCs, deployed Edge Functions, or populated schemas do not independently constitute readiness.

## Next audit layer

Build the authoritative feature operational contract registry and audit every product domain against it before implementing repairs. The registry must become an input to the Avenize control plane so release certification fails closed when a claimed-ready feature is only structural, partial, disconnected, or unprovable.
