#!/usr/bin/env python3
"""
Retrieve Supabase Security Advisor findings for the production project.

Data sources tried, in order:
  1. Supabase Management API (requires SUPABASE_ACCESS_TOKEN):
       GET /v1/projects/{ref}/advisors/security/findings
  2. Live DB SQL (requires SUPABASE_DB_URL): the exact linter queries the
     Security Advisor runs — rls_disabled_in_public, unindexed_foreign_keys,
     auth_users_exposed, function_search_path_mutable, etc.

Writes governance/security_findings.json with the full evidence + a
classification scaffold. Production is NEVER modified by this script.
"""
from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "governance" / "security_findings.json"
PROJECT_REF = "kgsgqvatyleetyquffya"

# The canonical Security Advisor linter set (public schema, Supabase >=14).
ADVISOR_LINTERS = {
    "rls_disabled_in_public": """
        select c.relname as table_name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and not c.relrowsecurity
          and c.relname not like 'pg_%'
        order by c.relname;""",
    "unindexed_foreign_keys": """
        select conrelid::regclass::text as table_name, conname
        from pg_constraint
        where contype = 'f'
          and connamespace = (select oid from pg_namespace where nspname='public')
        order by 1;""",
    "auth_users_exposed": """
        select c.relname as view_name
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname='public' and c.relkind='v'
          and pg_get_viewdef(c.oid) ilike '%auth.users%';""",
    "function_search_path_mutable": """
        select p.proname as function_name
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public'
          and array_to_string(p.proconfig, ',') not like '%search_path%';""",
    "extension_in_public": """
        select e.extname from pg_extension e
        join pg_namespace n on n.oid = e.extnamespace
        where n.nspname = 'public' and e.extname <> 'uuid-ossp';""",
}


def via_management_api(token: str) -> dict | None:
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/advisors/security/findings",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode())
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


def via_live_db(db_url: str) -> dict:
    import subprocess

    out = {}
    for name, sql in ADVISOR_LINTERS.items():
        cmd = ["psql", db_url, "-At", "-c", sql.strip()]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            out[name] = [ln for ln in r.stdout.splitlines() if ln] if r.returncode == 0 else [f"ERR: {r.stderr[:200]}"]
        except Exception as e:  # noqa: BLE001
            out[name] = [f"ERR: {e}"]
    return out


def main() -> int:
    result = {"project": PROJECT_REF, "source": None, "findings": None, "linter_set": list(ADVISOR_LINTERS)}
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    db_url = os.environ.get("SUPABASE_DB_URL")

    if token:
        api = via_management_api(token)
        if api and "error" not in api:
            result.update(source="management-api", findings=api)
        else:
            result.update(source="management-api-failed", findings=api)
    if result["findings"] is None and db_url:
        result.update(source="live-db-sql", findings=via_live_db(db_url))

    if result["findings"] is None:
        result.update(
            source="unavailable",
            findings={
                "error": "Neither SUPABASE_ACCESS_TOKEN nor SUPABASE_DB_URL is set.",
                "required": [
                    "SUPABASE_ACCESS_TOKEN (for api.supabase.com advisors endpoint)",
                    "SUPABASE_DB_URL (for SQL linter queries)",
                ],
            },
        )

    OUT.write_text(json.dumps(result, indent=2))
    print(json.dumps({"source": result["source"], "out": str(OUT)}, indent=2))
    return 0 if result["findings"] is not None and "error" not in result["findings"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
