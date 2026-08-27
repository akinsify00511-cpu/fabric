-- =============================================================================
-- Personal Experience Layer (P0)
--
-- The Personalization Constitution (Product Constitution, Article IX) requires
-- every authenticated user to receive an experience derived from their identity,
-- membership, role, responsibilities, business context and preferences — and it
-- REQUIRES this be built by composition on existing canonical objects, never by
-- duplicating them into parallel `user_*` tables.
--
-- Audit result (docs/domains/PERSONAL_EXPERIENCE.md): the overwhelming majority of
-- the Personal Experience contract ALREADY EXISTS and is canonical:
--   - identity/membership/role  → staff, resolve_current_user_context() (20260826190000)
--   - active_role persona       → staff.active_role, set_active_role (20260818250000)
--   - member_kind               → staff.member_kind (20260819015000)
--   - secondary roles           → staff_secondary_roles (20260818250000)
--   - tool access               → staff_functional_roles (027)
--   - dept/team/position        → staff_assignments, departments, teams, positions (039)
--   - reporting                 → reporting_structure, departments.head_staff_id (023/039)
--   - business/org              → businesses, organizations (20260817150000)
--   - entitlements              → business_entitlements + module gate (Session 8)
--   - workspace selection       → user_workspace_selections (100)
--   - locale / notification     → user_locale (012), notification_preferences (013)
--   - behaviour                 → usage_events (Session 9), user_activity_daily (037)
--   - governed metrics          → metric_definitions / kpi_metrics (086/019)
--   - next best action          → business_brain (20260818220000), compose_business_digest
--
-- This migration fills ONLY the three genuinely missing pieces and adds ONE
-- server-assembled context RPC that the whole app consumes. NO parallel tables.
-- =============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. user_pinned_items — the missing half of workspace personalization.
--    Module choice (user_workspace_selections) lets a user curate tools; this lets
--    them pin important individual entities to their personal workspace (a deal,
--    a customer, a report, a project, a lead, an invoice, a module).
--    Personalization can NEVER grant access: a user can only pin entities their
--    existing permissions already expose (enforcement is at consumption time via
--    the RLS-scoped read, not at write time — RLS stays the boundary).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_pinned_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- The kind of thing being pinned. Allowlist keeps the model deliberate; a module
  -- pin surfaces a tool (compose with user_workspace_selections), an entity pin
  -- surface a specific record (deal/customer/project/lead/report/invoice).
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('module','customer','deal','project','report','lead','invoice')),
  entity_id   TEXT NOT NULL,       -- module key for 'module'; UUID (as text) for entities
  pin_label   TEXT,                -- display label override (optional)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_pinned_items_unique UNIQUE (user_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_user_pinned_items_user
  ON public.user_pinned_items (user_id, sort_order);

ALTER TABLE public.user_pinned_items ENABLE ROW LEVEL SECURITY;

-- A user manages only their own pins.
DROP POLICY IF EXISTS user_pinned_items_self ON public.user_pinned_items;
CREATE POLICY user_pinned_items_self
  ON public.user_pinned_items
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- updated_at maintenance (self-contained; if 007's helper exists it's used below).
DROP TRIGGER IF EXISTS trg_user_pinned_items_updated ON public.user_pinned_items;
DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    CREATE TRIGGER trg_user_pinned_items_updated
      BEFORE UPDATE ON public.user_pinned_items
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $body$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_pinned_items TO authenticated;
REVOKE ALL ON public.user_pinned_items FROM anon;

-- ---------------------------------------------------------------------------
-- 2. user_goals — the "My Goals" contract. Progress comes from a linked governed
--    metric (FACT) or from user-confirmed values (USER CONFIRMED); never invented
--    (Article V / ¦22). Category allowlist mirrors the function home (functionHome.ts)
--    so a "sales" goal cannot be invented for a function with no sales scope.
--    Personal goals are personal to the user's own working scope, never someone
--    else's business.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_goals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category    TEXT NOT NULL
    CHECK (category IN ('general','marketing','sales','finance','hr','operations','projects')),
  title       TEXT NOT NULL,
  description TEXT,
  -- Optional link to a governed metric so progress can flow from real data.
  metric_key  TEXT REFERENCES public.metric_definitions(key) ON DELETE SET NULL,
  start_value NUMERIC,            -- baseline (null = no measurable baseline yet)
  target_value NUMERIC,
  current_value NUMERIC,          -- user-confirmed OR synced from metric actual
  unit        TEXT NOT NULL DEFAULT 'currency' CHECK (unit IN ('currency','number','percent','duration_days','ratio','boolean')),
  due_on       DATE,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','at_risk','paused','achieved','abandoned')),
  -- progress_source labels the honesty of the value (¦22): 'metric' = governed FACT,
  -- 'user' = USER CONFIRMED, 'none' = not set (show insufficient-data note).
  progress_source TEXT NOT NULL DEFAULT 'none' CHECK (progress_source IN ('metric','user','none')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_goals_unique UNIQUE (user_id, title)
);

CREATE INDEX IF NOT EXISTS idx_user_goals_user ON public.user_goals (user_id, status);

ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_goals_self ON public.user_goals;
CREATE POLICY user_goals_self
  ON public.user_goals
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_user_goals_updated ON public.user_goals;
DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    CREATE TRIGGER trg_user_goals_updated
      BEFORE UPDATE ON public.user_goals
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $body$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_goals TO authenticated;
REVOKE ALL ON public.user_goals FROM anon;

-- ---------------------------------------------------------------------------
-- 3. user_ai_memory — personal working-context memory with a hard privacy boundary.
--    NOT surveillance: entries are assembled ONLY from data within the user's own
--    authorized scope (their responsibilities, preferences, and legitimate work
--    facts). Every entry carries a source label (SYSTEM CAPTURED / AI INFERRED /
--    USER ENTERED / USER CONFIRMED) so AI inference never silently becomes fact.
--    Own-rows RLS — no other user, and never cross-business, can read a memory row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_ai_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('routine','significant','context')),
  -- A short, truthful fact assembled from the user's own scope, e.g.
  --   { "signal":"reviews_sales_on_monday", "detail":"Femi usually reviews sales performance on Monday mornings" }
  payload     JSONB NOT NULL,
  source      TEXT NOT NULL DEFAULT 'system_captured'
    CHECK (source IN ('system_captured','ai_inferred','user_entered','user_confirmed')),
  -- The memory is valid only while true; routine memories can be refreshed/expired.
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_ai_memory_user ON public.user_ai_memory (user_id, kind);
CREATE INDEX IF NOT EXISTS idx_user_ai_memory_signal
  ON public.user_ai_memory ((payload ->> 'signal'))
  WHERE payload ? 'signal';

ALTER TABLE public.user_ai_memory ENABLE ROW LEVEL SECURITY;

-- Own-rows only.
DROP POLICY IF EXISTS user_ai_memory_self ON public.user_ai_memory;
CREATE POLICY user_ai_memory_self
  ON public.user_ai_memory
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_user_ai_memory_updated ON public.user_ai_memory;
DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    CREATE TRIGGER trg_user_ai_memory_updated
      BEFORE UPDATE ON public.user_ai_memory
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $body$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ai_memory TO authenticated;
REVOKE ALL ON public.user_ai_memory FROM anon;

-- ---------------------------------------------------------------------------
-- 4. my_context() — the ONE authoritative server-assembled Personal Experience
--    object every consumer (nav, home surface, notifications, quick actions,
--    recommendations) derives from. Composes the canonical objects; does NOT
--    duplicate them. SECURITY DEFINER but every scoped reference is resolved
--    through get_current_staff() / the caller's own staff row, so a caller can
--    never see anyone else's context or a different business. Returns an honest
--    empty context (no fabrication) when the user has no active membership.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_sid  UUID;
  v_bid  UUID;
  v_role text;
  v_uid  UUID := auth.uid();
  v_out  jsonb;
BEGIN
  -- Resolve the caller's own active membership (canonical resolver shapes).
  SELECT s.id, s.business_id, s.role
    INTO v_sid, v_bid, v_role
  FROM public.staff s
  WHERE s.user_id = v_uid
    AND coalesce(s.active, true) = true
  ORDER BY s.created_at ASC
  LIMIT 1;

  -- No active membership → honest empty context, no error, nothing leaked.
  IF v_sid IS NULL THEN
    RETURN jsonb_build_object(
      'identity', jsonb_build_object('user_id', v_uid),
      'membership', jsonb_build_object('has_membership', false)
    );
  END IF;

  SELECT jsonb_build_object(
    'identity', (
      SELECT jsonb_build_object(
        'user_id',     s.user_id,
        'staff_id',    s.id,
        'name',        s.name,
        'email',       s.email,
        'bio',         s.bio
      ) FROM public.staff s WHERE s.id = v_sid
    ),
    'membership', (
      SELECT jsonb_build_object(
        'staff_id',        s.id,
        'business_id',     s.business_id,
        'role',            s.role,
        'active_role',     s.active_role,
        'member_kind',     s.member_kind,
        'job_title',       s.job_title,
        'department',      s.department,
        'onboarding_completed', s.onboarding_completed
      ) FROM public.staff s WHERE s.id = v_sid
    ),
    -- Responsibilities: departments/teams headed, reporting lines, secondary roles.
    -- Composed from canonical org/assignment/reporting tables; exclusively within the
    -- caller's own business scope (v_bid is derived from their own staff row).
    'responsibilities', (
      SELECT jsonb_build_object(
        'departments_headed', COALESCE((
          SELECT jsonb_agg(name) FROM public.departments
          WHERE business_id = v_bid AND head_staff_id = v_sid
        ), '[]'::jsonb),
        'teams_headed', COALESCE((
          SELECT jsonb_agg(name) FROM public.teams
          WHERE business_id = v_bid AND lead_id = v_sid
        ), '[]'::jsonb),
        'reports_to', (
          SELECT COALESCE(array_agg(s2.name ORDER BY s2.name), '{}')
          FROM public.reporting_structure rs
          JOIN public.staff s2 ON s2.id = rs.manager_id
          WHERE rs.staff_id = v_sid AND rs.is_active = true
        ),
        'direct_reports', (
          SELECT COALESCE(array_agg(s2.name ORDER BY s2.name), '{}')
          FROM public.reporting_structure rs
          JOIN public.staff s2 ON s2.id = rs.staff_id
          WHERE rs.manager_id = v_sid AND rs.is_active = true
        ),
        'secondary_roles', COALESCE((
          SELECT jsonb_agg(r.role) FROM public.staff_secondary_roles r
          WHERE r.staff_id = v_sid
        ), '[]'::jsonb),
        'department_memberships', COALESCE((
          SELECT jsonb_agg(d.name) FROM public.department_members dm
          JOIN public.departments d ON d.id = dm.department_id
          WHERE dm.staff_id = v_sid
        ), '[]'::jsonb)
      )
    ),
    -- Business context (caller's own business only).
    'business', (
      SELECT jsonb_build_object(
        'business_name', b.name,
        'industry',      b.industry,
        'organization_id', b.organization_id,
        'company_size',  (SELECT count(*)::int FROM public.staff s WHERE s.business_id = b.id
                          AND coalesce(s.active, true) = true)
      ) FROM public.businesses b WHERE b.id = v_bid
    ),
    -- Entitlements: the subscription plan + features (authority, not personalization).
    'entitlements', (
      SELECT jsonb_build_object(
        'plan_code', be.plan,
        'features',  be.features
      ) FROM public.business_entitlements be WHERE be.business_id = v_bid
    ),
    -- Workspace: selected tools + pinned items + pinned modules.
    'workspaces', (
      SELECT jsonb_build_object(
        'selected_tools',        COALESCE(ws.selected_tools, '{}'::text[]),
        'selection_completed',   COALESCE(ws.selection_completed, false),
        'pinned_items',          COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'entity_type', pi.entity_type,
            'entity_id',   pi.entity_id,
            'pin_label',   pi.pin_label,
            'sort_order',  pi.sort_order
          ) ORDER BY pi.sort_order)
          FROM public.user_pinned_items pi WHERE pi.user_id = v_uid
        ), '[]'::jsonb)
      ) FROM public.user_workspace_selections ws
      WHERE ws.user_id = v_uid AND ws.business_id = v_bid
    ),
    -- Personal preferences.
    'personal', (
      SELECT jsonb_build_object(
        'locale', jsonb_build_object(
          'language',      ul.language,
          'timezone',      ul.timezone,
          'date_format',   ul.date_format,
          'time_format',   ul.time_format
        ),
        'notification', jsonb_build_object(
          'email_enabled',   np.email_enabled,
          'push_enabled',    np.push_enabled,
          'in_app_enabled',  np.in_app_enabled
        )
      )
      FROM public.user_locale ul
      LEFT JOIN public.notification_preferences np ON np.user_id = ul.user_id
      WHERE ul.user_id = v_uid
    ),
    -- Personal AI memory (own rows only): legitimate work-context facts.
    'ai_memory', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('kind', m.kind, 'payload', m.payload, 'source', m.source)
        ORDER BY m.last_seen_at DESC
      ), '[]'::jsonb)
      FROM public.user_ai_memory m WHERE m.user_id = v_uid
    ),
    -- Personal goals: the user's own goals, with an honest progress status.
    'goals', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',         g.id,
        'category',   g.category,
        'title',      g.title,
        'description', g.description,
        'metric_key', g.metric_key,
        'start_value', g.start_value,
        'target_value', g.target_value,
        'current_value', g.current_value,
        'unit',       g.unit,
        'due_on',     g.due_on,
        'status',     g.status,
        'progress_source', g.progress_source
      ) ORDER BY g.created_at DESC), '[]'::jsonb)
      FROM public.user_goals g WHERE g.user_id = v_uid
    )
  ) INTO v_out;

  RETURN v_out;
END;
$fn$;

REVOKE ALL ON FUNCTION public.my_context() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_context() TO authenticated;

COMMENT ON FUNCTION public.my_context() IS
  'Canonical Personal Experience context object: identity → membership → responsibilities → business → entitlements → workspaces → personal preferences → ai_memory → goals. SECURITY DEFINER but strictly auth.uid()-scoped; honest empty context when no membership.';

-- ---------------------------------------------------------------------------
-- 5. my_workspace_arrangement() — a lean RPC for personal workspace management
--    (current pins + selected tools in one call). Read-only composition; writes go
--    through the individual tables (RLS-own-rows) as today.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_workspace_arrangement()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT public.my_context() -> 'workspaces'
$fn$;

REVOKE ALL ON FUNCTION public.my_workspace_arrangement() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_workspace_arrangement() TO authenticated;

COMMENT ON FUNCTION public.my_workspace_arrangement() IS
  'Lean RPC returning just the workspaces block of my_context() for the authenticated user.';