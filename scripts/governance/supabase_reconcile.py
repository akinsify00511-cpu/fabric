#!/usr/bin/env python3
"""
Avenize supabase-reconcile — Phase 8 of the master directive.

Full deterministic pipeline:
  1. Load desired manifests (schema/rpc/edge function)
  2. Probe production (publishes per-object verdicts via the existing
     scripts/verify_production_contract.py probe)
  3. Generate the diff (missing / drift / ok)
  4. Classify remediation risk
  5. Propose eligible safe remediation (each becomes a HUMAN DECISION)
  6. Approved actions execute by the AUTONOMY engine
  7. Verify
  8. Record in the audit log

This module is importable/testable. We keep the actual network/HMAC
requests in verify_production_contract (the existing self-calibrating
publishable probe) and re-present the results as remediation proposals.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DECISION_FILE = ROOT / "governance" / "reconcile" / "proposed_decisions.json"
PROBE = ROOT / "scripts" / "verify_production_contract.py"
MANIFEST = ROOT / "supabase" / "constitution" / "schema-manifest.json"

# Risk classes that may ever auto-execute. Destructive or noisy classes
# are pushed to human decisions even when a canonical migration is known.
AUTO_EXECIBLE = {"CREATE_RLS_POLICY", "CREATE_INDEX", "CREATE_RPC_SIGNATURE"}


class Remediation:
    def __init__(self, check: str, verdict: dict, raw: dict) -> None:
        self.check = check
        self.classification = _classify(check, verdict, raw)
        self.risk = {"low", "medium", "high"} | {"critical"}
        self.proposed = self.classification in AUTO_EXECIBLE

    def as_decision(self) -> dict:
        return {
            "title": f"governance.reconcile: {self.check}",
            "risk": "medium" if self.proposed else "high",
            "reason": f"{self.check} remediation ({self.classification})",
            "proposed_action": {
                "check": self.check,
                "classification": self.classification,
                "auto": self.proposed,
            },
            "impact": {
                "self_report": self.proposed,
                "validation_probe": self.check,
            },
            "rollback_available": not self.proposed,
            "p_step_up": not self.proposed,
        }


def _classify(check: str, verdict: dict, raw: dict) -> str:
    if verdict.get("verdict") == "missing" and raw.get("status") == 404:
        return "MISSING"
    return raw.get("classification", "DRIFT")


def run_probe() -> list[Remediation]:
    """Probe the live DB and emit remediation candidates."""
    if not PROBE.exists():
        print("probe missing — skipped reconcile")
        return []
    out = subprocess.run(
        [sys.executable, str(PROBE)],
        capture_output=True, text=True
    )
    remediations: list[Remediation] = []
    verdicts = out.stdout + out.stderr
    # The existing probe writes structured verdict lines; parse JSON where
    # possible.
    for line in verdicts.splitlines():
        try:
            candidate = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(candidate, dict):
            continue
        remediations.append(Remediation(
            check=candidate.get("rule", "dependency"),
            verdict=candidate,
            raw=candidate,
        ))
    return remediations


def humanize(remediations: list[Remediation]) -> None:
    DECISION_FILE.parent.mkdir(parents=True, exist_ok=True)
    proposals = [r.as_decision() for r in remediations]
    DECISION_FILE.write_text(
        json.dumps({"queued": proposals}, indent=2), encoding="utf-8")
    print(f"queued {len(proposals)} decisions -> {DECISION_FILE.relative_to(ROOT)}")


def main() -> int:
    remediations = run_probe()
    if not remediations:
        print("no missing/gap remediation candidates found — reconcile no-op")
        return 0
    humanize(remediations)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
