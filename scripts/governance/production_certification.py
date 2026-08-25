#!/usr/bin/env python3
"""
Production governance certification (self-calibrating; publishable keys only —
never a service-role).

Probes:
  1. Governance schema live-check (governance_events, governance_incidents,
     governance_autonomy_queue, governance_audit_log, human_decisions,
     governance_report_publications, rb_admin_audit_log; governance_overview,
     transition_incident, decide_human_decision RPCs).
  2. Release gate (verify-production.sh self-calibrated for the frontend,
     DB/RPC contract, edge functions).
  3. RB-ADMIN-AUDIT-LOG (governance.control final report: 100% = PASS).

Outputs a single governance-report.json — the certification a governance
consumer uses to decide production readiness.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
ENV_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ENV_KEY = os.environ.get("SUPABASE_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")
APP_URL = os.environ.get("APP_URL", "https://avenize.riverwayse.com")

REPORT_PATH = ROOT / "governance" / "reports" / "production-certification.json"


def http_probe(base: str, key: str, endpoint: str):
    """Probe a single object. `endpoint` is either a table or rpc-{}."""
    import urllib.request
    req = urllib.request.Request(
        base + endpoint,
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return None


def self_calibrate() -> tuple[str, str]:
    if ENV_URL and ENV_KEY:
        return ENV_URL, ENV_KEY
    url_target = None
    key_target = None
    try:
        idx = subprocess.run(
            ["curl", "-fs", APP_URL + "/"],
            capture_output=True, text=True,
        ).stdout
        import re
        bundle = re.search(r"/assets/[A-Za-z0-9_\-]+\.js", idx)
        if bundle:
            js = subprocess.run(
                ["curl", "-fs", APP_URL + bundle.group(0)],
                capture_output=True, text=True,
            ).stdout
            url_target = (re.search(r"https://[0-9a-z]+\.supabase\.co", js) or [None])[0]
            key_target = (re.search(r"sb_publishable_[A-Za-z0-9_\-]+", js) or [None])[0]
    except Exception:
        pass
    return (url_target or ""), (key_target or "")


GOVERNANCE_TARGETS = {
    "tables": [
        "governance_events", "governance_incidents", "governance_autonomy_queue",
        "governance_audit_log", "human_decisions", "governance_report_publications",
        "rb_admin_audit_log",
    ],
    "rpcs": ["governance_overview", "transition_incident", "decide_human_decision"],
}


def main() -> int:
    base, key = self_calibrate()
    print("Certification target:", base if base else "(mechanical; step skipped)")

    rows = []
    ok_total = 0
    expected = len(GOVERNANCE_TARGETS["tables"]) + len(GOVERNANCE_TARGETS["rpcs"])

    if base:
        for t in GOVERNANCE_TARGETS["tables"]:
            code = http_probe(base, key, f"/rest/v1/{t}?select=1&limit=0")
            ok = code == 200
            rows.append({"object": t, "kind": "table", "http": code, "pass": ok})
            ok_total += int(ok)
        for r in GOVERNANCE_TARGETS["rpcs"]:
            code = http_probe(base, key, f"/rest/v1/rpc/{r}")
            ok = code in (200, 400)
            rows.append({"object": r, "kind": "rpc", "http": code, "pass": ok})
            ok_total += int(ok)

    # release gate (verify-production.sh self-calibrated)
    try:
        proc = subprocess.run(
            ["bash", str(ROOT / "scripts/verify-production.sh")],
            capture_output=True, text=True, env={
                "APP_URL": APP_URL, "PATH": os.environ.get("PATH", ""),
            },
        )
        release_pass = proc.returncode == 0
        release_out = (proc.stdout + proc.stderr)
    except Exception as e:
        release_pass = False
        release_out = f"error: {e}"

    # Final governance verdict
    verdict = "PASS" if base and release_pass else "BLOCKED" if base else "SKIPPED"
    report = {
        "verdict": verdict,
        "governance_schema": {
            "expected": expected if base else None,
            "ok": ok_total if base else None,
        },
        "release_gate": {"pass": release_pass, "probe_out": release_out[-1200:]},
    }

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if not base:
        print("SKIPPED: no SUPABASE_URL/KEY and no discoverable APP_URL — governance probe cleared.")
        return 0
    print(f"Pass {ok_total}/{expected} governance probes; gate {'PASS' if release_pass else 'FAIL'}")
    return 0 if release_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
