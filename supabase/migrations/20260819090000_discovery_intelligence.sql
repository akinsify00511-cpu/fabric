-- ============================================================================
-- DISCOVERY INTELLIGENCE (Phase B — SEO / AEO / GEO / AIO as a product layer)
-- ============================================================================
-- One platform capability: make a business discoverable, understandable,
-- citeable and attributable across search engines AND AI answer systems —
-- then connect discovery to revenue (the B14 closed loop).
--
-- Scope model: BUSINESS-SCOPED. Each business monitors the discovery of ITS
-- OWN brand (queries, AI citations, brand truth, content opportunities).
-- Avenize-the-company is simply the first tenant of its own system.
--
-- Security: every table is business-scoped RLS via get_current_staff(); every
-- RPC is SECURITY DEFINER + membership-guarded (the zz-closure pattern).
-- The public/private boundary (B3) is enforced at the edge by robots.txt +
-- auth-gated /app; NOTHING in this schema ever publishes customer business
-- data — it records how the PUBLIC surface performs.
--
-- §22 anti-fabrication: observations are recorded facts (someone/something
-- observed an engine's answer at a time). Aggregates are computed from those
-- records only; empty means empty, never a synthetic number.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. discovery_targets — the queries/topics a business tracks (B6/B7/B9).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discovery_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  query TEXT NOT NULL,                        -- the tracked question/query
  cluster TEXT NOT NULL DEFAULT 'general',    -- topic cluster (B6)
  kind TEXT NOT NULL DEFAULT 'seo' CHECK (kind IN ('seo', 'aeo', 'geo')),
  priority INT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS discovery_targets_business_query_key
  ON public.discovery_targets (business_id, query);
CREATE INDEX IF NOT EXISTS discovery_targets_business_idx
  ON public.discovery_targets (business_id) WHERE active;

-- ---------------------------------------------------------------------------
-- 2. discovery_observations — one recorded check of one engine's answer (B7).
--    A row is a FACT: at observed_at, engine E answered target T this way.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discovery_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.discovery_targets(id) ON DELETE CASCADE,
  engine TEXT NOT NULL CHECK (engine IN ('google', 'bing', 'chatgpt', 'perplexity', 'claude', 'gemini', 'other')),
  avenize_present BOOLEAN NOT NULL DEFAULT false,  -- the brand appeared at all
  avenize_cited BOOLEAN NOT NULL DEFAULT false,    -- the brand was cited as a source
  citation_url TEXT,
  position INT,                                     -- rank/position when known
  competitors JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{name, cited, position}]
  ai_statement TEXT,                                -- verbatim AI description (feeds B8)
  notes TEXT,
  observed_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS discovery_observations_target_idx
  ON public.discovery_observations (target_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS discovery_observations_business_idx
  ON public.discovery_observations (business_id, observed_at DESC);

-- ---------------------------------------------------------------------------
-- 3. discovery_brand_truths — the expected entity truths (B4/B8).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discovery_brand_truths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  aspect TEXT NOT NULL,                     -- e.g. 'what_it_is', 'what_it_does'
  expected_statement TEXT NOT NULL,         -- the authoritative truth
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS discovery_brand_truths_business_aspect_key
  ON public.discovery_brand_truths (business_id, aspect);

-- ---------------------------------------------------------------------------
-- 4. discovery_brand_checks — an observed AI statement vs a truth (B8).
--    AI statement → expected truth → mismatch → severity → correction.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discovery_brand_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  truth_id UUID NOT NULL REFERENCES public.discovery_brand_truths(id) ON DELETE CASCADE,
  engine TEXT NOT NULL DEFAULT 'other',
  ai_statement TEXT NOT NULL,
  mismatch BOOLEAN NOT NULL DEFAULT false,
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  recommended_correction TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'addressed', 'dismissed')),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS discovery_brand_checks_business_idx
  ON public.discovery_brand_checks (business_id, status, severity);

-- ---------------------------------------------------------------------------
-- 5. content_opportunities — what to write + the B11 quality gate (B10/B11).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cluster TEXT NOT NULL DEFAULT 'general',
  rationale TEXT,                    -- why it matters (evidence: a gap, a competitor citation)
  search_intent TEXT,                -- informational / commercial / transactional / navigational
  target_audience TEXT,
  supporting_topics TEXT[] NOT NULL DEFAULT '{}',
  internal_links TEXT[] NOT NULL DEFAULT '{}',
  evidence_required TEXT,            -- what first-hand evidence the piece must cite
  conversion_goal TEXT,              -- the action the piece should drive
  priority_score INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'approved', 'in_progress', 'published', 'rejected')),
  -- B11 quality gate — authority, not volume. A piece may be marked
  -- 'published' only when all three are true (enforced by trigger below).
  originality_confirmed BOOLEAN NOT NULL DEFAULT false,
  evidence_confirmed BOOLEAN NOT NULL DEFAULT false,
  human_reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  published_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS content_opportunities_business_idx
  ON public.content_opportunities (business_id, status, priority_score DESC);

-- B11: no AI content factory. 'published' requires the full quality gate.
CREATE OR REPLACE FUNCTION public.enforce_content_quality_gate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'published' AND NOT (
    NEW.originality_confirmed AND NEW.evidence_confirmed AND NEW.human_reviewed
  ) THEN
    RAISE EXCEPTION 'content_opportunities: cannot publish before the quality gate (originality + evidence + human review)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_opportunities_quality_gate ON public.content_opportunities;
CREATE TRIGGER content_opportunities_quality_gate
  BEFORE INSERT OR UPDATE ON public.content_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.enforce_content_quality_gate();

-- ---------------------------------------------------------------------------
-- 6. discovery_content — published pieces (the B14 attribution anchor).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discovery_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.content_opportunities(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  cluster TEXT NOT NULL DEFAULT 'general',
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS discovery_content_business_url_key
  ON public.discovery_content (business_id, url);

-- ---------------------------------------------------------------------------
-- 7. discovery_referrals — B14 attribution events. One row = one arrival at
--    a business's public surface with known provenance (UTM/referrer),
--    optionally linked to the entity it produced (lead/deal/business).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discovery_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source TEXT,                       -- utm_source (google, chatgpt, perplexity, newsletter…)
  medium TEXT,                       -- utm_medium (organic, ai-citation, referral…)
  campaign TEXT,                     -- utm_campaign
  content_url TEXT,                  -- the content piece that drove the visit
  referrer TEXT,                     -- raw document.referrer
  landing_path TEXT,                 -- where they landed (/pricing, /book/…)
  entity_type TEXT,                  -- what the visit produced, once linked
  entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS discovery_referrals_business_idx
  ON public.discovery_referrals (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS discovery_referrals_entity_idx
  ON public.discovery_referrals (entity_type, entity_id) WHERE entity_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS — business-scoped on every table (canonical get_current_staff pattern).
-- ---------------------------------------------------------------------------
ALTER TABLE public.discovery_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_brand_truths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_brand_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_referrals ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'discovery_targets', 'discovery_observations', 'discovery_brand_truths',
    'discovery_brand_checks', 'content_opportunities', 'discovery_content',
    'discovery_referrals'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated
         USING (business_id IN (SELECT business_id FROM public.get_current_staff()))', t, t);
    EXECUTE format(
      'CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated
         WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()))', t, t);
    EXECUTE format(
      'CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated
         USING (business_id IN (SELECT business_id FROM public.get_current_staff()))
         WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()))', t, t);
    EXECUTE format(
      'CREATE POLICY %I_delete ON public.%I FOR DELETE TO authenticated
         USING (business_id IN (SELECT business_id FROM public.get_current_staff()))', t, t);
  END LOOP;
END $$;

-- updated_at triggers (canonical helper from 007).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['discovery_targets', 'discovery_brand_truths', 'discovery_brand_checks', 'content_opportunities'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Module gate seeds (the two-flag gate): 'discovery' is entitled at tier 2
-- and ready (it persists real data today).
-- ---------------------------------------------------------------------------
INSERT INTO public.module_plan_tiers (module_key, min_plan_tier, display_name, category)
VALUES ('discovery', 2, 'Discovery', 'reach')
ON CONFLICT (module_key) DO UPDATE SET
  min_plan_tier = EXCLUDED.min_plan_tier,
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category;

INSERT INTO public.module_status (module_key, ready, notes)
VALUES ('discovery', true, 'discovery intelligence persists: targets/observations/brand-truth/opportunities/referrals')
ON CONFLICT (module_key) DO UPDATE SET ready = EXCLUDED.ready, notes = EXCLUDED.notes;

-- ---------------------------------------------------------------------------
-- RPC: seed_discovery_defaults(p_business_id) — idempotent first-run seed.
-- Brand truths derived from the business's own name/industry (FACTS the
-- business asserts about itself), plus starter tracked queries.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_discovery_defaults(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_name TEXT;
  v_industry TEXT;
  v_truths INT := 0;
  v_targets INT := 0;
BEGIN
  -- Canonical membership guard (zz-closure pattern).
  IF NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = p_business_id) THEN
    RETURN jsonb_build_object('authorized', false, 'truths', 0, 'targets', 0);
  END IF;

  SELECT name, COALESCE(industry, 'business') INTO v_name, v_industry
  FROM public.businesses WHERE id = p_business_id;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'truths', 0, 'targets', 0);
  END IF;

  INSERT INTO public.discovery_brand_truths (business_id, aspect, expected_statement) VALUES
    (p_business_id, 'what_it_is',  v_name || ' is a ' || v_industry || ' business.'),
    (p_business_id, 'brand_name',  'The brand name is "' || v_name || '" — spelled exactly, never abbreviated or confused with another company.'),
    (p_business_id, 'what_it_does', v_name || ' operates in the ' || v_industry || ' space and serves its customers directly.')
  ON CONFLICT (business_id, aspect) DO NOTHING;
  GET DIAGNOSTICS v_truths = ROW_COUNT;

  INSERT INTO public.discovery_targets (business_id, query, cluster, kind, priority) VALUES
    (p_business_id, v_name, 'brand', 'seo', 5),
    (p_business_id, v_name || ' reviews', 'brand', 'aeo', 4),
    (p_business_id, 'what is ' || v_name, 'brand', 'geo', 4),
    (p_business_id, 'best ' || v_industry || ' software', 'industry', 'geo', 3),
    (p_business_id, 'best ' || v_industry || ' companies', 'industry', 'seo', 3)
  ON CONFLICT (business_id, query) DO NOTHING;
  GET DIAGNOSTICS v_targets = ROW_COUNT;

  RETURN jsonb_build_object('authorized', true, 'truths', v_truths, 'targets', v_targets);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- RPC: discovery_overview(p_business_id) — the B13 dashboard aggregator.
-- One call: visibility, citation share, per-engine, brand-truth state,
-- opportunity funnel, attribution rollup. Computed from recorded
-- observations only — empty means empty (§22).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discovery_overview(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_targets INT;
  v_obs_30d INT;
  v_present INT;
  v_cited INT;
  v_checks INT;
  v_mismatches INT;
  v_open_mismatches INT;
  v_opps JSONB;
  v_refs INT;
  v_refs_30d INT;
  v_engines JSONB;
  v_trend JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = p_business_id) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT COUNT(*) INTO v_targets FROM public.discovery_targets t
  WHERE t.business_id = p_business_id AND t.active;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE o.avenize_present),
         COUNT(*) FILTER (WHERE o.avenize_cited)
  INTO v_obs_30d, v_present, v_cited
  FROM public.discovery_observations o
  WHERE o.business_id = p_business_id AND o.observed_at >= NOW() - INTERVAL '30 days';

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE c.mismatch),
         COUNT(*) FILTER (WHERE c.mismatch AND c.status = 'open')
  INTO v_checks, v_mismatches, v_open_mismatches
  FROM public.discovery_brand_checks c
  WHERE c.business_id = p_business_id;

  SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) INTO v_opps
  FROM (
    SELECT status, COUNT(*) AS n FROM public.content_opportunities
    WHERE business_id = p_business_id GROUP BY status
  ) s;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE r.created_at >= NOW() - INTERVAL '30 days')
  INTO v_refs, v_refs_30d
  FROM public.discovery_referrals r WHERE r.business_id = p_business_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'engine', e.engine, 'checks', e.n, 'present', e.present, 'cited', e.cited
  ) ORDER BY e.engine), '[]'::jsonb) INTO v_engines
  FROM (
    SELECT engine, COUNT(*) AS n,
           COUNT(*) FILTER (WHERE avenize_present) AS present,
           COUNT(*) FILTER (WHERE avenize_cited) AS cited
    FROM public.discovery_observations
    WHERE business_id = p_business_id AND observed_at >= NOW() - INTERVAL '30 days'
    GROUP BY engine
  ) e;

  -- Weekly presence trend over the last 12 weeks (for the visibility chart).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'week', w.week_start, 'checks', w.n, 'present', w.present, 'cited', w.cited
  ) ORDER BY w.week_start), '[]'::jsonb) INTO v_trend
  FROM (
    SELECT date_trunc('week', observed_at)::date AS week_start,
           COUNT(*) AS n,
           COUNT(*) FILTER (WHERE avenize_present) AS present,
           COUNT(*) FILTER (WHERE avenize_cited) AS cited
    FROM public.discovery_observations
    WHERE business_id = p_business_id AND observed_at >= NOW() - INTERVAL '12 weeks'
    GROUP BY 1
  ) w;

  RETURN jsonb_build_object(
    'authorized', true,
    'targets', v_targets,
    'observations_30d', v_obs_30d,
    'present_30d', v_present,
    'cited_30d', v_cited,
    -- NULL (not 0%) when nothing observed — honest insufficient-data (§21).
    'presence_rate', CASE WHEN v_obs_30d > 0 THEN ROUND(100.0 * v_present / v_obs_30d, 1) END,
    'citation_rate', CASE WHEN v_obs_30d > 0 THEN ROUND(100.0 * v_cited / v_obs_30d, 1) END,
    'brand_checks', v_checks,
    'brand_mismatches', v_mismatches,
    'open_mismatches', v_open_mismatches,
    'opportunities', v_opps,
    'referrals', v_refs,
    'referrals_30d', v_refs_30d,
    'engines', v_engines,
    'trend', v_trend
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- RPC: discovery_query_leaderboard(p_business_id) — B9 per-query: for each
-- tracked query, how often we appear/get cited vs which competitors do.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discovery_query_leaderboard(p_business_id UUID)
RETURNS TABLE (
  target_id UUID,
  query TEXT,
  cluster TEXT,
  kind TEXT,
  checks BIGINT,
  avenize_present BIGINT,
  avenize_cited BIGINT,
  top_competitors JSONB,
  last_observed_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = p_business_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id, t.query, t.cluster, t.kind,
    COUNT(o.id) AS checks,
    COUNT(o.id) FILTER (WHERE o.avenize_present) AS avenize_present,
    COUNT(o.id) FILTER (WHERE o.avenize_cited) AS avenize_cited,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', c.name, 'cited', c.n) ORDER BY c.n DESC), '[]'::jsonb)
      FROM (
        SELECT comp->>'name' AS name, COUNT(*) AS n
        FROM public.discovery_observations o2,
             LATERAL jsonb_array_elements(o2.competitors) comp
        WHERE o2.target_id = t.id AND (comp->>'cited')::boolean
        GROUP BY 1
        ORDER BY n DESC
        LIMIT 5
      ) c
    ) AS top_competitors,
    MAX(o.observed_at) AS last_observed_at
  FROM public.discovery_targets t
  LEFT JOIN public.discovery_observations o ON o.target_id = t.id
  WHERE t.business_id = p_business_id AND t.active
  GROUP BY t.id, t.query, t.cluster, t.kind
  ORDER BY t.priority DESC, checks DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- RPC: discovery_brand_truth_report(p_business_id) — B8: each truth with its
-- latest observed AI statement + mismatch state.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discovery_brand_truth_report(p_business_id UUID)
RETURNS TABLE (
  truth_id UUID,
  aspect TEXT,
  expected_statement TEXT,
  latest_ai_statement TEXT,
  latest_engine TEXT,
  latest_mismatch BOOLEAN,
  latest_severity TEXT,
  open_checks BIGINT
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = p_business_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    bt.id, bt.aspect, bt.expected_statement,
    lc.ai_statement, lc.engine, lc.mismatch, lc.severity,
    (SELECT COUNT(*) FROM public.discovery_brand_checks oc
      WHERE oc.truth_id = bt.id AND oc.mismatch AND oc.status = 'open') AS open_checks
  FROM public.discovery_brand_truths bt
  LEFT JOIN LATERAL (
    SELECT c.ai_statement, c.engine, c.mismatch, c.severity
    FROM public.discovery_brand_checks c
    WHERE c.truth_id = bt.id
    ORDER BY c.observed_at DESC
    LIMIT 1
  ) lc ON true
  WHERE bt.business_id = p_business_id AND bt.active
  ORDER BY bt.aspect;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- RPC: discovery_roi(p_business_id) — B14, the closed loop.
-- DISCOVERY → VISIT → ENTITY (lead/deal/business) → REVENUE.
-- Revenue is attributed ONLY through explicit referral→entity links against
-- real tables (won deals / paid invoices / subscription payments). Nothing
-- is estimated (§22): when nothing is linked, totals are 0 with an honest
-- note — not a fabricated ROI.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discovery_roi(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_refs INT;
  v_linked INT;
  v_by_source JSONB;
  v_deal_revenue NUMERIC;
  v_sub_revenue NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = p_business_id) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE r.entity_id IS NOT NULL)
  INTO v_refs, v_linked
  FROM public.discovery_referrals r WHERE r.business_id = p_business_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'source', COALESCE(s.source, 'direct'), 'visits', s.n, 'linked', s.linked
  ) ORDER BY s.n DESC), '[]'::jsonb) INTO v_by_source
  FROM (
    SELECT source, COUNT(*) AS n, COUNT(*) FILTER (WHERE entity_id IS NOT NULL) AS linked
    FROM public.discovery_referrals
    WHERE business_id = p_business_id
    GROUP BY source ORDER BY n DESC LIMIT 10
  ) s;

  -- Won-deal revenue attributed to discovery (referral → deal links).
  SELECT COALESCE(SUM(d.value), 0) INTO v_deal_revenue
  FROM public.discovery_referrals r
  JOIN public.deals d ON d.id = r.entity_id AND d.business_id = p_business_id
  WHERE r.business_id = p_business_id AND r.entity_type = 'deal' AND d.stage = 'won';

  -- Subscription revenue attributed to discovery (the Avenize tenant's own
  -- loop: referral → business → its subscription payments).
  SELECT COALESCE(SUM(sp.amount_cents), 0) / 100.0 INTO v_sub_revenue
  FROM public.discovery_referrals r
  JOIN public.business_subscriptions bs
    ON bs.business_id = r.entity_id AND r.entity_type = 'business'
  JOIN public.subscription_payments sp
    ON sp.business_id = r.entity_id AND sp.status = 'successful'
  WHERE r.business_id = p_business_id;

  RETURN jsonb_build_object(
    'authorized', true,
    'referrals', v_refs,
    'linked', v_linked,
    'by_source', v_by_source,
    'deal_revenue', v_deal_revenue,
    'subscription_revenue', COALESCE(v_sub_revenue, 0),
    'attributed_revenue', v_deal_revenue + COALESCE(v_sub_revenue, 0),
    'note', CASE WHEN v_linked = 0
      THEN 'No referral-to-revenue links recorded yet. Link arrivals to the deals or signups they produced to start measuring discovery ROI.'
      ELSE NULL END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- RPC: record_discovery_referral(...) — best-effort attribution capture.
-- Called by the client when a public-surface arrival carries UTM/referrer
-- provenance. Membership-guarded like everything else.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_discovery_referral(
  p_business_id UUID,
  p_source TEXT DEFAULT NULL,
  p_medium TEXT DEFAULT NULL,
  p_campaign TEXT DEFAULT NULL,
  p_content_url TEXT DEFAULT NULL,
  p_referrer TEXT DEFAULT NULL,
  p_landing_path TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = p_business_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.discovery_referrals (
    business_id, source, medium, campaign, content_url, referrer,
    landing_path, entity_type, entity_id
  ) VALUES (
    p_business_id, p_source, p_medium, p_campaign, p_content_url, p_referrer,
    p_landing_path, p_entity_type, p_entity_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grants (the 998 blanket grants EXECUTE to authenticated; state explicitly).
GRANT EXECUTE ON FUNCTION public.seed_discovery_defaults(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discovery_overview(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discovery_query_leaderboard(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discovery_brand_truth_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discovery_roi(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_discovery_referral(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

COMMENT ON TABLE public.discovery_targets IS 'Discovery Intelligence (Phase B): tracked queries/topics per business (SEO/AEO/GEO).';
COMMENT ON TABLE public.discovery_observations IS 'Recorded engine-answer checks. A row is a FACT: at observed_at, engine answered target this way. Never fabricated.';
COMMENT ON TABLE public.discovery_brand_checks IS 'B8 AI Brand Truth Monitor: observed AI statement vs expected brand truth → mismatch → severity → correction.';
COMMENT ON TABLE public.content_opportunities IS 'B10/B11 content opportunities with the enforced quality gate (originality + evidence + human review before publish).';
COMMENT ON TABLE public.discovery_referrals IS 'B14 attribution: public-surface arrivals with provenance, linked to the entity they produced (deal/lead/business).';
COMMENT ON FUNCTION public.discovery_roi(UUID) IS 'B14 closed loop: discovery → visit → entity → revenue. Explicit links only, never estimated (§22).';
