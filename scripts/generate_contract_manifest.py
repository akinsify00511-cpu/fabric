#!/usr/bin/env python3
"""Generate the Avenize Production Contract manifest.

The contract is the SINGLE machine-readable statement of what production must
contain, derived from the canonical sources:

  1. supabase/migrations/*.sql  (the canonical migration chain - applied in
     filename order, later files win)  -> tables, views, functions + arg
     signatures, storage buckets.
  2. supabase/functions/*/           -> expected edge functions.
  3. src/**/*.{ts,tsx}               -> the frontend contract (.from/.rpc/
     .storage.from/.functions.invoke references). Every frontend reference
     MUST have a canonical definition, otherwise the manifest generation
     FAILS (this is the generalized schema-drift gate).

Outputs:
  supabase/contract/production_contract.json   - the machine-readable contract
  supabase/migrations/20260822160000_contract_integrity_seed.sql
      - seeds integrity_rules rows (one per contract object) so the DB-side
        scanner (run_integrity_scan) checks the SAME contract server-side.

Classification (used by the verifier + the DB scanner):
  repairable=True            -> missing object may be restored by applying the
                                canonical migration that defines it.
  security_sensitive=True    -> NEVER auto-repair. Missing/drifted objects
                                produce a SECURITY_REPAIR_REQUIRED incident
                                (integrity_findings, severity=critical) and a
                                human applies the canonical migration.
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "supabase" / "migrations"
FUNCTIONS_DIR = ROOT / "supabase" / "functions"
SRC = ROOT / "src"
CONTRACT_DIR = ROOT / "supabase" / "contract"
SEED_MIGRATION = MIGRATIONS / "20260822160000_contract_integrity_seed.sql"

RE_TABLE = re.compile(
    r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)",
    re.IGNORECASE,
)
RE_VIEW = re.compile(
    r"create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)",
    re.IGNORECASE,
)
RE_FUNCTION_HEAD = re.compile(
    r"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(",
    re.IGNORECASE,
)


def extract_balanced_args(text: str, start: int) -> str:
    """Return the text between the paren at start-1 and its match (string-literal aware).
    Naive [^)]* truncation breaks on DEFAULT NOW() and DEFAULT date_trunc(...)."""
    depth, i, in_str = 1, start, None
    while i < len(text) and depth > 0:
        ch = text[i]
        if in_str:
            if ch == in_str:
                in_str = None
        elif ch in ("'", '"'):
            in_str = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return text[start:i]
        i += 1
    return text[start:]


def iter_function_defs(text: str):
    for m in RE_FUNCTION_HEAD.finditer(text):
        yield m.group(1), extract_balanced_args(text, m.end())
RE_BUCKET = re.compile(
    r"insert\s+into\s+storage\.buckets[^;]*?values\s*\(\s*'([a-zA-Z0-9_-]+)'",
    re.IGNORECASE | re.DOTALL,
)
RE_DROP = re.compile(
    r"drop\s+(table|view|function)\s+(?:if\s+exists\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)",
    re.IGNORECASE,
)
RE_LINE_COMMENT = re.compile(r"--[^\n]*")
RE_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)


def strip_sql_comments(text: str) -> str:
    text = RE_BLOCK_COMMENT.sub(" ", text)
    return RE_LINE_COMMENT.sub(" ", text)

RE_FE_FROM = re.compile(r"\.from\(\s*['\"]([a-zA-Z_][a-zA-Z0-9_]*)['\"]")
RE_FE_RPC = re.compile(r"\.rpc\(\s*['\"]([a-zA-Z_][a-zA-Z0-9_]*)['\"]")
RE_FE_BUCKET = re.compile(r"\.storage\s*\.\s*from\(\s*['\"]([a-zA-Z0-9_-]+)['\"]")
RE_FE_INVOKE = re.compile(r"\.functions\.invoke\(\s*['\"]([a-zA-Z0-9_-]+)['\"]")
RE_FE_EDGE_URL = re.compile(r"/functions/v1/([a-zA-Z0-9_-]+)\b")

# Objects whose absence/mutation is a SECURITY event, never a silent repair.
SECURITY_NAME_PATTERNS = re.compile(
    r"auth|security|rate_limit|password|webauthn|mfa|totp|api_key|secret|"
    r"platform_admin|riverways|get_current_staff|get_current_accessible|"
    r"is_platform_admin|is_riverways_admin|rls|permission|tenant_guard|"
    r"member_kind|role_immutability|structural_immutability|audit",
    re.IGNORECASE,
)
SECURITY_MIGRATION_HINTS = re.compile(
    r"revoke|create\s+policy|drop\s+policy|security\s+definer", re.IGNORECASE
)

SKIP_TABLE_PREFIXES = ("pg_", "sql_")


TYPE_ALIASES = [
    ("character varying", "text"),
    ("timestamp with time zone", "timestamptz"),
    ("timestamp without time zone", "timestamp"),
    ("double precision", "float8"),
    ("bigserial", "int8"),
    ("bigint", "int8"),
    ("smallint", "int2"),
    ("integer", "int4"),
    ("int", "int4"),
    ("serial", "int4"),
    ("decimal", "numeric"),
    ("bool", "boolean"),
]


def normalize_args_text(args: str) -> str:
    """Word-boundary type alias canonicalization (mirrors contract_normalize_args)."""
    s = re.sub(r"\s+", " ", (args or "").lower()).strip()
    for old, new in TYPE_ALIASES:
        s = re.sub(rf"\b{re.escape(old)}\b", new, s)
    return s


def normalize_signature(args: str) -> str:
    """Normalize a function arg list to 'name type, name type' form."""
    args = args.strip()
    if not args:
        return ""
    parts = []
    depth = 0
    current = ""
    for ch in args:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        parts.append(current.strip())
    norm = []
    for p in parts:
        p = re.sub(r"\s+", " ", p)
        p = re.split(r"\s+default\s+", p, flags=re.IGNORECASE)[0].strip()
        norm.append(normalize_args_text(p))
    return ", ".join(norm)


def parse_migrations():
    tables, views, functions, buckets = {}, {}, {}, {}
    for path in sorted(MIGRATIONS.glob("*.sql")):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        text = strip_sql_comments(text)
        for m in RE_DROP.finditer(text):
            kind, name = m.group(1).lower(), m.group(2)
            if kind == "table":
                tables.pop(name, None)
            elif kind == "view":
                views.pop(name, None)
            elif kind == "function":
                functions.pop(name, None)
        for m in RE_TABLE.finditer(text):
            name = m.group(1)
            if name.startswith(SKIP_TABLE_PREFIXES):
                continue
            tables[name] = path.name
        for m in RE_VIEW.finditer(text):
            views[m.group(1)] = path.name
        for name, raw_args in iter_function_defs(text):
            sig = normalize_signature(raw_args)
            entry = functions.setdefault(name, {"defined_in": path.name, "signatures": []})
            entry["defined_in"] = path.name  # later file wins
            if sig not in entry["signatures"]:
                entry["signatures"].append(sig)
        for m in RE_BUCKET.finditer(text):
            buckets[m.group(1)] = path.name
    return tables, views, functions, buckets


def parse_frontend():
    refs = {"tables": set(), "rpcs": set(), "buckets": set(), "edge_functions": set()}
    for path in list(SRC.rglob("*.ts")) + list(SRC.rglob("*.tsx")):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        refs["tables"].update(RE_FE_FROM.findall(text))
        refs["rpcs"].update(RE_FE_RPC.findall(text))
        refs["buckets"].update(RE_FE_BUCKET.findall(text))
        refs["edge_functions"].update(RE_FE_INVOKE.findall(text))
        refs["edge_functions"].update(RE_FE_EDGE_URL.findall(text))
    # .storage.from('bucket') is not a table query
    refs["tables"] -= refs["buckets"]
    return {k: sorted(v) for k, v in refs.items()}


def parse_edge_functions():
    out = []
    if FUNCTIONS_DIR.is_dir():
        for child in sorted(FUNCTIONS_DIR.iterdir()):
            if child.is_dir() and not child.name.startswith("_") and (child / "index.ts").exists():
                out.append(child.name)
    return out


def is_security_sensitive(name, kind, defining_migration_text):
    if SECURITY_NAME_PATTERNS.search(name):
        return True
    if kind == "function" and defining_migration_text and SECURITY_MIGRATION_HINTS.search(
        defining_migration_text
    ):
        return True
    return False


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main():
    tables, views, functions, buckets = parse_migrations()
    fe = parse_frontend()
    edge_functions = parse_edge_functions()

    migration_texts = {}
    for path in MIGRATIONS.glob("*.sql"):
        try:
            migration_texts[path.name] = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            pass

    objects = []

    def add(kind, name, defined_in):
        sec = is_security_sensitive(name, kind, migration_texts.get(defined_in, ""))
        objects.append(
            {
                "kind": kind,
                "name": name,
                "defined_in": defined_in,
                "repairable": not sec,
                "security_sensitive": sec,
                "frontend_referenced": name
                in (fe["tables"] if kind in ("table", "view") else fe["rpcs"] if kind == "function" else fe["buckets"]),
            }
        )

    for name, src in sorted(tables.items()):
        add("table", name, src)
    for name, src in sorted(views.items()):
        add("view", name, src)
    for name, info in sorted(functions.items()):
        add("function", name, info["defined_in"])
        objects[-1]["signatures"] = info["signatures"]
    for name, src in sorted(buckets.items()):
        add("bucket", name, src)

    missing = []
    for t in fe["tables"]:
        if t not in tables and t not in views:
            missing.append(f"frontend table reference has no canonical definition: {t}")
    for r in fe["rpcs"]:
        if r not in functions:
            missing.append(f"frontend rpc reference has no canonical definition: {r}")
    for b in fe["buckets"]:
        if b not in buckets:
            missing.append(f"frontend bucket reference has no canonical definition: {b}")
    for fn in fe["edge_functions"]:
        if fn not in edge_functions:
            missing.append(f"frontend edge-function invoke has no canonical definition: {fn}")

    contract = {
        "counts": {
            "tables": len(tables),
            "views": len(views),
            "functions": len(functions),
            "buckets": len(buckets),
            "edge_functions": len(edge_functions),
        },
        "objects": objects,
        "functions": {name: info["signatures"] for name, info in sorted(functions.items())},
        "edge_functions": edge_functions,
        "frontend": fe,
    }

    CONTRACT_DIR.mkdir(parents=True, exist_ok=True)
    (CONTRACT_DIR / "production_contract.json").write_text(
        json.dumps(contract, indent=2) + "\n", encoding="utf-8"
    )

    # --- Generate the DB-side integrity seed (same contract, server-side) ---
    lines = [
        "-- GENERATED FILE - do not edit by hand.",
        "-- Regenerate with: python3 scripts/generate_contract_manifest.py",
        "--",
        "-- Seeds integrity_rules with one row per Production Contract object so",
        "-- run_integrity_scan() checks the SAME contract the CI verifier checks.",
        "-- repairable=false objects are SECURITY-SENSITIVE: a missing/drifted",
        "-- object opens a critical finding (SECURITY_REPAIR_REQUIRED) and is",
        "-- never silently repaired.",
        "",
    ]
    seen_keys = set()
    all_rule_keys = []
    for obj in objects:
        rule_key = f"contract_{obj['kind']}__{obj['name']}"
        if rule_key in seen_keys:
            continue
        seen_keys.add(rule_key)
        all_rule_keys.append(rule_key)
        contract_json = json.dumps(
            {
                "object_type": obj["kind"],
                "object_name": obj["name"],
                "signatures": obj.get("signatures", []),
                "repairable": obj["repairable"],
                "defined_in": obj["defined_in"],
            },
            separators=(",", ":"),
        )
        severity = "critical" if obj["security_sensitive"] else "warning"
        auto_repair = "false"  # repairs go through the canonical migration, never inline DDL
        lines.append(
            "insert into public.integrity_rules(rule_key,name,description,severity,auto_repair,repair_action,contract) values ("
            f"{sql_quote(rule_key)},{sql_quote('Contract: ' + obj['kind'] + ' ' + obj['name'])},"
            f"{sql_quote('Production contract object defined in ' + obj['defined_in'])},"
            f"{sql_quote(severity)},{auto_repair},"
            + sql_quote("apply_canonical_migration" if obj["repairable"] else "security_repair_required")
            + f",{sql_quote(contract_json)}::jsonb) on conflict(rule_key) do update"
            + " set contract = excluded.contract, contract_status = 'registered', updated_at = now();"
        )
    # The rules table mirrors the contract exactly: remove rules for objects
    # that left the contract (dropped objects, parser refinements). Only
    # contract-registered rules are deleted; bespoke + repairable rules stay.
    keys = ", ".join(sql_quote(k) for k in sorted(all_rule_keys))
    lines.append(
        "delete from public.integrity_rules where rule_key like 'contract\\_%' escape '\\'"
        + f" and rule_key <> all (array[{keys}]::text[]);"
    )
    lines.append("")
    SEED_MIGRATION.write_text("\n".join(lines), encoding="utf-8")

    print(f"contract: {len(objects)} objects "
          f"({len(tables)} tables, {len(views)} views, {len(functions)} functions, "
          f"{len(buckets)} buckets, {len(edge_functions)} edge functions)")
    print(f"frontend: {len(fe['tables'])} tables, {len(fe['rpcs'])} rpcs, "
          f"{len(fe['buckets'])} buckets, {len(fe['edge_functions'])} edge functions referenced")
    if missing:
        print("CONTRACT VIOLATIONS:", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
        sys.exit(1)
    print("OK: every frontend reference has a canonical definition")


if __name__ == "__main__":
    main()
