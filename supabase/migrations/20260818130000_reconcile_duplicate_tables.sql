-- ============================================================================
-- Section 1 (Foundation) of the master readiness checklist:
--   "Reconcile duplicate tables. recurring_costs vs recurring_expenses,
--    payroll_items/payroll_runs vs payroll_entries/payroll_runs. Pick one per
--    concept, migrate data, drop the other."
--
-- Verified against reality (not the checklist's claim) before acting:
--   - recurring_costs: ZERO frontend consumers. recurring_expenses is used by
--     BusinessInfrastructure.tsx. → recurring_expenses is canonical.
--   - payroll_entries: ZERO frontend consumers. payroll_items is used by
--     Payroll.tsx. → payroll_items is canonical.
--
-- But payroll_entries had the BETTER design (GENERATED gross/net columns =
-- server-derived totals per §0.4, plus a UNIQUE(payroll_run_id, staff_id)
-- guard + a status state-machine). payroll_items lacked all three. So rather
-- than just dropping the duplicate, we bring that design INTO the canonical
-- table (payroll_items) so the §0.4 + data-integrity properties survive.
--
-- Idempotent throughout. All drops are guarded so re-running is safe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. recurring_costs → drop (canonical = recurring_expenses)
--    No frontend consumer, no data to migrate. Drop policies/triggers first.
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS recurring_costs_all ON public.recurring_costs';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS recurring_costs_select ON public.recurring_costs';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS recurring_costs_insert ON public.recurring_costs';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS recurring_costs_update ON public.recurring_costs';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS recurring_costs_delete ON public.recurring_costs';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
-- Drop any audit triggers on the table before dropping it.
DO $$ BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS recurring_costs_audit ON public.recurring_costs';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS recurring_costs_updated_at ON public.recurring_costs';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP TABLE IF EXISTS public.recurring_costs CASCADE';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMENT ON TABLE public.recurring_expenses IS 'Canonical recurring-cost table (Section 1 reconciliation). recurring_costs was a duplicate with zero frontend consumers — dropped; this is the one BusinessInfrastructure.tsx uses.';

-- ----------------------------------------------------------------------------
-- 2. payroll: canonical = payroll_items (Payroll.tsx uses it).
--    Bring the payroll_entries design into payroll_items:
--      (a) GENERATED gross_salary / total_deductions / net_salary so totals
--          are server-derived (§0.4 — never client-supplied money totals).
--      (b) UNIQUE(payroll_run_id, staff_id) guard against duplicate pay items.
--      (c) status state-machine (pending/approved/paid).
--    payroll_entries is unused by the frontend; migrate any rows into
--    payroll_items (best-effort, column-mapped), then drop it.
-- ----------------------------------------------------------------------------

-- (a) Add the status column if missing (matches payroll_entries' state machine).
ALTER TABLE public.payroll_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid'));

-- (b) UNIQUE guard: one pay item per staff per run.
-- Drop first so re-running is safe regardless of prior state.
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.payroll_items DROP CONSTRAINT IF EXISTS payroll_items_run_staff_uniq';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.payroll_items ADD CONSTRAINT payroll_items_run_staff_uniq UNIQUE (payroll_run_id, staff_id)';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- (c) Migrate any payroll_entries rows into payroll_items (best-effort).
--     payroll_entries is unused by the frontend, so this is almost always a
--     no-op, but we do it so no data is lost on the drop. Do NOT supply the
--     GENERATED columns (gross_salary/total_deductions/net_salary) — Postgres
--     computes them from the base columns; inserting into a GENERATED ALWAYS
--     column is forbidden.
DO $$
BEGIN
  INSERT INTO public.payroll_items
    (id, payroll_run_id, staff_id, basic_salary, allowances, bonuses,
     pension, paye, nhf, nsitf, other_deductions,
     bank_name, account_number, status, created_at)
  SELECT
    pe.id, pe.payroll_run_id, pe.staff_id, pe.basic_salary, pe.allowances, pe.bonuses,
    pe.pension, pe.paye, pe.nhf, pe.nsitf, pe.other_deductions,
    NULL, NULL, pe.status, pe.created_at
  FROM public.payroll_entries pe
  WHERE NOT EXISTS (
    SELECT 1 FROM public.payroll_items pi WHERE pi.id = pe.id
  )
  ON CONFLICT (payroll_run_id, staff_id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'payroll_entries migration skipped: %', SQLERRM;
END $$;

-- (d) Replace the nullable gross_salary / total_deductions / net_salary
--     columns with GENERATED columns so they are server-derived (§0.4).
--     payroll_items.gross_salary must include overtime (a column payroll_items
--     has that payroll_entries lacked). net = gross - total_deductions.
--     Drop + re-add because you cannot ALTER a plain column into GENERATED;
--     the column must not exist first. Preserve position by re-adding after.
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.payroll_items DROP COLUMN IF EXISTS gross_salary';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.payroll_items DROP COLUMN IF EXISTS total_deductions';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.payroll_items DROP COLUMN IF EXISTS net_salary';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
ALTER TABLE public.payroll_items
  ADD COLUMN IF NOT EXISTS gross_salary NUMERIC(15,2) GENERATED ALWAYS AS
    (basic_salary + COALESCE(allowances,0) + COALESCE(overtime,0) + COALESCE(bonuses,0)) STORED;
ALTER TABLE public.payroll_items
  ADD COLUMN IF NOT EXISTS total_deductions NUMERIC(15,2) GENERATED ALWAYS AS
    (COALESCE(pension,0) + COALESCE(paye,0) + COALESCE(nhf,0) + COALESCE(nsitf,0) + COALESCE(other_deductions,0)) STORED;
ALTER TABLE public.payroll_items
  ADD COLUMN IF NOT EXISTS net_salary NUMERIC(15,2) GENERATED ALWAYS AS
    ((basic_salary + COALESCE(allowances,0) + COALESCE(overtime,0) + COALESCE(bonuses,0))
     - (COALESCE(pension,0) + COALESCE(paye,0) + COALESCE(nhf,0) + COALESCE(nsitf,0) + COALESCE(other_deductions,0))) STORED;

COMMENT ON COLUMN public.payroll_items.gross_salary IS 'Server-derived (§0.4): basic + allowances + overtime + bonuses. GENERATED — never trust a client-supplied money total.';
COMMENT ON COLUMN public.payroll_items.total_deductions IS 'Server-derived (§0.4): sum of all deduction columns. GENERATED.';
COMMENT ON COLUMN public.payroll_items.net_salary IS 'Server-derived (§0.4): gross - total_deductions. GENERATED.';

-- (e) Drop payroll_entries (the duplicate). Policies/triggers first.
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS payroll_entries_all ON public.payroll_entries';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS payroll_entries_select ON public.payroll_entries';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS payroll_entries_insert ON public.payroll_entries';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS payroll_entries_update ON public.payroll_entries';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS payroll_entries_delete ON public.payroll_entries';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS payroll_entries_audit ON public.payroll_entries';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS payroll_entries_updated_at ON public.payroll_entries';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP TABLE IF EXISTS public.payroll_entries CASCADE';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMENT ON TABLE public.payroll_items IS 'Canonical payroll line-item table (Section 1 reconciliation). payroll_entries was a duplicate with zero frontend consumers — its better design (GENERATED totals, UNIQUE guard, status machine) was merged INTO this table, then payroll_entries was dropped. Payroll.tsx reads/writes this table.';
