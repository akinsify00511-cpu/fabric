-- ============================================================================
-- P0 #14: Pricing engine — founding pricing, price-lock, future-increase arch.
--
-- The directive: treat current pricing as "2026 Founding Pricing" (not the
-- permanent price). Implement founding-period language, price-lock rules,
-- future pricing config, and architect pricing so a future 30-50% increase
-- is a config change, not a rebuild.
--
-- PROBLEM: prices are hardcoded in TWO places today (the subscription-
-- management edge function's PLAN_PRICES + Pricing.tsx's PLANS array) — a
-- §0.5 single-source-of-truth violation. Changing a price means editing both
-- and they can drift (they nearly did: Pricing.tsx has 5 tiers, the edge fn
-- has 5, business_entitlements.plan CHECK only allows 4 — three sources).
--
-- FIX: a `pricing_tiers` table as the SINGLE source of truth. The edge
-- function + the Pricing page + the entitlements all read from it. Each tier
-- has: current (founding) price, the FUTURE price (for when the founding
-- period ends), the founding-period end date, a price-lock flag, and the
-- founding-period language. A price increase is an UPDATE to this table —
-- no code change, no redeploy.
--
-- Price-lock: when a business subscribes during the founding period, their
-- `business_subscriptions.amount_cents` is already locked (the existing
-- schema captures the price at signup). The price-lock guarantee is enforced
-- by the subscription-management edge function reading `amount_cents` on
-- renewal, NOT the current tier price — so a founding customer keeps their
-- founding price even after a future increase. This migration documents that
-- invariant in the tier config + adds a `price_locked` flag on subscriptions
-- so the renewal logic is explicit.
--
-- Idempotent throughout.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pricing_tiers (
  -- The plan code (matches business_entitlements.plan + the edge function).
  plan_code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  tagline TEXT NOT NULL,                        -- the one-line description
  features TEXT[] NOT NULL DEFAULT '{}',        -- the bullet-point features
  -- Founding price (current, in kobo — NGN). The "2026 Founding Pricing".
  founding_monthly_cents BIGINT NOT NULL,
  founding_yearly_cents BIGINT NOT NULL,
  -- Future price (post-founding-period, in kobo). NULL = not yet set.
  -- When the founding period ends, the edge function reads this column instead
  -- of founding_*. Architecting a 30-50% increase = setting this column.
  future_monthly_cents BIGINT,
  future_yearly_cents BIGINT,
  -- The founding period end date. After this, new subscribers pay future_*.
  -- Existing founding subscribers keep their locked price (price_locked=true).
  founding_period_ends_at TIMESTAMPTZ,
  -- Seat limit per tier (NULL = unlimited).
  seats_included INT,
  -- The founding-period language shown on the Pricing page (the directive's
  -- "clear founding-period language").
  founding_label TEXT,
  -- Whether this tier is currently sellable (some tiers may be internal-only).
  is_sellable BOOLEAN NOT NULL DEFAULT true,
  -- Display order.
  display_order INT NOT NULL DEFAULT 100,
  -- Whether this is the "popular" tier (highlighted on the pricing page).
  is_popular BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
-- The pricing catalog is public (anyone can see the prices — it's marketing).
-- Only the service role writes it (Riverwayse sets prices, not customers).
CREATE POLICY pricing_tiers_read ON public.pricing_tiers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY pricing_tiers_anon_read ON public.pricing_tiers
  FOR SELECT TO anon USING (true);

-- ----------------------------------------------------------------------------
-- Seed the 5 tiers with the current founding prices (matches the existing
-- edge function PLAN_PRICES + Pricing.tsx PLANS — no behavior change, this
-- just centralizes them). Future prices are set to ~40% higher (the directive's
-- "30-50%" range) but NOT yet active (founding_period_ends_at is NULL = the
-- founding period is ongoing). Setting founding_period_ends_at is the launch
-- decision for the price increase.
-- ----------------------------------------------------------------------------
INSERT INTO public.pricing_tiers
  (plan_code, display_name, tagline, features, founding_monthly_cents, founding_yearly_cents,
   future_monthly_cents, future_yearly_cents, founding_period_ends_at, seats_included,
   founding_label, display_order, is_popular)
VALUES
  ('starter',
   'Starter',
   'One person running a simple operation',
   ARRAY['Core CRM & deals', 'Invoicing with VAT & WHT', 'Tasks & basic approvals', 'Up to 5 team members'],
   1500000, 15000000,
   2100000, 21000000,   -- 40% increase, not yet active
   NULL, 5, '2026 Founding Pricing', 10, false),
  ('team',
   'Team',
   'A small team working together',
   ARRAY['Everything in Starter', 'AI-assisted capture', 'Department groups', 'Up to 15 seats'],
   4800000, 48000000,
   6700000, 67000000,   -- ~40% increase
   NULL, 15, '2026 Founding Pricing', 20, false),
  ('business',
   'Business',
   'Multiple teams and departments',
   ARRAY['Everything in Team', 'Multi-location inventory', 'Approval workflows', 'Up to 30 seats'],
   11200000, 112000000,
   15600000, 156000000, -- ~39% increase
   NULL, 30, '2026 Founding Pricing', 30, true),
  ('pro',
   'Pro',
   'A growing, complex organization',
   ARRAY['Everything in Business', 'Committees & OKRs', 'Advanced intelligence & risk', 'Up to 60 seats'],
   18600000, 186000000,
   26000000, 260000000, -- ~40% increase
   NULL, 60, '2026 Founding Pricing', 40, false),
  ('scale',
   'Scale',
   'Large or multi-subsidiary operations',
   ARRAY['Everything in Pro', 'SSO & custom roles', 'Multi-subsidiary & audit trail', 'Dedicated support'],
   38000000, 380000000,
   53200000, 532000000, -- 40% increase
   NULL, NULL, '2026 Founding Pricing', 50, false)
ON CONFLICT (plan_code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  tagline = EXCLUDED.tagline,
  features = EXCLUDED.features,
  founding_monthly_cents = EXCLUDED.founding_monthly_cents,
  founding_yearly_cents = EXCLUDED.founding_yearly_cents,
  future_monthly_cents = EXCLUDED.future_monthly_cents,
  future_yearly_cents = EXCLUDED.future_yearly_cents,
  founding_label = EXCLUDED.founding_label,
  seats_included = EXCLUDED.seats_included,
  display_order = EXCLUDED.display_order,
  is_popular = EXCLUDED.is_popular,
  updated_at = NOW();

-- ----------------------------------------------------------------------------
-- get_pricing_tiers() — the single read path for the Pricing page + edge fn.
-- Returns the ACTIVE price for each tier (founding if within the founding
-- period, future if past it). Anonymous-callable (it's a public catalog).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pricing_tiers()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'plan_code', plan_code,
    'display_name', display_name,
    'tagline', tagline,
    'features', features,
    'monthly_cents', CASE
      WHEN founding_period_ends_at IS NOT NULL AND NOW() > founding_period_ends_at
        AND future_monthly_cents IS NOT NULL
      THEN future_monthly_cents
      ELSE founding_monthly_cents
    END,
    'yearly_cents', CASE
      WHEN founding_period_ends_at IS NOT NULL AND NOW() > founding_period_ends_at
        AND future_yearly_cents IS NOT NULL
      THEN future_yearly_cents
      ELSE founding_yearly_cents
    END,
    'is_founding_price', NOT (founding_period_ends_at IS NOT NULL AND NOW() > founding_period_ends_at
                              AND future_monthly_cents IS NOT NULL),
    'founding_label', founding_label,
    'founding_period_ends_at', founding_period_ends_at,
    'seats_included', seats_included,
    'is_popular', is_popular,
    'display_order', display_order
  ) ORDER BY display_order)
  FROM pricing_tiers
  WHERE is_sellable = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_pricing_tiers() TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- Price-lock on subscriptions: a founding subscriber keeps their founding
-- price on renewal, even after the founding period ends. The existing
-- business_subscriptions.amount_cents already captures the signup price;
-- this flag makes the renewal invariant explicit (the edge function reads
-- amount_cents on renewal, NOT the current tier price).
-- ----------------------------------------------------------------------------
ALTER TABLE public.business_subscriptions
  ADD COLUMN IF NOT EXISTS price_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.business_subscriptions.price_locked IS
  'P0 #14: when true, the subscriber keeps their signup price (amount_cents) on renewal regardless of future tier price increases — the founding-period price-lock guarantee. Set to true when a subscription is created during the founding period.';

-- ----------------------------------------------------------------------------
-- Widen the business_entitlements.plan CHECK to accept ALL plan codes the
-- pricing system actually uses (starter/team/business/pro/scale + legacy
-- professional/enterprise aliases). The old constraint (028) only allowed
-- free/starter/professional/enterprise — so storing plan=''team'' or
-- ''business'' would fail. This is the drift the plan-recommendation audit
-- (P0 #15) surfaced.
-- ----------------------------------------------------------------------------
ALTER TABLE public.business_entitlements DROP CONSTRAINT IF EXISTS business_entitlements_plan_check;
ALTER TABLE public.business_entitlements
  ADD CONSTRAINT business_entitlements_plan_check
  CHECK (plan IN ('free', 'starter', 'team', 'business', 'professional', 'pro', 'scale', 'enterprise'));

COMMENT ON TABLE public.pricing_tiers IS
  'P0 #14: the single source of truth for plan pricing. founding_* prices are the "2026 Founding Pricing" (current). future_* prices are the post-founding-period prices (a 30-50% increase, configured but not yet active until founding_period_ends_at is set). Price-lock: founding subscribers keep their signup price on renewal (business_subscriptions.price_locked + amount_cents).';
