#!/usr/bin/env python3
"""
Supabase Reconciliation Matrix Generator.

Cross-references:
  1. Frontend-referenced tables  (src/**: supabase.from('table'))
  2. Migration-created tables    (supabase/migrations/*.sql: CREATE TABLE)
  3. Migration RPCs              (CREATE [OR REPLACE] FUNCTION)
  4. Frontend-referenced RPCs    (src/**: supabase.rpc('name'))

Produces:
  - A classified matrix (A-F) for every frontend-referenced table
  - The schema manifest (machine-readable JSON)

Classification:
  A — Layer 1 Required (CRM/Sales, Inventory, Accounting, HR)
  B — Existing live infrastructure (has migration — needs validation)
  C — Future feature (frontend exists, outside Layer 1)
  D — Orphaned/dead frontend dependency (no active flow)
  E — Partially implemented backend (migration incomplete)
  F — Migration drift (migration exists, live differs)
"""

import os
import re
import json
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS_DIR = os.path.join(REPO, 'supabase', 'migrations')
SRC_DIR = os.path.join(REPO, 'src')

LAYER1 = {
    'crm_sales': {
        'leads', 'contacts', 'deals', 'activities', 'pipelines', 'pipeline_stages',
        'deal_stages', 'customers', 'opportunities', 'quotes', 'quote_items',
        'social_media_accounts', 'social_media_posts', 'campaigns', 'email_campaigns',
        'sms_campaigns',
    },
    'inventory': {
        'products', 'inventory', 'inventory_categories', 'stock_movements',
        'warehouses', 'suppliers', 'vendors', 'purchase_orders', 'purchase_order_items',
        'branches', 'assets', 'asset_categories', 'equipment',
    },
    'accounting': {
        'accounts', 'transactions', 'transaction_items', 'invoices', 'invoice_items',
        'payments', 'expenses', 'expense_categories', 'journal_entries', 'journal_lines',
        'account_balances', 'bank_accounts', 'tax_rates', 'budgets', 'cashflow',
        'currency_rates', 'currencies', 'e_invoices',
    },
    'hr': {
        'staff', 'departments', 'attendance', 'leave_requests', 'leave_types',
        'leave_balances', 'payroll_runs', 'payroll_records', 'payroll_items',
        'training_records', 'performance_reviews', 'merit_entries', 'appraisals',
        'jobs', 'recruitment_candidates', 'job_postings', 'job_applications',
        'org_chart', 'reporting_structure', 'positions',
    },
    'core': {
        'businesses', 'invites', 'business_entitlements', 'business_subscriptions',
        'business_branding', 'settings', 'notifications', 'user_mfa',
        'api_keys', 'user_devices',
    },
}

ALL_LAYER1 = set()
for v in LAYER1.values():
    ALL_LAYER1 |= v

INTELLIGENCE_TABLES = {
    'business_events', 'business_event_handlers', 'business_event_destinations',
    'entity_freshness', 'entity_freshness_status', 'business_relationships',
    'recursive_neighbors', 'link_entities', 'claims', 'metric_definitions',
    'kpi_metrics', 'business_health_scores', 'health_metric_map',
    'strategic_objectives', 'key_results', 'business_risks',
    'self_audit_findings', 'data_quality_checks', 'action_reversals',
    'decision_log', 'organizational_memory', 'reality_gaps',
    'usage_events', 'intelligence_notification_log',
    'approvals', 'approval_actions', 'approval_requests',
    'audit_logs', 'audit_trail',
}


def _layer1_group(tbl):
    for group, tables in LAYER1.items():
        if tbl in tables:
            return group
    return 'core'


def _is_storage_from(content, match_start):
    """Check if a .from() match is preceded by .storage (possibly across
    whitespace/newlines). Looks back up to 30 chars for 'storage'."""
    lookback = content[max(0, match_start - 30):match_start]
    return bool(re.search(r'storage\s*$', lookback))


def extract_frontend_tables():
    """Extract table names referenced via supabase.from('table').
    Excludes supabase.storage.from('bucket') — those are storage buckets,
    not table queries."""
    tables = set()
    pattern = re.compile(r"\.from\(['\"]([a-z_]+)['\"]\)")
    for root, _, files in os.walk(SRC_DIR):
        for f in files:
            if not f.endswith(('.ts', '.tsx')):
                continue
            path = os.path.join(root, f)
            try:
                with open(path, encoding='utf-8') as fh:
                    content = fh.read()
                for m in pattern.finditer(content):
                    if _is_storage_from(content, m.start()):
                        continue
                    tables.add(m.group(1))
            except Exception:
                pass
    return tables


def extract_frontend_rpcs():
    rpcs = set()
    pattern = re.compile(r"\.rpc\(['\"]([a-z_]+)['\"]\)")
    for root, _, files in os.walk(SRC_DIR):
        for f in files:
            if not f.endswith(('.ts', '.tsx')):
                continue
            path = os.path.join(root, f)
            try:
                with open(path, encoding='utf-8') as fh:
                    for m in pattern.finditer(fh.read()):
                        rpcs.add(m.group(1))
            except Exception:
                pass
    return rpcs


def extract_migration_tables():
    """Tables AND views — both satisfy a frontend .from() reference."""
    tables = {}
    for pattern_str in [
        r"CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?([a-z_]+)",
        r"CREATE\s+(?:OR REPLACE\s+)?VIEW\s+(?:public\.)?([a-z_]+)",
    ]:
        pattern = re.compile(pattern_str, re.IGNORECASE)
        for f in sorted(os.listdir(MIGRATIONS_DIR)):
            if not f.endswith('.sql'):
                continue
            path = os.path.join(MIGRATIONS_DIR, f)
            try:
                with open(path, encoding='utf-8') as fh:
                    for m in pattern.finditer(fh.read()):
                        tbl = m.group(1).lower()
                        tables.setdefault(tbl, []).append(f)
            except Exception:
                pass
    # Storage buckets: INSERT INTO storage.buckets (id, name, ...) VALUES (..., 'name', ...)
    pattern = re.compile(
        r"INSERT\s+INTO\s+storage\.buckets\s*\([^)]*\)\s*VALUES?\s*\([^)]*['\"]([a-z_]+)['\"]",
        re.IGNORECASE | re.DOTALL,
    )
    for f in sorted(os.listdir(MIGRATIONS_DIR)):
        if not f.endswith('.sql'):
            continue
        path = os.path.join(MIGRATIONS_DIR, f)
        try:
            with open(path, encoding='utf-8') as fh:
                for m in pattern.finditer(fh.read()):
                    tbl = m.group(1).lower()
                    tables.setdefault(tbl, []).append(f + ' (storage bucket)')
        except Exception:
            pass
    return tables


def extract_migration_rpcs():
    rpcs = {}
    pattern = re.compile(r"CREATE\s+(?:OR REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_]+)\s*\(", re.IGNORECASE)
    for f in sorted(os.listdir(MIGRATIONS_DIR)):
        if not f.endswith('.sql'):
            continue
        path = os.path.join(MIGRATIONS_DIR, f)
        try:
            with open(path, encoding='utf-8') as fh:
                for m in pattern.finditer(fh.read()):
                    rpc = m.group(1).lower()
                    rpcs.setdefault(rpc, []).append(f)
        except Exception:
            pass
    return rpcs


def find_frontend_consumers(table_name):
    """Find which frontend files reference a table (not storage bucket)."""
    consumers = set()
    pattern = re.compile(rf"\.from\(['\"]{re.escape(table_name)}['\"]\)")
    for root, _, files in os.walk(SRC_DIR):
        for f in files:
            if not f.endswith(('.ts', '.tsx')):
                continue
            path = os.path.join(root, f)
            try:
                with open(path, encoding='utf-8') as fh:
                    content = fh.read()
                for m in pattern.finditer(content):
                    if _is_storage_from(content, m.start()):
                        continue
                    consumers.add(os.path.relpath(path, SRC_DIR))
                    break
            except Exception:
                pass
    return sorted(consumers)


def classify_table(tbl, has_migration, consumers):
    if not has_migration:
        return 'F', 'Frontend references table with no backing migration'
    if not consumers:
        return 'D', 'No active frontend consumer found'
    if tbl in ALL_LAYER1:
        return 'A', f'Layer 1 required ({_layer1_group(tbl)})'
    if tbl in INTELLIGENCE_TABLES:
        return 'B', 'Intelligence/event infrastructure (preserve)'
    return 'C', 'Future/extended feature (outside Layer 1)'


def main():
    frontend_tables = extract_frontend_tables()
    frontend_rpcs = extract_frontend_rpcs()
    migration_tables = extract_migration_tables()
    migration_rpcs = extract_migration_rpcs()

    matrix = []
    for tbl in sorted(frontend_tables):
        has_migration = tbl in migration_tables
        consumers = find_frontend_consumers(tbl)
        cls, reason = classify_table(tbl, has_migration, consumers)
        matrix.append({
            'table': tbl,
            'classification': cls,
            'reason': reason,
            'has_migration': has_migration,
            'migration_sources': migration_tables.get(tbl, []),
            'layer1': tbl in ALL_LAYER1,
            'layer1_group': _layer1_group(tbl) if tbl in ALL_LAYER1 else None,
            'is_intelligence': tbl in INTELLIGENCE_TABLES,
            'frontend_consumers': consumers,
            'consumer_count': len(consumers),
            'deployment_status': 'UNKNOWN',
        })

    rpc_reconciliation = []
    for rpc in sorted(frontend_rpcs):
        rpc_reconciliation.append({
            'rpc': rpc,
            'has_migration': rpc in migration_rpcs,
            'migration_sources': migration_rpcs.get(rpc, []),
        })

    classification_counts = defaultdict(int)
    for row in matrix:
        classification_counts[row['classification']] += 1

    layer1_tables = sorted(ALL_LAYER1 & frontend_tables)
    layer1_missing = sorted(ALL_LAYER1 & frontend_tables - set(migration_tables.keys()))

    summary = {
        'frontend_tables_total': len(frontend_tables),
        'migration_tables_total': len(migration_tables),
        'frontend_rpcs_total': len(frontend_rpcs),
        'migration_rpcs_total': len(migration_rpcs),
        'rpcs_with_migration': sum(1 for r in frontend_rpcs if r in migration_rpcs),
        'rpcs_without_migration': sum(1 for r in frontend_rpcs if r not in migration_rpcs),
        'classification_counts': dict(classification_counts),
        'layer1_tables_count': len(layer1_tables),
        'layer1_missing_migration': layer1_missing,
    }

    out_dir = os.path.join(REPO, 'supabase', 'reconciliation')
    os.makedirs(out_dir, exist_ok=True)

    with open(os.path.join(out_dir, 'RECONCILIATION_MATRIX.md'), 'w') as f:
        f.write("# Supabase Reconciliation Matrix\n\n")
        f.write("Generated by `scripts/generate_reconciliation_matrix.py`.\n")
        f.write("Classifies every frontend-referenced table against migration coverage.\n\n")
        f.write("## Summary\n\n")
        f.write(f"| Metric | Count |\n|--------|-------|\n")
        f.write(f"| Frontend-referenced tables | {summary['frontend_tables_total']} |\n")
        f.write(f"| Migration-defined tables | {summary['migration_tables_total']} |\n")
        f.write(f"| Frontend-referenced RPCs | {summary['frontend_rpcs_total']} |\n")
        f.write(f"| RPCs with backing migration | {summary['rpcs_with_migration']} |\n")
        f.write(f"| RPCs WITHOUT migration | {summary['rpcs_without_migration']} |\n\n")
        f.write("### Classification\n\n")
        f.write("| Class | Description | Count |\n|-------|-------------|-------|\n")
        for cls in sorted(classification_counts):
            desc = {
                'A': 'Layer 1 Required (CRM/Inventory/Accounting/HR)',
                'B': 'Existing infrastructure (intelligence/event — preserve)',
                'C': 'Future/extended feature (outside Layer 1)',
                'D': 'Orphaned/dead frontend dependency',
                'E': 'Partially implemented backend',
                'F': 'Migration drift (no backing migration)',
            }.get(cls, '')
            f.write(f"| {cls} | {desc} | {classification_counts[cls]} |\n")
        f.write(f"\n### Layer 1 ({summary['layer1_tables_count']} tables)\n\n")
        f.write(f"Layer 1 tables with missing migrations ({len(layer1_missing)}): "
                f"{', '.join(layer1_missing) or 'none'}\n\n")
        f.write("## Full Matrix\n\n")
        f.write("| Table | Class | Reason | Migration? | Consumers | Layer1 | Intelligence |\n")
        f.write("|-------|-------|--------|------------|-----------|--------|--------------|\n")
        for row in matrix:
            f.write(f"| `{row['table']}` | {row['classification']} | {row['reason']} | "
                    f"{'yes' if row['has_migration'] else 'NO'} | {row['consumer_count']} | "
                    f"{'yes' if row['layer1'] else ''} | {'yes' if row['is_intelligence'] else ''} |\n")
        f.write("\n## RPC Reconciliation\n\n")
        f.write("| RPC | Has Migration? | Migration Sources |\n|-----|----------------|-------------------|\n")
        for r in rpc_reconciliation:
            f.write(f"| `{r['rpc']}` | {'yes' if r['has_migration'] else 'NO'} | "
                    f"{', '.join(os.path.basename(s) for s in r['migration_sources'][:3])} |\n")

    manifest = {
        'generated_by': 'scripts/generate_reconciliation_matrix.py',
        'note': 'deployment_status=UNKNOWN for all until live DB checked. '
                'has_migration = a CREATE TABLE exists in migrations.',
        'summary': summary,
        'tables': matrix,
        'rpcs': rpc_reconciliation,
    }
    with open(os.path.join(out_dir, 'schema_manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"Matrix: {summary['frontend_tables_total']} frontend tables, "
          f"{summary['migration_tables_total']} migration tables")
    print(f"Classification: {dict(classification_counts)}")
    print(f"Layer 1: {summary['layer1_tables_count']} tables, "
          f"{len(layer1_missing)} missing migrations")
    print(f"RPCs: {summary['rpcs_with_migration']}/{summary['frontend_rpcs_total']} have migrations, "
          f"{summary['rpcs_without_migration']} missing")
    print(f"Output: supabase/reconciliation/RECONCILIATION_MATRIX.md + schema_manifest.json")


if __name__ == '__main__':
    main()
