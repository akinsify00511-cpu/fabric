# AVENIZE STATE MACHINES

**Version:** 1.0 (2026-08-24). Every critical business object has an explicit state
machine. Invalid transitions are REJECTED — trigger-enforced where the cost of an
invalid transition is high (payments), RPC-validated elsewhere. Client code never
invents transitions; it calls the transition RPC.

## Payment — `payment_transactions` (trigger-enforced, `enforce_payment_transaction_transition`)

```text
pending → processing → success
pending → processing → failed
success → refunded
```
- Actor: `paystack-webhook` edge fn (HMAC-SHA512 verified + re-verified against
  Paystack) — NEVER the browser. `paystack-verify` is a browser-return helper;
  the ledger stays authoritative.
- Side effects: success settles the ledger → upserts `business_subscriptions` →
  trigger syncs entitlements → trigger queues receipt email (email failure cannot
  break settlement). failure → queues payment-failed email.
- Audit: every webhook event persisted in `payment_webhook_events`
  (unique(provider,event_id) — idempotent replay-safe).
- Recovery: 10-minute idempotent checkout reuse; failed payments can be retried by
  starting a new checkout (new pending row).

## Quote — `quotes`

```text
draft → sent → viewed → accepted → converted
sent/viewed → rejected;  sent (past expires_at) → expired
```
- Actor: staff (create/send), anonymous customer via `access_token`
  (`get_quote_by_token`, `respond_to_quote` — granted to anon, token-scoped).
- Side effects: create_quote auto-advances request → quoted; accept enables order;
  convert marks converted (converted quotes cannot double-order).
- Failure: respond_to_quote on an already-decided quote is rejected (once only).

## Order — `sales_orders`

```text
confirmed → in_fulfilment → fulfilled → completed
confirmed/in_fulfilment → cancelled
```
- Entry requires an accepted quote (`create_sales_order` enforces; backfills chain).
- Actor: business member via membership-guarded RPC. Transitions via
  `transition_demand` (validated per-entity; timestamps recorded).

## Demand Request — `lead_requests`

```text
new → reviewing → qualified → quoted → accepted → fulfilled
any open state → rejected | abandoned  (BOTH revivable — demand is never lost)
```
- `create_lead_request` auto-advances the lead new → contacted.

## Meeting — `meetings`

```text
scheduled → in_progress → completed
scheduled/in_progress → cancelled
```
- Actors: host (start/end), member or token-guest (join/leave) via lifecycle RPCs
  (create/start/join/leave/end/generate_token). All idempotent; all emit
  business_events. Participant evidence appended to `meeting_participant_events`.

## Meeting Decision / Action

- Decision: `proposed → decided → reversed | superseded` (reversed stays VISIBLE —
  audit trail; links to claims for the outcome loop).
- Action: 5-status lifecycle; `create_action_task` links to a REAL task and marks the
  action in_progress (no parallel task system).

## AI Recommendation — `claims`

```text
issued → acknowledged → accepted | rejected
accepted → acted → outcome_recorded
issued/acknowledged → superseded | expired
```
- Actor: membership-guarded lifecycle RPCs (acknowledge / set_decision / mark_acted /
  record_outcome). Claims table is write-closed to direct client DML (Session 33b) —
  writes go through SECURITY DEFINER RPCs only.
- Side effect: critical issuance notifies the owner once (deduped).

## Subscription — `business_subscriptions`

```text
trialing → active → past_due → cancelled (cancel_at_period_end supported)
```
- Actor: subscription-management edge fn (owner/admin gate) + webhook settlement.
- `price_locked` preserves founding pricing at renewal.

## Membership (client-side, authoritative in AuthContext)

```text
loading → anonymous | member | onboarding_required | deactivated | error
```
- Login/Onboarding NEVER decide membership; they defer to AuthContext.
  A failed onboarding operation never destroys a valid session.
- `deactivated` and `error` are explicit states with retry-in-place — never logout.

## Email — `email_events`

```text
queued → sent → delivered | bounced  (opened advances engagement only)
```
- Forward-only: the resend-webhook handler never regresses status.

## Invite — `invites`

```text
pending → accepted | expired | revoked
```
- `accept_invite` carries `member_kind` into the staff row; `owner` is never invitable.
