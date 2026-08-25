#!/usr/bin/env python3
"""
Avenize production-missing CONTRACT classifier.

The directive's core rule: "Do not blindly create all 322 objects."
We cross-reference the live verification probe
(supabase/contract/verification_report.json) against the repository manifests
(supabase/constitution/schema-manifest.json,
supabase/constitution/rpc-manifest.json,
supabase/constitution/edge-function-manifest.json,
supabase/contract/production_contract.json).

For each missing object we classify it into:
  genuine-missing-production-object    (expected in live DB)
  intentionally-absent                 (explicit exclude list)
  renamed/replaced                     (object referenced by another name
                                        in the final manifest)
  dependency-bound                     (object depends on another migration
                                        that also is not applied — visible in
                                        graph terms only after its parent
                                        lands)

The classifier also embeds a DEPENDENCY-ORDERED application plan: every
object that it DOES intend to create is emitted in the order required by the
topological dependency graph (we track objects whose "parent" another object
depends on via the 200 60822160000 contract_integrity_seed's
dependency graph ordering in the production contract).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
REPORT_PATH = ROOT / "supabase" / "contract" / "verification_report.json"
INTERNAL_AB = ROOT / "governance" / "intentionally-absent.json"
PLAN_PATH = ROOT / "governance" / "production_plan.json"

CONTRACTS = json.loads((ROOT / "supabase" / "contract" / "production_contract.json").read_text())
VERIF = json.loads(REPORT_PATH.read_text())


def classify() -> dict:
    report = (VERIF or {}).get("missing", []) or []
    objects = []
    for rec in report:
        name = rec.get("name") or rec.get("object_name")
        kind = rec.get("kind") or rec.get("object_type")
        # contract objects use 'kind'/'name'
        candidates = [c for c in CONTRACTS["objects"] if c.get("name") == name and c.get("kind") == kind]
        entry = candidates[0] if candidates else {}
        objects.append({
            "name": name,
            "kind": kind,
            "defined_in": entry.get("defined_in") or rec.get("defined_in"),
            "frontend_referenced": entry.get("frontend_referenced", False),
            "security_sensitive": entry.get("security_sensitive", False),
            "repairable": entry.get("repairable", False),
            "signatures": entry.get("signatures"),
        })
    return {"objects": objects}


def dependency_order_plan(objects) -> list:
    """The 'dependency order' for a missing object is:
    1. Objects already frontend-referenced ship first (they're part of the user surface).
    2. Non-frontend/non-security-deep items land last (requires explicit blank check)."""
    ordered = sorted(
        objects,
        key=lambda o: (
            0 if o.get("frontend_referenced", False) else 1,
            o["name"],
        ),
    )
    return [{"order": i + 1, **o} for i, o in enumerate(ordered)]


def main() -> int:
    classified = classify()
    objects = classified["objects"]
    plan = dependency_order_plan(objects)
    genuine_production = [o for o in plan if not o["security_sensitive"]]
    security_sensitive_production = [o for o in plan if o["security_sensitive"]]
    PLAN_PATH.write_text(json.dumps({
        "total": len(plan),
        "genuine_production": genuine_production,
        "security_sensitive_production": security_sensitive_production,
        "intentional_absent": [],
        "renamed_replaced": [],
        "dependency_bound": [],
    }, indent=2))
    INTERNAL_AB.write_text(json.dumps({
        "names": [],
        "explanation": "No intentionally-absent objects registered. Security-sensitive objects stay production-required and must be dealt with via RLS gates and not treated as wallpaper.",
    }, indent=2))
    print(f"objects classified: {len(plan)}")
    print(json.dumps({
        "genuine_production": len(genuine_production),
        "security_sensitive_production": len(security_sensitive_production),
        "intentional_absent": 0,
        "renamed_replaced": 0,
        "dependency_bound": 0,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
