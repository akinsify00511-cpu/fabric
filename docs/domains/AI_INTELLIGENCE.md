# DOMAIN: AI INTELLIGENCE (The Business Brain)

**Purpose:** the layer that reasons ACROSS modules: What is happening? Why? What
should I do? Did it work? How much value did it create? Governance rules live in
docs/ai/AVENIZE_AI_GOVERNANCE.md — this spec covers the domain machinery.

**Entities:** claims (recommendations — the outcome loop), kpi_metrics,
business_health_scores, diagnosis_rules, business_relationships (context graph),
copilot_messages, copilot_daily_usage.

**Responsibilities:** business state classification, governed metrics, health pulse,
diagnosis (symptom FACT + cause INFERENCE + ₦ impact from real numbers), next-best
action scoring, value ledger, copilot chat, recommendation lifecycle + effectiveness.

**States:** 12 business states (at_risk/cash_constrained/.../growing/scaling/
insufficient_data); claims lifecycle (see state machines doc).

**User flows:** BusinessHome (intelligence-first: state + NBA + cards) →
ExecutiveCockpit (full brain) → AskAvenize (/app/ask: chat with provider badge —
"Answered from your live data" vs "AI reasoning over your data") → act on a
recommendation (accept → create task → outcome recorded → effectiveness).

**Permissions:** business_brain membership-guarded (any staff member); copilot
edge fn verifies JWT + membership + daily cap; claims writes only via RPCs.

**Database:** 086 (metrics), 088 (claims lifecycle), 091 (8 rules), 092 (cron),
093 (health), 20260101000011 (behavior rules), 20260818220000 (business_brain),
20260819040000 (copilot).

**APIs:** business_brain, classify_business_state, diagnose_business,
next_best_action, business_value_ledger, open_recommendations,
recommendation_effectiveness, run_recommendation_rules + run_behavior_recommendation
_rules (SEPARATE — never re-declare one over the other), ask-avenize edge fn.

**Events:** ai.completed/ai.failed (duration) on the platform bus; recommendations
emit via claims trigger (critical → owner notification once).

**Notifications:** critical recommendation → owner (deduped).

**Analytics:** recommendation effectiveness (by-rule success); value ledger
(recovered/saved/generated/identified — ONLY from recorded outcomes).

**AI interaction:** this IS the AI domain. Grounding: caller-JWT context assembly;
fallback chain deterministic → LLM → honest fallback; caps: 100 user msgs/day.

**Failure states:** per-engine EXCEPTION isolation — one engine degrades one card
({degraded:true} + honest notice), the rest render; copilot without LLM key still
answers deterministically.

**Recovery:** degraded engines refresh on next load; DLQ + retry for automation-driven
intelligence.

**Security:** claims write-closure; caller-JWT assembly; fenced user input;
metadata-only activity logging.

**Accessibility:** cards have text alternatives; confidence tags are text, not color
alone.

**Performance:** business_brain is ONE aggregator call; BusinessHome fires only the
loads the displayed cards need (needs() gate).

**Tests:** businessState (12), diagnosisEngine (8), nextBestAction (7), valueLedger
(9), copilotRouter (15), governedMetrics (12).

**Definition of Done:** the home answers what/why/what-next/did-it-work/value from
real data with provenance labels — and degrades honestly when it can't.
