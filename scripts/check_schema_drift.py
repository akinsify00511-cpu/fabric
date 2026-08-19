#!/usr/bin/env python3
"""
Schema-drift CI check.

Scans the frontend (src/**) for every Supabase reference:
  - supabase.from('table')         (table queries, excluding storage.from)
  - supabase.rpc('name')           (RPC calls)
  - supabase.storage.from('bucket') (storage buckets)

And verifies each has a backing migration:
  - tables  → CREATE TABLE or CREATE VIEW in supabase/migrations/*.sql
  - rpcs    → CREATE [OR REPLACE] FUNCTION in supabase/migrations/*.sql
  - buckets → storage.buckets insert/reference in migrations

Exits 0 if all references have backing migrations.
Exits 1 if any reference is UNBACKED (drift), printing the list.

This prevents the frontend from racing ahead of Supabase again — a new
page that queries a table with no migration will fail CI before merge.

Usage:
  python3 scripts/check_schema_drift.py
"""

import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS_DIR = os.path.join(REPO, 'supabase', 'migrations')
SRC_DIR = os.path.join(REPO, 'src')


def _is_storage_from(content, match_start):
    lookback = content[max(0, match_start - 30):match_start]
    return bool(re.search(r'storage\s*$', lookback))


def extract_frontend_references():
    """Returns (tables, rpcs, storage_buckets) referenced by the frontend."""
    tables = {}
    rpcs = {}
    buckets = {}

    # Supabase identifiers can contain letters, digits, underscores and hyphens.
    from_pattern = re.compile(r"\.from\(['\"]([a-z0-9_-]+)['\"]\)")
    rpc_pattern = re.compile(r"\.rpc\(['\"]([a-z0-9_-]+)['\"]\)")

    for root, _, files in os.walk(SRC_DIR):
        for f in files:
            if not f.endswith(('.ts', '.tsx')):
                continue
            path = os.path.join(root, f)
            rel = os.path.relpath(path, SRC_DIR)
            try:
                with open(path, encoding='utf-8') as fh:
                    content = fh.read()
            except Exception:
                continue

            for m in from_pattern.finditer(content):
                name = m.group(1)
                if _is_storage_from(content, m.start()):
                    buckets.setdefault(name, set()).add(rel)
                else:
                    tables.setdefault(name, set()).add(rel)

            for m in rpc_pattern.finditer(content):
                rpcs.setdefault(m.group(1), set()).add(rel)

    return tables, rpcs, buckets


def load_migration_definitions():
    """Returns (tables, rpcs, buckets) defined in migrations."""
    tables = set()
    rpcs = set()
    buckets = set()

    identifier = r"[a-zA-Z0-9_-]+"
    table_patterns = [
        re.compile(rf"CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?({identifier})", re.IGNORECASE),
        re.compile(rf"CREATE\s+(?:OR REPLACE\s+)?VIEW\s+(?:public\.)?({identifier})", re.IGNORECASE),
    ]
    rpc_pattern = re.compile(rf"CREATE\s+(?:OR REPLACE\s+)?FUNCTION\s+(?:public\.)?({identifier})\s*\(", re.IGNORECASE)
    bucket_pattern = re.compile(
        rf"INSERT\s+INTO\s+storage\.buckets\s*\([^)]*\)\s*VALUES?\s*\([^)]*['\"]({identifier})['\"]",
        re.IGNORECASE | re.DOTALL,
    )

    for f in sorted(os.listdir(MIGRATIONS_DIR)):
        if not f.endswith('.sql'):
            continue
        path = os.path.join(MIGRATIONS_DIR, f)
        try:
            with open(path, encoding='utf-8') as fh:
                content = fh.read()
        except Exception:
            continue
        for p in table_patterns:
            for m in p.finditer(content):
                tables.add(m.group(1).lower())
        for m in rpc_pattern.finditer(content):
            rpcs.add(m.group(1).lower())
        for m in bucket_pattern.finditer(content):
            buckets.add(m.group(1).lower())

    return tables, rpcs, buckets


def main():
    fe_tables, fe_rpcs, fe_buckets = extract_frontend_references()
    mig_tables, mig_rpcs, mig_buckets = load_migration_definitions()

    drift = []

    for tbl, consumers in sorted(fe_tables.items()):
        if tbl not in mig_tables:
            drift.append(('TABLE', tbl, sorted(consumers)))

    for rpc, consumers in sorted(fe_rpcs.items()):
        if rpc not in mig_rpcs:
            drift.append(('RPC', rpc, sorted(consumers)))

    for bucket, consumers in sorted(fe_buckets.items()):
        if bucket not in mig_buckets:
            drift.append(('STORAGE_BUCKET', bucket, sorted(consumers)))

    if not drift:
        print(f"OK: {len(fe_tables)} tables, {len(fe_rpcs)} RPCs, "
              f"{len(fe_buckets)} storage buckets — all have backing migrations.")
        sys.exit(0)

    print(f"FAIL: {len(drift)} frontend reference(s) have NO backing migration:")
    for kind, name, consumers in drift:
        print(f"  [{kind}] {name}")
        for c in consumers[:3]:
            print(f"    ← {c}")
    sys.exit(1)


if __name__ == '__main__':
    main()
