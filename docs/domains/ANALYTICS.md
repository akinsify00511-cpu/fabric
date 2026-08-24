# DOMAIN: ANALYTICS

**Purpose:** canonical event-based analytics — acquisition, activation, onboarding,
engagement, retention, conversion, revenue, feature usage, failures, AI interactions.
Every metric has an explicit formula (METRIC_DICTIONARY.md); no undocumented metric
is ever displayed.

**Entities:** usage_events (append-only + context JSONB), analytics_events
(reconciled 111 — ONE insert path via record_analytics_event), metric_definitions →
kpi_metrics (governed; refresh_business_metrics is the ONLY writer), business health
scores, demand funnel/revenue RPCs.

**States:** governed metric confidence high/medium/low/insufficient; value NULL below
min_sample (never a guess).

**Responsibilities:** route-view + structured event capture (fire-and-forget),
funnels (onboarding, workflow), feature activation, quick-turnoff, ignored
automations, owner intelligence, builder dashboard, governed metrics engine.

**User flows:** automatic (instrumentation) + surfaces: OwnerIntelligence
(/app/owner-intelligence, owner-gated), BuilderDashboard (/builder, platform-admin),
BusinessHome cards, ExecutiveCockpit, MonthlyReview.

**Permissions:** per-business analytics membership-guarded (the #18 fix: SECURITY
DEFINER + business param MUST verify membership); cross-business aggregates
service-role only, surfaced only via is_platform_admin-gated aggregators.

**Database:** 20260101000007 (usage_events), ...000009 (self-instrumentation),
...000010 (owner intelligence + guard closure), ...000011 (sector benchmarks),
...000012 (builder dashboard), 086 (governed metrics), 093 (health).

**APIs:** record_analytics_event (canonical insert), onboarding_funnel,
workflow_funnel, feature_activation, ignored_automations, quick_turnoff,
owner_intelligence, sector_benchmark, builder_dashboard, refresh_business_metrics,
current_metrics, compute_business_health.

**Events:** analytics IS events; also consumes business_events for intelligence.

**Notifications:** critical-metric alerts via the recommendation→notification path.

**AI interaction:** metrics feed the Brain; recommendations cite real metric values.

**Failure states:** analytics failure → drop the batch (never grow an unbounded
queue); permanent-unavailable classification (PGRST202 etc.) stops retries.

**Recovery:** circuit breaker resets per session/TTL; next successful write resumes.

**Security:** business-scoped RLS; cross-tenant guarded; aggregate-only for
cross-business (no business-identifying fields).

**Accessibility:** charts have text/table alternatives (RepresentationEngine table
view).

**Performance:** one instrumentation call per route change (fire-and-forget);
governed refresh on pg_cron (15 min) not per page view.

**Tests:** governedMetrics (12), selfInstrumentation (7), saidVsUsed (6),
ownerIntelligence (14), builderDashboard (11), sectorIntelligence (8).

**Definition of Done:** every displayed number traces to a documented formula over
real data; insufficient data is shown as such.
