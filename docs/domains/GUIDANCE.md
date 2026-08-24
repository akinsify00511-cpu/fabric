# DOMAIN: GUIDANCE

**Purpose:** contextual education and direction — onboarding guidance, empty-state
guidance, next-best actions, system education — without notification spam.

**Entities:** module_value_propositions (operator-tunable "why this matters" copy +
server-side value-estimate SQL), user_workspace_selections (tool curation),
tool-onboarding seen state, claims (next-best action source).

**Responsibilities:** ToolOnboardingPopup (first-visit coachmarks, 18 tools),
gamified empty states (milestone + hint + tip), feature discovery ("Worth exploring"
with REAL value estimates), trial assistance (phase-prioritized single nudge),
next-best-action surfacing.

**User flows:** first visit to a tool → one coachmark (dismissible, tracked);
empty module → "Your first X" milestone with coaching; trial phase nudge
(setup_incomplete > trial_ending > feature_unused > midpoint > healthy-no-nudge);
dashboard "Worth exploring" → explore route.

**Permissions:** discovery/nudges read-only; value propositions service-role managed
(the value_estimate_sql is NEVER client-writable — executed via format(%L) server-side).

**Database:** 20260818190000 (feature discovery), 20260818210000 (trial assistance).

**APIs:** feature_discovery, trial_assistance, next_best_action (Brain), plus the
shared EmptyState component (gamified props: milestone/hint/tip).

**Events:** tool_select/tool_deselect usage events feed quick_turnoff detection.

**Notifications:** guidance is IN-CONTEXT (banners, coachmarks, empty states) — it
does NOT create bell/email notifications (anti-spam by design).

**Analytics:** feature_activation (reuse_label: reused/returning/activated/view_only).

**AI interaction:** next_best_action scores by impact × urgency × success-probability
/ effort + state relevance; all deterministic.

**Failure states:** RPCs missing → generic banner/empty states (graceful); no data →
honest "keep exploring" nudge.

**Recovery:** per-nudge dismissal resets on phase change.

**Security:** value-estimate SQL is server-stored only (injection-safe by
construction).

**Accessibility:** coachmarks dismissible by keyboard; not focus-trapping.

**Performance:** guidance loads are best-effort parallel; never block the host page.

**Tests:** trialAssistance (8), featureDiscovery (6), planRecommendation (8),
nextBestAction (7).

**Definition of Done:** a new user always has a clear, honest next step; an
established user is never nagged (healthy phase = no nudge).
