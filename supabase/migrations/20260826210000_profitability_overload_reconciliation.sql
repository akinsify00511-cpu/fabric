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

comment on function public.profitability_leakage(p_business_id uuid) is
  'Canonical (unambiguous) leakage detection. §G: overdue invoices, declining-margin customers, underpriced won deals, stale receivables — REAL numbers only. Owner-gated.';
comment on function public.pricing_opportunities(p_business_id uuid) is
  'Canonical (unambiguous) pricing opportunities: high-margin (room to discount) + low-margin (raise price/cut cost). Owner-gated. §22 — REAL numbers only.';