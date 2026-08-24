# DOMAIN: ORGANIZATION

**Purpose:** the authoritative structural model — Business → Departments → Teams →
Staff → Roles → Permissions — including groups/subsidiaries and governance (the Board
belongs HERE, not as a separate module).

**Responsibilities:** org structure CRUD, subsidiaries (create_subsidiary),
org-level access resolution (get_current_accessible_businesses), organogram,
governance (board roster, committees, resolutions, conflicts), objective cascade
provenance.

**Entities:** businesses (organization_id, parent_business_id, entity_type),
organizations, organization_memberships, departments, teams, staff,
board_committees(+members), board_resolutions, board_conflicts.

**States:** staff active/deactivated; resolutions proposed → approved/rejected/
tabled/withdrawn (ordinary = simple majority, special = 2/3 of cast votes — outcome
derived server-side); conflicts active/mitigated/resolved.

**User flows:** owner builds structure (depts/teams); invites staff with member_kind;
group owner creates subsidiaries (creator gets group_admin + a staff row in the
subsidiary); subsidiary switching via SubsidiarySwitcher (BusinessContext); board
governs via the Governance tab (Organization page, ?tab=governance) — resolutions
cascade to strategic_objectives ONLY when approved (marks implemented_at).

**Permissions:** structural changes owner/admin (enforce_business_structural_immutability
trigger); committee/resolution writes owner/admin-gated RPCs; subsidiary creation gated
(group_owner/group_admin of org OR owner of parent).

**Database:** org hierarchy (20260817150000 + 18100000 is_active→active fix),
20260818300000 (subsidiary creation), 20260822120000 (governance layer).

**APIs:** create_subsidiary, get_current_accessible_businesses, record_board_vote,
cascade_board_objective, objective_cascade_tree (depth-bounded cycle guard),
board_governance_overview, compose_board_report (AGGREGATE ONLY — the report function
never references payroll/salary/PII/CRM tables; boundary by CONSTRUCTION).

**Events:** subsidiary + governance actions emit business_events; assignment changes
emit security.permission_changed (platform bus).

**Notifications:** resolution cascade + invite flows notify via the canonical
notifications table.

**Analytics:** headcount feeds experience-context complexity tiers (solo/small/mid/
enterprise) which drive progressive UI complexity.

**AI interaction:** objective gap analysis (constraint detection over deals).

**Failure states:** organogram governance strip fails closed (hidden) when the
governance migration isn't deployed; subsidiary switch to a business without a staff
row shows empty data (RLS denies) — acceptable edge, documented.

**Recovery:** soft states only; structural immutability prevents destructive moves.

**Security:** RLS via get_current_staff (staff rows per business the user belongs to);
board visibility boundary is construction-based.

**Accessibility:** organogram is navigable; tabs keyboard accessible.

**Performance:** accessible-businesses list cached in BusinessContext; organogram
loads best-effort.

**Tests:** governanceCascade suite (18); member kinds suite; guard matrices on
postgres:15.

**Definition of Done:** one structure Board → executives → departments → teams;
cross-tenant and cross-subsidiary isolation proven; cascade works from resolution to
team target.
