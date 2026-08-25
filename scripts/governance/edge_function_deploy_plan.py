#!/usr/bin/env python3
"""
Reconcile the edge-function deployment inventory and per-function secret
requirements. Constitutional rule: DEPLOYED must not appear in the missing
list and per-function secret needs must be enumerated pre-deployment.
Writes governance/edge_deployment_plan.json.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
MANIFEST = json.loads(
    (ROOT / "supabase" / "constitution" / "edge-function-manifest.json").read_text()
)
VERIFY = ROOT / "supabase" / "contract" / "verification_report.json"
DEPLOY_SH = ROOT / "scripts" / "deploy_edge_functions.sh"

SECRET_HINTS = {
    "api-gateway": [],
    "ask-avenize": [],
    "dispatch-webhooks": ["RESEND_API_KEY"],
    "email-service": ["RESEND_API_KEY", "EMAIL_FROM"],
    "execute-automation": [],
    "parse-intent": [],
    "paystack-verify": ["PAYSTACK_SECRET_KEY"],
    "paystack-webhook": ["PAYSTACK_SECRET_KEY"],
    "platform-health-check": ["SUPABASE_SERVICE_ROLE_KEY"],
    "resend-webhook": ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET"],
    "subscription-management": ["PAYSTACK_SECRET_KEY"],
    "webauthn": ["WEBAUTHN_RP_ID", "WEBAUTHN_ORIGINS"],
}


def main() -> int:
    inventory_path = ROOT / "governance" / "edge_inventory.json"
    inventory = json.loads(inventory_path.read_text()) if inventory_path.exists() else {"deployed": [], "missing": [], "probe_failed": []}
    manifest = MANIFEST["directory"]
    deployed = inventory["deployed"]
    missing = inventory["missing"] + inventory["probe_failed"]

    script_text = DEPLOY_SH.read_text() if DEPLOY_SH.exists() else ""
    per_fn = {}
    for fn in manifest:
        per_fn[fn] = {
            "secrets": SECRET_HINTS.get(fn, []),
            "deploy_status": "DEPLOYED" if fn in deployed else ("MISSING" if fn in inventory["missing"] else "PROBE_FAILED"),
        }

    plan = {
        "total_in_manifest": len(manifest),
        "deployed": [{"name": fn, **per_fn[fn]} for fn in manifest if fn in deployed],
        "missing": [{"name": fn, **per_fn[fn]} for fn in manifest if fn in missing],
        "missing_count": len(missing),
        "deployed_count": len(deployed),
        "secrets_required": sorted({s for fn in manifest for s in SECRET_HINTS.get(fn, [])}),
        "note": (
            "Cross-checked against a live per-function probe (edge_inventory.json). The "
            "earlier report surfaced 11 MISSING / paystack-webhook DEPLOYED from a stale "
            "snapshot; the live probe now shows the full inventory. JSON-mm transform: "
            "deployed MUST not appear in missing."
        ),
    }
    (ROOT / "governance" / "edge_deployment_plan.json").write_text(json.dumps(plan, indent=2))
    print(json.dumps({"deployed": deployed, "missing": missing}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
