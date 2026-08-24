# DOMAIN: COMMERCE (Demand Chain)

**Purpose:** the lead-to-revenue workflow as ONE chain, not three disconnected
modules — every downstream record keeps its upstream links. Rejected/abandoned demand
is recoverable; no lost demand.

```text
Lead → Request → Qualification → Quote → Accepted Quote → Order → Revenue
```

**Entities:** leads, lead_requests (6 types), quotes (backlinks + access_token +
expires_at), sales_orders, demand_activity (append-only trail), invoices +
transactions (revenue).

**States:** see docs/data/AVENIZE_STATE_MACHINES.md (request/quote/order machines;
rejected/abandoned revivable; converted quotes cannot double-order).

**User flows:** lead page DemandActionCentre (request/quote/order forms + visible
chain + transitions + activity); /app/requests + /app/orders; public /quote/:token
portal (customer views → auto sent→viewed; accepts/declines once, no login).

**Permissions:** 4 member-guarded SECURITY DEFINER RPCs (create_lead_request,
create_quote, create_sales_order, transition_demand); portal RPCs granted to anon
but token-scoped (get_quote_by_token, respond_to_quote).

**Database:** zzzaaa_demand_capture.sql; quotes NOT NULL backfill from lead handled
in create_quote; notifications trigger supplies category+type and is EXCEPTION-wrapped
(a notification failure never breaks a demand write).

**APIs:** the 4 chain RPCs + portal RPCs + demand_funnel / demand_revenue /
demand_pipeline intelligence RPCs.

**Events:** demand_notify triggers → notification bell (assignee, else owners).

**Notifications:** quote sent/viewed/accepted; order confirmed — via canonical
notifications.

**Analytics:** demand_funnel (pairwise conversion %), demand_revenue (total/AOV/
lost+expired value/revenue-per-lead/by-source), demand_pipeline (open values +
avg sales days). Revenue attribution reaches paid invoices.

**AI interaction:** attribution feeds discovery_roi; copilot answers funnel questions.

**Failure states:** quote RPC missing required backfill → surfaced; double-order
attempt rejected; expired quote → honest expired state.

**Recovery:** revive rejected/abandoned; orders cancellable from early states.

**Security:** portal tokens are random and single-purpose; chain RPCs membership-
guarded; cross-tenant denial tested.

**Accessibility:** portal is usable without the app chrome; forms labeled.

**Performance:** funnel computed pairwise server-side; chain pages query scoped by
business.

**Tests:** demand chain functional matrix on postgres:15 (full lifecycle incl. anon
portal accept, cross-tenant denial, no duplicate orders).

**Definition of Done:** a lead can be carried to revenue entirely inside Avenize,
with attribution and no stage as decoration.
