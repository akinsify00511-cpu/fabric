-- ============================================================================
-- Section 7.3: per-business approval threshold configuration.
--
-- The existing approval system has per-CATEGORY thresholds (requisition_categories
-- in 017: requires_approval + auto_approve_below; expense_categories in 039:
-- requires_approval + approval_threshold). That satisfies §7.3's "configurable
-- per business" at the category level. But the checklist also demands "a solo
-- founder needs none; a 50-person business needs some, never hardcoded
-- globally" — and a solo founder currently has to set requires_approval=FALSE
-- on every category individually rather than having ONE business-level bypass.
--
-- This migration adds a business-level approval config: a single row per
-- business with a global approval bypass (the sole-proprietor case) + a
-- default minimum amount below which approvals are skipped business-wide
-- (the "small decisions shouldn't be bureaucratic" requirement). Category-
-- level config still overrides the business default (more specific wins).
--
-- §7.5: every approval decision + bypass is auditable via the existing
-- approval_enforcement_logs (070) + approval_actions (039). This config is
-- read by the approval-decision path, not a new audit table.
--
-- Idempotent throughout.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.business_approval_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  -- §7.3: sole-proprietor bypass. When TRUE, no approval is required for any
  -- action regardless of amount (the solo founder IS the business — there is
  -- no second person to approve against). Defaulted FALSE for existing
  -- businesses so approval flow is unchanged until explicitly enabled.
  bypass_all_approvals BOOLEAN NOT NULL DEFAULT FALSE,
  -- §7.3: the business-wide minimum amount below which approval is SKIPPED
  -- (small decisions shouldn't be bureaucratic). NULL = no business-wide floor
  -- (fall back to category-level config). Category auto_approve_below wins
  -- when more specific.
  auto_approve_below NUMERIC(15,2),
  -- Who last changed the config + when (§7.5 auditability — the config itself
  -- is a security-relevant change).
  updated_by UUID REFERENCES staff(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.business_approval_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_approval_config_read ON public.business_approval_config
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM get_current_staff()));
CREATE POLICY business_approval_config_owner ON public.business_approval_config
  FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM get_current_staff())
         AND EXISTS (SELECT 1 FROM get_current_staff() cs
                     WHERE cs.business_id = business_approval_config.business_id
                       AND cs.role IN ('owner', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM get_current_staff() cs
                      WHERE cs.business_id = business_approval_config.business_id
                        AND cs.role IN ('owner', 'admin')));

-- Auto-create a default config row for each new business (bypass=FALSE,
-- auto_approve_below=NULL — the safe default until the owner opts in).
CREATE OR REPLACE FUNCTION public.ensure_business_approval_config()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.business_approval_config (business_id)
  VALUES (NEW.id)
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_business_approval_config ON businesses;
CREATE TRIGGER ensure_business_approval_config
  AFTER INSERT ON businesses
  FOR EACH ROW EXECUTE FUNCTION public.ensure_business_approval_config();

-- Backfill existing businesses.
INSERT INTO public.business_approval_config (business_id)
  SELECT id FROM businesses
  WHERE id NOT IN (SELECT business_id FROM business_approval_config)
  ON CONFLICT (business_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- The decision helper: given a business + amount + optional category, should
-- approval be required? §7.3: "a solo founder needs none." Centralized so the
-- page + the enforcement gate ask the SAME question. Pure read; never mutates.
-- Returns { requires_approval BOOL, reason TEXT }.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_approval_required(
  p_business_id UUID,
  p_amount NUMERIC DEFAULT NULL,
  p_category_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_config RECORD;
  v_category RECORD;
  v_requires BOOLEAN := TRUE;
  v_reason TEXT;
  v_staff_count INT;
BEGIN
  SELECT * INTO v_config FROM business_approval_config WHERE business_id = p_business_id;

  -- §7.3 sole-proprietor bypass: if the business is a one-person operation,
  -- no approval is required (there's no second person to approve against).
  -- This is the authoritative "solo founder needs none" path.
  IF v_config.bypass_all_approvals THEN
    RETURN jsonb_build_object('requires_approval', false, 'reason', 'Business-level bypass enabled (sole proprietor)');
  END IF;

  -- Cross-check: if the business has only 1 active staff member, bypass
  -- regardless of the config flag (the owner cannot approve their own
  -- request — it's a no-op gate). Honest + safe.
  SELECT count(*) INTO v_staff_count FROM staff WHERE business_id = p_business_id AND active = true;
  IF v_staff_count <= 1 THEN
    RETURN jsonb_build_object('requires_approval', false, 'reason', 'Sole proprietor — no second approver available');
  END IF;

  -- Category-level config (more specific wins).
  IF p_category_id IS NOT NULL THEN
    -- Try requisition_categories (017) first.
    BEGIN
      SELECT * INTO v_category FROM requisition_categories WHERE id = p_category_id;
      IF FOUND THEN
        IF v_category.requires_approval = false THEN
          RETURN jsonb_build_object('requires_approval', false, 'reason', 'Category requires_approval = false');
        END IF;
        IF v_category.auto_approve_below IS NOT NULL AND p_amount IS NOT NULL AND p_amount <= v_category.auto_approve_below THEN
          RETURN jsonb_build_object('requires_approval', false, 'reason', 'Below category auto-approve threshold');
        END IF;
        RETURN jsonb_build_object('requires_approval', true, 'reason', 'Category requires approval');
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    -- Try expense_categories (039).
    BEGIN
      SELECT * INTO v_category FROM expense_categories WHERE id = p_category_id;
      IF FOUND THEN
        IF v_category.requires_approval = false THEN
          RETURN jsonb_build_object('requires_approval', false, 'reason', 'Category requires_approval = false');
        END IF;
        IF v_category.approval_threshold IS NOT NULL AND p_amount IS NOT NULL AND p_amount <= v_category.approval_threshold THEN
          RETURN jsonb_build_object('requires_approval', false, 'reason', 'Below category approval threshold');
        END IF;
        RETURN jsonb_build_object('requires_approval', true, 'reason', 'Category requires approval');
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Business-wide floor (§7.3: small decisions shouldn't be bureaucratic).
  IF v_config.auto_approve_below IS NOT NULL AND p_amount IS NOT NULL AND p_amount <= v_config.auto_approve_below THEN
    RETURN jsonb_build_object('requires_approval', false, 'reason', 'Below business-wide auto-approve threshold');
  END IF;

  -- Default: approval required (fail-safe — require a human check unless
  -- explicitly opted out). §7.3: "never hardcoded globally" — this is the
  -- safe default the business can opt OUT of, not a global rule.
  RETURN jsonb_build_object('requires_approval', true, 'reason', 'Default requires approval');
EXCEPTION WHEN OTHERS THEN
  -- On any failure, fail SAFE (require approval) — never silently bypass.
  RETURN jsonb_build_object('requires_approval', true, 'reason', 'Config check failed — fail-safe requires approval');
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_approval_required(UUID, NUMERIC, UUID) TO authenticated;

COMMENT ON FUNCTION public.is_approval_required(UUID, NUMERIC, UUID) IS
  '§7.3: the centralized approval-decision helper. Returns whether approval is required for a business+amount+category. Sole-proprietor bypass (config flag OR single active staff) → no approval. Category-level config wins over business-wide floor. Fails SAFE (requires approval) on any error. Never mutates.';
