#!/usr/bin/env bash
# Deploy all Supabase edge functions to the live project.
#
# Runbook companion to apply_migrations_live.sh — run AFTER the migration
# chain is applied (functions reference tables/RPCs the chain creates).
#
# Required env:
#   SUPABASE_ACCESS_TOKEN   personal access token (supabase.com/dashboard →
#                           Account → Access Tokens)
# Optional env:
#   PROJECT_REF             defaults to the live project ref
#   ONLY                    space-separated subset, e.g. ONLY="email-service resend-webhook"
#
# Secrets are NOT set by this script — set them once in the dashboard or via:
#   supabase secrets set PAYSTACK_SECRET_KEY=... RESEND_API_KEY=... \
#     EMAIL_FROM="Avenize <hello@avenize.app>" RESEND_WEBHOOK_SECRET=... \
#     APP_URL=https://avenize.riverwayse.com \
#     EMAIL_SERVICE_CRON_SECRET=<random> PLATFORM_HEALTH_CRON_SECRET=<random> \
#     --project-ref $PROJECT_REF
set -u

PROJECT_REF="${PROJECT_REF:-kgsgqvatyleetyquffya}"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: set SUPABASE_ACCESS_TOKEN (supabase.com/dashboard → Account → Access Tokens)" >&2
  exit 2
fi

if ! command -v supabase > /dev/null 2>&1; then
  echo "ERROR: supabase CLI not found. Install: npm i -g supabase" >&2
  exit 2
fi

if [ -n "${ONLY:-}" ]; then
  FUNCTIONS="$ONLY"
else
  FUNCTIONS=$(ls -d supabase/functions/*/ | xargs -n1 basename | grep -v '^_shared$')
fi

# Per-function platform JWT policy (verified against each function's code):
# - verify-jwt ON: browser-called with a user JWT; the platform rejects
#   unauthenticated calls before the function runs.
# - verify-jwt OFF: the function does its own auth — provider HMAC
#   (paystack/resend svix), an internal shared secret (cron/automation), its
#   own API-key verification (api-gateway), or a mixed flow (webauthn's
#   pre-auth assertion ceremony would be rejected by platform JWT).
VERIFY_JWT="ask-avenize parse-intent paystack-verify subscription-management"

FAIL=0
for fn in $FUNCTIONS; do
  JWT_FLAG="--no-verify-jwt"
  case " $VERIFY_JWT " in
    *" $fn "*) JWT_FLAG="" ;;
  esac
  echo "── deploying $fn ${JWT_FLAG:-(verify-jwt)}"
  if supabase functions deploy "$fn" --project-ref "$PROJECT_REF" $JWT_FLAG 2>&1 | tail -2; then
    echo "   ok"
  else
    echo "   FAILED"
    FAIL=1
  fi
done

echo ""
if [ "$FAIL" = "0" ]; then
  echo "all functions deployed. Next: bash scripts/verify-production.sh (should report edge functions DEPLOYED)"
else
  echo "some functions failed — re-run with ONLY=\"<name>\" after fixing"
fi
exit $FAIL
