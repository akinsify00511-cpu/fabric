# DOMAIN: PERMISSIONS

**Purpose:** answer "who can do what" at three separate layers that must never be
conflated — database (RLS, the boundary), server (RPC guards), client (UX).

**Responsibilities:** RLS policies on all tenant tables; membership-guarded RPCs;
role hierarchy; module gating; member kinds (identity, not grants); functional roles
(tool access, UX); approval thresholds.

**Entities:** staff.role (5 DB-valid: owner/admin/manager/team_lead/staff),
staff.member_kind (identity/UX: owner/staff/consultant/vendor/expert/partner),
functional_roles, module_plan_tiers/module_status, business_approval_config,
platform_admins/riverways_admins (allowlists).

**States:** permission = role × module-entitlement × module-readiness × membership.
Selection (workspace tools) is a removal-only UX filter — it can never grant.

**User flows:** owner assigns roles (People page, inline reclassify); RoleSettings
manages functional roles + approval thresholds; module gate page distinguishes
"not ready" (back to dashboard) from "needs higher plan" (upgrade CTA).

**Permissions:** the permission matrix itself: role changes owner/admin-only
(trigger-enforced); module readiness service-role-only; approval config owner/admin.

**Database:** 080 RLS rewrite (111 policies), zz_rpc_tenant_guards_closure (generated
guards + REVOKE classes), 20260819060000-80000 (immutability triggers),
20260818170000 (approval config).

**APIs:** can_access_module, list_accessible_modules, is_approval_required
(precedence: business bypass → sole proprietor → category config → floor → DEFAULT
require — fail-safe), set_member_kind (last-owner guard).

**Events:** security.permission_changed on assignment changes.

**Notifications:** role-change notifications via canonical notifications.

**Analytics:** owner_intelligence surfaces adoption by role-agnostic usage data.

**AI interaction:** AI never bypasses these (caller-JWT context; same RPCs).

**Failure states:** unknown module → denied (closed); missing gate RPC → treated as
not-ready (closed); permission RPC error → deny.

**Recovery:** owner can always re-grant; last-owner guard prevents lockout.

**Security:** THIS domain IS the security boundary; see security architecture doc.
Precedence rule: deny > allow; server > client.

**Accessibility:** gate pages are readable and keyboard-navigable.

**Performance:** module access cached per business:module; cache cleared on signOut.

**Tests:** ownerIntelligence/builderDashboard gate suites; RLS attack suite;
memberKinds suite; apiKeyGateway suite.

**Definition of Done:** unauthorized access PROVEN to fail (not inspected — tested)
for every tenant-sensitive path.
