# DOMAIN: ONBOARDING

**Purpose:** take a verified user to an operating business — business created,
organization seeded, tools selected, guidance started — with zero dead ends.

**Responsibilities:** business creation (create_business_and_owner — the ONLY path;
direct inserts blocked by design), profile capture (job title feeds function
derivation), theme, industry (seeds tool defaults), tool selection
(user_workspace_selections), invite acceptance (join flow), activation guidance.

**Entities:** businesses, staff, organizations/organization_memberships,
user_workspace_selections, invites.

**States:** the membership state machine (IDENTITY.md) drives routing; onboarding
itself is a stepper (Business → Profile → Theme → Industry → Tools → Ready).

**User flows:** new signup → onboarding → /app; invited member → join → /app
(member_kind carried from invite; owner never invitable); existing member visiting
/onboarding → redirected to /app (never re-onboarded); already-belongs RPC error →
refreshStaff + /app (recovery, not failure).

**Permissions:** create_business_and_owner is SECURITY DEFINER, authenticated-only,
anon-revoked; repeat-onboarding guarded.

**Database:** zzz_auth_protocol_repair.sql (fixed org link + staff.email NOT NULL +
#general channel join ordering); 100_workspace_personalization.

**APIs:** createBusinessAndOwner wrapper (4-arg canonical + drift fallback +
array/object/scalar normalization + already-member recovery).

**Events:** onboarding.completed → platform_activity_events; onboarding_complete
usage event (steps_reached, duration_seconds, industry).

**Notifications:** welcome email (transactional templates).

**Analytics:** onboarding_funnel (per business), onboarding_conversion (builder-only).

**AI interaction:** feature_discovery + trial_assistance pick up from the selected
tools post-onboarding.

**Failure states:** RPC missing (undeployed) → honest "not configured" message (never
a loop); transient staff read → retry; error state never logs out.

**Recovery:** refreshStaff + navigate; re-running onboarding for an existing member
is a no-op redirect.

**Security:** no anonymous business creation; industry/theme are display fields,
never authorization.

**Accessibility:** stepper is keyboard navigable; labeled fields; focus management
between steps.

**Performance:** single RPC for business creation; tool selection persisted
best-effort after success (never blocks the transition).

**Tests:** authProtocol suite; onboarding funnel self-instrumentation tests.

**Definition of Done:** a new user reaches /app with a business, owner staff row,
#general membership, and selected tools — verified end-to-end (e2e-production.sh).
