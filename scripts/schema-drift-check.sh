#!/usr/bin/env bash
# schema-drift-check.sh — CI gate for frontend database/storage references.
set -uo pipefail

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

# Use Perl's slurp mode for SQL definitions so CREATE TABLE statements that
# span lines, use public. qualification, or vary whitespace are recognized.
# This avoids the false negatives caused by line-oriented grep parsing.
extract_sql_targets() {
  local pattern="$1"
  local output="$2"
  : > "$output"
  for file in "$MIGRATIONS_DIR"/*.sql; do
    perl -0777 -ne "$pattern" "$file" >> "$output" 2>/dev/null || true
  done
  tr 'A-Z' 'a-z' < "$output" | sort -u > "${output}.sorted"
  mv "${output}.sorted" "$output"
}

# ---------------------------------------------------------------------------
# 1. TABLE / STORAGE DRIFT
# ---------------------------------------------------------------------------
grep -rhoE "\.from\(['\"][a-zA-Z0-9_-]+['\"]\)" "$SRC_DIR" \
  | sed -E "s/\.from\(['\"]//;s/['\"]\)$//" \
  | sort -u > /tmp/frontend_tables.txt

grep -rhoE "storage\.from\(['\"][a-zA-Z0-9_-]+['\"]\)" "$SRC_DIR" \
  | sed -E "s/storage\.from\(['\"]//;s/['\"]\)$//" \
  | sort -u > /tmp/frontend_buckets.txt

comm -23 /tmp/frontend_tables.txt /tmp/frontend_buckets.txt > /tmp/frontend_tables_only.txt
mv /tmp/frontend_tables_only.txt /tmp/frontend_tables.txt

extract_sql_targets \
  'while (/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["'"'"']?([a-zA-Z0-9_-]+)["'"'"']?/ig) { print "$1\n"; }' \
  /tmp/migration_tables.txt

extract_sql_targets \
  'while (/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?["'"'"']?([a-zA-Z0-9_-]+)["'"'"']?/ig) { print "$1\n"; }' \
  /tmp/migration_views.txt

# Bucket IDs are values, not PostgreSQL identifiers. Support the repository's
# INSERT ... VALUES form without assuming underscores only.
: > /tmp/migration_buckets.txt
for file in "$MIGRATIONS_DIR"/*.sql; do
  perl -0777 -ne 'while (/INSERT\s+INTO\s+storage\.buckets[\s\S]*?VALUES\s*\(\s*['"'"']([a-zA-Z0-9_-]+)['"'"']/ig) { print "$1\n"; }' "$file" >> /tmp/migration_buckets.txt 2>/dev/null || true
done
tr 'A-Z' 'a-z' < /tmp/migration_buckets.txt | sort -u -o /tmp/migration_buckets.txt

cat /tmp/migration_tables.txt /tmp/migration_views.txt /tmp/migration_buckets.txt \
  | sort -u > /tmp/all_schema_targets.txt

TABLE_DRIFT=$(comm -23 /tmp/frontend_tables.txt /tmp/all_schema_targets.txt)
TABLE_COUNT=$(wc -l < /tmp/frontend_tables.txt)
SCHEMA_COUNT=$(wc -l < /tmp/all_schema_targets.txt)
DRIFT_COUNT=$(printf '%s\n' "$TABLE_DRIFT" | grep -c . || true)

echo "Frontend table references: $TABLE_COUNT"
echo "Schema-defined targets (tables + views + buckets): $SCHEMA_COUNT"
echo "Unbacked frontend tables: $DRIFT_COUNT"
echo ""

if [ "$DRIFT_COUNT" -gt 0 ]; then
  echo -e "${RED}❌ TABLE DRIFT DETECTED:${NC}"
  printf '%s\n' "$TABLE_DRIFT" | while read -r table; do
    [ -n "$table" ] && echo "  - $table (no CREATE TABLE/VIEW/bucket in migrations)"
  done
  echo ""
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

extract_sql_targets \
  'while (/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?["'"'"']?([a-zA-Z0-9_-]+)["'"'"']?\s*\(/ig) { print "$1\n"; }' \
  /tmp/migration_rpcs.txt

RPC_DRIFT=$(comm -23 /tmp/frontend_rpcs.txt /tmp/migration_rpcs.txt)
RPC_COUNT=$(wc -l < /tmp/frontend_rpcs.txt)
MIGRATION_RPC_COUNT=$(wc -l < /tmp/migration_rpcs.txt)
RPC_DRIFT_COUNT=$(printf '%s\n' "$RPC_DRIFT" | grep -c . || true)

echo "Frontend RPC references: $RPC_COUNT"
echo "Schema-defined functions: $MIGRATION_RPC_COUNT"
echo "Unbacked frontend RPCs: $RPC_DRIFT_COUNT"
echo ""

if [ "$RPC_DRIFT_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}⚠️ RPC DRIFT DETECTED:${NC}"
  printf '%s\n' "$RPC_DRIFT" | while read -r rpc; do
    [ -n "$rpc" ] && echo "  - $rpc"
  done
  echo ""
  HAS_RPC_DRIFT=1
else
  echo -e "${GREEN}✅ All frontend RPC references have function definitions.${NC}"
  HAS_RPC_DRIFT=0
fi

echo ""

if [ "$HAS_DRIFT" -eq 1 ]; then
  exit 1
fi
if [ "$HAS_RPC_DRIFT" -eq 1 ]; then
  echo -e "${YELLOW}RPC drift is advisory only.${NC}"
fi

echo -e "${GREEN}✅ Schema drift check passed — no hard gaps.${NC}"
exit 0
