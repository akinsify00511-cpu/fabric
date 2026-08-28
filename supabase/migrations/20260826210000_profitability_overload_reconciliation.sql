-- Canonical contract repair: eliminate the ambiguous profitability overloads.
--
-- LIVE FINDING (Contract Sentinel, 2026-08-27): the frontend calls
--   profitability_leakage({ p_business_id })
--   pricing_opportunities({ p_business_id })
-- (1-arg, see src/lib/businessOS.ts) but TWO signatures existed on live:
--   20260818260000  created ... (p_business_id UUID, p_period_start DATE DEFAULT NULL, p_period_end DATE DEFAULT NULL)
--   zz_live_console_drift_reconciliation created ... (p_business_id UUID)
-- PostgREST responded PGRST203 (ambiguous function) for the exact 1-arg client
-- call because both overloads were exposed.
--
-- Fix (canonical layer, NOT a frontend fallback): the 3-arg overload has NO
-- consumer anywhere in the repo (only src/lib/businessOS.ts call these, always
-- 1-arg). Drop it so the 1-arg signature — the only one the codebase and the
-- contract manifest's first signature declare — is unambiguous on production.
-- Dropping a function removes its grants; the 1-arg SECURITY DEFINER versions
-- (owner/admin membership-gated) remain intact.

drop function if exists public.profitability_leakage(
  p_business_id uuid, p_period_start date, p_period_end date
);

drop function if exists public.pricing_opportunities(
  p_business_id uuid, p_period_start date, p_period_end date
);

-- The 1-arg profitability_leakage / pricing_opportunities are (re)created by
-- zz_live_console_drift_reconciliation which sorts AFTER this file, so the
-- canonical function may not exist yet when this runs on a fresh chain. Guard
-- the comments so the chain stays idempotent; the intent (document the 1-arg
-- contract) still lands once the function exists.
do $guard$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'profitability_leakage'
      and pg_get_function_identity_arguments(p.oid) = 'p_business_id uuid'
  ) then
    comment on function public.profitability_leakage(p_business_id uuid) is
      'Canonical (unambiguous) leakage detection. §G: overdue invoices, declining-margin customers, underpriced won deals, stale receivables — REAL numbers only. Owner-gated.';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'pricing_opportunities'
      and pg_get_function_identity_arguments(p.oid) = 'p_business_id uuid'
  ) then
    comment on function public.pricing_opportunities(p_business_id uuid) is
      'Canonical (unambiguous) pricing opportunities: high-margin (room to discount) + low-margin (raise price/cut cost). Owner-gated. §22 — REAL numbers only.';
  end if;
end;
$guard$;