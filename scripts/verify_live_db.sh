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

probe_table() { # desc path expected_fragment
  local desc="$1" path="$2" want="$3"
  local body code
  code=$(curl -s -o /tmp/verify_resp.json -w "%{http_code}" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" "$S/rest/v1/$path")
  body=$(head -c 300 /tmp/verify_resp.json | tr -d '\n')
  if echo "$body" | grep -q "$want"; then echo "FAIL  $desc -> [$code] $body"; else echo "ok    $desc -> [$code]"; fi
}

probe_rpc() { # desc fn
  local desc="$1" fn="$2"
  local body code
  code=$(curl -s -o /tmp/verify_resp.json -w "%{http_code}" -X POST -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{}' "$S/rest/v1/rpc/$fn")
  body=$(head -c 300 /tmp/verify_resp.json | tr -d '\n')
  if echo "$body" | grep -q "no matches were found in the schema cache"; then echo "FAIL  $desc -> MISSING [$code]"; else echo "ok    $desc -> [$code] (exists; arg errors are expected with {})"; fi
}

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

echo "-- RPCs (PGRST202 = still missing) --"
for fn in create_business_and_owner check_auth_rate_limit record_auth_failure \
          reset_auth_rate_limit log_security_event business_brain \
          can_access_module current_metrics open_recommendations \
          business_value_ledger profitability_leakage feature_discovery \
          recommend_plan trial_assistance create_subsidiary; do
  probe_rpc "$fn" "$fn"
done
