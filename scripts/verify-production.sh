#!/usr/bin/env bash
# Avenize Production Contract verification.
#
# Fails (exit 1) if any expected production object is missing or a required
# live subsystem probe fails. A Vercel build/deploy alone is never a production
# readiness signal.
#
# Required env:
#   SUPABASE_URL   e.g. https://<ref>.supabase.co
#   SUPABASE_KEY   publishable key (service role key gives deeper checks)
# Optional env:
#   SUPABASE_SERVICE_ROLE_KEY  service role key for authoritative checks
#   APP_URL        e.g. https://app.avenize.com
set -u

BASE="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"; BASE="${BASE%/}"
KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_KEY:-${SUPABASE_ANON_KEY:-${VITE_SUPABASE_ANON_KEY:-}}}}"
APP_URL="${APP_URL:-https://app.avenize.com}"
PASS=0
FAIL=0

line()  { printf '%s\n' "$*"; }
pass()  { PASS=$((PASS+1)); line "$(printf '%-16s PASS  %s' "$1" "$2")"; }
fail()  { FAIL=$((FAIL+1)); line "$(printf '%-16s FAIL  %s' "$1" "$2")"; }

# Self-calibration: recover only the public Supabase URL/key from the deployed
# frontend when explicit values are not supplied. Never discover a service role.
if [ -n "$APP_URL" ] && { [ -z "$BASE" ] || [ -z "$KEY" ]; }; then
  INDEX=$(curl -fs "$APP_URL/" 2>/dev/null || true)
  BUNDLE=$(printf '%s' "$INDEX" | grep -oE '/assets/[A-Za-z0-9_-]+\.js' | head -1)
  if [ -n "$BUNDLE" ]; then
    JS=$(curl -fs "${APP_URL}${BUNDLE}" 2>/dev/null || true)
    SB_URL=$(printf '%s' "$JS" | grep -oE 'https://[0-9a-z]+\.supabase\.co' | head -1)
    SB_KEY=$(printf '%s' "$JS" | grep -oE 'sb_(publishable|anon)_[A-Za-z0-9_\-]+' | head -1)
    if [ -n "$SB_URL" ] && [ -n "$SB_KEY" ]; then
      BASE="$SB_URL"; KEY="$SB_KEY"
      line "self-calibrated Supabase URL+publishable key from $APP_URL"
    fi
  fi
fi

if [ -z "$BASE" ] || [ -z "$KEY" ]; then
  line "ERROR: set SUPABASE_URL/SUPABASE_KEY (or pass APP_URL to self-calibrate)"
  exit 2
fi

export SUPABASE_URL="$BASE"
export SUPABASE_KEY="$KEY"

line ""
line "Avenize Production Contract"
line "────────────────────────────"
line ""

# --- Auth ---
code=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $KEY" "$BASE/auth/v1/health" || true)
[ "$code" = "200" ] && pass "Auth" "health endpoint reachable" || fail "Auth" "health endpoint HTTP $code"

# --- Database / RPC contracts / RLS-surface / Storage ---
if python3 scripts/verify_production_contract.py --frontend-only > /tmp/avenize-contract-check.txt 2>&1; then
  pass "Database" "all frontend-referenced tables/views present"
  pass "RPC contracts" "all frontend-referenced RPCs present, signatures match"
else
  cat /tmp/avenize-contract-check.txt | head -60
  fail "Database/RPC" "contract broken — see supabase/contract/verification_report.json"
fi

# --- Payments: every required RPC must return a valid PostgREST response.
# 400 is acceptable for an empty test payload (it proves the RPC exists);
# 404/schema-cache misses and transport failures are not.
payment_rpc_fail=0
for rpc in request_plan_payment plan_price_cents my_payment_request; do
  code=$(curl -s -o /tmp/avenize-pay-rpc.txt -w '%{http_code}' -X POST "$BASE/rest/v1/rpc/$rpc" \
    -H "apikey: $KEY" -H 'Content-Type: application/json' -d '{}' || true)
  case "$code" in
    200|201|400|409|422) pass "Payments" "rpc $rpc reachable (HTTP $code)" ;;
    *) fail "Payments" "rpc $rpc unreachable (HTTP ${code:-none})"; payment_rpc_fail=1 ;;
  esac
done

missing_pay=0
for fn in subscription-management paystack-webhook paystack-verify; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H "apikey: $KEY" "$BASE/functions/v1/$fn" || true)
  case "$code" in
    200|204|400|401|403|405) pass "Payments" "edge function $fn reachable (HTTP $code)" ;;
    *) fail "Payments" "edge function $fn unreachable (HTTP ${code:-none})"; missing_pay=1 ;;
  esac
done

# --- Email ---
mail_rpc_fail=0
code=$(curl -s -o /tmp/avenize-mail-rpc.txt -w '%{http_code}' -X POST "$BASE/rest/v1/rpc/queue_email" \
  -H "apikey: $KEY" -H 'Content-Type: application/json' -d '{}' || true)
case "$code" in
  200|201|400|409|422) pass "Email" "rpc queue_email reachable (HTTP $code)" ;;
  *) fail "Email" "rpc queue_email unreachable (HTTP ${code:-none})"; mail_rpc_fail=1 ;;
esac

missing_mail=0
for fn in email-service resend-webhook; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H "apikey: $KEY" "$BASE/functions/v1/$fn" || true)
  case "$code" in
    200|204|400|401|403|405) pass "Email" "edge function $fn reachable (HTTP $code)" ;;
    *) fail "Email" "edge function $fn unreachable (HTTP ${code:-none})"; missing_mail=1 ;;
  esac
done

# --- Frontend ---
body=$(curl -s --max-time 20 "$APP_URL" || true)
if printf '%s' "$body" | grep -q '/assets/index-'; then
  pass "Frontend" "$APP_URL serves the SPA shell"
else
  fail "Frontend" "$APP_URL did not return the SPA shell"
fi

line ""
if [ "$FAIL" = "0" ]; then
  line "RESULT: PRODUCTION READY"
  exit 0
else
  line "RESULT: NOT READY ($FAIL failing checks)"
  exit 1
fi
