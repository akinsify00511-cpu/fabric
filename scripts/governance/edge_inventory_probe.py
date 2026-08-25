#!/usr/bin/env python3
"""
Probe live edge-function deployment statuses (verify vs missing).
Writes governance/edge_inventory.json.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

def _try(url: str, key: str):
    try:
        return urllib.request.urlopen(url).status
    except Exception as e:
        return getattr(e, "status", getattr(e, "code", -1))


# Authoritative production dashboard inventory (user-verified Supabase dashboard
# for kgsgqvatyleetyquffya, 2026-08-25). A manifest-only probe reported
# 1 deployed / 11 missing precisely because it never probed these legacy names.
DASHBOARD_DEPLOYED = [
    "paystack-initialize",
    "paystack-webhook",
    "process-crm-activity",
    "refresh-deal-follow-through",
    "refresh-deal-risk",
    "send-welcome-email",
    "subscription-checkout",
]


def probe() -> dict:
    base, key = self_calibrate()
    manifest_path = ROOT / "supabase" / "constitution" / "edge-function-manifest.json"
    manifest = json.loads(manifest_path.read_text())["directory"]
    manifest_frontend = json.loads(manifest_path.read_text())["frontend_referenced"]
    universe = sorted(set(manifest) | set(DASHBOARD_DEPLOYED))
    results = {
        "deployed": [],
        "missing": [],
        "extra_deployed": [],
        "probe_failed": [],
        "http": {},
        "dashboard_verified": DASHBOARD_DEPLOYED,
        "frontend_referenced": manifest_frontend,
        "method": "OPTIONS only (POST is invalid: gateway returns 401 for both deployed and missing functions)",
    }
    for fn in universe:
        if base and key:
            req = urllib.request.Request(f"{base}/functions/v1/{fn}", method="OPTIONS")
            req.add_header("Authorization", f"Bearer {key}")
            try:
                code = urllib.request.urlopen(req, timeout=20).status
            except Exception as e:
                code = getattr(e, "status", getattr(e, "code", -1))
        else:
            code = -1
        results["http"][fn] = code
        if code in (404, -1):
            if fn in manifest:
                results["missing"].append(fn)
            else:
                results["probe_failed"].append(fn)
        elif fn in manifest:
            results["deployed"].append(fn)
        else:
            results["extra_deployed"].append(fn)
    return results


LIVE_PLAN = ROOT / "governance" / "edge_inventory.json"


def parse_deployed(url: str) -> tuple[str, str]:
    try:
        html = urllib.request.urlopen(url, timeout=30).read().decode()
        assets = re.findall(r'src="([^"]+\.js)"', html)
        for n in assets[:50]:
            data = urllib.request.urlopen(
                url + n if n.startswith("/") else n, timeout=30
            ).read().decode()
            u = re.search(r"https://([a-z0-9]+)\.supabase\.co", data)
            k = re.search(r"sb_publishable_[A-Za-z0-9]+", data)
            if u and k:
                return (f"https://{u.group(1)}.supabase.co", k.group(0))
        return ("", "")
    except Exception:
        return ("", "")


def self_calibrate():
    deployed_url = "https://avenize.riverwayse.com"
    return parse_deployed(deployed_url)


def main() -> int:
    res = probe()
    LIVE_PLAN.write_text(json.dumps(res, indent=2))
    print(json.dumps(res, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
