#!/usr/bin/env python3
"""Avenize canonical governance command.

Runs the constitutional validators, computes the compliance score, and emits
the release verdict:

    RELEASE APPROVED | RELEASE BLOCKED (with exact reasons)

Rules:
  - UNKNOWN never counts as healthy (NO FALSE GREEN).
  - Blocking failures (P0/P1, or any rule marked blocking) block release.
  - The report artifact is deterministic (no timestamps, stable ordering).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from checks import CHECKS, CheckResult  # noqa: E402

REPORT_PATH = ROOT / "governance" / "reports" / "governance-report.json"

MODE_SUBSETS = {
    "check": None,  # everything
    "drift": {"supabase.drift", "supabase.contract.deterministic", "supabase.contract.frontend"},
    "contracts": {
        "supabase.contract.deterministic", "supabase.contract.frontend",
        "edge.functions", "supabase.manifests", "platform.observability",
        "money.pricing.constitution",
    },
    "security": {"security.secrets", "supabase.drift", "money.pricing.constitution"},
    "e2e": {"units.pass", "types.clean"},
    "meta": {"autonomy.registry", "features.registry", "const.registry.governing", "const.hierarchy"},
    "reconcile": None,  # regen manifest + enforcement registry, then verify
}


def compute(results: dict[str, dict]) -> dict:
    blocking_failures = []
    blocking_unknown = []
    warnings = []
    tracked = []
    passed = 0
    for rule_id, res in sorted(results.items()):
        meta = CHECKS[rule_id]
        status = res["status"]
        if status == "PASS":
            passed += 1
            continue
        entry = {"rule": rule_id, "severity": meta["severity"], "summary": meta["summary"]}
        if res["blocking"] and status == "FAIL":
            blocking_failures.append(entry)
        elif res["blocking"] and status == "UNKNOWN":
            blocking_unknown.append(entry)
        elif not res["blocking"]:
            warnings.append(entry)
        else:
            tracked.append(entry)

    total = len(results)
    score = round(100.0 * passed / total, 1) if total else 0.0
    approved = not blocking_failures and not blocking_unknown
    reasons = (
        [f"FAIL:{e['rule']}" for e in blocking_failures]
        + [f"UNKNOWN(blocking):{e['rule']}" for e in blocking_unknown]
    )
    severity_counts = {"P0": 0, "P1": 0, "P2": 0, "P3": 0, "P4": 0}
    for rule_id, res in results.items():
        if res["status"] in ("FAIL", "UNKNOWN"):
            severity_counts[meta["severity"]] += 1

    return {
        "result": "RELEASE APPROVED" if approved else "RELEASE BLOCKED",
        "reasons": sorted(reasons),
        "compliance_score": score,
        "total_rules": total,
        "passed": passed,
        "failed_or_unknown": total - passed,
        "severity_counts": severity_counts,
        "blocking_failures": blocking_failures,
        "blocking_unknown": blocking_unknown,
        "warnings": warnings,
        "tracked": tracked,
    }


def run(selected: set[str] | None) -> tuple[dict, int]:
    results: dict[str, dict] = {}
    for rule_id, meta in sorted(CHECKS.items()):
        if selected and rule_id not in selected:
            continue
        try:
            r: CheckResult = meta["fn"]()
            res = r.to_dict()
        except Exception as exc:  # a validator crashing is UNKNOWN, never green
            res = {"status": "UNKNOWN", "severity": meta["severity"],
                   "blocking": meta["blocking"], "detail": {"exception": str(exc)},
                   "remediation": "human"}
        results[rule_id] = res

    verdict = compute(results)
    report = {
        "version": 1,
        "engine": "avenize_governance",
        "rules": {rid: results[rid] for rid in sorted(results)},
        "verdict": verdict,
        "fingerprint": hashlib.sha256(
            json.dumps({rid: results[rid] for rid in sorted(results)}, sort_keys=True).encode()
        ).hexdigest()[:16],
    }
    return report, (0 if verdict["result"] == "RELEASE APPROVED" else 1)


def print_human(report: dict) -> None:
    v = report["verdict"]
    print("=" * 62)
    print("AVENIZE GOVERNANCE")
    print("=" * 62)
    print(f"COMPLIANCE: {v['compliance_score']}%  ({v['passed']}/{v['total_rules']} passed)")
    print(f"VERDICT:    {v['result']}")
    if v["severity_counts"]:
        print(f"SEVERITY:   P0={v['severity_counts']['P0']} P1={v['severity_counts']['P1']} "
              f"P2={v['severity_counts']['P2']} P3={v['severity_counts']['P3']} P4={v['severity_counts']['P4']}")
    if not v["blocking_failures"] and not v["blocking_unknown"]:
        print("Blocking failures: none")
    else:
        print("Blocking reasons:")
        for reason in v["reasons"]:
            print(f"  - {reason}")
    print("-" * 62)
    for rule_id, res in report["rules"].items():
        marker = {"PASS": "✓", "FAIL": "✗", "UNKNOWN": "?"}.get(res["status"], "?")
        print(f"  [{marker}] {rule_id:38s} {res['status']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Avenize governance engine")
    parser.add_argument("mode", nargs="?", default="check",
                        choices=sorted(MODE_SUBSETS) + ["report"],
                        help="rule subset to execute")
    parser.add_argument("--json", action="store_true", help="print report JSON")
    parser.add_argument("--write-report", action="store_true",
                        help="write governance/reports/governance-report.json")
    args = parser.parse_args()

    if args.mode == "reconcile":
        # Regenerate the derived artifacts, then run the contract subset.
        import subprocess as _sp
        here = Path(__file__).resolve().parent
        steps = [
            [sys.executable, str(ROOT / "scripts/generate_contract_manifest.py")],
            [sys.executable, str(ROOT / "scripts/generate_supabase_manifests.py")],
            [sys.executable, str(here / "emit_enforcement_registry.py")],
        ]
        for step in steps:
            proc = _sp.run(step)
            if proc.returncode != 0:
                return proc.returncode
        print("reconciled artifacts; running contract subset…")
        selected = MODE_SUBSETS["contracts"]
    else:
        selected = MODE_SUBSETS.get("check" if args.mode == "report" else args.mode)

    report, code = run(selected)

    if args.write_report or args.mode == "report":
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"report written: {REPORT_PATH.relative_to(ROOT)}")

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_human(report)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
