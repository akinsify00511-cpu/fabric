-- ============================================================================
-- Unified Business Search (Master Directive §27; docs/domains/SEARCH.md)
-- ONE membership-guarded RPC that searches an explicit allowlist of tenant
-- tables scoped to the caller's business. Ranking: exact > prefix > substring,
-- recency tiebreaker, per-type caps so one noisy type can't flood results.
-- RLS remains the backstop; the SECURITY DEFINER body pre-filters by
-- business_id so a member only ever sees their own tenant's records.
-- Entities: staff, contacts, leads, meetings, objectives, quotes, orders,
--           tasks, activities (business_events). Payroll/finance/walled
--           content is excluded BY CONSTRUCTION (never in the allowlist).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.business_search(
  p_query TEXT,
  p_types TEXT[] DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_biz UUID;
  v_q TEXT;
  v_lim INT;
  v_pattern TEXT;
  v_exact TEXT;
  v_prefix TEXT;
  v_per_type INT;
  v_results JSONB;
  v_counts JSONB;
  v_total INT;
BEGIN
  -- Membership gate (the real boundary — RLS does not protect SECURITY DEFINER)
  SELECT cs.business_id INTO v_biz FROM public.get_current_staff() cs LIMIT 1;
  IF v_biz IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'results', '[]'::jsonb,
      'counts', '{}'::jsonb, 'total', 0, 'query', '');
  END IF;

  v_q := btrim(COALESCE(p_query, ''));
  IF length(v_q) < 2 THEN
    RETURN jsonb_build_object('authorized', true, 'results', '[]'::jsonb,
      'counts', '{}'::jsonb, 'total', 0, 'query', v_q, 'note', 'type at least 2 characters');
  END IF;

  v_lim := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_per_type := GREATEST(1, (v_lim / 3));

  -- Escape ILIKE metacharacters so user input is literal text (no SQL/like injection)
  v_pattern := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  v_exact := lower(v_q);
  v_prefix := v_pattern || '%';

  WITH allowed(t) AS (
    SELECT unnest(COALESCE(p_types, ARRAY['staff','contact','lead','meeting',
      'objective','quote','order','task','activity']))
  ),
  hits AS (
    SELECT * FROM (
      SELECT 'staff'::text AS type, s.id, s.name AS title,
        COALESCE(NULLIF(s.job_title,''), s.role) AS subtitle,
        s.email AS detail, s.created_at, '/app/people'::text AS route,
        CASE WHEN lower(s.name)=v_exact OR lower(COALESCE(s.email,''))=v_exact THEN 0
             WHEN s.name ILIKE v_prefix ESCAPE '\' THEN 1 ELSE 2 END AS rank
      FROM public.staff s JOIN allowed a ON a.t='staff'
      WHERE s.business_id=v_biz AND
        (s.name ILIKE '%'||v_pattern||'%' ESCAPE '\' OR s.email ILIKE '%'||v_pattern||'%' ESCAPE '\'
         OR COALESCE(s.job_title,'') ILIKE '%'||v_pattern||'%' ESCAPE '\'
         OR COALESCE(s.department,'') ILIKE '%'||v_pattern||'%' ESCAPE '\')

      UNION ALL
      SELECT 'contact', c.id, c.name, COALESCE(c.company,''), COALESCE(c.email,''), c.created_at, '/app/crm',
        CASE WHEN lower(c.name)=v_exact OR lower(COALESCE(c.email,''))=v_exact THEN 0
             WHEN c.name ILIKE v_prefix ESCAPE '\' THEN 1 ELSE 2 END
      FROM public.contacts c JOIN allowed a ON a.t='contact'
      WHERE c.business_id=v_biz AND
        (c.name ILIKE '%'||v_pattern||'%' ESCAPE '\' OR COALESCE(c.email,'') ILIKE '%'||v_pattern||'%' ESCAPE '\'
         OR COALESCE(c.company,'') ILIKE '%'||v_pattern||'%' ESCAPE '\')

      UNION ALL
      SELECT 'lead', l.id, l.full_name, COALESCE(l.company_name, l.status), COALESCE(l.email,''), l.created_at, '/app/leads',
        CASE WHEN lower(l.full_name)=v_exact OR lower(COALESCE(l.email,''))=v_exact THEN 0
             WHEN l.full_name ILIKE v_prefix ESCAPE '\' THEN 1 ELSE 2 END
      FROM public.leads l JOIN allowed a ON a.t='lead'
      WHERE l.business_id=v_biz AND
        (l.full_name ILIKE '%'||v_pattern||'%' ESCAPE '\' OR COALESCE(l.email,'') ILIKE '%'||v_pattern||'%' ESCAPE '\'
         OR COALESCE(l.company_name,'') ILIKE '%'||v_pattern||'%' ESCAPE '\')

      UNION ALL
      SELECT 'meeting', m.id, m.title, COALESCE(m.location, m.status), m.status, m.created_at, '/app/meetings',
        CASE WHEN lower(m.title)=v_exact THEN 0 WHEN m.title ILIKE v_prefix ESCAPE '\' THEN 1 ELSE 2 END
      FROM public.meetings m JOIN allowed a ON a.t='meeting'
      WHERE m.business_id=v_biz AND
        (m.title ILIKE '%'||v_pattern||'%' ESCAPE '\' OR COALESCE(m.description,'') ILIKE '%'||v_pattern||'%' ESCAPE '\'
         OR COALESCE(m.location,'') ILIKE '%'||v_pattern||'%' ESCAPE '\'
         OR COALESCE(m.agenda,'') ILIKE '%'||v_pattern||'%' ESCAPE '\')

      UNION ALL
      SELECT 'objective', o.id, o.title, COALESCE(o.level, o.status), o.status, o.created_at, '/app/okrs',
        CASE WHEN lower(o.title)=v_exact THEN 0 WHEN o.title ILIKE v_prefix ESCAPE '\' THEN 1 ELSE 2 END
      FROM public.strategic_objectives o JOIN allowed a ON a.t='objective'
      WHERE o.business_id=v_biz AND
        (o.title ILIKE '%'||v_pattern||'%' ESCAPE '\' OR COALESCE(o.description,'') ILIKE '%'||v_pattern||'%' ESCAPE '\')

      UNION ALL
      SELECT 'quote', q.id, COALESCE(NULLIF(q.title,''), 'Quote #' || COALESCE(q.quote_number::text,'')), q.client_name, q.status, q.created_at, '/app/quotes',
        CASE WHEN lower(COALESCE(q.client_name,''))=v_exact OR lower(COALESCE(q.title,''))=v_exact THEN 0
             WHEN COALESCE(q.client_name,'') ILIKE v_prefix ESCAPE '\' OR COALESCE(q.title,'') ILIKE v_prefix ESCAPE '\' THEN 1 ELSE 2 END
      FROM public.quotes q JOIN allowed a ON a.t='quote'
      WHERE q.business_id=v_biz AND
        (COALESCE(q.client_name,'') ILIKE '%'||v_pattern||'%' ESCAPE '\'
         OR COALESCE(q.title,'') ILIKE '%'||v_pattern||'%' ESCAPE '\'
         OR COALESCE(q.quote_number::text,'') ILIKE '%'||v_pattern||'%' ESCAPE '\')

      UNION ALL
      SELECT 'order', so.id, 'Order #' || so.order_number::text, COALESCE(c2.name, so.status), so.status, so.created_at, '/app/orders',
        CASE WHEN so.order_number::text = v_q THEN 0 ELSE 1 END
      FROM public.sales_orders so JOIN allowed a ON a.t='order'
      LEFT JOIN public.contacts c2 ON c2.id = so.contact_id
      WHERE so.business_id=v_biz AND
        (so.order_number::text ILIKE '%'||v_pattern||'%' ESCAPE '\'
         OR COALESCE(c2.name,'') ILIKE '%'||v_pattern||'%' ESCAPE '\'
         OR COALESCE(so.status,'') ILIKE '%'||v_pattern||'%' ESCAPE '\')

      UNION ALL
      SELECT 'task', t.id, t.title, COALESCE(t.status, t.priority), COALESCE(t.status,''), t.created_at, '/app/tasks',
        CASE WHEN lower(t.title)=v_exact THEN 0 WHEN t.title ILIKE v_prefix ESCAPE '\' THEN 1 ELSE 2 END
      FROM public.tasks t JOIN allowed a ON a.t='task'
      WHERE t.business_id=v_biz AND
        (t.title ILIKE '%'||v_pattern||'%' ESCAPE '\' OR COALESCE(t.description,'') ILIKE '%'||v_pattern||'%' ESCAPE '\')

      UNION ALL
      SELECT 'activity', be.id, be.event_type, COALESCE(be.entity_type,''), be.event_type, be.created_at, '/app/activity',
        CASE WHEN lower(be.event_type)=v_exact THEN 0 ELSE 2 END
      FROM public.business_events be JOIN allowed a ON a.t='activity'
      WHERE be.business_id=v_biz AND
        (be.event_type ILIKE '%'||v_pattern||'%' ESCAPE '\' OR COALESCE(be.entity_type,'') ILIKE '%'||v_pattern||'%' ESCAPE '\')
    ) u
  ),
  capped AS (
    SELECT type, id, title, subtitle, detail, created_at, route, rank,
      ROW_NUMBER() OVER (PARTITION BY type ORDER BY rank, created_at DESC) AS rn
    FROM hits
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'type', type, 'id', id, 'title', title, 'subtitle', subtitle,
      'detail', detail, 'route', route, 'created_at', created_at, 'rank', rank
    ) ORDER BY rank, created_at DESC), '[]'::jsonb),
    (SELECT COALESCE(jsonb_object_agg(type, cnt), '{}'::jsonb)
       FROM (SELECT type, COUNT(*) cnt FROM hits GROUP BY type) c),
    (SELECT COUNT(*) FROM hits)
  INTO v_results, v_counts, v_total
  FROM capped WHERE rn <= v_per_type;

  RETURN jsonb_build_object(
    'authorized', true, 'results', COALESCE(v_results,'[]'::jsonb),
    'counts', COALESCE(v_counts,'{}'::jsonb), 'total', COALESCE(v_total,0), 'query', v_q
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_search(TEXT, TEXT[], INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_search(TEXT, TEXT[], INT) TO authenticated;

COMMENT ON FUNCTION public.business_search(TEXT, TEXT[], INT) IS
  'Unified tenant-scoped search across staff/contacts/leads/meetings/objectives/quotes/orders/tasks/activities. Membership-guarded; exact>prefix>substring ranking; per-type caps.';

NOTIFY pgrst, 'reload schema';
