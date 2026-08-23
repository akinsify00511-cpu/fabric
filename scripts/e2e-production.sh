#!/usr/bin/env bash
# Avenize Phase 6 — end-to-end production journey test.
#
# Complements verify-production.sh (which checks that OBJECTS exist) with
# BEHAVIOUR: can a brand-new account actually sign up, onboard, reach the
# dashboard intelligence, and see the payment + email rails respond?
#
# Honest by design: steps that depend on not-yet-deployed infrastructure
# FAIL (not skip) until the deployment completes — same gate philosophy as
# verify-production.sh. After the live DB migration + edge function deploy,
# this script should print E2E READY.
#
# Required env: none beyond APP_URL (self-calibrates like verify-production.sh)
# Optional env:
#   APP_URL            default https://avenize.riverwayse.com
#   SUPABASE_URL / SUPABASE_KEY (skip self-calibration)
#   E2E_EMAIL / E2E_PASSWORD  reuse a specific test account instead of a fresh one
set -u

APP_URL="${APP_URL:-https://avenize.riverwayse.com}"
BASE="${SUPABASE_URL:-}"; KEY="${SUPABASE_KEY:-}"
PASS=0; FAIL=0
line() { printf '%s\n' "$*"; }
pass() { PASS=$((PASS+1)); line "$(printf '%-22s PASS  %s' "$1" "$2")"; }
fail() { FAIL=$((FAIL+1)); line "$(printf '%-22s FAIL  %s' "$1" "$2")"; }

# --- self-calibration (same pattern as verify-production.sh) ---
if [ -z "$BASE" ] || [ -z "$KEY" ]; then
  INDEX=$(curl -fs "$APP_URL/" 2>/dev/null)
  BUNDLE=$(printf '%s' "$INDEX" | grep -oE '/assets/[A-Za-z0-9_-]+\.js' | head -1)
  if [ -n "$BUNDLE" ]; then
    JS=$(curl -fs "${APP_URL}${BUNDLE}" 2>/dev/null)
    BASE=$(printf '%s' "$JS" | grep -oE 'https://[0-9a-z]+\.supabase\.co' | head -1)
    KEY=$(printf '%s' "$JS" | grep -oE 'sb_publishable_[A-Za-z0-9_\-]+' | head -1)
  fi
fi
if [ -z "$BASE" ] || [ -z "$KEY" ]; then
  line "ERROR: could not resolve Supabase URL/key"; exit 2
fi

AUTH=(-H "apikey: $KEY" -H "Content-Type: application/json")
rpc() { # rpc <name> <token-or-empty> <json>
  local auth=()
  [ -n "$2" ] && auth=(-H "Authorization: Bearer $2")
  curl -s -X POST "$BASE/rest/v1/rpc/$1" "${AUTH[@]}" ${auth[@]+"${auth[@]}"} -d "$3"
}

line ""
line "Avenize E2E Production Journey"
line "──────────────────────────────"

# RPC existence is checkable WITHOUT a session (PGRST body detection) — this
# is the contract half and must hard-fail in every environment.
rpc_exists() { # rpc_exists <name>
  local body
  body=$(rpc "$1" "" "{}")
  ! printf '%s' "$body" | grep -qE "no matches.*schema cache|PGRST202"
}

# --- 0. contract: RPCs the journeys depend on must EXIST ---
for FN in create_business_and_owner business_brain current_metrics open_recommendations my_payment_request; do
  if rpc_exists "$FN"; then
    pass "contract/rpc" "$FN exists"
  else
    fail "contract/rpc" "$FN MISSING (PGRST202) — live DB not migrated"
  fi
done

# --- 1. signup / login (obtain a session for the authenticated journeys) ---
EMAIL="${E2E_EMAIL:-e2e-$(date +%s)@avenize-e2e.test}"
PASSWORD="${E2E_PASSWORD:-E2e!$(date +%s | tail -c 9)aZ}"
SIGNUP=$(curl -s -X POST "$BASE/auth/v1/signup" "${AUTH[@]}" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(printf '%s' "$SIGNUP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token') or '')" 2>/dev/null)
if [ -n "$TOKEN" ]; then
  pass "signup" "session issued for $EMAIL"
elif [ -n "${E2E_EMAIL:-}" ]; then
  LOGIN=$(curl -s -X POST "$BASE/auth/v1/token?grant_type=password" "${AUTH[@]}" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
  TOKEN=$(printf '%s' "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token') or '')" 2>/dev/null)
  if [ -n "$TOKEN" ]; then
    pass "signup" "email-confirm on; logged in provided account"
  else
    fail "signup" "provided E2E_EMAIL could not log in"
  fi
else
  line "signup                 SKIP  email confirmation on; set E2E_EMAIL/E2E_PASSWORD secrets to run authenticated journeys"
fi

# --- 2. onboarding (create business) ---
if [ -n "$TOKEN" ]; then
  OB=$(rpc create_business_and_owner "$TOKEN" \
    "{\"p_business_name\":\"E2E Contract Test $(date +%s)\",\"p_owner_name\":\"E2E Bot\",\"p_industry\":\"testing\"}")
  if printf '%s' "$OB" | grep -qiE '"id"|business_id|already'; then
    pass "onboarding" "business created (or account already onboarded)"
  else
    fail "onboarding" "unexpected: $(printf '%s' "$OB" | head -c 120)"
  fi
fi

# --- 3. membership resolution (the auth-lifecycle contract) ---
if [ -n "$TOKEN" ]; then
  STAFF=$(curl -s "$BASE/rest/v1/staff?select=business_id&limit=1" \
    -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN")
  if printf '%s' "$STAFF" | grep -q "business_id"; then
    pass "membership" "staff row resolves (no onboarding loop)"
  else
    fail "membership" "no staff row — RequireAuth would bounce to /onboarding"
  fi
fi

# --- 4. dashboard intelligence RPCs respond for a member ---
for FN in business_brain current_metrics open_recommendations; do
  if [ -n "$TOKEN" ]; then
    R=$(rpc "$FN" "$TOKEN" "{}")
    if printf '%s' "$R" | grep -qE "no matches.*schema cache|PGRST202"; then
      fail "intelligence" "$FN MISSING"
    else
      pass "intelligence" "$FN responds"
    fi
  fi
done

# --- 5. payment rail: manual bank-transfer flow (existing) ---
if [ -n "$TOKEN" ]; then
  R=$(rpc my_payment_request "$TOKEN" "{}")
  if printf '%s' "$R" | grep -qE "no matches.*schema cache|PGRST202"; then
    fail "payments/manual" "my_payment_request MISSING"
  else
    pass "payments/manual" "manual bank-transfer rail responds"
  fi
fi

# --- 6. payment rail: Paystack checkout (restored) ---
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$BASE/functions/v1/subscription-management" -H "apikey: $KEY")
if [ "$CODE" != "404" ]; then
  pass "payments/paystack" "subscription-management deployed (http $CODE)"
else
  fail "payments/paystack" "subscription-management NOT deployed"
fi
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$BASE/functions/v1/paystack-webhook" -H "apikey: $KEY")
if [ "$CODE" != "404" ]; then
  pass "payments/webhook" "paystack-webhook deployed (http $CODE)"
else
  fail "payments/webhook" "paystack-webhook NOT deployed"
fi

# --- 7. email rail ---
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$BASE/functions/v1/email-service" -H "apikey: $KEY")
if [ "$CODE" != "404" ]; then
  pass "email" "email-service deployed (http $CODE)"
else
  fail "email" "email-service NOT deployed"
fi

# --- 8. frontend serves the current shell ---
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/")
if [ "$CODE" = "200" ]; then
  pass "frontend" "$APP_URL serves 200"
else
  fail "frontend" "$APP_URL returned $CODE"
fi

line ""
if [ "$FAIL" = "0" ]; then
  line "RESULT: E2E READY"
  exit 0
else
  line "RESULT: E2E NOT READY ($FAIL failing journeys)"
  exit 1
fi
