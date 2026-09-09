#!/usr/bin/env python3
"""Avenize Control Plane.

One deterministic command for the engineering contract. It composes the
existing contract, schema, edge-function, governance and production checks
and turns silent/partial verification into an explicit PASS/BLOCKED/FAIL
report.

The control plane never invents production state. Live checks run only when
explicit credentials are present; otherwise the report records BLOCKED and
returns a non-zero exit code instead of pretending production is healthy.
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
DEFAULT_APP_URL = "https://avenize.com"


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

    checks.append(run("contract-manifest", [sys.executable, "scripts/generate_contract_manifest.py"]))
    checks.append(run("schema-drift", [sys.executable, "scripts/check_schema_drift.py"]))
    checks.append(run("rpc-signatures", [sys.executable, "scripts/audit_rpc_signatures.py"]))
    checks.append(run("edge-functions", ["bash", "scripts/check_edge_functions.sh"]))
    checks.append(run("governance-schema", [sys.executable, "scripts/verify_governance_schema.py"]))

    checks.append(run("typecheck", ["npm", "run", "typecheck"]))
    checks.append(run("lint", ["npm", "run", "lint"]))
    checks.append(run("unit-tests", ["npm", "run", "test:unit"]))
    checks.append(run("build", ["npm", "run", "build"]))

    if configured("SUPABASE_URL", "SUPABASE_KEY"):
        checks.append(run("production-certification", [sys.executable, "scripts/governance/production_certification.py"]))
    else:
        checks.append({
            "name": "production-certification",
            "status": "BLOCKED",
            "required": True,
            "output_tail": "Live certification is not configured. SUPABASE_URL and SUPABASE_KEY are required; production state must not be inferred.",
        })

    app_url = os.environ.get("APP_URL", DEFAULT_APP_URL)
    e2e_ready = configured("SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_SERVICE_ROLE_KEY") or configured("APP_URL", "E2E_EMAIL", "E2E_PASSWORD")
    if e2e_ready:
        checks.append(run("production-e2e", ["bash", "scripts/e2e-production.sh"], env={"APP_URL": app_url}))
    else:
        checks.append({
            "name": "production-e2e",
            "status": "BLOCKED",
            "required": True,
            "output_tail": "Live E2E is not configured. Provide disposable-account credentials or dedicated E2E credentials; do not treat missing credentials as a passing journey.",
        })

    blocking = [c for c in checks if c["status"] in {"FAIL", "BLOCKED"}]
    failed = [c for c in checks if c["status"] == "FAIL"]
    blocked = [c for c in checks if c["status"] == "BLOCKED"]
    if failed:
        verdict = "FAIL"
    elif blocked:
        verdict = "BLOCKED"
    else:
        verdict = "PASS"

    report = {
        "schema_version": 2,
        "generated_at_epoch": int(time.time()),
        "verdict": verdict,
        "live_verification": "CONFIGURED" if configured("SUPABASE_URL", "SUPABASE_KEY") else "NOT_CONFIGURED",
        "blocking_checks": [c["name"] for c in blocking],
        "failed_checks": [c["name"] for c in failed],
        "blocked_checks": [c["name"] for c in blocked],
        "checks": checks,
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 1 if failed else (2 if blocked else 0)


if __name__ == "__main__":
    raise SystemExit(main())
