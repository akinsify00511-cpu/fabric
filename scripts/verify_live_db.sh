#!/usr/bin/env bash
# verify_live_db.sh — post-apply smoke probes against the LIVE Supabase
# project using the publishable (anon) key. Confirms the objects the
# frontend needs now exist in the schema cache.
#
# Usage:
#   export SUPABASE_ANON_KEY='sb_publishable_...'   # Project Settings → API
#   scripts/verify_live_db.sh
set -u
S="https://kgsgqvatyleetyquffya.supabase.co"
KEY="${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}"

# NOTE (2026-08-25): probes send the publishable key in the `apikey` header
# ONLY. Passing it as `Authorization: Bearer` too makes the gateway reject the
# request as an invalid JWT ("Invalid API key") and pollutes every verdict.

probe_table() { # desc path expected_fragment
  local desc="$1" path="$2" want="$3"
  local body code
  code=$(curl -s -o /tmp/verify_resp.json -w "%{http_code}" -H "apikey: $KEY" "$S/rest/v1/$path")
  body=$(head -c 300 /tmp/verify_resp.json | tr -d '\n')
  if echo "$body" | grep -q "$want"; then
    echo "FAIL  $desc -> [$code] $body"
  elif echo "$body" | grep -q "permission denied for function"; then
    # RLS evaluation itself is broken (get_current_staff not executable) —
    # object existence cannot be determined until the grant is repaired.
    echo "????  $desc -> INCONCLUSIVE [$code] $body"
  else
    echo "ok    $desc -> [$code]"
  fi
}

# Canonical wire contracts (production-verified 2026-08-25). {} is INVALID
# for parameterized RPCs — PostgREST answers PGRST202 argument-mismatch for
# an EXISTING function, which must not be reported as "missing".
rpc_body() {
  case "$1" in
    create_business_and_owner) printf '%s' '{"p_business_name":"verify-live-db probe","p_industry":"testing","p_staff_name":"probe","p_job_title":"probe"}' ;;
    business_brain|current_metrics|business_value_ledger|profitability_leakage|feature_discovery|recommend_plan|trial_assistance) printf '%s' '{"p_business_id":"00000000-0000-0000-0000-000000000000"}' ;;
    open_recommendations) printf '%s' '{"p_business_id":"00000000-0000-0000-0000-000000000000","p_limit":1}' ;;
    create_subsidiary) printf '%s' '{"p_name":"probe"}' ;;
    *) printf '%s' '{}' ;;
  esac
}

probe_rpc() { # desc fn
  local desc="$1" fn="$2"
  local body code
  code=$(curl -s -o /tmp/verify_resp.json -w "%{http_code}" -X POST -H "apikey: $KEY" -H "Content-Type: application/json" -d "$(rpc_body "$fn")" "$S/rest/v1/rpc/$fn")
  body=$(head -c 300 /tmp/verify_resp.json | tr -d '\n')
  # With the correct wire contract, PGRST202 unambiguously means the
  # (name, params) combination is not in the schema cache: genuinely absent
  # OR signature drift — either way the contract is broken, so show the body.
  if echo "$body" | grep -qE '"PGRST202"'; then
    echo "FAIL  $desc -> ABSENT/SIGNATURE-DRIFT [$code] $body"
  elif echo "$body" | grep -qE "permission denied for function"; then
    # Existence IS proven by a permission error. Whether the anon denial is a
    # defect depends on the function's intended grant surface (get_current_staff
    # MUST be anon-executable — RLS policies evaluate it; create_subsidiary is
    # intentionally authenticated-only, so anon 42501 there is correct).
    echo "EXISTS, GRANT-REVIEW  $desc -> [$code] $body"
  else
    echo "ok    $desc -> [$code] (exists; business/RLS outcomes expected)"
  fi
}

# get_current_staff is the tenant-isolation primitive: if anon/authenticated
# lack EXECUTE, EVERY RLS-protected table read fails with 42501. Probe first.
echo "-- tenant-identity primitive --"
probe_rpc "get_current_staff (EXECUTE grant)" "get_current_staff"

echo "-- tables/columns (400/404 = still missing) --"
probe_table "staff.active"            "staff?select=active&limit=1"                 "does not exist"
probe_table "staff.member_kind"       "staff?select=member_kind&limit=1"            "does not exist"
probe_table "businesses.slug"         "businesses?select=slug&limit=1"              "does not exist"
probe_table "leave_requests.start_date" "leave_requests?select=start_date&limit=1"  "does not exist"
probe_table "email_campaigns"         "email_campaigns?select=id&limit=1"           "Could not find the table"
probe_table "user_workspace_selections" "user_workspace_selections?select=user_id&limit=1" "Could not find the table"
probe_table "usage_events"            "usage_events?select=id&limit=1"              "Could not find the table"
probe_table "capture_attachments"     "capture_attachments?select=id&limit=1"       "Could not find the table"
probe_table "discovery_targets"       "discovery_targets?select=id&limit=1"         "Could not find the table"
probe_table "budgets"                 "budgets?select=id&limit=1"                   "Could not find the table"
probe_table "entity_freshness"        "entity_freshness?select=id&limit=1"          "Could not find the table"
probe_table "entity_freshness_status" "entity_freshness_status?select=id&limit=1"   "Could not find the table"

echo "-- RPCs (PGRST202 = still missing) --"
for fn in create_business_and_owner check_auth_rate_limit record_auth_failure \
          reset_auth_rate_limit log_security_event business_brain \
          can_access_module current_metrics open_recommendations \
          business_value_ledger profitability_leakage feature_discovery \
          recommend_plan trial_assistance create_subsidiary; do
  probe_rpc "$fn" "$fn"
done
