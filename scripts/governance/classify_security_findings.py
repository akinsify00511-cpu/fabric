#!/usr/bin/env python3
"""
Classify Security Advisor findings into the governance quadrant:
  FIX_NOW | FIX_WITH_MIGRATION | GOVERNED_EXCEPTION | FALSE_STALE.

Reads governance/security_findings.json (populated by
retrieve_security_findings.py once SUPABASE_ACCESS_TOKEN or
SUPABASE_DB_URL is injected) plus the repo's canonical classification
metadata (supabase/contract/production_contract.json +
supabase/constitution/*-manifest.json), and emits
governance/rls_remediation_plan.json.

Production is NEVER modified. Classification rules:
- Any table carrying tenant/business data must get a get_current_staff()-scoped
  policy; USING(true) is constitutionally forbidden.
- Server-only/system tables need owner_of=no-client evidence + compensating
  control (RLS denied to anon/authenticated, service-role-only RPC).
- service-ingestion/webhook tables document the ingestion actor + the reader gate.
- A finding is GOVERNED_EXCEPTION only with a named compensating control.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
FINDINGS = ROOT / "governance" / "security_findings.json"
CONTRACT = ROOT / "supabase" / "contract" / "production_contract.json"
OUT = ROOT / "governance" / "rls_remediation_plan.json"

CANONICAL_TENANT_FUNCTION = "get_current_staff()"

# Data-classification precedence: first matching rule wins.
DATA_CLASS_RULES = [
    ("sensitive/security", ["payment", "subscription", "entitlement", "auth", "mfa", "passkey", "webauthn", "secret", "credential", "api_key", "rate_limit", "audit_log", "security_", "ledger"]),
    ("user/staff", ["staff", "user_", "member", "invite", "employee", "person"]),
    ("tenant/business", ["deal", "contact", "lead", "invoice", "quote", "order", "task", "project", "product", "inventory", "transaction", "budget", "expense", "payroll", "leave", "attendance", "meeting", "capture", "document", "asset", "vendor", "purchase", "recurring", "cashflow", "tax", "account", "currency"]),
    ("intelligence/system", ["claim", "kpi", "metric", "recommend", "diagnos", "business_brain", "health_score", "entitlement", "module_", "feature_", "usage_", "event", "audit", "graph", "neighbor", "governance"]),
    ("webhook/service-ingestion", ["webhook", "provider_request", "idempotency", "queue", "inbox", "outbox"]),
]


def classify_data(table_name: str) -> str:
    for klass, needles in DATA_CLASS_RULES:
        if any(n in table_name.lower() for n in needles):
            return klass
    return "unclassified"


def decision_for(linter: str, table: str, contract_obj: dict | None) -> tuple[str, str]:
    klass = classify_data(table)
    sensitive = contract_obj.get("security_sensitive", False) if contract_obj else False
    if linter == "rls_disabled_in_public":
        if klass in ("tenant/business", "user/staff", "sensitive/security") or sensitive:
            return (
                "FIX_WITH_MIGRATION",
                f"Enable RLS + business-scoped policy via {CANONICAL_TENANT_FUNCTION}; forbid USING(true).",
            )
        if klass in ("webhook/service-ingestion",):
            return (
                "FIX_WITH_MIGRATION",
                "RLS-deny to anon/authenticated; service-role-only ingestion; reader via SECURITY DEFINER gate.",
            )
        return (
            "FIX_WITH_MIGRATION",
            "RLS-deny to anon/authenticated unless a named compensating control is recorded (then GOVERNED_EXCEPTION).",
        )
    if linter == "unindexed_foreign_keys":
        return ("FIX_WITH_MIGRATION", "Add index on the FK column; harmless, no policy change.")
    if linter == "auth_users_exposed":
        return ("FIX_NOW", "View must not expose auth.users to clients; re-authored with security_barrier or dropped.")
    if linter == "function_search_path_mutable":
        return ("FIX_WITH_MIGRATION", "Set search_path='' explicitly on the function (SECURITY DEFINER hardening).")
    if linter == "extension_in_public":
        return ("GOVERNED_EXCEPTION", "Extensions live in public by Supabase convention; compensating control: no client-visible objects depend on extension misuse; audit quarterly.")
    return ("FIX_WITH_MIGRATION", "Unclassified linter requires individual review.")


def main() -> int:
    if not FINDINGS.exists():
        plan = {"status": "blocked", "reason": "security_findings.json missing — run retrieve_security_findings.py after injecting SUPABASE_ACCESS_TOKEN or SUPABASE_DB_URL."}
        OUT.write_text(json.dumps(plan, indent=2))
        print(json.dumps(plan, indent=2))
        return 2

    findings = json.loads(FINDINGS.read_text())
    if not findings.get("findings") or "error" in findings["findings"]:
        plan = {"status": "blocked", "reason": findings.get("findings", {}).get("error", "no findings"), "required": findings.get("findings", {}).get("required")}
        OUT.write_text(json.dumps(plan, indent=2))
        print(json.dumps({"status": "blocked"}, indent=2))
        return 2

    contract = json.loads(CONTRACT.read_text())
    by_name = {(o["kind"], o["name"]): o for o in contract["objects"]}

    items = []
    src = findings["source"]
    if src == "live-db-sql":
        for linter, rows in findings["findings"].items():
            for row in rows:
                name = row if ("|") not in row else row.split("|")[0].strip()
                obj = by_name.get(("table", name)) or by_name.get(("view", name)) or by_name.get(("function", name))
                decision, rationale = decision_for(linter, name, obj)
                items.append({
                    "linter": linter,
                    "object": name,
                    "data_classification": classify_data(name),
                    "decision": decision,
                    "rationale": rationale,
                    "contract_sensitive": obj.get("security_sensitive") if obj else None,
                })
    else:  # management api shapes vary; normalize minimally
        for it in (findings["findings"].get("advisors") or findings["findings"]) if isinstance(findings["findings"], dict) else findings["findings"]:
            if isinstance(it, dict):
                obj = it.get("metadata", {}).get("name") or it.get("name") or it.get("title")
                linter = it.get("id") or it.get("type") or "unknown"
                decision, rationale = decision_for(linter, str(obj), by_name.get(("table", obj)) or by_name.get(("view", obj)))
                items.append({"linter": linter, "object": obj, "data_classification": classify_data(str(obj)), "decision": decision, "rationale": rationale})

    summary = {"FIX_NOW": 0, "FIX_WITH_MIGRATION": 0, "GOVERNED_EXCEPTION": 0, "FALSE_STALE": 0}
    for it in items:
        summary[it["decision"]] = summary.get(it["decision"], 0) + 1

    plan = {
        "status": "classified",
        "source": src,
        "total_findings": len(items),
        "summary": summary,
        "items": sorted(items, key=lambda x: (x["decision"], x["linter"], x["object"])),
        "constitutional_constraints": [
            "No USING(true) policies.",
            "No RLS disable to pass tests.",
            "GOVERNED_EXCEPTION requires a named compensating control.",
            "Every FIX marks the canonical migration; prod modified only after review.",
        ],
    }
    OUT.write_text(json.dumps(plan, indent=2))
    print(json.dumps({"status": plan["status"], "total": plan["total_findings"], "summary": summary}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
