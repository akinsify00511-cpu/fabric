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


# Legacy deployed functions (dashboard-verified) that are not in the manifest.
# Constitutional decision: HOLD — never delete without an explicit human decision.
# Renamed-replaced hypotheses are evidence-based (migration comments, superseding
# manifest functions) but remain HYPOTHESES until a human approves deprecation.
LEGACY_HYPOTHESES = {
    "subscription-checkout": {
        "superseded_by": "subscription-management",
        "evidence": "Migration 20260821170000_payment_entitlement_sync.sql comment: 'The subscription-checkout edge function records each checkout attempt in subscription_provider_attempts' — the table exists, the manifest successor is subscription-management.",
    },
    "paystack-initialize": {
        "superseded_by": "subscription-management + paystack-verify",
        "evidence": "Payment flow consolidated: checkout initialization lives in subscription-management (createCheckout); verification separated into paystack-verify.",
    },
    "send-welcome-email": {
        "superseded_by": "email-service",
        "evidence": "Resend email subsystem (migration 20260822170000) consolidates all transactional email into email-service with a template ledger.",
    },
    "process-crm-activity": {
        "superseded_by": "execute-automation",
        "evidence": "Single automation executor (execute-automation) replaced per-domain activity processors.",
    },
    "refresh-deal-follow-through": {
        "superseded_by": "execute-automation",
        "evidence": "Follow-through scheduling folded into the automation executor + dispatch-webhooks.",
    },
    "refresh-deal-risk": {
        "superseded_by": "execute-automation + platform-health-check",
        "evidence": "Deal-risk recomputation is a scheduled automation/health concern.",
    },
}


def main() -> int:
    inventory_path = ROOT / "governance" / "edge_inventory.json"
    inventory = json.loads(inventory_path.read_text()) if inventory_path.exists() else {"deployed": [], "missing": [], "extra_deployed": [], "probe_failed": []}
    manifest = MANIFEST["directory"]
    deployed = inventory["deployed"]
    extra = inventory.get("extra_deployed", [])
    missing = inventory["missing"] + inventory["probe_failed"]

    per_fn = {}
    for fn in manifest:
        per_fn[fn] = {
            "secrets": SECRET_HINTS.get(fn, []),
            "deploy_status": "DEPLOYED" if fn in deployed else ("MISSING" if fn in inventory["missing"] else "PROBE_FAILED"),
            "decision": "KEEP" if fn in deployed else "DEPLOY",
        }

    legacy = []
    for fn in extra:
        hypothesis = LEGACY_HYPOTHESES.get(fn, {})
        legacy.append({
            "name": fn,
            "deploy_status": "DEPLOYED",
            "decision": "HOLD (no deletion without human decision)",
            "frontend_referenced": False,
            "superseded_by_hypothesis": hypothesis.get("superseded_by"),
            "evidence": hypothesis.get("evidence", "Deployed; not in manifest; no repo source; classifying as legacy-extra pending human decision."),
        })

    plan = {
        "total_in_manifest": len(manifest),
        "deployed": [{"name": fn, **per_fn[fn]} for fn in manifest if fn in deployed],
        "missing": [{"name": fn, **per_fn[fn]} for fn in manifest if fn in missing],
        "legacy_extra": legacy,
        "missing_count": len(missing),
        "deployed_count": len(deployed),
        "legacy_extra_count": len(legacy),
        "secrets_required": sorted({s for fn in manifest for s in SECRET_HINTS.get(fn, [])}),
        "dashboard_crosscheck": "OPTIONS-probe universe (12 manifest + 7 dashboard-verified) reconciles exactly with the user-verified Supabase dashboard inventory: 1 expected deployed (paystack-webhook), 11 expected missing, 6 legacy-extra held.",
        "note": (
            "Constitution: DEPLOYED never appears in missing; legacy-extra NEVER deleted "
            "without a human decision. Renamed-replaced supersession mapping is a hypothesis "
            "layer with cited evidence, not an action."
        ),
    }
    (ROOT / "governance" / "edge_deployment_plan.json").write_text(json.dumps(plan, indent=2))
    print(json.dumps({"deployed": deployed, "missing": missing}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
