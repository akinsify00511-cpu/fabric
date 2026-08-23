#!/usr/bin/env bash
# Avenize Production Contract verification.
#
# Fails (exit 1) if any expected production object is missing. This is the
# deploy gate: a frontend deployment is NOT "successful" because Vercel built
# it — it is successful when this script prints PRODUCTION READY.
#
# Required env:
#   SUPABASE_URL   e.g. https://<ref>.supabase.co
#   SUPABASE_KEY   publishable key (service role key gives deeper checks)
# Optional env:
#   APP_URL        e.g. https://avenize.riverwayse.com (frontend smoke check)
set -u

BASE="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"; BASE="${BASE%/}"
KEY="${SUPABASE_KEY:-${SUPABASE_ANON_KEY:-${VITE_SUPABASE_ANON_KEY:-}}}"
APP_URL="${APP_URL:-}"
PASS=0
FAIL=0

line()  { printf '%s\n' "$*"; }
pass()  { PASS=$((PASS+1)); line "$(printf '%-16s PASS  %s' "$1" "$2")"; }
fail()  { FAIL=$((FAIL+1)); line "$(printf '%-16s FAIL  %s' "$1" "$2")"; }

# Self-calibration: when no Supabase URL/key was provided, recover them from
# the deployed frontend bundle (the publishable pair is deliberately embedded
# in the public JS; RLS remains the boundary). Only the publishable key is
# discovered — never a service role.
if [ -n "$APP_URL" ] && { [ -z "$BASE" ] || [ -z "$KEY" ]; }; then
  INDEX=$(curl -fs "$APP_URL/" 2>/dev/null)
  BUNDLE=$(printf '%s' "$INDEX" | grep -oE '/assets/[A-Za-z0-9_-]+\.js' | head -1)
  if [ -n "$BUNDLE" ]; then
    JS=$(curl -fs "${APP_URL}${BUNDLE}" 2>/dev/null)
    SB_URL=$(printf '%s' "$JS" | grep -oE 'https://[0-9a-z]+\.supabase\.co' | head -1)
    SB_KEY=$(printf '%s' "$JS" | grep -oE 'sb_publishable_[A-Za-z0-9_\-]+' | head -1)
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

# Hand the self-calibrated values to every child process (the python verifier
# reads SUPABASE_URL/SUPABASE_KEY from its own environment).
export SUPABASE_URL="$BASE"
export SUPABASE_KEY="$KEY"

line ""
line "Avenize Production Contract"
line "────────────────────────────"
line ""

# --- Auth: the GoTrue health endpoint must answer ---
code=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $KEY" "$BASE/auth/v1/health" || true)
[ "$code" = "200" ] && pass "Auth" "health endpoint reachable" || fail "Auth" "health endpoint HTTP $code"

# --- Database / RPC contracts / RLS-surface / Storage: the full contract ---
if python3 scripts/verify_production_contract.py --frontend-only > /tmp/avenize-contract-check.txt 2>&1; then
  pass "Database" "all frontend-referenced tables/views present"
  pass "RPC contracts" "all frontend-referenced RPCs present, signatures match"
else
  cat /tmp/avenize-contract-check.txt | head -40
  fail "Database/RPC" "contract broken — see supabase/contract/verification_report.json"
fi

# --- Payments: the payment subsystem contract objects ---
for rpc in request_plan_payment plan_price_cents my_payment_request; do
  detail=$(curl -s -X POST "$BASE/rest/v1/rpc/$rpc" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{}' || true)
  if printf '%s' "$detail" | grep -q "no matches found in the schema cache"; then
    fail "Payments" "rpc $rpc missing"
  fi
done
missing_pay=0
for fn in subscription-management paystack-webhook paystack-verify; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H "apikey: $KEY" "$BASE/functions/v1/$fn" || true)
  [ "$code" = "404" ] && missing_pay=1 && line "$(printf '%-16s FAIL  edge function %s missing' 'Payments' "$fn")"
done
[ "$missing_pay" = "0" ] && pass "Payments" "checkout + webhook + verify edge functions deployed" || FAIL=$((FAIL+1))

# --- Email: the email subsystem contract objects ---
detail=$(curl -s -X POST "$BASE/rest/v1/rpc/queue_email" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{}' || true)
if printf '%s' "$detail" | grep -q "no matches found in the schema cache"; then
  fail "Email" "rpc queue_email missing"
fi
missing_mail=0
for fn in email-service resend-webhook; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H "apikey: $KEY" "$BASE/functions/v1/$fn" || true)
  [ "$code" = "404" ] && missing_mail=1 && line "$(printf '%-16s FAIL  edge function %s missing' 'Email' "$fn")"
done
[ "$missing_mail" = "0" ] && pass "Email" "email service + delivery webhook deployed" || FAIL=$((FAIL+1))

# --- Frontend: the deployed app must actually serve a bundle ---
if [ -n "${APP_URL:-}" ]; then
  body=$(curl -s --max-time 20 "$APP_URL" || true)
  if printf '%s' "$body" | grep -q '/assets/index-'; then
    pass "Frontend" "$APP_URL serves the current SPA shell"
  else
    fail "Frontend" "$APP_URL did not return the SPA shell"
  fi
else
  line "$(printf '%-16s SKIP  APP_URL not set' 'Frontend')"
fi

line ""
if [ "$FAIL" = "0" ]; then
  line "RESULT: PRODUCTION READY"
  exit 0
else
  line "RESULT: NOT READY ($FAIL failing checks)"
  exit 1
fi
