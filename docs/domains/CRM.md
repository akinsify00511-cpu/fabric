# DOMAIN: CRM

**Purpose:** manage relationships and pipeline — contacts, leads, deals — feeding the
demand chain (COMMERCE.md) and the intelligence layer.

**Responsibilities:** contact management, lead capture/import/convert, deal pipeline
(stages), per-subsidiary scoping, role-aware views (my deals vs all).

**Entities:** contacts (customers = contacts; no separate table), leads, deals.

**States:** lead new → contacted → qualified → converted/lost; deal by stage
(won/lost terminal); lead status transitions validated by transition_demand where
part of the demand chain.

**User flows:** capture lead (manual / CSV import / demand capture) → qualify →
convert to contact+deal → pipeline board → won/lost. Sales individuals default to
"mine" (assignee/owner filter) with a toggle; managers see all.

**Permissions:** create/delete gated by the real permission matrix (canCreate/
canDelete) matching RLS; RLS business-scoped; per-subsidiary via activeBusinessId
(BusinessContext) with fallback to staff.business_id.

**Database:** 041 (leads + business_id/RLS in 075), contacts 001 + 075 lead_id
backlink, deals 001 (stage, owner_id, assignee_id — NOT status/assigned_to/closed_at;
the DealWon trigger drift on these was a real bug, fixed 059/090).

**APIs:** standard RLS'd table access + demand chain RPCs (COMMERCE.md) for the
lead→request→quote→order extension.

**Events:** DealWon/DealLost (stage transitions), leads.imported/converted
(platform bus), CustomerInactive detector.

**Notifications:** lead assignment + conversion via canonical notifications.

**Analytics:** pipeline metrics feed governed KPIs; lead quality card on the
marketing/sales home; CUST-001/SAL-CONV-001 recommendation rules.

**AI interaction:** capture can create leads/deals via the propagation handler;
copilot answers pipeline questions from governed metrics.

**Failure states:** CSV import surfaces per-row errors; conversion is atomic via RPC.

**Recovery:** rejected/abandoned demand revivable (COMMERCE.md); deleted deals
follow the reversal/audit pattern where applicable.

**Security:** cross-tenant denial proven; per-subsidiary scoping verified.

**Accessibility:** pipeline keyboard operable; forms labeled.

**Performance:** deals indexes (business_id,stage) + (business_id,owner_id);
leads index (business_id,status).

**Tests:** crmRoleGating suite (8); demand chain smoke matrix (functional, postgres:15).

**Definition of Done:** no stage is UI decoration — every stage transition does real
work and feeds the funnel analytics.
