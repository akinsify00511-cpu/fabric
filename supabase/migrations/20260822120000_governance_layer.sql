-- Governance Layer — Organization → Governance → Board.
--
-- The Board is a governance structure INSIDE the organization, not a product
-- module. This migration adds the governance data model to the existing
-- organizational primitives (board_members 20260818330000, departments/teams,
-- strategic_objectives 063/094, meetings 998+phaseA):
--   * board_committees + board_committee_members — committee structure with
--     chairs/members drawn from the board roster.
--   * board_resolutions — the decision register (proposed → approved/rejected
--     with recorded votes). Resolutions are the cascade seed.
--   * board_conflicts — the conflicts-of-interest register.
--   * strategic_objectives.board_resolution_id — links an objective to the
--     Board decision that seeded it (parent_id from 063 is the cascade tree).
--   * meetings.board_committee_id — board/committee meetings reuse the
--     canonical meeting lifecycle; NO parallel meeting system (§0.5).
--   * RPCs: record_board_vote, cascade_board_objective (resolution →
--     objective), objective_cascade_tree, board_governance_overview,
--     compose_board_report (AGGREGATE-ONLY — no salaries, no PII, no
--     operational detail; the board-visibility boundary is construction-based).
--
-- All tables: RLS business-scoped via get_current_staff(); management is
-- owner/admin; read is any business member (structure is not secret).

-- =============================================================================
-- 1. board_committees
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.board_committees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  committee_type TEXT NOT NULL DEFAULT 'other'
    CHECK (committee_type IN ('audit', 'finance', 'risk', 'remuneration', 'strategy', 'nomination', 'other')),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_committees_business ON public.board_committees(business_id);

ALTER TABLE public.board_committees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_committees_read ON public.board_committees;
CREATE POLICY board_committees_read ON public.board_committees
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS board_committees_write ON public.board_committees;
CREATE POLICY board_committees_write ON public.board_committees
  FOR ALL TO authenticated
  USING (
    business_id IN (SELECT business_id FROM public.get_current_staff())
    AND (SELECT role FROM public.get_current_staff()) IN ('owner', 'admin')
  );

DROP TRIGGER IF EXISTS trg_board_committees_updated_at ON public.board_committees;
CREATE TRIGGER trg_board_committees_updated_at
  BEFORE UPDATE ON public.board_committees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- 2. board_committee_members
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.board_committee_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id UUID NOT NULL REFERENCES public.board_committees(id) ON DELETE CASCADE,
  board_member_id UUID NOT NULL REFERENCES public.board_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('chair', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (committee_id, board_member_id)
);

CREATE INDEX IF NOT EXISTS idx_bcm_committee ON public.board_committee_members(committee_id);
CREATE INDEX IF NOT EXISTS idx_bcm_member ON public.board_committee_members(board_member_id);

ALTER TABLE public.board_committee_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bcm_read ON public.board_committee_members;
CREATE POLICY bcm_read ON public.board_committee_members
  FOR SELECT TO authenticated
  USING (committee_id IN (
    SELECT id FROM public.board_committees c
    WHERE c.business_id IN (SELECT business_id FROM public.get_current_staff())
  ));

DROP POLICY IF EXISTS bcm_write ON public.board_committee_members;
CREATE POLICY bcm_write ON public.board_committee_members
  FOR ALL TO authenticated
  USING (
    committee_id IN (
      SELECT id FROM public.board_committees c
      WHERE c.business_id IN (SELECT business_id FROM public.get_current_staff())
    )
    AND (SELECT role FROM public.get_current_staff()) IN ('owner', 'admin')
  );

-- =============================================================================
-- 3. board_resolutions — the decision register
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.board_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  resolution_type TEXT NOT NULL DEFAULT 'ordinary'
    CHECK (resolution_type IN ('ordinary', 'special')),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'tabled', 'withdrawn')),
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  votes_for INT NOT NULL DEFAULT 0,
  votes_against INT NOT NULL DEFAULT 0,
  votes_abstain INT NOT NULL DEFAULT 0,
  decided_at TIMESTAMPTZ,
  implemented_at TIMESTAMPTZ,
  due_date DATE,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_resolutions_business ON public.board_resolutions(business_id);
CREATE INDEX IF NOT EXISTS idx_board_resolutions_status ON public.board_resolutions(business_id, status);

ALTER TABLE public.board_resolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_resolutions_read ON public.board_resolutions;
CREATE POLICY board_resolutions_read ON public.board_resolutions
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS board_resolutions_write ON public.board_resolutions;
CREATE POLICY board_resolutions_write ON public.board_resolutions
  FOR ALL TO authenticated
  USING (
    business_id IN (SELECT business_id FROM public.get_current_staff())
    AND (SELECT role FROM public.get_current_staff()) IN ('owner', 'admin')
  );

DROP TRIGGER IF EXISTS trg_board_resolutions_updated_at ON public.board_resolutions;
CREATE TRIGGER trg_board_resolutions_updated_at
  BEFORE UPDATE ON public.board_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- 4. board_conflicts — conflicts-of-interest register
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.board_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  board_member_id UUID NOT NULL REFERENCES public.board_members(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'mitigated', 'resolved')),
  mitigation TEXT,
  declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_conflicts_business ON public.board_conflicts(business_id);

ALTER TABLE public.board_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_conflicts_read ON public.board_conflicts;
CREATE POLICY board_conflicts_read ON public.board_conflicts
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS board_conflicts_write ON public.board_conflicts;
CREATE POLICY board_conflicts_write ON public.board_conflicts
  FOR ALL TO authenticated
  USING (
    business_id IN (SELECT business_id FROM public.get_current_staff())
    AND (SELECT role FROM public.get_current_staff()) IN ('owner', 'admin')
  );

DROP TRIGGER IF EXISTS trg_board_conflicts_updated_at ON public.board_conflicts;
CREATE TRIGGER trg_board_conflicts_updated_at
  BEFORE UPDATE ON public.board_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- 5. Board meetings reuse the canonical meetings table (composition, §0.5).
--    board_committee_id NULL = full-board meeting; set = committee meeting.
-- =============================================================================
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS board_committee_id UUID REFERENCES public.board_committees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_board_committee ON public.meetings(board_committee_id)
  WHERE board_committee_id IS NOT NULL;

COMMENT ON COLUMN public.meetings.board_committee_id IS
  'Governance body for board/committee meetings. NULL = full board. Reuses the canonical meetings lifecycle; no parallel meeting system.';

-- =============================================================================
-- 6. Objective cascade link — an objective may cite the Board resolution that
--    seeded it. parent_id (063) provides the tree; this provides provenance.
-- =============================================================================
ALTER TABLE public.strategic_objectives
  ADD COLUMN IF NOT EXISTS board_resolution_id UUID REFERENCES public.board_resolutions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_so_board_resolution ON public.strategic_objectives(board_resolution_id)
  WHERE board_resolution_id IS NOT NULL;

COMMENT ON COLUMN public.strategic_objectives.board_resolution_id IS
  'The Board resolution that seeded this objective (Board decision → company objective → cascaded objectives provenance).';

-- =============================================================================
-- 7. record_board_vote — record votes and derive the outcome server-side.
--    Ordinary resolutions need for > against. Special resolutions need 2/3 of
--    cast votes. Owner/admin only.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_board_vote(
  p_resolution_id UUID,
  p_for INT,
  p_against INT,
  p_abstain INT DEFAULT 0
)
RETURNS public.board_resolutions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_resolution public.board_resolutions;
  v_outcome TEXT;
  v_cast INT;
BEGIN
  SELECT * INTO v_resolution FROM public.board_resolutions WHERE id = p_resolution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resolution not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Owner/admin of the resolution's business only.
  IF NOT EXISTS (
    SELECT 1 FROM public.get_current_staff() cs
    WHERE cs.business_id = v_resolution.business_id
      AND cs.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only an owner or admin can record board votes.' USING ERRCODE = '42501';
  END IF;

  IF p_for < 0 OR p_against < 0 OR p_abstain < 0 THEN
    RAISE EXCEPTION 'Vote counts cannot be negative.' USING ERRCODE = '22023';
  END IF;

  IF v_resolution.resolution_type = 'special' THEN
    v_cast := p_for + p_against;
    v_outcome := CASE
      WHEN v_cast = 0 THEN 'rejected'
      WHEN p_for >= CEIL(v_cast * 2.0 / 3.0) THEN 'approved'
      ELSE 'rejected'
    END;
  ELSE
    v_outcome := CASE WHEN p_for > p_against THEN 'approved' ELSE 'rejected' END;
  END IF;

  UPDATE public.board_resolutions
  SET votes_for = p_for,
      votes_against = p_against,
      votes_abstain = p_abstain,
      status = v_outcome,
      decided_at = now()
  WHERE id = p_resolution_id
  RETURNING * INTO v_resolution;

  RETURN v_resolution;
END
$$;

REVOKE EXECUTE ON FUNCTION public.record_board_vote(UUID, INT, INT, INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.record_board_vote(UUID, INT, INT, INT) TO authenticated;

COMMENT ON FUNCTION public.record_board_vote(UUID, INT, INT, INT) IS
  'Record board votes and derive outcome (ordinary: for>against; special: 2/3 of cast). Owner/admin only.';

-- =============================================================================
-- 8. cascade_board_objective — Board decision → objective → (optionally child
--    of another objective). Marks the resolution implemented on first cascade.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cascade_board_objective(
  p_resolution_id UUID,
  p_title TEXT,
  p_scope TEXT DEFAULT 'company',
  p_department_id UUID DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_parent_objective_id UUID DEFAULT NULL,
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL,
  p_due_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_resolution public.board_resolutions;
  v_objective_id UUID;
BEGIN
  SELECT * INTO v_resolution FROM public.board_resolutions WHERE id = p_resolution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resolution not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.get_current_staff() cs
    WHERE cs.business_id = v_resolution.business_id
      AND cs.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only an owner or admin can cascade board objectives.' USING ERRCODE = '42501';
  END IF;

  IF v_resolution.status != 'approved' THEN
    RAISE EXCEPTION 'Only approved resolutions can cascade into objectives.' USING ERRCODE = '22023';
  END IF;

  IF p_scope NOT IN ('company', 'department', 'team', 'individual') THEN
    RAISE EXCEPTION 'Invalid scope.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.strategic_objectives (
    business_id, level, title, description, parent_id,
    scope, department_id, owner_id, period_start, period_end, due_date,
    board_resolution_id, status
  )
  VALUES (
    v_resolution.business_id, 'objective', p_title, v_resolution.description,
    p_parent_objective_id, p_scope, p_department_id, p_owner_id,
    p_period_start, p_period_end, p_due_date,
    p_resolution_id, 'active'
  )
  RETURNING id INTO v_objective_id;

  -- First cascade marks the resolution implemented (idempotent — only NULL).
  UPDATE public.board_resolutions
  SET implemented_at = now()
  WHERE id = p_resolution_id AND implemented_at IS NULL;

  RETURN v_objective_id;
END
$$;

REVOKE EXECUTE ON FUNCTION public.cascade_board_objective(UUID, TEXT, TEXT, UUID, UUID, UUID, DATE, DATE, DATE) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.cascade_board_objective(UUID, TEXT, TEXT, UUID, UUID, UUID, DATE, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.cascade_board_objective(UUID, TEXT, TEXT, UUID, UUID, UUID, DATE, DATE, DATE) IS
  'Cascade an approved Board resolution into a strategic objective (Board decision → company objective → cascaded child objectives).';

-- =============================================================================
-- 9. objective_cascade_tree — recursive tree with per-node progress. Depth is
--    bounded (40) to defend against accidental parent_id cycles.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.objective_cascade_tree(p_root_objective_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_root public.strategic_objectives;
BEGIN
  SELECT * INTO v_root FROM public.strategic_objectives WHERE id = p_root_objective_id;
  IF NOT FOUND THEN
    RETURN '[]'::JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.get_current_staff() cs
    WHERE cs.business_id = v_root.business_id
  ) THEN
    RETURN '[]'::JSONB;
  END IF;

  RETURN (
    WITH RECURSIVE tree AS (
      SELECT o.id, o.title, o.scope, o.status, o.department_id, o.owner_id,
             o.due_date, o.period_start, o.period_end, o.board_resolution_id, 0 AS depth
      FROM public.strategic_objectives o
      WHERE o.id = p_root_objective_id
      UNION ALL
      SELECT o.id, o.title, o.scope, o.status, o.department_id, o.owner_id,
             o.due_date, o.period_start, o.period_end, o.board_resolution_id, t.depth + 1
      FROM public.strategic_objectives o
      JOIN tree t ON o.parent_id = t.id
      WHERE t.depth < 40
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'scope', t.scope,
      'status', t.status,
      'depth', t.depth,
      'owner_name', (SELECT s.name FROM public.staff s WHERE s.id = t.owner_id),
      'department_name', (SELECT d.name FROM public.departments d WHERE d.id = t.department_id),
      'due_date', t.due_date,
      'progress', public.objective_progress(t.id),
      'from_board_resolution', t.board_resolution_id IS NOT NULL
    ) ORDER BY t.depth, t.title), '[]'::JSONB)
    FROM tree t
  );
END
$$;

REVOKE EXECUTE ON FUNCTION public.objective_cascade_tree(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.objective_cascade_tree(UUID) TO authenticated;

COMMENT ON FUNCTION public.objective_cascade_tree(UUID) IS
  'Recursive objective tree with per-node weighted KR progress (objective_progress). Depth-bounded (40) cycle guard. Members only.';

-- =============================================================================
-- 10. board_governance_overview — the governance tab in one round-trip.
--     Membership-guarded; empty payload for non-members.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.board_governance_overview(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.get_current_staff() cs
    WHERE cs.business_id = p_business_id
  ) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,
    'members', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'title', m.title, 'email', m.email,
        'phone', m.phone, 'bio', m.bio, 'is_active', m.is_active,
        'term_start', m.term_start, 'term_end', m.term_end
      ) ORDER BY CASE m.title WHEN 'Chair' THEN 0 WHEN 'Vice Chair' THEN 1 ELSE 2 END, m.name), '[]'::JSONB)
      FROM public.board_members m
      WHERE m.business_id = p_business_id AND m.is_active
    ),
    'committees', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'committee_type', c.committee_type,
        'description', c.description,
        'members', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'board_member_id', cm.board_member_id, 'role', cm.role, 'name', m.name
          )), '[]'::JSONB)
          FROM public.board_committee_members cm
          JOIN public.board_members m ON m.id = cm.board_member_id
          WHERE cm.committee_id = c.id
        )
      ) ORDER BY c.name), '[]'::JSONB)
      FROM public.board_committees c
      WHERE c.business_id = p_business_id AND c.is_active
    ),
    'upcoming_meetings', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', mt.id, 'title', mt.title, 'scheduled_start', mt.scheduled_start,
        'committee_id', mt.board_committee_id,
        'committee_name', (SELECT c.name FROM public.board_committees c WHERE c.id = mt.board_committee_id),
        'status', mt.status
      ) ORDER BY mt.scheduled_start), '[]'::JSONB)
      FROM (
        SELECT * FROM public.meetings mt2
        WHERE mt2.business_id = p_business_id
          AND mt2.scheduled_start >= now() - INTERVAL '1 day'
        ORDER BY mt2.scheduled_start
        LIMIT 10
      ) mt
      WHERE mt.board_committee_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.board_resolutions r WHERE r.meeting_id = mt.id)
    ),
    'open_resolutions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'resolution_type', r.resolution_type,
        'status', r.status, 'due_date', r.due_date, 'created_at', r.created_at,
        'implemented', r.implemented_at IS NOT NULL
      ) ORDER BY r.created_at DESC), '[]'::JSONB)
      FROM public.board_resolutions r
      WHERE r.business_id = p_business_id AND r.status IN ('proposed', 'approved')
    ),
    'recent_decisions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'status', r.status,
        'votes_for', r.votes_for, 'votes_against', r.votes_against,
        'votes_abstain', r.votes_abstain, 'decided_at', r.decided_at,
        'implemented', r.implemented_at IS NOT NULL
      ) ORDER BY r.decided_at DESC), '[]'::JSONB)
      FROM (
        SELECT * FROM public.board_resolutions r2
        WHERE r2.business_id = p_business_id
          AND r2.status IN ('approved', 'rejected')
          AND r2.decided_at IS NOT NULL
        ORDER BY r2.decided_at DESC
        LIMIT 10
      ) r
    ),
    'active_conflicts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', cf.id, 'title', cf.title, 'member_name', m.name, 'status', cf.status,
        'declared_at', cf.declared_at
      )), '[]'::JSONB)
      FROM public.board_conflicts cf
      JOIN public.board_members m ON m.id = cf.board_member_id
      WHERE cf.business_id = p_business_id AND cf.status = 'active'
    ),
    'board_objectives', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', o.id, 'title', o.title, 'scope', o.scope, 'status', o.status,
        'resolution_id', o.board_resolution_id,
        'due_date', o.due_date,
        'progress', public.objective_progress(o.id)
      ) ORDER BY o.created_at DESC), '[]'::JSONB)
      FROM public.strategic_objectives o
      WHERE o.business_id = p_business_id
        AND o.board_resolution_id IS NOT NULL
        AND o.status != 'archived'
    )
  );
END
$$;

REVOKE EXECUTE ON FUNCTION public.board_governance_overview(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.board_governance_overview(UUID) TO authenticated;

COMMENT ON FUNCTION public.board_governance_overview(UUID) IS
  'One-call governance tab: members, committees, upcoming board meetings, open resolutions, recent decisions, active conflicts, board-seeded objectives. Members only.';

-- =============================================================================
-- 11. compose_board_report — AGGREGATE-ONLY board visibility.
--
--     The contextual board-permission boundary: a Board receives aggregate
--     strategy/finance/risk/progress — never salaries, employee PII, CRM
--     conversations, or operational row-level detail. That exclusion is
--     CONSTRUCTION-based: this function never references those tables.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.compose_board_report(
  p_business_id UUID,
  p_period_start DATE DEFAULT date_trunc('month', now())::DATE,
  p_period_end DATE DEFAULT (date_trunc('month', now())::DATE + INTERVAL '1 month - 1 day')::DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_health public.business_health_scores;
  v_invoiced NUMERIC;
  v_collected NUMERIC;
  v_overdue_count INT;
  v_overdue_value NUMERIC;
  v_risks JSONB;
  v_resolutions JSONB;
  v_objectives JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.get_current_staff() cs
    WHERE cs.business_id = p_business_id
  ) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  -- Aggregate health (latest recorded score).
  SELECT h INTO v_health
  FROM public.business_health_scores h
  WHERE h.business_id = p_business_id
  ORDER BY h.computed_at DESC
  LIMIT 1;

  -- Aggregate money (totals only, no customer names).
  SELECT COALESCE(SUM(total), 0) INTO v_invoiced
  FROM public.invoices
  WHERE business_id = p_business_id
    AND status != 'cancelled'
    AND created_at::DATE BETWEEN p_period_start AND p_period_end;

  SELECT COALESCE(SUM(total), 0) INTO v_collected
  FROM public.invoices
  WHERE business_id = p_business_id
    AND status = 'paid'
    AND created_at::DATE BETWEEN p_period_start AND p_period_end;

  SELECT COUNT(*), COALESCE(SUM(total), 0) INTO v_overdue_count, v_overdue_value
  FROM public.invoices
  WHERE business_id = p_business_id
    AND status IN ('sent', 'overdue')
    AND due_date < now()::DATE;

  -- Aggregate risk profile (counts by category, no risk narrative PII).
  -- risk_summary (095) returns scalar JSONB — call it directly.
  SELECT public.risk_summary(p_business_id) INTO v_risks;

  -- Governance decided in period (titles + votes only).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'title', r.title, 'type', r.resolution_type, 'outcome', r.status,
    'votes_for', r.votes_for, 'votes_against', r.votes_against,
    'decided_at', r.decided_at
  ) ORDER BY r.decided_at DESC), '[]'::JSONB) INTO v_resolutions
  FROM public.board_resolutions r
  WHERE r.business_id = p_business_id
    AND r.status IN ('approved', 'rejected')
    AND r.decided_at BETWEEN p_period_start::TIMESTAMPTZ AND (p_period_end + 1)::TIMESTAMPTZ;

  -- Board-seeded objective progress (aggregate progress vs elapsed).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'title', o.title, 'scope', o.scope, 'due_date', o.due_date,
    'progress', public.objective_progress(o.id),
    'elapsed_pct', CASE
      WHEN o.period_start IS NULL OR o.period_end IS NULL OR o.period_end <= o.period_start THEN NULL
      ELSE ROUND(LEAST(1, GREATEST(0, (now()::DATE - o.period_start)::NUMERIC / NULLIF((o.period_end - o.period_start), 0))) * 100)
    END,
    'status_label', CASE
      WHEN o.period_start IS NULL OR o.period_end IS NULL OR o.period_end <= o.period_start THEN 'unknown'
      WHEN public.objective_progress(o.id) IS NULL THEN 'unknown'
      WHEN public.objective_progress(o.id) + 15 < ROUND(LEAST(1, GREATEST(0, (now()::DATE - o.period_start)::NUMERIC / NULLIF((o.period_end - o.period_start), 0))) * 100) THEN 'at_risk'
      ELSE 'on_track'
    END
  )), '[]'::JSONB) INTO v_objectives
  FROM public.strategic_objectives o
  WHERE o.business_id = p_business_id
    AND o.board_resolution_id IS NOT NULL
    AND o.status != 'archived';

  RETURN jsonb_build_object(
    'authorized', true,
    'period_start', p_period_start,
    'period_end', p_period_end,
    -- The boundary, stated explicitly for consumers.
    'data_scope', 'aggregate_only: no salaries, no employee PII, no customer PII, no operational row detail',
    'health', CASE WHEN v_health IS NULL THEN jsonb_build_object('note', 'No health score computed yet.')
      ELSE jsonb_build_object(
        'overall_score', v_health.overall_score,
        'computed_at', v_health.computed_at,
        'dimension_scores', v_health.dimension_scores
      )
    END,
    'finance', jsonb_build_object(
      'invoiced_in_period', v_invoiced,
      'collected_in_period', v_collected,
      'overdue_count', v_overdue_count,
      'overdue_value', v_overdue_value
    ),
    'risk_profile', v_risks,
    'resolutions', v_resolutions,
    'board_objectives', v_objectives
  );
END
$$;

REVOKE EXECUTE ON FUNCTION public.compose_board_report(UUID, DATE, DATE) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.compose_board_report(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.compose_board_report(UUID, DATE, DATE) IS
  'Board report: aggregate health, finance totals, risk profile, resolutions, board-seeded objective progress. Data scope: aggregate_only (no salaries/PII/operational rows) by construction. Members only.';

-- =============================================================================
-- 12. Explicit grants for bare-postgres chains (998 blanket may have applied
--     before these tables existed in some chains). Guarded: roles checked.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_committees TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_committee_members TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_resolutions TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_conflicts TO authenticated';
  END IF;
END $$;
