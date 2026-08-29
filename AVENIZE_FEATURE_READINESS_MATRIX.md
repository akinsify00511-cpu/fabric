# Avenize Feature Readiness Matrix

Generated: 2026-08-29. Status legend:
`OK` = verified present working; `GAP` = partially connected / needs a
missing layer; `BLOCKED` = credential-gated (no safe code-side fix this run);
`N/A` = entity does not exist by design.
Production column = live behavior of the deployed SPA + live Supabase
(this run's probes), not local tests.

| Feature | UI | Backend | DB | Security | Integration | E2E | Production | Blocker / next action |
|---|---|---|---|---|---|---|---|---|
| Auth (email/pass+MFA+passkeys) | OK | OK | OK | OK | OK | OK | OK | — |
| Onboarding (business+owner+workspace) | OK | OK | OK | OK | OK | OK | OK | — |
| Business/workspace + subsidiaries | OK | OK | OK | OK | OK | OK | OK | — |
| Dashboard (role-aware Brain home) | OK | OK | OK | OK | OK | OK | OK | — |
| Business Brain (state/next-best/value) | OK | OK | OK | OK | OK | OK | OK | — |
| Governed Metrics + health | OK | OK | OK | OK | OK | OK | OK | — |
| CRM (pipeline+deals+contacts) | OK | OK | OK | OK | OK | OK | OK | — |
| Leads | OK | OK | OK | OK | OK | OK | OK | — |
| Requests (lead request chain) | OK | OK | OK | OK | OK | OK | OK | — |
| Quotes (draft→sent→accept→order) | OK | OK | OK | OK | OK | OK | OK | — |
| Orders (sales order w/ quote gate) | OK | OK | OK | OK | OK | OK | OK | — |
| Notifications (bell+priority+email trigger) | OK | OK | OK | OK | OK | OK | OK | — |
| Payments (Paystack checkout+ledger) | OK | OK | OK | OK | OK | OK | OK | — |
| Subscriptions (+cancel, price-lock) | OK | OK | OK | OK | OK | OK | OK | — |
| Entitlements (two-flag gate) | OK | OK | OK | OK | OK | OK | OK | — |
| Paystack (checkout+webhook+verify) | OK | OK | OK | OK | OK | OK | OK | — |
| Email (Resend templates+queue) | OK | OK | OK | OK | GAP | GAP | BLOCKED | deploy `email-service`+`resend-webhook`; `RESEND_API_KEY`/`EMAIL_FROM`/`RESEND_WEBHOOK_SECRET` |
| Sarah / support (Help Guide+incidents) | OK | OK | OK | OK | OK | OK | OK | — |
| Meeting (native WebRTC room+chat+capture bindings) | OK | OK | OK | OK | OK | OK | OK | — |
| Capture (clip/mic/image→Whisper/OCR) | OK | OK | GAP | OK | BLOCKED | BLOCKED | BLOCKED | deploy `capture-process`; `OPENAI_API_KEY` |
| AI / Business Brain edge (ask-avenize) | OK | OK | OK | OK | BLOCKED | BLOCKED | BLOCKED | deploy `ask-avenize`; `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` |
| Files (private buckets+signed URLs) | OK | OK | OK | OK | OK | OK | OK | — |
| Search (unified `business_search` RPC in CommandPalette) | OK | OK | OK | OK | OK | OK | OK | — |
| Analytics (usage+onboarding+funnels) | OK | OK | OK | OK | OK | OK | OK | — |
| Attribution (UTM→checkout→revenue) | OK | OK | OK | OK | OK | OK | OK | — |
| Admin control plane (RiverwaysAdmin+payment investigation+global search) | OK | OK | OK | OK | OK | OK | OK | — |
| Monitoring (PlatformOps+error feed+incidents) | OK | OK | OK | OK | OK | OK | OK | — |
| Security / RLS | OK | OK | OK | OK | OK | OK | OK | — |
| Audit trail (row-change triggers+reversals) | OK | OK | OK | OK | OK | OK | OK | — |
| Data lifecycle (expire_recordings,detect_*_all,daily digest opt-in) | OK | OK | OK | OK | OK | OK | OK | sweepers exist; business retention policy is P2 |
| Deployment gate | OK | OK | OK | OK | OK | FAIL | BLOCKED | apply migrations live; deploy edge fns |

## E2E journeys (as of this run)

| Journey | Status | Note |
|---|---|---|
| A New customer (signup→onboard→first action) | SKIP | live email confirmation on; needs `E2E_EMAIL`/`E2E_PASSWORD` |
| B Returning customer (login→dashboard→existing data) | PASS | auth path + Brain RPCs live |
| C CRM (lead→request→quote→order) | PASS (contract) | RPCs exist + signatures verified; full money smoke needs live data fixture |
| D Payment (plan→checkout→Paystack→webhook→entitlement) | PASS (rails) | edge fns live; real transaction smoke needs Paystack test key |
| E Support (issue→Sarah→admin→resolution) | OK (wiring) | admin investigation + global search present |
| F Meeting (meeting→capture→AI→action→CRM) | PARTIAL | meeting runtime live; AI/capture edge fn not deployed |
| G Security (cross-tenant denial) | PASS (RPC denies) | verified non-member `{authorized:false}` paths in code + contract |

## System responsible / next action

| Gap | System responsible | Next action (automatic, no PO input) |
|---|---|---|
| 218 live DB/RPC objects missing | Supabase production DB | apply `scripts/apply_migrations_live.sh` when `SUPABASE_DB_URL` provided; all idempotent |
| 9 edge functions undeployed | Supabase edge runtime | `scripts/deploy_edge_functions.sh` when `SUPABASE_ACCESS_TOKEN`+secrets provided |
| Email rail missing | Resend | set `RESEND_API_KEY`/`EMAIL_FROM`/`RESEND_WEBHOOK_SECRET`; deploy both fns |
| AI/Capture edge fns missing | OpenAI (optional) | set `OPENAI_API_KEY`; deploy fns |
| E2E signup journey | mailbox | provide `E2E_EMAIL`/`E2E_PASSWORD` |