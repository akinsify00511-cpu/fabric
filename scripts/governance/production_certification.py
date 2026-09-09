#!/usr/bin/env python3
"""Production governance certification.

The live gate is intentionally strict when REQUIRE_LIVE=1: missing live
credentials, unreachable production, incomplete governance probes, release
contract failures, or unresolved security findings are all blocking.
Without REQUIRE_LIVE the script remains useful for local/mechanical checks.
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
ENV_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ENV_KEY = os.environ.get("SUPABASE_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")
APP_URL = os.environ.get("APP_URL", "https://avenize.riverwayse.com").rstrip("/")
REQUIRE_LIVE = os.environ.get("REQUIRE_LIVE", "0").lower() in {"1", "true", "yes"}
REPORT_PATH = ROOT / "governance" / "reports" / "production-certification.json"


def http_probe(base: str, key: str, endpoint: str):
    import urllib.error
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
    if REQUIRE_LIVE:
        return "", ""

    url_target = None
    key_target = None
    try:
        idx = subprocess.run(
            ["curl", "-fs", APP_URL + "/"],
            capture_output=True,
            text=True,
        ).stdout
        import re
        bundle = re.search(r"/assets/[A-Za-z0-9_\-]+\.js", idx)
        if bundle:
            js = subprocess.run(
                ["curl", "-fs", APP_URL + bundle.group(0)],
                capture_output=True,
                text=True,
            ).stdout
            url_target = (re.search(r"https://[0-9a-z]+\.supabase\.co", js) or [None])[0]
            key_target = (re.search(r"sb_(?:publishable|anon)_[A-Za-z0-9_\-]+", js) or [None])[0]
    except Exception:
        pass
    return (url_target or ""), (key_target or "")


GOVERNANCE_TARGETS = {
    "tables": [
        "governance_events", "governance_incidents", "autonomy_actions",
        "governance_audit_log", "human_decisions", "governance_reports",
    ],
    "rpcs": ["governance_overview", "transition_incident", "decide_human_decision"],
}


def main() -> int:
    base, key = self_calibrate()
    print("Certification target:", base if base else "(not configured)")

    rows = []
    ok_total = 0
    expected = len(GOVERNANCE_TARGETS["tables"]) + len(GOVERNANCE_TARGETS["rpcs"])

    for t in GOVERNANCE_TARGETS["tables"]:
        code = http_probe(base, key, f"/rest/v1/{t}?select=1&limit=0") if base and key else None
        ok = code == 200
        rows.append({"object": t, "kind": "table", "http": code, "pass": ok})
        ok_total += int(ok)
    for r in GOVERNANCE_TARGETS["rpcs"]:
        code = http_probe(base, key, f"/rest/v1/rpc/{r}") if base and key else None
        # A 400 means PostgREST found the RPC but requires arguments; that is
        # a valid existence probe.  404/5xx are failures.
        ok = code in (200, 400)
        rows.append({"object": r, "kind": "rpc", "http": code, "pass": ok})
        ok_total += int(ok)

    if not base or not key:
        release_pass = False if REQUIRE_LIVE else True
        release_out = "Live credentials unavailable."
    else:
        try:
            proc = subprocess.run(
                ["bash", str(ROOT / "scripts/verify-production.sh")],
                capture_output=True,
                text=True,
                env={**os.environ, "APP_URL": APP_URL},
                timeout=900,
            )
            release_pass = proc.returncode == 0
            release_out = proc.stdout + proc.stderr
        except Exception as e:
            release_pass = False
            release_out = f"error: {e}"

    rls_plan_path = ROOT / "governance" / "rls_remediation_plan.json"
    rls_track = {"status": "unknown", "blocking": True}
    if rls_plan_path.exists():
        rls_plan = json.loads(rls_plan_path.read_text(encoding="utf-8"))
        rls_status = rls_plan.get("status")
        unresolved = sum(
            rls_plan.get("summary", {}).get(k, 0)
            for k in ("FIX_NOW", "FIX_WITH_MIGRATION")
        )
        rls_track = {
            "status": rls_status,
            "unresolved": unresolved,
            "blocking": rls_status == "blocked" or unresolved > 0,
        }

    governance_pass = bool(base and key and ok_total == expected)
    migration_pass = governance_pass and release_pass
    security_pass = not rls_track["blocking"]
    verdict = "PASS" if migration_pass and security_pass else "BLOCKED"
    if not base and not REQUIRE_LIVE:
        verdict = "NOT_CONFIGURED"

    report = {
        "verdict": verdict,
        "require_live": REQUIRE_LIVE,
        "governance_schema": {
            "expected": expected,
            "ok": ok_total,
            "rows": rows,
            "pass": governance_pass,
        },
        "release_gate": {"pass": release_pass, "probe_out": release_out[-1200:]},
        "rls_security_track": rls_track,
    }

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"Governance probes: {ok_total}/{expected}")
    print(f"Release gate: {'PASS' if release_pass else 'FAIL'}")
    print(f"Security track: {'PASS' if security_pass else 'BLOCKED'}")
    print(f"VERDICT: {verdict}")

    if REQUIRE_LIVE and verdict != "PASS":
        return 1
    return 0 if verdict in {"PASS", "NOT_CONFIGURED"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
