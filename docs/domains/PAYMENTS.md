# DOMAIN: PAYMENTS

**Purpose:** Plan → Price → Entitlements → Checkout → Payment → Subscription →
Access — one consistent path for every published plan; the browser NEVER decides
payment success.

**Entities:** pricing_tiers (single source of truth), payment_transactions (the ONLY
payment state — ledger), payment_webhook_events (idempotency),
business_subscriptions (price_locked), business_entitlements (synced by trigger).

**States:** payment ledger pending → processing → success/failed; success → refunded
(trigger-enforced — invalid transitions rejected). Subscription trialing → active →
past_due → cancelled (cancel_at_period_end).

**User flows:** /upgrade (self-service checkout for ALL published plans — Scale
included; only genuinely custom enterprise is contact-based) → subscription-management
createCheckout (owner/admin gate; server-side price; pending ledger row; 10-min
idempotent reuse) → Paystack → paystack-webhook settles → entitlements unlock →
receipt email queued. Return path: ?reference= → paystack-verify (membership-gated;
informational — the ledger is authoritative) + entitlement refresh. Manual
bank-transfer rail remains as fallback.

**Permissions:** checkout owner/admin; verify membership-gated; webhook is
HMAC-authenticated (no platform JWT); ledger writes only via the webhook path.

**Database:** 20260822150000 (ledger), 20260821170000 (subscription→entitlement
sync), 20260822125000 (manual rail), 20260818200000 (pricing_tiers).

**APIs/edge fns:** subscription-management (createCheckout/cancel), paystack-webhook
(HMAC-SHA512 → idempotency → provider RE-VERIFY → settle → upsert subscription →
queue receipt), paystack-verify. Shared logic: _shared/paymentsCore.ts (state machine,
HMAC, constant-time compare, amount-sufficiency) — the SAME module vitest tests.

**Events:** checkout.started/failed, subscription.cancel (platform bus);
payment.success/failed triggers queue receipt/failed emails.

**Notifications:** payment receipt + payment-failed emails via the Resend subsystem
(event-driven — email failure never breaks settlement).

**Analytics:** billing_activity (Riverways); demand/attribution chain reaches paid
invoices.

**AI interaction:** plan recommendation (recommend_plan — minimum tier usage
justifies; anti-gouging); trial_assistance.

**Failure states:** unsigned webhook → 401 (live-verified); provider mismatch →
ledger untouched; verify-before-webhook → honest "pending" (webhook will settle);
no unintended free trials (trial comes only from business_entitlements.trial_ends_at
server-side trigger).

**Recovery:** failed payment → new checkout (new pending row); stuck processing →
webhook or verify reconciles; refund path success → refunded.

**Security:** threat model §13–14. Server-side price, HMAC, re-verify, idempotency.

**Accessibility:** checkout states announced; currency formatted accessibly.

**Performance:** checkout is one edge call; verify is a single read.

**Tests:** paymentsCore vitest suite; email subsystem suite; (live) plan ×
billing-cycle smoke matrix — pending secrets.

**Definition of Done:** every published plan purchasable end-to-end; entitlements
unlock only from settled ledger state; verified by e2e-production.sh on production.
