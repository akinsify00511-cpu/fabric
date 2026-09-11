#!/usr/bin/env python3
"""Production governance certification.

Live certification is fail-closed. It proves the deployed governance surface,
authenticated production identity, release gate and security track. Public
Supabase URL/publishable key may be self-calibrated from the deployed app;
private credentials are never discovered from the frontend. When no dedicated
E2E identity is configured, a disposable confirmed identity is provisioned
only with a server-side service key and deleted before exit.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
ENV_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ENV_KEY = os.environ.get("SUPABASE_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
E2E_EMAIL = os.environ.get("E2E_EMAIL", "")
E2E_PASSWORD = os.environ.get("E2E_PASSWORD", "")
APP_URL = os.environ.get("APP_URL", "https://app.avenize.com").rstrip("/")
REQUIRE_LIVE = os.environ.get("REQUIRE_LIVE", "1").lower() in {"1", "true", "yes"}
REPORT_PATH = ROOT / "governance" / "reports" / "production-certification.json"
TEMP_USER_ID = ""
TEMP_EMAIL = ""


def http_probe(base: str, key: str, endpoint: str, method: str = "GET", body: bytes | None = None, bearer: str | None = None):
    import urllib.error
    import urllib.request
    headers = {"apikey": key, "Authorization": f"Bearer {bearer or key}"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + endpoint, headers=headers, method=method, data=body)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return None, str(e)


def ensure_e2e_identity(base: str) -> tuple[str, str, str]:
    global TEMP_USER_ID, TEMP_EMAIL
    if E2E_EMAIL and E2E_PASSWORD:
        return E2E_EMAIL, E2E_PASSWORD, "dedicated"
    if not SERVICE_KEY:
        return "", "", "E2E credentials unavailable and no service key is configured"
    stamp = str(int(time.time()))
    email = f"avenize-cert-{stamp}@example.com"
    password = f"Cert!{stamp}aZ#x"
    payload = json.dumps({"email": email, "password": password, "email_confirm": True, "user_metadata": {"source": "production_certification"}}).encode()
    code, body = http_probe(base, SERVICE_KEY, "/auth/v1/admin/users", "POST", payload, SERVICE_KEY)
    if code not in (200, 201):
        return "", "", f"disposable E2E provisioning failed (HTTP {code})"
    try:
        TEMP_USER_ID = json.loads(body).get("id", "")
    except json.JSONDecodeError:
        TEMP_USER_ID = ""
    if not TEMP_USER_ID:
        return "", "", "disposable E2E provisioning returned no user id"
    TEMP_EMAIL = email
    return email, password, "disposable"


def cleanup_e2e_identity(base: str) -> None:
    if TEMP_USER_ID and SERVICE_KEY:
        http_probe(base, SERVICE_KEY, f"/auth/v1/admin/users/{TEMP_USER_ID}", "DELETE", None, SERVICE_KEY)


def authenticate_admin(base: str, key: str) -> tuple[str, str]:
    global E2E_EMAIL, E2E_PASSWORD
    email, password, source = ensure_e2e_identity(base)
    if not email or not password:
        return "", source
    payload = json.dumps({"email": email, "password": password}).encode()
    code, body = http_probe(base, key, "/auth/v1/token?grant_type=password", "POST", payload)
    if code != 200:
        return "", f"authentication failed (HTTP {code})"
    try:
        token = json.loads(body).get("access_token", "")
    except json.JSONDecodeError:
        token = ""
    return token, "authenticated (" + source + ")" if token else "authentication returned no access token"


def self_calibrate() -> tuple[str, str]:
    if ENV_URL and ENV_KEY:
        return ENV_URL, ENV_KEY
    try:
        idx = subprocess.run(["curl", "-fs", APP_URL + "/"], capture_output=True, text=True, timeout=20).stdout
        import re
        bundle = re.search(r"/assets/[A-Za-z0-9_\-]+\.js", idx)
        if bundle:
            js = subprocess.run(["curl", "-fs", APP_URL + bundle.group(0)], capture_output=True, text=True, timeout=20).stdout
            url_target = (re.search(r"https://[0-9a-z]+\.supabase\.co", js) or [""])[0]
            key_target = (re.search(r"sb_(?:publishable|anon)_[A-Za-z0-9_\-]+", js) or [""])[0]
            if url_target and key_target:
                return url_target.rstrip("/"), key_target
    except Exception:
        pass
    return "", ""


GOVERNANCE_TARGETS = {
    "tables": ["governance_events", "governance_incidents", "autonomy_actions", "governance_audit_log", "human_decisions", "governance_reports"],
    "rpcs": ["governance_overview", "transition_incident", "decide_human_decision"],
}


def main() -> int:
    base, key = self_calibrate()
    print("Certification target:", base if base else "(not configured)")
    rows = []
    ok_total = 0
    expected = len(GOVERNANCE_TARGETS["tables"]) + len(GOVERNANCE_TARGETS["rpcs"])

    for table in GOVERNANCE_TARGETS["tables"]:
        code, _ = http_probe(base, key, f"/rest/v1/{table}?select=1&limit=0") if base and key else (None, "")
        ok = code == 200
        rows.append({"object": table, "kind": "table", "http": code, "pass": ok})
        ok_total += int(ok)
    for rpc in GOVERNANCE_TARGETS["rpcs"]:
        code, _ = http_probe(base, key, f"/rest/v1/rpc/{rpc}", "POST", b"{}") if base and key else (None, "")
        ok = code in (200, 400)
        rows.append({"object": rpc, "kind": "rpc", "http": code, "pass": ok})
        ok_total += int(ok)

    auth_token, auth_status = authenticate_admin(base, key) if base and key else ("", "live credentials unavailable")
    gov_code = gov_body = None
    health_code = health_body = None
    if auth_token:
        gov_code, gov_body = http_probe(base, key, "/rest/v1/rpc/governance_overview", "POST", b"{}", auth_token)
        health_code, health_body = http_probe(base, key, "/rest/v1/rpc/governance_self_health", "POST", b"{}", auth_token)
    gov_json = {}
    health_json = {}
    try:
        gov_json = json.loads(gov_body or "{}")
    except json.JSONDecodeError:
        pass
    try:
        health_json = json.loads(health_body or "{}")
    except json.JSONDecodeError:
        pass
    governance_auth_pass = bool(
        auth_token
        and gov_code == 200
        and gov_json.get("authorized") is True
        and health_code == 200
        and health_json.get("authorized") is True
        and health_json.get("status") == "healthy"
    )

    if not base or not key:
        release_pass = False
        release_out = "Live Supabase URL/publishable key unavailable."
    else:
        try:
            proc = subprocess.run(["bash", str(ROOT / "scripts/verify-production.sh")], capture_output=True, text=True, env={**os.environ, "APP_URL": APP_URL, "SUPABASE_URL": base, "SUPABASE_KEY": key}, timeout=900)
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
        unresolved = sum(rls_plan.get("summary", {}).get(k, 0) for k in ("FIX_NOW", "FIX_WITH_MIGRATION"))
        rls_track = {"status": rls_status, "unresolved": unresolved, "blocking": rls_status == "blocked" or unresolved > 0}

    governance_schema_pass = bool(base and key and ok_total == expected)
    migration_pass = governance_schema_pass and release_pass
    security_pass = not rls_track["blocking"]
    verdict = "PASS" if migration_pass and security_pass and governance_auth_pass else "BLOCKED"

    report = {
        "verdict": verdict,
        "require_live": REQUIRE_LIVE,
        "governance_schema": {"expected": expected, "ok": ok_total, "rows": rows, "pass": governance_schema_pass},
        "governance_authenticated": {"status": auth_status, "overview_http": gov_code, "overview_authorized": gov_json.get("authorized") is True, "self_health_http": health_code, "self_health_status": health_json.get("status"), "pass": governance_auth_pass},
        "release_gate": {"pass": release_pass, "probe_out": release_out[-1200:]},
        "rls_security_track": rls_track,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    cleanup_e2e_identity(base)
    print(f"Governance probes: {ok_total}/{expected}")
    print(f"Authenticated governance: {'PASS' if governance_auth_pass else 'FAIL'}")
    print(f"Release gate: {'PASS' if release_pass else 'FAIL'}")
    print(f"Security track: {'PASS' if security_pass else 'BLOCKED'}")
    print(f"VERDICT: {verdict}")
    if REQUIRE_LIVE and verdict != "PASS":
        return 1
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
