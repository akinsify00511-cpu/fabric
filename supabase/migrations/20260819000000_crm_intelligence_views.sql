-- CRM Intelligence Surface backing views
-- Backs the three CRMIntelligenceSurface queries (drift fix) with REAL,
-- deterministic interpretation over the canonical CRM tables (001):
-- contacts, deals, invoices. No new write stores — pure views (§0.5).
-- security_invoker = true so the base tables' business-scoped RLS is
-- evaluated as the querying user (never the migration owner) — required
-- to avoid cross-tenant reads through the view (Supabase view gotcha).

-- Who should I call next: priority-ranked open deals. The score is a
-- deterministic heuristic over real columns (stage weight + staleness +
-- value) — interpretation, not inference (§22).
CREATE OR REPLACE VIEW public.smart_call_list
WITH (security_invoker = true) AS
SELECT
  d.id AS deal_id,
  d.business_id,
  d.title AS deal_title,
  c.name AS contact_name,
  d.stage,
  d.value,
  GREATEST(0, current_date - d.updated_at::date) AS days_since_activity,
  d.updated_at AS last_activity_at,
  (current_date - d.updated_at::date) > 14 AS cold_flag,
  CASE WHEN (current_date - d.updated_at::date) > 14
       THEN 'No activity in ' || (current_date - d.updated_at::date) || ' days'
  END AS cold_reason,
  d.expected_close AS next_action_date,
  (
    CASE d.stage WHEN 'negotiation' THEN 25 WHEN 'proposal' THEN 20 WHEN 'qualified' THEN 10 ELSE 5 END
    + LEAST(GREATEST(current_date - d.updated_at::date, 0), 30)
    + LEAST(COALESCE(round(d.value / 100000), 0), 40)
  )::numeric AS call_score
FROM public.deals d
LEFT JOIN public.contacts c ON c.id = d.contact_id
WHERE d.stage NOT IN ('won','lost');

-- Pre-call context: per-contact rollup of open pipeline, invoicing and
-- last activity, composed from deals (contact-linked) and invoices
-- (deal-linked). Honest zeros when a contact has no history yet.
CREATE OR REPLACE VIEW public.pre_call_briefing
WITH (security_invoker = true) AS
WITH deal_agg AS (
  SELECT
    d.contact_id, d.business_id,
    count(*) FILTER (WHERE d.stage NOT IN ('won','lost')) AS open_deal_count,
    COALESCE(sum(d.value) FILTER (WHERE d.stage NOT IN ('won','lost')), 0) AS open_pipeline_value,
    bool_or(d.stage NOT IN ('won','lost') AND d.expected_close IS NOT NULL AND d.expected_close < current_date) AS has_overdue_expected_close,
    bool_or(d.stage NOT IN ('won','lost') AND (current_date - d.updated_at::date) > 14) AS has_cold_deal,
    max(d.updated_at) AS last_deal_at
  FROM public.deals d
  GROUP BY d.contact_id, d.business_id
),
inv_agg AS (
  SELECT
    d.contact_id, d.business_id,
    count(i.id) AS invoice_count,
    COALESCE(sum(i.total) FILTER (WHERE i.status NOT IN ('draft','cancelled')), 0) AS invoiced_value,
    COALESCE(sum(i.total) FILTER (WHERE i.status = 'paid'), 0) AS paid_invoice_value,
    min(i.due_date) FILTER (WHERE i.status IN ('sent','overdue')) AS next_due_date,
    max(i.updated_at) AS last_invoice_at
  FROM public.deals d
  JOIN public.invoices i ON i.deal_id = d.id
  GROUP BY d.contact_id, d.business_id
)
SELECT
  c.id AS contact_id,
  c.business_id,
  c.name AS contact_name,
  c.company,
  NULLIF(concat_ws(' · ',
    CASE WHEN COALESCE(da.open_deal_count, 0) > 0 THEN COALESCE(da.open_deal_count, 0) || ' open deal(s)' END,
    CASE WHEN COALESCE(ia.invoice_count, 0) > 0 THEN COALESCE(ia.invoice_count, 0) || ' invoice(s)' END,
    CASE WHEN COALESCE(ia.paid_invoice_value, 0) > 0 THEN '₦ paid: ' || round(COALESCE(ia.paid_invoice_value, 0))::bigint END
  ), '') AS last_activity_summary,
  GREATEST(c.updated_at, COALESCE(da.last_deal_at, c.updated_at), COALESCE(ia.last_invoice_at, c.updated_at)) AS last_activity_at,
  COALESCE(da.open_deal_count, 0) AS open_deal_count,
  COALESCE(da.open_pipeline_value, 0) AS open_pipeline_value,
  COALESCE(da.has_overdue_expected_close, false) AS has_risk,
  COALESCE(da.has_cold_deal, false) AS has_cold_deal,
  COALESCE(ia.invoice_count, 0) AS invoice_count,
  COALESCE(ia.invoiced_value, 0) AS invoiced_value,
  COALESCE(ia.paid_invoice_value, 0) AS paid_invoice_value,
  ia.next_due_date
FROM public.contacts c
LEFT JOIN deal_agg da ON da.contact_id = c.id AND da.business_id = c.business_id
LEFT JOIN inv_agg ia ON ia.contact_id = c.id AND ia.business_id = c.business_id;

-- Forecast integrity: discrepancies between what the pipeline claims and
-- what the data supports. Every row cites a real record and a real reason.
CREATE OR REPLACE VIEW public.forecast_integrity
WITH (security_invoker = true) AS
SELECT d.id AS deal_id, d.business_id, d.title AS deal_title, d.stage, d.value,
       'overdue_expected_close' AS discrepancy_type,
       'Expected close ' || to_char(d.expected_close, 'YYYY-MM-DD') || ' has passed and the deal is still ' || d.stage AS discrepancy_reason,
       d.updated_at AS last_activity_at
FROM public.deals d
WHERE d.stage NOT IN ('won','lost') AND d.expected_close IS NOT NULL AND d.expected_close < current_date
UNION ALL
SELECT d.id, d.business_id, d.title, d.stage, d.value,
       'stale_deal',
       'No activity in ' || (current_date - d.updated_at::date) || ' days on an open deal',
       d.updated_at
FROM public.deals d
WHERE d.stage NOT IN ('won','lost') AND (current_date - d.updated_at::date) > 14
UNION ALL
SELECT d.id, d.business_id, d.title, d.stage, d.value,
       'missing_contact',
       'Deal has no linked contact',
       d.updated_at
FROM public.deals d
WHERE d.stage NOT IN ('won','lost') AND d.contact_id IS NULL
UNION ALL
SELECT d.id, d.business_id, d.title, d.stage, d.value,
       'missing_value',
       'Deal has no value — excluded from any forecast',
       d.updated_at
FROM public.deals d
WHERE d.stage NOT IN ('won','lost') AND COALESCE(d.value, 0) <= 0;

GRANT SELECT ON public.smart_call_list TO authenticated;
GRANT SELECT ON public.pre_call_briefing TO authenticated;
GRANT SELECT ON public.forecast_integrity TO authenticated;
