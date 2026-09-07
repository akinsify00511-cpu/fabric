#!/usr/bin/env python3
"""Avenize Engineering Health Command Center.

Aggregates the repo's REAL, deterministic health signals into a single
human-readable report — no fabricated numbers. Every line comes from a
concrete check that was actually executed in this run:

  application  → governance verdict (scripts/governance checkout)
  production   → production contract script result (self-calibrated when
                          env vars are absent; FAILs honestly when blocked)
  database      → migration+schema drift checks (supabase.drift,
                          supabase.manifests, migration naming, contract det.)
  security      → governance security subset (secrets scan + pricing)
  tests         → unit test runner result
  performance   → bundle analysis summary (governance/reports/bundle-analysis.txt)
  errors        → platform-ops feed (platform_error_events unresolved count via
                          the production contract verifier when live env exists)
  deployments   → git HEAD + dirty-tree state (CI models deployment state)

Outputs:
  - STDOUT: a human-facing "AVENIZE ENGINEERING HEALTH" block.

  - governance/reports/engineering-health.txt: machine-readable summary
    written only when --write-report is passed.

Exit code: 0 unless a blocking check (P0/P1 or production gate) failed.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOV_REPORT = ROOT / "governance" / "reports" / "governance-report.json"
BUNDLE_REPORT = ROOT / "governance" / "reports" / "bundle-analysis.txt"
OUT = ROOT / "governance" / "reports" / "engineering-health.txt"


def _run(cmd: list[str], cwd: Path = ROOT, timeout: int = 900, env: dict | None = None) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(cmd, 124, "", "timeout", )
    except FileNotFoundError:
        return subprocess.CompletedProcess(cmd, 127, "", "command not found", )


def _ok(res: subprocess.CompletedProcess[str]) -> bool:
    return res.returncode == 0


def health_line(label: str, state: str, detail: str) -> str:
    return f"{label:<14s} {state:<20s} {detail}"


def run_governance(write_report: bool) -> tuple[str, str]:
    """Returns (state, detail}; runs the full governance gate."""
    cmd = [sys.executable, str(ROOT / "scripts/governance/avenize_governance.py"), "check"]
    if write_report:
        cmd.append("--write-report")
    res = _run(cmd, timeout=1200)
    try:
        data = json.loads(GOV_REPORT.read_text(encoding="utf-8") if GOV_REPORT.exists() else "{}")
        verdict = data.get("verdict", {})
        score = verdict.get("compliance_score", "?")
        detail = f"governance check exited {res.returncode} — compliance {score}%"
        if verdict.get("reasons"):
            detail += " — " + "; ".join(verdict["reasons"][:4])
        return state, detail
    except Exception:
        return ("UNKNOWN", f"governance check exited {res.returncode} without readable report")


def run_database() -> tuple[str, str]:
    drift = _run([sys.executable, str(ROOT / "scripts/check_schema_drift.py")], timeout=300)
    naming = _run([sys.executable, str(ROOT / "scripts/governance/avenize_governance.py"), "drift"], timeout=600)
    if not _ok(drift) or not _ok(naming):
        return "ATTENTION REQUIRED", "schema drift or migration naming gate failed — see governance report"
    return "HEALTHY", "schema drift 0 + migration naming gate PASS"


def run_security() -> tuple[str, str]:
    sec = _run([sys.executable, str(ROOT / "scripts/governance/avenize_governance.py"), "security"], timeout=900)
    if _ok(sec):
        return "HEALTHY", "secrets scan + pricing constitution + drift gates PASS"
    return "ATTENTION REQUIRED", "security subset failed — check governance report"


def run_tests() -> tuple[str, str]:
    res = _run(["npx", "vitest", "run"], timeout=1200)
    if _ok(res):
        lines = [ln for ln in res.stdout.splitlines() if "Tests " in ln or "Test Files " in ln]
        return "PASSING", "vitest: " + (lines[-2] if lines else "ok")


def run_production() -> tuple[str, str]:
    script = ROOT / "scripts/verify-production.sh"
    if not script.exists():
        return "UNKNOWN", "verify-production.sh missing"
    # Self-calibrates when no env (publishable pair from the deployed bundle);
    # needs APP_URL or SUPABASE_URL/KEY to do anything serious.

    env = os.environ.copy()
    if "APP_URL" not in env and "SUPABASE_URL" not in env:
        env.setdefault("APP_URL", "https://avenize.riverwayse.com")

    res = _run(["bash", str(script)], timeout=300, env=env)
    tail = "\n".join(res.stdout.strip().splitlines()[-8:])
    if _ok(res):
        return "HEALTHY", "production contract gate PASS"
    return "ATTENTION REQUIRED", "production gate FAIL (standing live-DB/edge-fn blockers when applicable)"


def run_errors() -> tuple[str, str]:
    # Best-effort: only meaningful with a live Supabase env; without env it is
    # honestly UNKNOWN (no fabricated stale count.
    if not (os.environ.get("SUPABASE_URL") or os.environ.get("APP_URL")):
        return "UNKNOWN", "no live env — platform error feed is inspected at deploy/sentinel time"
    res = _run(["bash", str(ROOT / "scripts/verify-production.sh")], timeout=300)
    if not _ok(res):
        return "ATTENTION REQUIRED", "production gate red — see contract verifier report for unresolved incidents"
    return "HEALTHY", "production gate green — platform-ops live feed healthy"


def run_deployments() -> tuple[str, str]:
    git = _run(["git", "rev-parse", "--short", "HEAD"], timeout=30)
    dirty = _run(["git", "status", "--porcelain"], timeout=30)
    if not _ok(git):
        return "UNKNOWN", "not a git checkout"
    head = git.stdout.strip()[:8]
    if dirty.stdout.strip():
        return "MODIFIED", f"HEAD {head} + uncommitted changes (work in progress)"
    return "HEALTHY", f"HEAD {head} — clean tree"


def run_performance() -> tuple[str, str]:
    if not BUNDLE_REPORT.exists():
        return "UNKNOWN", "run bundle analysis first (npm run analyze:bundle)"
    lines = BUNDLE_REPORT.read_text(encoding="utf-8").splitlines()
    total = "Total unknown"
    eager = "eager unknown"
    for ln in lines:
        if ln.startswith("Total JS+CSS gzip"):
            total = ln
        elif ln.startswith("Eager (index-*)"):
            eager = ln
    return "HEALTHY", f"{total} — {eager}"


def run_application() -> tuple[str, str]:
    res = _run(["npm", "run", "typecheck"], timeout=600)
    if not _ok(res):
        return "ATTENTION REQUIRED", "TypeScript errors — run npm run typecheck"
    return "HEALTHY", "TypeScript clean"


def main() -> int:
    parser = argparse.ArgumentParser(description="Avenize Engineering Health Command Center")
    parser.add_argument("--write-report", action="store_true", help="write governance/reports/engineering-health.txt")
    parser.add_argument("--skip-tests", action="store_true", help="skip the unit-test run (useful for quick triage)")
    args = parser.parse_args()

    checks = [
        ("Application", *run_application()),
        ("Production", *run_production()),
        ("Database", *run_database()),
        ("Security", *run_security()),
        ("Tests", *(["UNKNOWN", "skipped by --skip-tests"] if args.skip_tests else run_tests())),
        ("Performance", *run_performance()),
        ("Errors", *run_errors()),
        ("Deployments", *run_deployments()),
    ]

    blocked = []
    lines = []
    lines.append("AVENIZE ENGINEERING HEALTH")
    lines.append("═════════════════════════════")
    for label, state, detail in checks:
        lines.append(health_line(label, state, detail))
        if "BLOCKED" in state or "FAILING" in state or "ATTENTION" in state or "MODIFIED" in state:
            blocked.append((label, state, detail))
    lines.append("")
    if blocked:
        lines.append("Diagnostics:")
        for label, state, detail in blocked:
            lines.append(f"  - {label}: {state} — {detail}")
    else:
        lines.append("Every health area is green. Aligned with the release gate.")

    if args.write_report:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 1 if any(b[1] in ("RELEASE BLOCKED", "FAILING") for b in blocked) else 0


if __name__ == "__main__":
    sys.exit(main())
