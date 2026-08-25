#!/usr/bin/env python3
"""Emit governance/enforcement-registry.json from the CHECKS registry.

Deterministic by construction: the registry is derived from code, not
hand-written data, so it can never drift from the validators it describes.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from checks import CHECKS  # noqa: E402

OUT = ROOT / "governance" / "enforcement-registry.json"


def emit() -> dict:
    rules = []
    for rule_id, meta in sorted(CHECKS.items()):
        rules.append(
            {
                "rule_id": rule_id,
                "layer": meta["layer"],
                "requirement": meta["summary"],
                "validator": f"scripts/governance/checks.py::{meta['fn'].__name__}",
                "severity": meta["severity"],
                "blocking": meta["blocking"],
                "verification": "avenize_governance.py:" + rule_id,
                "escalation": "human_decision" if meta["blocking"] else "incident",
            }
        )
    return {
        "version": 1,
        "engine": "avenize_governance",
        "severity_ladder": {
            "P0": "catastrophic — immediate containment",
            "P1": "critical — release/production blocked",
            "P2": "major — incident created, prioritized remediation",
            "P3": "minor — tracked defect",
            "P4": "improvement — optimization",
        },
        "rules": rules,
    }


def main() -> int:
    content = emit()
    serialized = json.dumps(content, indent=2, sort_keys=True) + "\n"
    if OUT.exists() and OUT.read_text(encoding="utf-8") == serialized:
        print("enforcement-registry.json is up to date")
        return 0
    OUT.write_text(serialized, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
