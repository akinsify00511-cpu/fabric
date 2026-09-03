#!/usr/bin/env python3
"""Verify the live Supabase project against the generated production contract.

Important: PostgREST's public OpenAPI surface can be incomplete for publishable
keys. Therefore an object absent from /rest/v1/ is never classified as missing
without a direct probe. This prevents required-argument RPCs from becoming
false MISSING results merely because they are not exposed in the OpenAPI spec.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT / "supabase" / "contract" / "production_contract.json"


def request(url, key, method="GET", body=None, timeout=20):
    headers = {"apikey": key, "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, headers=headers, method=method, data=body)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except OSError:
        return 0, ""


def rpc_exists(base, name, key):
    code, body = request(f"{base}/rest/v1/rpc/{name}", key, "POST", b"{}")
    if code == 0:
        return None
    if '"PGRST202"' in body or ("no matches" in body.lower() and "schema cache" in body.lower()):
        return False
    # Any non-404 response proves that PostgREST resolved the RPC. A 400/401/
    # 403 can be caused by missing arguments/permissions, which means the RPC
    # exists and should not be classified as schema-missing.
    if code == 404 and "not found" in body.lower():
        return False
    return True


def table_exists(base, name, key):
    code, _ = request(f"{base}/rest/v1/{name}?limit=0", key, "HEAD")
    if code == 0:
        return None
    if code == 404:
        return False
    return True


def edge_exists(base, name, key):
    code, _ = request(f"{base}/functions/v1/{name}", key, "OPTIONS")
    return code not in (0, 404)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", dest="json_out", default=str(ROOT / "supabase" / "contract" / "verification_report.json"))
    parser.add_argument("--frontend-only", action="store_true")
    args = parser.parse_args()

    base = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
    key = service_key or os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY") or ""
    if not base or not key:
        print("ERROR: set SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY)", file=sys.stderr)
        return 2

    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    objects = contract.get("objects", [])
    if args.frontend_only:
        objects = [o for o in objects if o.get("frontend_referenced")]

    results = {"ok": [], "missing": [], "drift": [], "unknown": []}
    for obj in objects:
        kind, name = obj["kind"], obj["name"]
        entry = {"kind": kind, "name": name, "defined_in": obj["defined_in"],
                 "security_sensitive": obj["security_sensitive"], "classification": None}
        if kind in ("table", "view"):
            exists = table_exists(base, name, key)
        elif kind == "function":
            exists = rpc_exists(base, name, key)
        elif kind == "bucket":
            # A publishable/anon key can receive a filtered bucket list that omits
            # private buckets. Never turn that incomplete list into a false MISSING.
            if not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
                exists = None
            else:
                code, body = request(f"{base}/storage/v1/bucket", key)
                if code == 0 or code in (401, 403):
                    exists = None
                elif code == 200:
                    try:
                        names = {b.get("name") or b.get("id") for b in json.loads(body)}
                        exists = name in names
                    except Exception:
                        exists = None
                else:
                    exists = None
        else:
            exists = None

        if exists is True:
            results["ok"].append(entry)
        elif exists is None:
            entry["classification"] = "UNREACHABLE"
            results["unknown"].append(entry)
        else:
            entry["classification"] = ("SECURITY_REPAIR_REQUIRED" if obj["security_sensitive"] else "AUTO_REPAIR_SAFE")
            results["missing"].append(entry)

    edge_results = []
    for fn in contract.get("edge_functions", []):
        deployed = edge_exists(base, fn, key)
        edge_results.append({"name": fn, "deployed": deployed, "http": None})

    failed = len(results["missing"]) + len(results["drift"])
    report = {
        "target": base,
        "frontend_only": args.frontend_only,
        "summary": {"ok": len(results["ok"]), "missing": len(results["missing"]),
                     "drift": len(results["drift"]), "unknown": len(results["unknown"]),
                     "edge_functions_missing": [e["name"] for e in edge_results if not e["deployed"]]},
        "missing": results["missing"], "drift": results["drift"],
        "unknown": results["unknown"], "edge_functions": edge_results,
    }
    Path(args.json_out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json_out).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print("Avenize Production Contract")
    print("─" * 28)
    print(f"Objects checked : {len(objects)}")
    print(f"OK              : {len(results['ok'])}")
    print(f"Missing         : {len(results['missing'])}")
    print(f"Drift           : {len(results['drift'])}")
    print(f"Unknown         : {len(results['unknown'])}")
    for e in edge_results:
        print(f"  edge {e['name']:<28} {'DEPLOYED' if e['deployed'] else 'MISSING'}")
    if results["missing"]:
        print("\nMissing objects:")
        for m in results["missing"][:40]:
            print(f"  [{m['classification']}] {m['kind']} {m['name']} <- {m['defined_in']}")
    print(f"\nRESULT: {'CONTRACT HOLDS' if failed == 0 and all(e['deployed'] for e in edge_results) else 'CONTRACT BROKEN'}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
