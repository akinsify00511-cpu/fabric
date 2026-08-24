# DOMAIN: ADMIN (Riverways Control Plane)

**Purpose:** the platform-operator control plane — system health, accounts, users,
organizations, AI, billing, security, errors, self-healing, analytics — useful
WITHOUT raw Supabase logs for routine diagnosis. Privacy rule: "everything necessary
to operate and secure the platform, not unrestricted access to private user content."

**Entities:** riverways_admins (allowlist, client-denied), riverways_account_types,
platform_activity_events, platform_error_events, platform_incidents,
platform_integration_status, platform_incident_investigations.

**States:** incident open → investigating → resolved (+postmortem); error new →
resolved; account types as ops labels (NOT staff.role).

**Responsibilities:** live activity stream, global search (users/orgs/RPCs/incidents/
events), account management, per-user/org activity, AI activity (metadata only),
billing activity, security center, error center, self-healing (integrity engine),
platform analytics (DAU/WAU/MAU, signups, module adoption).

**User flows:** /riverways-admin (RequireAuth → is_riverways_admin() gate → 10 tabs +
global search + health strip + privacy-boundary copy); non-admins get the restricted
screen (fails closed).

**Permissions:** every reader RPC gated by is_riverways_admin() returning
{authorized:false} with NO payload otherwise; allowlist service-role managed.

**Database:** 20260821000000 (riverways admin), 20260821150000 (activity ops),
20260821160000 (account management), platform-ops migrations (20260818120000+).

**APIs:** riverways_admin_overview, activity_feed, global_search, user/org activity,
ai_activity, billing_activity, security_center, error_center, self_healing,
platform_analytics, riverways_admin_list_accounts, riverways_assign_account_type.

**Events:** the console READS the platform bus; assignment emits
security.permission_changed.

**Notifications:** incident paging via Resend + Termii (ops domain).

**Analytics:** platform_analytics; all aggregate — no PII, no financials.

**AI interaction:** ai_activity is metadata-only (contents never stored).

**Failure states:** fails closed everywhere — missing migrations → honest empty /
authorized:false screens; never a broken console.

**Recovery:** self-healing tab surfaces integrity findings; repairable objects →
apply the canonical migration; security-sensitive → SECURITY_REPAIR_REQUIRED.

**Security:** threat model §15 (insider access); drill-down audit-logged.

**Accessibility:** tabs keyboard navigable; status uses text + color.

**Performance:** one overview aggregate; realtime subscriptions for live tabs.

**Tests:** riverways gate matrix (admin true / tenant authorized:false-no-payload
on every reader); sanitizer strips credential keys; bogus account type rejected;
tenant self-escalation denied.

**Definition of Done:** an operator can diagnose routine platform issues from the
console alone, and every sensitive action is attributed.
