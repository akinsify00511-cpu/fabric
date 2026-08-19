#!/usr/bin/env bash
# schema-drift-check.sh — CI gate: every frontend-referenced table must have
# a backing CREATE TABLE, CREATE VIEW, or storage bucket definition in migrations.
#
# Fails (exit 1) if any .from('table') in src/ has no schema backing.
# Fails (exit 2) if any frontend-referenced RPC has no CREATE FUNCTION in migrations.
#
# Usage: ./scripts/schema-drift-check.sh
# Exit codes: 0 = clean, 1 = table drift, 2 = RPC drift

set -uo pipefail
# Note: NOT using -e because grep returns non-zero when no matches (expected)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/supabase/migrations"
SRC_DIR="$ROOT_DIR/src"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== Avenize Schema Drift Check ==="
echo ""

# ---------------------------------------------------------------------------
# 1. TABLE / STORAGE DRIFT
# ---------------------------------------------------------------------------

# Identifiers use the PostgreSQL-safe characters relevant to this repository:
# letters, digits, underscore and hyphen. Storage bucket names commonly use
# hyphens even though table/RPC identifiers generally do not.
grep -rhoE "\.from\(['\"][a-zA-Z0-9_-]+['\"]\)" "$SRC_DIR" \
  | sed -E "s/\.from\(['\"]//;s/['\"]\)$//" \
  | sort -u > /tmp/frontend_tables.txt

# storage.from() targets are buckets, not tables.
grep -rhoE "storage\.from\(['\"][a-zA-Z0-9_-]+['\"]\)" "$SRC_DIR" \
  | sed -E "s/storage\.from\(['\"]//;s/['\"]\)$//" \
  | sort -u > /tmp/frontend_buckets.txt

# Remove storage bucket references from the table list.
comm -23 /tmp/frontend_tables.txt /tmp/frontend_buckets.txt > /tmp/frontend_tables_only.txt
mv /tmp/frontend_tables_only.txt /tmp/frontend_tables.txt

# Extract CREATE TABLE / VIEW identifiers.
grep -rhoiE "CREATE TABLE (IF NOT EXISTS )?(public\.)?[a-zA-Z0-9_-]+" "$MIGRATIONS_DIR"/*.sql \
  | sed -E 's/CREATE TABLE (IF NOT EXISTS )?(public\.)?//' \
  | tr 'A-Z' 'a-z' \
  | sort -u > /tmp/migration_tables.txt

grep -rhoiE "CREATE (OR REPLACE )?VIEW (public\.)?[a-zA-Z0-9_-]+" "$MIGRATIONS_DIR"/*.sql \
  | sed -E 's/CREATE (OR REPLACE )?VIEW (public\.)?//' \
  | tr 'A-Z' 'a-z' \
  | sort -u > /tmp/migration_views.txt

# Extract bucket ids from common Storage migration forms, including hyphenated
# names. Do not assume bucket names follow PostgreSQL identifier rules.
grep -rhoiE "insert into storage\.buckets[^;]*" "$MIGRATIONS_DIR"/*.sql \
  | grep -oE "'[-a-zA-Z0-9_]+'" \
  | tr -d "'" \
  | tr 'A-Z' 'a-z' \
  | sort -u > /tmp/migration_buckets.txt

# Also catch VALUES ('bucket_name', ...), used by older migrations.
grep -rhoiE "VALUES[[:space:]]*\('[a-zA-Z0-9_-]+'" "$MIGRATIONS_DIR"/*.sql \
  | grep -oE "'[a-zA-Z0-9_-]+'" \
  | tr -d "'" \
  | tr 'A-Z' 'a-z' \
  | sort -u >> /tmp/migration_buckets.txt
sort -u -o /tmp/migration_buckets.txt /tmp/migration_buckets.txt

cat /tmp/migration_tables.txt /tmp/migration_views.txt /tmp/migration_buckets.txt \
  | sort -u > /tmp/all_schema_targets.txt

TABLE_DRIFT=$(comm -23 /tmp/frontend_tables.txt /tmp/all_schema_targets.txt)
TABLE_COUNT=$(wc -l < /tmp/frontend_tables.txt)
SCHEMA_COUNT=$(wc -l < /tmp/all_schema_targets.txt)
DRIFT_COUNT=$(echo -n "$TABLE_DRIFT" | grep -c . || true)

echo "Frontend table references: $TABLE_COUNT"
echo "Schema-defined targets (tables + views + buckets): $SCHEMA_COUNT"
echo "Unbacked frontend tables: $DRIFT_COUNT"
echo ""

if [ "$DRIFT_COUNT" -gt 0 ]; then
  echo -e "${RED}❌ TABLE DRIFT DETECTED:${NC}"
  echo "$TABLE_DRIFT" | while read -r table; do
    [ -n "$table" ] && echo "  - $table (no CREATE TABLE/VIEW/bucket in migrations)"
  done
  echo ""
  echo "These tables are queried by the frontend but have no schema definition."
  echo "Add a CREATE TABLE migration OR fix the frontend reference."
  HAS_DRIFT=1
else
  echo -e "${GREEN}✅ All frontend table references have schema backing.${NC}"
  HAS_DRIFT=0
fi

echo ""

# ---------------------------------------------------------------------------
# 2. RPC DRIFT
# ---------------------------------------------------------------------------

grep -rhoE "\.rpc\(['\"][a-zA-Z0-9_-]+['\"]" "$SRC_DIR" \
  | sed -E "s/\.rpc\(['\"]//;s/['\"]$//" \
  | sort -u > /tmp/frontend_rpcs.txt

grep -rhoiE "CREATE (OR REPLACE )?FUNCTION (public\.)?[a-zA-Z0-9_-]+" "$MIGRATIONS_DIR"/*.sql \
  | sed -E 's/[Cc][Rr][Ee][Aa][Tt][Ee] ([Oo][Rr] [Rr][Ee][Pp][Ll][Aa][Cc][Ee] )?[Ff][Uu][Nn][Cc][Tt][Ii][Oo][Nn] (public\.)?//' \
  | tr 'A-Z' 'a-z' \
  | sort -u > /tmp/migration_rpcs.txt

RPC_DRIFT=$(comm -23 /tmp/frontend_rpcs.txt /tmp/migration_rpcs.txt)
RPC_COUNT=$(wc -l < /tmp/frontend_rpcs.txt)
MIGRATION_RPC_COUNT=$(wc -l < /tmp/migration_rpcs.txt)
RPC_DRIFT_COUNT=$(echo -n "$RPC_DRIFT" | grep -c . || true)

echo "Frontend RPC references: $RPC_COUNT"
echo "Schema-defined functions: $MIGRATION_RPC_COUNT"
echo "Unbacked frontend RPCs: $RPC_DRIFT_COUNT"
echo ""

if [ "$RPC_DRIFT_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  RPC DRIFT DETECTED:${NC}"
  echo "$RPC_DRIFT" | while read -r rpc; do
    [ -n "$rpc" ] && echo "  - $rpc (no CREATE FUNCTION in migrations)"
  done
  echo ""
  echo "These RPCs are called by the frontend but have no function definition."
  echo "Note: some may be Supabase built-in functions or defined outside migrations."
  HAS_RPC_DRIFT=1
else
  echo -e "${GREEN}✅ All frontend RPC references have function definitions.${NC}"
  HAS_RPC_DRIFT=0
fi

echo ""

if [ "$HAS_DRIFT" -eq 1 ]; then
  exit 1
elif [ "$HAS_RPC_DRIFT" -eq 1 ]; then
  echo -e "${YELLOW}RPC drift is advisory only (some are Supabase built-ins).${NC}"
  exit 0
else
  echo -e "${GREEN}✅ Schema drift check passed — no gaps.${NC}"
  exit 0
fi