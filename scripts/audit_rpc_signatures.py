#!/usr/bin/env python3
"""Extract the canonical (latest-wins) signature for a named RPC from the
migration chain and print it, so it can be compared against the frontend
caller's exact params. Credential-free: pure SQL-source analysis.

Usage:
  python3 scripts/audit_rpc_signatures.py create_business_and_owner current_metrics
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
FUNC_RE = re.compile(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_0-9]+)\s*\(",
    re.IGNORECASE | re.DOTALL,
)


def extract_chain() -> dict[str, str]:
    """Return {fn_name: latest_full_definition_block} applying migrations in
    filename order so later CREATE OR REPLACE wins (matches Postgres)."""
    chain: dict[str, str] = {}
    for path in sorted(MIGRATIONS.glob("*.sql")):
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in FUNC_RE.finditer(text):
            name = m.group(1)
            # Match to the terminating `$$` block or the first `LANGUAGE`
            # after the arg list; capture enough to show the signature+returns.
            start = m.start()
            sig_match = re.search(
                r"(.*?)(?:LANGUAGE\s+[a-z_]+|RETURNS\s+[A-Z_]+)", text[start:],
                re.IGNORECASE | re.DOTALL,
            )
            block = text[start : start + (sig_match.end() if sig_match else 240)]
            chain[name] = block.replace("\n", " ").strip()
    return chain


def summarize(sig: str) -> str:
    s = re.sub(r"\s+", " ", sig)
    s = re.sub(r"(--.*?)(?=\s+(?:CREATE|create))", "", s)
    s = re.sub(r"(?s)\$\$.*?\$\$", "$$...$$", s)
    return s[:700]


def main() -> None:
    chain = extract_chain()
    names = sys.argv[1:] or [
        "create_business_and_owner",
        "resolve_current_user_context",
        "current_metrics",
        "refresh_business_metrics",
        "business_brain",
        "compute_ebitda",
        "recommend_plan",
        "profitability_by_segment",
        "profitability_leakage",
        "pricing_opportunities",
    ]
    print(f"canonical files scanned: {len(list(MIGRATIONS.glob('*.sql')))}")
    for name in names:
        sig = chain.get(name)
        if not sig:
            print(f"\n=== {name}: NO CANONICAL DEFINITION FOUND ===")
            continue
        # argument names
        args_m = re.match(r"CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+public\.\w+\s*\((.*?)\)\s*RETURNS", sig, re.DOTALL)
        print(f"\n=== {name} ===")
        print("  signature:", summarize(sig))
        if args_m:
            args = args_m.group(1)
            types = [a.strip().split()[0] for a in args.split(",") if a.strip() and "DEFAULT" not in a.split()[0]]
            print("  arg names:", [a.split()[0] for a in args.split(",") if a.strip()])


if __name__ == "__main__":
    main()