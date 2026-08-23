#!/usr/bin/env bash
# Type-check every Supabase edge function with Deno.
#
# Edge functions run on Deno at runtime, which does NOT type-check — a broken
# type only surfaces when the function is invoked in production. This gate
# makes `deno check` part of CI so edge-function drift is caught pre-merge.
#
# --node-modules-dir=none: the repo root package.json would otherwise make
# Deno resolve npm: specifiers from a local node_modules that does not exist
# in CI; "none" resolves them from the global cache instead.
set -u

FAIL=0
COUNT=0
for f in supabase/functions/*/index.ts; do
  COUNT=$((COUNT+1))
  if deno check --node-modules-dir=none "$f" > /tmp/edge-check.log 2>&1; then
    echo "PASS  $f"
  else
    echo "FAIL  $f"
    tail -8 /tmp/edge-check.log
    FAIL=1
  fi
done

echo ""
if [ "$FAIL" = "0" ]; then
  echo "edge functions: $COUNT/$COUNT type-check clean"
else
  echo "edge functions: TYPE ERRORS — fix before merging"
fi
exit $FAIL
