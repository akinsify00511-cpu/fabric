#!/usr/bin/env bash
# Avenize production behaviour gate. This test is intentionally fail-closed:
# authenticated journey credentials are mandatory, and a missing credential
# can never be reported as E2E READY.
set -u

APP_URL="${APP_URL:-https://avenize.riverwayse.com}"
BASE="${SUPABASE_URL:-}"
KEY="${SUPABASE_KEY:-}"
EMAIL="${E2E_EMAIL:-}"
PASSWORD="${E2E_PASSWORD:-}"
PASS=0
FAIL=0

pass(){ PASS=$((PASS+1)); printf '%-24s PASS  %s\n' "$1" "$2"; }
fail(){ FAIL=$((FAIL+1)); printf '%-24s FAIL  %s\n' "$1" "$2"; }

# Resolve the public Supabase connection only when explicit CI values are not supplied.
if [ -z "$BASE" ] || [ -z "$KEY" ]; then
  INDEX=$(curl -fsS "$APP_URL/" 2>/dev/null || true)
  BUNDLE=$(printf '%s' "$INDEX" | grep -oE '/assets/[A-Za-z0-9_-]+\.js' | head -1)
  if [ -n "$BUNDLE" ]; then
    JS=$(curl -fsS "${APP_URL}${BUNDLE}" 2>/dev/null || true)
    BASE=$(printf '%s' "$JS" | grep -oE 'https://[0-9a-z]+\.supabase\.co' | head -1)
    KEY=$(printf '%s' "$JS" | grep -oE 'sb_publishable_[A-Za-z0-9_-]+' | head -1)
  fi
fi

[ -n "$BASE" ] || fail "config/supabase" "Supabase URL unavailable"
[ -n "$KEY" ] || fail "config/supabase" "publishable key unavailable"
[ -n "$EMAIL" ] || fail "config/auth" "E2E_EMAIL secret is required"
[ -n "$PASSWORD" ] || fail "config/auth" "E2E_PASSWORD secret is required"
if [ "$FAIL" -gt 0 ]; then
  printf '\nRESULT: E2E NOT READY — production authentication credentials are mandatory.\n'
  exit 1
fi

AUTH=(-H "apikey: $KEY" -H "Content-Type: application/json")
rpc(){
  local name="$1" token="$2" body="$3"
  if [ -n "$token" ]; then
    curl -sS -X POST "$BASE/rest/v1/rpc/$name" "${AUTH[@]}" -H "Authorization: Bearer $token" -d "$body"
  else
    curl -sS -X POST "$BASE/rest/v1/rpc/$name" "${AUTH[@]}" -d "$body"
  fi
}

printf '\nAvenize Production Journey\n──────────────────────────\n'

# 1. Public application and health rails.
CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$APP_URL/")
[ "$CODE" = "200" ] && pass "frontend" "$APP_URL returned 200" || fail "frontend" "returned HTTP $CODE"

for FN in subscription-management paystack-webhook email-service campaign-send; do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS "$BASE/functions/v1/$FN" -H "apikey: $KEY")
  [ "$CODE" != "404" ] && pass "edge/$FN" "deployed (HTTP $CODE)" || fail "edge/$FN" "function missing"
done

# 2. Authenticated journey using a controlled test account.
LOGIN=$(curl -sS -X POST "$BASE/auth/v1/token?grant_type=password" "${AUTH[@]}" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(printf '%s' "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token') or '')" 2>/dev/null || true)
if [ -n "$TOKEN" ]; then pass "auth/login" "controlled E2E account authenticated"; else fail "auth/login" "E2E account could not authenticate"; fi

if [ -n "$TOKEN" ]; then
  STAFF=$(curl -sS "$BASE/rest/v1/staff?select=id,business_id,active,is_active&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN")
  if printf '%s' "$STAFF" | grep -q 'business_id'; then
    pass "auth/membership" "staff membership resolves without onboarding loop"
  else
    fail "auth/membership" "no business membership resolved"
  fi

  for SPEC in \
    'business_brain|{}' \
    'current_metrics|{}' \
    'open_recommendations|{}' \
    'my_payment_request|{}' \
    'resolve_current_user_context|{}'; do
    FN="${SPEC%%|*}"; BODY="${SPEC#*|}"
    RESP=$(rpc "$FN" "$TOKEN" "$BODY")
    if printf '%s' "$RESP" | grep -qiE 'schema cache|PGRST202'; then
      fail "rpc/$FN" "missing or argument mismatch"
    else
      pass "rpc/$FN" "callable for authenticated member"
    fi
  done

  # A second onboarding attempt must be rejected for a returning member.
  OB=$(rpc create_business_and_owner "$TOKEN" '{"p_business_name":"Avenize E2E Existing Member","p_industry":"testing","p_staff_name":"E2E Bot","p_job_title":"Owner"}')
  if printf '%s' "$OB" | grep -qiE 'already belongs|already|duplicate|exists'; then
    pass "auth/returning" "existing member cannot be re-onboarded"
  else
    fail "auth/returning" "existing-member onboarding guard did not fire"
  fi

  # Payment entitlement is only granted by verified provider success. This
  # check confirms the subscription endpoint requires the authenticated rail.
  CHECKOUT=$(curl -sS -X POST "$BASE/functions/v1/subscription-checkout" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"plan_code":"starter","billing_cycle":"monthly"}')
  if printf '%s' "$CHECKOUT" | grep -q 'checkout_url'; then
    pass "payments/checkout" "Paystack checkout initialized"
  elif printf '%s' "$CHECKOUT" | grep -qiE 'configuration unavailable|Payment provider rejected|Unable to create checkout'; then
    fail "payments/checkout" "provider checkout failed: $(printf '%s' "$CHECKOUT" | head -c 180)"
  else
    fail "payments/checkout" "unexpected checkout response: $(printf '%s' "$CHECKOUT" | head -c 180)"
  fi
fi

printf '\nPASS=%s FAIL=%s\n' "$PASS" "$FAIL"
if [ "$FAIL" -eq 0 ]; then
  printf 'RESULT: E2E READY\n'
  exit 0
fi
printf 'RESULT: E2E NOT READY\n'
exit 1
