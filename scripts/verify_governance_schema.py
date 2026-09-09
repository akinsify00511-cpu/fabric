#!/usr/bin/env python3
"""Verify that the governance control-plane objects have canonical migrations."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "supabase" / "migrations"

TABLES = {
    "governance_events",
    "governance_incidents",
    "autonomy_actions",
    "governance_audit_log",
    "human_decisions",
    "governance_reports",
}
RPCS = {
    "governance_overview",
    "transition_incident",
    "decide_human_decision",
}


def migration_text() -> str:
    if not MIGRATIONS.exists():
        raise SystemExit(f"ERROR: migration directory not found: {MIGRATIONS}")
    return "\n".join(
        p.read_text(encoding="utf-8", errors="ignore")
        for p in sorted(MIGRATIONS.rglob("*.sql"))
    )


def present(text: str, name: str) -> bool:
    ident = re.escape(name)
    table = rf"\b(?:create|alter)\s+(?:table|view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?{ident}\b"
    fn = rf"\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?{ident}\s*\("
    return bool(re.search(table, text, re.I) or re.search(fn, text, re.I))


def main() -> int:
    text = migration_text()
    missing_tables = sorted(x for x in TABLES if not present(text, x))
    missing_rpcs = sorted(x for x in RPCS if not present(text, x))
    total = len(TABLES) + len(RPCS)
    ok = total - len(missing_tables) - len(missing_rpcs)

    print(f"governance tables: {len(TABLES) - len(missing_tables)}/{len(TABLES)}")
    print(f"governance RPCs: {len(RPCS) - len(missing_rpcs)}/{len(RPCS)}")
    if missing_tables:
        print("missing tables/views: " + ", ".join(missing_tables))
    if missing_rpcs:
        print("missing functions: " + ", ".join(missing_rpcs))

    if missing_tables or missing_rpcs:
        print(f"FAIL: {ok}/{total} governance objects have canonical migrations")
        return 1
    print(f"PASS: {ok}/{total} governance objects have canonical migrations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
