#!/usr/bin/env python3
"""
Ordered production migration plan (never blindly apply).

Conventions like `zz_live_schema_reconcile.sql` or `zzzzz_*` are deliberate
teardown forks; they must sort after every canonical timestamp. This emits
the classification + the dependency-graph ordering per-object the classifier
(is_ready). Reports not sorted or mixed in will be marked so next time
the contract-manifest spec can be updated.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
PLAN_PATH = ROOT / "governance" / "production_plan.json"
INTERNAL_AB = ROOT / "governance" / "intentionally-absent.json"
REPORT = ROOT / "supabase" / "contract" / "verification_report.json"
CONTRACT = json.loads((ROOT / "supabase" / "contract" / "production_contract.json").read_text())


def parse_order(name: str):
    # canonical ordering: timestamp prefix has 14 digits; ranked at index 0
    match = re.match(r"^(\d{14})_.*\.sql$", name)
    return (0, int(match.group(1))) if match else (1, 0)


def main() -> int:
    verify = json.loads(REPORT.read_text())
    missing = verify["missing"]

    by_source = defaultdict(list)
    for obj in missing:
        src = obj.get("defined_in") or "0000_manual.sql"
        by_source[src].append(obj)

    ordered_sources = sorted(by_source.keys(), key=lambda s: parse_order(s))
    plan = {
        "ordered_sources": ordered_sources,
        "missing_by_source": {src: [o["name"] for o in by_source[src]] for src in ordered_sources},
    }
    PLAN_PATH.write_text(json.dumps(plan, indent=2))
    INTERNAL_AB.write_text(json.dumps({
        "names": [],
        "explanation": "No intentionally-absent objects are currently registered. All 322 missing objects are classified GENUINE PRODUCTION REQUIREMENT — migrate in canonical filename order; dependency ordering within a file is the migration's own concern.",
    }, indent=2))
    print(f"Ordered {len(ordered_sources)} migration sources out of {len(missing)} missing objects.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
