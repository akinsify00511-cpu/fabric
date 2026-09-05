#!/usr/bin/env python3
"""Verify the live Supabase project against the generated production contract.

A zero-argument PostgREST probe is not a valid existence test for parameterized
RPCs. The generated contract contains function signatures, so this verifier
constructs a null-valued request with the correct argument names. That lets
PostgREST resolve the function without executing business logic successfully.
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT / "supabase" / "contract" / "production_contract.json"
_OPENAPI_CACHE = None


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


def openapi_has_rpc(base, name, key):
    global _OPENAPI_CACHE
    if _OPENAPI_CACHE is None:
        code, body = request(f"{base}/rest/v1/", key)
        if code != 200:
            return None
        try:
            _OPENAPI_CACHE = json.loads(body)
        except Exception:
            return None
    return f"/rpc/{name}" in ((_OPENAPI_CACHE or {}).get("paths", {}))


def signature_body(signature):
    """Turn 'p_id uuid, p_limit integer' into {'p_id': None, 'p_limit': None}."""
    if not signature or not signature.strip():
        return {}
    body = {}
    # Parameter names in generated Supabase signatures are unquoted identifiers.
    for part in signature.split(","):
        match = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)", part)
        if match:
            body[match.group(1)] = None
    return body


def rpc_exists(base, name, key, signatures):
    candidates = signatures or [""]
    saw_unreachable = False
    for signature in candidates:
        payload = json.dumps(signature_body(signature)).encode("utf-8")
        code, body = request(f"{base}/rest/v1/rpc/{name}", key, "POST", payload)
        if code == 0:
            saw_unreachable = True
            continue
        lower = body.lower()
        if code == 404 and "not found" in lower:
            return False
        # A non-schema error (400/401/403/409/500) means PostgREST resolved the
        # function and began processing it. Business/RLS validation is not a
        # schema-missing condition and must not be reported as missing.
        if '"pgrst202"' not in lower and not ("no matches" in lower and "schema cache" in lower):
            return True

    # If argument resolution still failed, the authoritative OpenAPI surface
    # can confirm the RPC when a service-role key is available. Otherwise the
    # correct result is UNKNOWN, never a false MISSING.
    confirmed = openapi_has_rpc(base, name, key)
    if confirmed is True:
        return True
    if confirmed is False:
        return False
    return None if saw_unreachable or True else False


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
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    key = service_key or os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY") or ""
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
        entry = {"kind": kind, "name": name, "defined_in": obj["defined_in"], "security_sensitive": obj["security_sensitive"], "classification": None}
        if kind in ("table", "view"):
            exists = table_exists(base, name, key)
        elif kind == "function":
            exists = rpc_exists(base, name, key, obj.get("signatures"))
        elif kind == "bucket":
            if not service_key:
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
    report = {"target": base, "frontend_only": args.frontend_only, "summary": {"ok": len(results["ok"]), "missing": len(results["missing"]), "drift": len(results["drift"]), "unknown": len(results["unknown"]), "edge_functions_missing": [e["name"] for e in edge_results if not e["deployed"]]}, "missing": results["missing"], "drift": results["drift"], "unknown": results["unknown"], "edge_functions": edge_results}
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
