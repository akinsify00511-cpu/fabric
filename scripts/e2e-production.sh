#!/usr/bin/env bash
# Avenize production behaviour gate. It is fail-closed, but it can create a
# disposable confirmed Supabase user through the service-role Admin API when
# no dedicated E2E account is configured. The disposable user is removed at
# the end so production certification does not depend on manual credentials.
set -u

APP_URL="${APP_URL:-https://avenize.riverwayse.com}"
BASE="${SUPABASE_URL:-}"
KEY="${SUPABASE_KEY:-}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
EMAIL="${E2E_EMAIL:-}"
PASSWORD="${E2E_PASSWORD:-}"
DISPOSABLE_USER=""
PASS=0
FAIL=0

pass(){ PASS=$((PASS+1)); printf '%-24s PASS  %s\n' "$1" "$2"; }
fail(){ FAIL=$((FAIL+1)); printf '%-24s FAIL  %s\n' "$1" "$2"; }
cleanup(){
  if [ -n "$DISPOSABLE_USER" ] && [ -n "$SERVICE_KEY" ]; then
    curl -sS -X DELETE "$BASE/auth/v1/admin/users/$DISPOSABLE_USER" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" >/dev/null || true
  fi
}
trap cleanup EXIT

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
[ -n "$SERVICE_KEY" ] || fail "config/admin" "SUPABASE_SERVICE_ROLE_KEY is required for disposable E2E user"
if [ "$FAIL" -gt 0 ]; then printf '\nRESULT: E2E NOT READY\n'; exit 1; fi

AUTH=(-H "apikey: $KEY" -H "Content-Type: application/json")
rpc(){
  local name="$1" token="$2" body="$3"
  curl -sS -X POST "$BASE/rest/v1/rpc/$name" "${AUTH[@]}" -H "Authorization: Bearer $token" -d "$body"
}

printf '\nAvenize Production Journey\n──────────────────────────\n'
CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$APP_URL/")
[ "$CODE" = "200" ] && pass "frontend" "$APP_URL returned 200" || fail "frontend" "returned HTTP $CODE"

for FN in subscription-management paystack-webhook email-service campaign-send; do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS "$BASE/functions/v1/$FN" -H "apikey: $KEY")
  [ "$CODE" != "404" ] && pass "edge/$FN" "deployed (HTTP $CODE)" || fail "edge/$FN" "function missing"
done

# Use an explicitly configured test account when available; otherwise create a
# confirmed disposable user with the Supabase Admin API (no email is sent).
if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  STAMP=$(date +%s)
  EMAIL="e2e-${STAMP}@avenize.invalid"
  PASSWORD="E2e!${STAMP}aZ#x"
  CREATED=$(curl -sS -X POST "$BASE/auth/v1/admin/users" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true,\"user_metadata\":{\"source\":\"production_e2e\"}}")
  DISPOSABLE_USER=$(printf '%s' "$CREATED" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id') or '')" 2>/dev/null || true)
  [ -n "$DISPOSABLE_USER" ] && pass "auth/provision" "disposable confirmed E2E user created" || fail "auth/provision" "Admin API could not create disposable user"
fi

LOGIN=$(curl -sS -X POST "$BASE/auth/v1/token?grant_type=password" "${AUTH[@]}" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(printf '%s' "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token') or '')" 2>/dev/null || true)
[ -n "$TOKEN" ] && pass "auth/login" "E2E account authenticated" || fail "auth/login" "E2E account could not authenticate"

if [ -n "$TOKEN" ]; then
  STAFF=$(curl -sS "$BASE/rest/v1/staff?select=id,business_id,active,is_active&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN")
  if printf '%s' "$STAFF" | grep -q 'business_id'; then pass "auth/membership" "staff membership resolves without onboarding loop"; else fail "auth/membership" "no business membership resolved"; fi

  for SPEC in 'business_brain|{}' 'current_metrics|{}' 'open_recommendations|{}' 'my_payment_request|{}' 'resolve_current_user_context|{}'; do
    FN="${SPEC%%|*}"; BODY="${SPEC#*|}"; RESP=$(rpc "$FN" "$TOKEN" "$BODY")
    if printf '%s' "$RESP" | grep -qiE 'schema cache|PGRST202'; then fail "rpc/$FN" "missing or argument mismatch"; else pass "rpc/$FN" "callable for authenticated member"; fi
  done

  OB=$(rpc create_business_and_owner "$TOKEN" '{"p_business_name":"Avenize E2E Existing Member","p_industry":"testing","p_staff_name":"E2E Bot","p_job_title":"Owner"}')
  if printf '%s' "$OB" | grep -qiE 'already belongs|already|duplicate|exists'; then pass "auth/returning" "existing member cannot be re-onboarded"; else fail "auth/returning" "existing-member onboarding guard did not fire"; fi

  CHECKOUT=$(curl -sS -X POST "$BASE/functions/v1/subscription-checkout" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"plan_code":"starter","billing_cycle":"monthly"}')
  if printf '%s' "$CHECKOUT" | grep -q 'checkout_url'; then pass "payments/checkout" "Paystack checkout initialized"; elif printf '%s' "$CHECKOUT" | grep -qiE 'configuration unavailable|Payment provider rejected|Unable to create checkout'; then fail "payments/checkout" "provider checkout failed: $(printf '%s' "$CHECKOUT" | head -c 180)"; else fail "payments/checkout" "unexpected checkout response: $(printf '%s' "$CHECKOUT" | head -c 180)"; fi
fi

printf '\nPASS=%s FAIL=%s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] && printf 'RESULT: E2E READY\n' && exit 0
printf 'RESULT: E2E NOT READY\n'
exit 1
