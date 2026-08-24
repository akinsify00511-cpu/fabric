# DOMAIN: OBJECTIVES (OKR + Board Cascade)

**Purpose:** board decision → company objective → department objectives → team
targets — one cascade with provenance, honest progress, and constraint analysis.

**Responsibilities:** objectives + key results CRUD, weighted progress rollup,
metric-linked KRs (actuals flow from governed KPIs), board-resolution seeding,
cascade trees, CEO constraint analysis ("unlikely to be achieved; primary constraint
is pipeline, N% below required").

**Entities:** strategic_objectives (extended with OKR fields — NOT duplicated),
key_results (progress GENERATED 0–100, optional metric_key link), board_resolutions
(provenance link).

**States:** objective lifecycle (active/achieved/abandoned); KR status; analysis
ladder achieved/on_track/at_risk/unlikely/insufficient_data; progress_only for
non-revenue objectives.

**User flows:** executive creates objectives → adds KRs (unit/start/target, optional
metric link) → inline updates current → sync from metric; board approves resolution →
cascade_board_objective seeds objective with provenance → further cascades nest via
parent_id; "Analyze constraint" renders the gap panel with real numbers.

**Permissions:** membership-guarded RPCs; board cascade requires approved resolution.

**Database:** 094 (OKR extension + key_results + objective_progress +
sync_kr_from_metric), 20260822130000 (objective gap analysis), 20260822120000
(resolution provenance).

**APIs:** objective_progress (weighted rollup; NULL if no KRs — honest, not "0%"),
sync_kr_from_metric, cascade_board_objective, objective_cascade_tree (depth-40 cycle
guard), objective gap analysis RPC (deterministic over deals: win_rate NULL unless
≥5 closed deals; binding constraint derived).

**Events:** cascade emits business_events via the standard bus.

**Notifications:** KR owners notified on assignment via canonical notifications.

**Analytics:** objective progress feeds business health + MPR + board report.

**AI interaction:** gap analysis is deterministic SQL (no LLM); the headline sentence
is generated from real coverage/win-rate numbers.

**Failure states:** no target-backed data → "insufficient data" (never a fabricated
projection); missing period dates → no at_risk flag.

**Recovery:** sync is idempotent; re-running never duplicates.

**Security:** RLS via get_current_staff (the old strategic_objectives cross-tenant
policies were rewritten in 094).

**Accessibility:** progress bars have text equivalents; expandable rows keyboard
operable.

**Performance:** recursive tree is depth-bounded; progress is a single aggregate RPC.

**Tests:** governanceCascade suite (vote outcomes, cascade creates + marks
implemented_at, tree provenance); tone/label helper tests.

**Definition of Done:** cascade from approved resolution to team target with honest
progress and constraint analysis — all from real numbers.
