#!/usr/bin/env python3
"""Generate the Supabase source-of-truth manifests (Data/Supabase Constitution).

Derives six deterministic manifests from the canonical migration chain and
the production contract:

  schema-manifest         <- tables + views (from production_contract objects)
  rpc-manifest            <- functions with identity signature
  policy-manifest         <- CREATE POLICY statements in migrations
  trigger-manifest        <- CREATE TRIGGER statements in migrations
  index-manifest          <- CREATE INDEX statements in migrations
  edge-function-manifest  <- supabase/functions/* + the contract frontend map

Deterministic: generation is pure (no timestamps) so committing output is a
no-op when inputs are unchanged. This is the same guarantee as
generate_contract_manifest.py.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "supabase" / "migrations"
CONTRACT = ROOT / "supabase" / "contract" / "production_contract.json"
OUT_DIR = ROOT / "supabase" / "constitution"
FUNCTIONS_DIR = ROOT / "supabase" / "functions"

RE_POLICY = re.compile(
    r"\bcreate\s+policy\s+(\w+)\s+on\s+(?:public\.)?(\w+)", re.IGNORECASE)
RE_DROP_POLICY = re.compile(
    r"\bdrop\s+policy\s+if\s+exists\s+(\w+)\s+on\s+(?:public\.)?(\w+)", re.IGNORECASE)
RE_TRIGGER = re.compile(
    r"\bcreate\s+(?:or\s+replace\s+)?trigger\s+(\w+)\s+(?:before|after)\s+"
    r"(?:insert|update|delete)(?:\s+or\s+(?:insert|update|delete))*?\s+on\s+(?:public\.)?(\w+)",
    re.IGNORECASE)
RE_INDEX = re.compile(
    r"\bcreate\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?(\w+)\s+on\s+"
    r"(?:public\.)?(\w+)", re.IGNORECASE)


def strip_comments(text: str) -> str:
    out, in_line = [], False
    i = 0
    while i < len(text):
        if in_line:
            if text[i] == "\n":
                in_line = False
                out.append("\n")
            i += 1
            continue
        if text[i] == "-":
            if i + 1 < len(text) and text[i + 1] == "-":
                in_line = True
                i += 1
                continue
        out.append(text[i])
        i += 1
    return "".join(out)


def load_contract() -> dict:
    if not CONTRACT.exists():
        print("ERROR: production contract missing; run generate_contract_manifest.py")
        sys.exit(1)
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def build_schema_manifest(contract: dict) -> dict:
    objects = contract["objects"]
    tables = sorted(
        [{"name": o["name"], "kind": "table", "defined_in": o["defined_in"],
          "frontend_referenced": o["frontend_referenced"]}
         for o in objects if o["kind"] == "table"],
        key=lambda o: o["name"])
    views = sorted(
        [{"name": o["name"], "kind": "view", "defined_in": o["defined_in"],
          "frontend_referenced": o["frontend_referenced"]}
         for o in objects if o["kind"] == "view"],
        key=lambda o: o["name"])
    return {
        "tables": tables,
        "views": views,
        "counts": {"tables": len(tables), "views": len(views)},
    }


def build_rpc_manifest(contract: dict) -> dict:
    objects = contract["objects"]
    funcs = sorted(
        [{"name": o["name"], "signature": o.get("identity_args", ""),
          "defined_in": o["defined_in"],
          "frontend_referenced": o["frontend_referenced"],
          "security_sensitive": o["security_sensitive"]}
         for o in objects if o["kind"] == "function"],
        key=lambda o: (o.get("name", ""), o.get("signature", "")))
    return {"functions": funcs, "counts": {"functions": len(funcs)}}


def scan_migration_patterns() -> dict:
    policies, triggers, indexes = {}, {}, {}
    for path in sorted(MIGRATIONS.glob("*.sql")):
        text = strip_comments(path.read_text(encoding="utf-8"))
        rel = path.name
        for name, table in RE_POLICY.findall(text):
            policies[(table, name)] = {"table": table, "policy": name, "defined_in": rel}
        for name, table in RE_TRIGGER.findall(text):
            triggers[(table, name)] = {"table": table, "trigger": name, "defined_in": rel}
        for name, table in RE_INDEX.findall(text):
            indexes[(table, name)] = {"table": table, "index": name, "defined_in": rel}

    # DROP POLICY IF EXISTS is the canonical pre-create cleanup, not a
    # removal — policies stay tracked. DROP TABLE/FUNCTION purges happen at
    # the contract level (tables/functions), and their policies cascade.
    return {
        "policies": [policies[k] for k in sorted(policies)],
        "triggers": [triggers[k] for k in sorted(triggers)],
        "indexes": [indexes[k] for k in sorted(indexes)],
    }


def build_edge_function_manifest(contract: dict) -> dict:
    expected = sorted(p.name for p in FUNCTIONS_DIR.iterdir()
                      if p.is_dir() and not p.name.startswith("_"))
    frontend_refs = sorted(set(contract.get("frontend", {}).get("edge_functions", [])))
    return {
        "directory": [f for f in expected],
        "frontend_referenced": frontend_refs,
    }


def main() -> int:
    contract = load_contract()
    schema = build_schema_manifest(contract)
    rpc = build_rpc_manifest(contract)
    patterns = scan_migration_patterns()
    edge = build_edge_function_manifest(contract)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    outputs = {
        "schema-manifest.json": schema,
        "rpc-manifest.json": rpc,
        "policy-manifest.json": {"policies": patterns["policies"],
                                 "counts": {"policies": len(patterns["policies"])}},
        "trigger-manifest.json": {"triggers": patterns["triggers"],
                                  "counts": {"triggers": len(patterns["triggers"])}},
        "index-manifest.json": {"indexes": patterns["indexes"],
                                "counts": {"indexes": len(patterns["indexes"])}},
        "edge-function-manifest.json": edge,
    }
    for filename, content in outputs.items():
        target = OUT_DIR / filename
        serialized = json.dumps(content, indent=2, sort_keys=True) + "\n"
        if target.exists() and target.read_text(encoding="utf-8") == serialized:
            print(f"  = {filename} (unchanged)")
            continue
        target.write_text(serialized, encoding="utf-8")
        print(f"  + {filename}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
