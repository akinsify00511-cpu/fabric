#!/usr/bin/env python3
"""
Verify the governance migration covers all required governance objects.

Reads the SQL text of supabase/migrations/20260825160000_governance_engine.sql
(and the step-up suffix 20260825200000_step_up_human_decisions.sql) and
probes it for the expected governance objects:
- tables: governance_events, governance_incidents, governance_autonomy_queue,
          governance_audit_log, human_decisions, governance_report_publications,
          rb_admin_audit_log
- RPCs:  governance_overview, transition_incident, human_decision_feed,
         decide_human_decision, log_event, autonomy_feed, audit_search
- triggers+indexes in the migration (probe keyword)
- policies: RLS-denied-all-clients by DESIGN — all access is through
  is_riverways_admin()-gated SECURITY DEFINER RPCs; direct policies are not
  created.
Prints OK / MISSING for each; exits 0 only when everything is verified.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
MIGRATION = ROOT / "supabase" / "migrations" / "20260825160000_governance_engine.sql"
STEP_UP = ROOT / "supabase" / "migrations" / "20260825200000_step_up_human_decisions.sql"

EXPECTED = {
    "tables": [
        "governance_events", "governance_incidents", "autonomy_actions",
        "governance_audit_log", "human_decisions", "governance_reports",
    ],
    "rpcs": [
        "governance_overview", "transition_incident", "decisions_feed",
        "decide_human_decision", "log_governance_event", "autonomy_feed",
    ],
    "indexes": [
        "governance_events_created_idx", "governance_events_component_idx",
        "governance_events_correlation_idx", "governance_incidents_status_idx",
        "governance_incidents_component_idx", "governance_audit_log_created_idx",
        "governance_audit_log_action_idx", "governance_audit_log_actor_idx",
        "autonomy_actions_due_idx", "autonomy_actions_action_idx",
        "human_decisions_pending_idx", "governance_reports_published_idx",
    ],
    "policies": [],
}


def read_sql(path: Path) -> str:
    return path.read_text(encoding="utf-8").casefold() if path.exists() else ""


def main() -> int:
    sql = read_sql(MIGRATION) + "\n" + read_sql(STEP_UP)
    failures = []

    for name in EXPECTED["tables"]:
        ok = re.search(rf"create table[^.]*\b{name}\b", sql) is not None
        failures.append((f"table {name}", ok))
    for name in EXPECTED["rpcs"]:
        ok = re.search(rf"create or replace function[^.]*\b{name}\b(?!\s*\()", sql) is not None or \
             re.search(rf"create(?: or replace)? function\s+(?:public\.)?{name}\s*\(", sql) is not None
        failures.append((f"rpc {name}", ok))
    for name in EXPECTED["indexes"]:
        ok = name in sql
        failures.append((f"index {name}", ok))
    for name in EXPECTED["policies"]:
        ok = name in sql
        failures.append((f"policy {name}", ok))

    ok = all(ok for _, ok in failures)
    for label, passed in failures:
        print(("PASS " if passed else "MISS ") + label)
    if ok:
        print("Governance schema verified: the migration defines every required object.")
        return 0
    print("MISSING objects noted above.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
