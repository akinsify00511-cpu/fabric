#!/usr/bin/env python3
"""Avenize Control Plane.

One deterministic command for the engineering contract. It composes the
existing contract, schema, edge-function, governance and production checks
and turns silent/partial verification into an explicit PASS/FAIL report.

The control plane never invents production state. Live checks run only when
explicit credentials are present; otherwise the report records NOT_CONFIGURED
instead of pretending production is healthy.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORT = ROOT / "governance" / "reports" / "control-plane.json"


def run(name: str, command: list[str], *, required: bool = True, env: dict[str, str] | None = None) -> dict:
    started = time.time()
    try:
        proc = subprocess.run(
            command,
            cwd=ROOT,
            env={**os.environ, **(env or {})},
            text=True,
            capture_output=True,
            timeout=900,
        )
        output = (proc.stdout + "\n" + proc.stderr).strip()
        return {
            "name": name,
            "status": "PASS" if proc.returncode == 0 else ("FAIL" if required else "WARN"),
            "exit_code": proc.returncode,
            "duration_seconds": round(time.time() - started, 2),
            "output_tail": output[-3000:],
        }
    except Exception as exc:
        return {
            "name": name,
            "status": "FAIL" if required else "WARN",
            "exit_code": None,
            "duration_seconds": round(time.time() - started, 2),
            "output_tail": f"{type(exc).__name__}: {exc}",
        }


def configured(*names: str) -> bool:
    return all(bool(os.environ.get(name)) for name in names)


def main() -> int:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    checks: list[dict] = []

    # Static contract checks are always required. These are the controls that
    # prevent a frontend reference from silently drifting from its backend.
    checks.append(run(
        "contract-manifest",
        [sys.executable, "scripts/generate_contract_manifest.py"],
    ))
    checks.append(run(
        "schema-drift",
        [sys.executable, "scripts/check_schema_drift.py"],
    ))
    checks.append(run(
        "rpc-signatures",
        [sys.executable, "scripts/audit_rpc_signatures.py"],
    ))
    checks.append(run(
        "edge-functions",
        ["bash", "scripts/check_edge_functions.sh"],
    ))
    checks.append(run(
        "governance-schema",
        [sys.executable, "scripts/verify_governance_schema.py"],
    ))

    # Application correctness checks are also required in CI.
    checks.append(run("typecheck", ["npm", "run", "typecheck"]))
    checks.append(run("lint", ["npm", "run", "lint"]))
    checks.append(run("unit-tests", ["npm", "run", "test:unit"]))
    checks.append(run("build", ["npm", "run", "build"]))

    # Live checks are credential-gated by design. Missing credentials are not
    # a false PASS; they are surfaced as NOT_CONFIGURED in the final report.
    if configured("SUPABASE_URL", "SUPABASE_KEY"):
        checks.append(run(
            "production-certification",
            [sys.executable, "scripts/governance/production_certification.py"],
        ))
    else:
        checks.append({
            "name": "production-certification",
            "status": "NOT_CONFIGURED",
            "required": False,
            "output_tail": "SUPABASE_URL and SUPABASE_KEY are required for live certification.",
        })

    if configured("APP_URL", "E2E_EMAIL", "E2E_PASSWORD"):
        checks.append(run(
            "production-e2e",
            ["bash", "scripts/e2e-production.sh"],
            env={"APP_URL": os.environ["APP_URL"]},
        ))
    else:
        checks.append({
            "name": "production-e2e",
            "status": "NOT_CONFIGURED",
            "required": False,
            "output_tail": "APP_URL, E2E_EMAIL and E2E_PASSWORD are required for live journey verification.",
        })

    blocking = [c for c in checks if c["status"] == "FAIL"]
    report = {
        "schema_version": 1,
        "generated_at_epoch": int(time.time()),
        "verdict": "FAIL" if blocking else "PASS",
        "live_verification": "CONFIGURED" if configured("SUPABASE_URL", "SUPABASE_KEY") else "NOT_CONFIGURED",
        "blocking_checks": [c["name"] for c in blocking],
        "checks": checks,
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 1 if blocking else 0


if __name__ == "__main__":
    raise SystemExit(main())
