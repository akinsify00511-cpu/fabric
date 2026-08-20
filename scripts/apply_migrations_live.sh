#!/usr/bin/env bash
# apply_migrations_live.sh — apply the full migration chain to the LIVE
# Supabase database (project kgsgqvatyleetyquffya).
#
# The live DB was hand-managed (no supabase_migrations tracking) and has
# drifted from the repo chain (e.g. staff.is_active instead of staff.active,
# businesses.slug missing, most post-060 objects absent). This script applies
# every migration in filename order, logs per-file OK/FAIL, and runs a second
# pass so that failures caused by an earlier failure get a retry after their
# dependencies landed. Migrations are written to be idempotent
# (CREATE OR REPLACE / IF NOT EXISTS), so re-running is safe.
#
# Usage:
#   export SUPABASE_DB_URL='postgresql://postgres:<password>@db.kgsgqvatyleetyquffya.supabase.co:5432/postgres'
#   scripts/apply_migrations_live.sh
#
# Get SUPABASE_DB_URL from: Supabase Dashboard → Project Settings → Database →
# Connection string → "Direct connection" (use the session pooler port 5432
# if your network blocks the direct port).
#
# Output: supabase/migration_apply_report.txt (per-file status + failure list)

set -u
cd "$(dirname "$0")/.."

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "ERROR: set SUPABASE_DB_URL first." >&2
  exit 2
fi

REPORT="supabase/migration_apply_report.txt"
: > "$REPORT"

apply_pass() {
  local pass="$1"
  local ok=0 fail=0
  for f in $(ls supabase/migrations/*.sql | sort); do
    local name
    name=$(basename "$f")
    # Skip files that already applied cleanly in a previous pass.
    if grep -q "^OK $name" "$REPORT"; then continue; fi
    if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/tmp/mig_apply_out.txt 2>&1; then
      echo "OK $name" >> "$REPORT"
      ok=$((ok+1))
    else
      echo "FAIL(pass$pass) $name" >> "$REPORT"
      echo "--- error for $name ---" >> "$REPORT"
      tail -5 /tmp/mig_apply_out.txt >> "$REPORT"
      fail=$((fail+1))
      echo "FAIL: $name"
    fi
  done
  echo "pass $pass: $ok applied, $fail failed"
}

echo "== pass 1 =="
apply_pass 1
echo "== pass 2 (retry failures) =="
apply_pass 2

TOTAL=$(ls supabase/migrations/*.sql | wc -l)
APPLIED=$(grep -c "^OK " "$REPORT" || true)
echo ""
echo "RESULT: $APPLIED / $TOTAL migrations applied. Full report: $REPORT"
grep "^FAIL" "$REPORT" | sort -u || echo "no failures"
