-- DEMAND CAPTURE: Lead → Request → Quote → Order first-class entities
-- (filename zzzaaa_ so it applies after all existing zzz_*/0NN migrations;
-- verified clean + idempotent on postgres:15)
--
-- Audit summary (all rows reference the canonical entities, NEVER duplicate
-- customer records):
--   leads (041 + 075: business_id, RLS) — capture source.
--   contacts (001 + 075: lead_id backlink) — the customer record.
--   deals (001) — the legacy pipeline for some businesses; optional link.
--   quotes (048) — draft/sent/accepted/rejected/converted lifecycle.
--   products (001) — catalog reference for line items.
--   sales_orders — did NOT exist (only delivery_orders logistics /
--   purchase_orders supplier). Created here as the first-class customer order.
--   requests — did not exist as an entity (only a note concept). Created here.
--
-- LIFECYCLE:
--   request: new → reviewing → qualified → quoted → accepted → fulfilled
--            (terminal losers: rejected / abandoned)
--   quote:   draft → sent → viewed → accepted / rejected / expired /
--            (converted when it materializes an order)
--   order:   confirmed → in_fulfilment → fulfilled → completed
--            (terminal loser: cancelled)
--
-- CONVERSION PATHS (any shortcut allowed, never forced stages):
--   Lead → Request → Quote → Order
--   Lead → Request → Order
--   Lead → Quote → Order
--   Lead → Order
--
-- REVENUE INTELLIGENCE is derived purely from these links —
-- every downstream record retains the upstream chain (lead_id + request_id +
-- quote_id + contact_id) so analytics never guesses.

\set ON_ERROR_STOP on

-- =============================================================
-- 1. lead_requests — the customer's demand record
-- =============================================================
CREATE TABLE IF NOT EXISTS lead_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  request_number INT GENERATED ALWAYS AS IDENTITY,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL DEFAULT 'product'
    CHECK (request_type IN ('product','service','inspection','consultation','callback','custom')),
  title TEXT NOT NULL,
  description TEXT,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity NUMERIC(12,2),
  location TEXT,
  budget NUMERIC(12,2),
  urgency TEXT DEFAULT 'normal'
    CHECK (urgency IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','reviewing','qualified','quoted','accepted','fulfilled','rejected','abandoned')),
  assigned_to UUID REFERENCES staff(id),
  attachments JSONB DEFAULT '[]'::jsonb,
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_requests_business ON lead_requests(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_requests_lead ON lead_requests(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_requests_contact ON lead_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_requests_status ON lead_requests(business_id, status);

ALTER TABLE lead_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_requests_business_all ON lead_requests;
CREATE POLICY lead_requests_business_all ON lead_requests
  FOR ALL USING (
    business_id IN (SELECT business_id FROM public.get_current_staff())
  ) WITH CHECK (
    business_id IN (SELECT business_id FROM public.get_current_staff())
  );

-- =============================================================
-- 2. Extend quotes (048) with funnel backlinks + customer portal token + expiry
-- =============================================================
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES lead_requests(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Widen the lifecycle: viewed + expired states.
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft','sent','viewed','accepted','rejected','expired','converted'));

CREATE INDEX IF NOT EXISTS idx_quotes_lead ON quotes(lead_id);
CREATE INDEX IF NOT EXISTS idx_quotes_request ON quotes(request_id);

-- =============================================================
-- 3. sales_orders — first-class customer order
-- =============================================================
CREATE TABLE IF NOT EXISTS sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_number INT GENERATED ALWAYS AS IDENTITY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  request_id UUID REFERENCES lead_requests(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed','in_fulfilment','fulfilled','completed','cancelled')),
  assigned_to UUID REFERENCES staff(id) ON DELETE SET NULL,
  fulfilled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_business ON sales_orders(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_orders_lead ON sales_orders(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_quote ON sales_orders(quote_id);

ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_orders_business_all ON sales_orders;
CREATE POLICY sales_orders_business_all ON sales_orders
  FOR ALL USING (
    business_id IN (SELECT business_id FROM public.get_current_staff())
  ) WITH CHECK (
    business_id IN (SELECT business_id FROM public.get_current_staff())
  );

-- =============================================================
-- 4. demand_activity — one complete activity trail across the chain
-- =============================================================
CREATE TABLE IF NOT EXISTS demand_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  actor_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  action TEXT NOT NULL,     -- e.g. request.created, quote.status_change, order.fulfilled
  entity_type TEXT NOT NULL, -- request | quote | order | lead
  entity_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_activity_lead ON demand_activity(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_activity_business ON demand_activity(business_id, created_at DESC);

ALTER TABLE demand_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demand_activity_read ON demand_activity;
CREATE POLICY demand_activity_read ON demand_activity FOR SELECT USING (
  business_id IN (SELECT business_id FROM public.get_current_staff())
);
DROP POLICY IF EXISTS demand_activity_insert ON demand_activity;
CREATE POLICY demand_activity_insert ON demand_activity FOR INSERT WITH CHECK (
  business_id IN (SELECT business_id FROM public.get_current_staff())
);

-- =============================================================
-- 5. Lifecycle RPCs (SECURITY DEFINER + membership guard)
-- =============================================================

DROP FUNCTION IF EXISTS create_lead_request(uuid, uuid, text, text, text, uuid, numeric, text, numeric, text, jsonb);
CREATE OR REPLACE FUNCTION create_lead_request(
  p_lead_id UUID,
  p_request_type TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_product_id UUID DEFAULT NULL,
  p_quantity NUMERIC DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_budget NUMERIC DEFAULT NULL,
  p_urgency TEXT DEFAULT 'normal',
  p_attachments JSONB DEFAULT '[]'::jsonb
) RETURNS UUID
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_business UUID; v_contact UUID; v_assignee UUID; v_id UUID; v_num INT;
  v_lead leads%ROWTYPE;
BEGIN
  IF p_request_type !~ '^(product|service|inspection|consultation|callback|custom)$' THEN
    RAISE EXCEPTION 'invalid request type: %', p_request_type;
  END IF;
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;
  v_business := v_lead.business_id;
  v_assignee := COALESCE(v_lead.assigned_to, (SELECT id FROM staff WHERE user_id = auth.uid() LIMIT 1));
  v_contact := (SELECT c.id FROM contacts c WHERE c.lead_id = p_lead_id LIMIT 1);
  IF NOT EXISTS (SELECT 1 FROM get_current_staff() cs WHERE cs.business_id = v_business) THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  INSERT INTO lead_requests (business_id, lead_id, contact_id, request_type, title, description,
                             product_id, quantity, location, budget, urgency, assigned_to, attachments)
  VALUES (v_business, p_lead_id, v_contact, p_request_type, p_title, p_description,
          p_product_id, p_quantity, p_location, p_budget, p_urgency, v_assignee, p_attachments)
  RETURNING id, request_number INTO v_id, v_num;
  -- advance the lead funnel (contacted → qualified bends backward-safe)
  IF EXISTS (SELECT 1 FROM leads WHERE id = p_lead_id AND status = 'new') THEN
    UPDATE leads SET status = 'contacted', contacted_at = NOW() WHERE id = p_lead_id;
  END IF;
  INSERT INTO demand_activity (business_id, lead_id, actor_staff_id, action, entity_type, entity_id, details)
  VALUES (v_business, p_lead_id, v_assignee, 'request.created', 'request', v_id,
          jsonb_build_object('request_type', p_request_type, 'request_number', v_num, 'title', p_title));
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS create_quote(uuid, text, text, jsonb, uuid, numeric, numeric, timestamptz, uuid);
CREATE OR REPLACE FUNCTION create_quote(
  p_lead_id UUID,
  p_title TEXT,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_request_id UUID DEFAULT NULL,
  p_subtotal NUMERIC DEFAULT NULL,
  p_vat NUMERIC DEFAULT 0,
  p_valid_until TIMESTAMPTZ DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL
) RETURNS UUID
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_business UUID; v_contact UUID; v_id UUID; v_total NUMERIC; v_subtotal NUMERIC;
  v_lead leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;
  v_business := v_lead.business_id;
  v_contact := (SELECT c.id FROM contacts c WHERE c.lead_id = p_lead_id LIMIT 1);
  IF NOT EXISTS (SELECT 1 FROM get_current_staff() cs WHERE cs.business_id = v_business) THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  v_subtotal := COALESCE(p_subtotal, (
      SELECT SUM((item->>'quantity')::numeric * (item->>'unit_price')::numeric)
      FROM jsonb_array_elements(p_items) AS item
    ));
  v_total := COALESCE(v_subtotal, 0) + COALESCE(p_vat, 0);
  -- client_name/client_email are NOT NULL on quotes (048) — backfill from the lead.
  INSERT INTO quotes (business_id, quote_number, lead_id, request_id, contact_id,
                      client_name, client_email, title, items,
                      subtotal, vat_amount, total, valid_until, assigned_to, access_token, status)
  VALUES (v_business, 'Q-' || upper(substring(encode(gen_random_bytes(6), 'hex') from 1 for 10)),
          p_lead_id, p_request_id, v_contact,
          v_lead.full_name, v_lead.email, p_title, p_items,
          COALESCE(v_subtotal, 0), COALESCE(p_vat, 0), v_total, p_valid_until,
          COALESCE(p_assigned_to, (SELECT id FROM staff WHERE user_id = auth.uid() LIMIT 1)),
          encode(gen_random_bytes(24), 'hex'), 'draft')
  RETURNING id INTO v_id;
  IF p_request_id IS NOT NULL AND EXISTS (SELECT 1 FROM lead_requests WHERE id = p_request_id AND status IN ('new','reviewing','qualified')) THEN
    UPDATE lead_requests SET status = 'quoted' WHERE id = p_request_id;
  END IF;
  INSERT INTO demand_activity (business_id, lead_id, actor_staff_id, action, entity_type, entity_id, details)
  VALUES (v_business, p_lead_id, COALESCE(p_assigned_to, (SELECT id FROM staff WHERE user_id = auth.uid() LIMIT 1)),
          'quote.created', 'quote', v_id, jsonb_build_object('total', v_total));
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS create_sales_order(uuid, uuid, uuid, uuid, jsonb, numeric, text, uuid);
CREATE OR REPLACE FUNCTION create_sales_order(
  p_lead_id UUID DEFAULT NULL,
  p_request_id UUID DEFAULT NULL,
  p_quote_id UUID DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_total NUMERIC DEFAULT 0,
  p_title TEXT DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL
) RETURNS UUID
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_business UUID; v_assignee UUID; v_id UUID; v_num INT;
  v_lead UUID := p_lead_id; v_contact UUID := p_contact_id;
BEGIN
  -- Orders must inherit the complete upstream chain — an order created from
  -- a quote still carries the lead (and optionally request + contact) even if
  -- the caller only passed the quote.
  IF p_quote_id IS NOT NULL THEN
    SELECT q.business_id, q.assigned_to, q.lead_id, q.request_id, q.contact_id
      INTO v_business, v_assignee, v_lead, p_request_id, v_contact
    FROM quotes q WHERE q.id = p_quote_id;
  ELSIF p_request_id IS NOT NULL THEN
    SELECT l.business_id, COALESCE(l.assigned_to, (SELECT id FROM staff WHERE user_id = auth.uid() LIMIT 1)), l.lead_id, l.contact_id
      INTO v_business, v_assignee, v_lead, v_contact
    FROM lead_requests l WHERE l.id = p_request_id;
  ELSIF p_lead_id IS NOT NULL THEN
    SELECT l.business_id, COALESCE(l.assigned_to, (SELECT id FROM staff WHERE user_id = auth.uid() LIMIT 1)), l.id
      INTO v_business, v_assignee, v_lead
    FROM leads l WHERE l.id = p_lead_id;
  ELSE
    SELECT s.business_id, s.id INTO v_business, v_assignee FROM staff s WHERE s.user_id = auth.uid() LIMIT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM get_current_staff() cs WHERE cs.business_id = v_business) THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  IF p_quote_id IS NULL AND p_request_id IS NULL AND p_lead_id IS NULL THEN
    RAISE EXCEPTION 'order must reference a lead, request or quote';
  END IF;
  IF p_quote_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM quotes WHERE id = p_quote_id AND status = 'accepted') THEN
    RAISE EXCEPTION 'quote must be accepted before ordering';
  END IF;
  INSERT INTO sales_orders (business_id, contact_id, lead_id, request_id, quote_id,
                            items, total, status, assigned_to)
  VALUES (v_business, v_contact, v_lead, p_request_id, p_quote_id, p_items, p_total, 'confirmed',
          COALESCE(p_assigned_to, v_assignee))
  RETURNING id, order_number INTO v_id, v_num;
  IF p_quote_id IS NOT NULL THEN
    UPDATE quotes SET status = 'converted' WHERE id = p_quote_id;
  END IF;
  IF p_request_id IS NOT NULL AND EXISTS (SELECT 1 FROM lead_requests WHERE id = p_request_id AND status IN ('new','reviewing','qualified','quoted')) THEN
    UPDATE lead_requests SET status = 'accepted' WHERE id = p_request_id;
  END IF;
  v_contact := COALESCE(v_contact, (SELECT contact_id FROM lead_requests WHERE id = p_request_id));
  INSERT INTO demand_activity (business_id, lead_id, actor_staff_id, action, entity_type, entity_id, details)
  VALUES (v_business, v_lead,
          COALESCE(p_assigned_to, v_assignee), 'order.created', 'order', v_id,
          jsonb_build_object('order_number', v_num, 'total', p_total, 'title', p_title));
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Shared status-transition helper
DROP FUNCTION IF EXISTS transition_demand(text, uuid, text, uuid, text);
CREATE OR REPLACE FUNCTION transition_demand(
  p_entity TEXT,    -- 'request' | 'quote' | 'order'
  p_entity_id UUID,
  p_to_status TEXT,
  p_lost_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_business UUID; v_lead UUID; v_actor UUID;
BEGIN
  SELECT (SELECT id FROM staff WHERE user_id = auth.uid() LIMIT 1) INTO v_actor;
  IF p_entity = 'request' THEN
    SELECT l.business_id, l.lead_id INTO v_business, v_lead FROM lead_requests l WHERE l.id = p_entity_id;
  ELSIF p_entity = 'quote' THEN
    SELECT q.business_id, q.lead_id INTO v_business, v_lead FROM quotes q WHERE q.id = p_entity_id;
  ELSIF p_entity = 'order' THEN
    SELECT o.business_id, o.lead_id INTO v_business, v_lead FROM sales_orders o WHERE o.id = p_entity_id;
  ELSE
    RAISE EXCEPTION 'invalid entity';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM get_current_staff() cs WHERE cs.business_id = v_business) THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  IF p_entity = 'request' THEN
    IF p_to_status !~ '^(new|reviewing|qualified|quoted|accepted|fulfilled|rejected|abandoned)$' THEN RAISE EXCEPTION 'invalid status'; END IF;
    UPDATE lead_requests SET status = p_to_status, lost_reason = COALESCE(p_lost_reason, lost_reason) WHERE id = p_entity_id;
  ELSIF p_entity = 'quote' THEN
    IF p_to_status !~ '^(draft|sent|viewed|accepted|rejected|expired|converted)$' THEN RAISE EXCEPTION 'invalid status'; END IF;
    UPDATE quotes SET status = p_to_status WHERE id = p_entity_id;
  ELSIF p_entity = 'order' THEN
    IF p_to_status !~ '^(confirmed|in_fulfilment|fulfilled|completed|cancelled)$' THEN RAISE EXCEPTION 'invalid status'; END IF;
    UPDATE sales_orders SET status = p_to_status,
      fulfilled_at = CASE WHEN p_to_status = 'fulfilled' THEN NOW() ELSE fulfilled_at END,
      completed_at = CASE WHEN p_to_status = 'completed' THEN NOW() ELSE completed_at END,
      cancelled_at = CASE WHEN p_to_status = 'cancelled' THEN NOW() ELSE cancelled_at END,
      cancel_reason = COALESCE(p_lost_reason, cancel_reason)
    WHERE id = p_entity_id;
  END IF;
  INSERT INTO demand_activity (business_id, lead_id, actor_staff_id, action, entity_type, entity_id, details)
  VALUES (v_business, v_lead, v_actor, p_entity || '.status_change', p_entity, p_entity_id,
          jsonb_build_object('to_status', p_to_status, 'lost_reason', p_lost_reason));
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 6. Public customer-portal RPCs (quote view via access_token)
-- =============================================================
DROP FUNCTION IF EXISTS get_quote_by_token(text);
CREATE OR REPLACE FUNCTION get_quote_by_token(p_token TEXT)
RETURNS JSONB
SECURITY DEFINER SET search_path = public
AS $$
DECLARE q quotes%ROWTYPE;
BEGIN
  SELECT * INTO q FROM quotes WHERE access_token = p_token;
  IF q.id IS NULL THEN RETURN NULL; END IF;
  UPDATE quotes SET status = 'viewed' WHERE id = q.id AND status = 'sent';
  RETURN jsonb_build_object(
    'id', q.id, 'title', q.title, 'items', q.items, 'subtotal', q.subtotal,
    'vat_amount', q.vat_amount, 'total', q.total, 'status', q.status,
    'valid_until', q.valid_until, 'business_name', (SELECT name FROM businesses WHERE id = q.business_id),
    'lead_name', (SELECT full_name FROM leads WHERE id = q.lead_id),
    'contact_name', (SELECT name FROM contacts WHERE id = q.contact_id)
  );
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS respond_to_quote(text, boolean);
CREATE OR REPLACE FUNCTION respond_to_quote(p_token TEXT, p_accept BOOLEAN)
RETURNS BOOLEAN
SECURITY DEFINER SET search_path = public
AS $$
DECLARE q quotes%ROWTYPE;
BEGIN
  SELECT * INTO q FROM quotes WHERE access_token = p_token;
  IF q.id IS NULL THEN RETURN FALSE; END IF;
  IF q.status IN ('accepted','rejected','converted','expired') THEN RETURN FALSE; END IF;
  UPDATE quotes SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END WHERE id = q.id;
  INSERT INTO demand_activity (business_id, lead_id, action, entity_type, entity_id, details)
  VALUES (q.business_id, q.lead_id, CASE WHEN p_accept THEN 'quote.accepted' ELSE 'quote.rejected' END,
          'quote', q.id, jsonb_build_object('customer_action', TRUE));
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 7. Notification hooks (best-effort)
-- =============================================================
CREATE OR REPLACE FUNCTION demand_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_title TEXT; v_message TEXT;
BEGIN
  -- IF/ELSIF (not CASE) so non-taken branches never resolve NEW.<field>
  -- that only exists on one of the three tables.
  IF TG_TABLE_NAME = 'lead_requests' THEN
    v_title := 'New customer request: ' || NEW.title;
    v_message := 'Status: ' || NEW.status || ' (' || NEW.request_type || ')';
  ELSIF TG_TABLE_NAME = 'quotes' THEN
    v_title := 'Quote: ' || NEW.title;
    v_message := 'Status: ' || NEW.status || ' — total ' || COALESCE(NEW.total::text, '0');
  ELSIF TG_TABLE_NAME = 'sales_orders' THEN
    v_title := 'Order #' || NEW.order_number::text;
    v_message := 'Status: ' || NEW.status || ' — total ' || COALESCE(NEW.total::text, '0');
  ELSE
    v_title := 'Demand update';
    v_message := '';
  END IF;
  -- Notify the assignee if set, else the business owner(s). Best-effort:
  -- notification failures must never break a demand write.
  BEGIN
    INSERT INTO notifications (business_id, user_id, type, category, title, message, entity_type, entity_id)
    SELECT NEW.business_id, s.user_id,
           'intelligence', 'task', v_title, v_message, TG_TABLE_NAME, NEW.id
    FROM staff s
    WHERE s.business_id = NEW.business_id
      AND CASE WHEN NEW.assigned_to IS NOT NULL THEN s.id = NEW.assigned_to
               ELSE s.role IN ('owner','admin') END
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_request_notify ON lead_requests;
CREATE TRIGGER trg_request_notify AFTER INSERT OR UPDATE OF status ON lead_requests
  FOR EACH ROW EXECUTE FUNCTION demand_notify();
DROP TRIGGER IF EXISTS trg_quote_notify ON quotes;
CREATE TRIGGER trg_quote_notify AFTER INSERT OR UPDATE OF status ON quotes
  FOR EACH ROW EXECUTE FUNCTION demand_notify();
DROP TRIGGER IF EXISTS trg_order_notify ON sales_orders;
CREATE TRIGGER trg_order_notify AFTER INSERT OR UPDATE OF status ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION demand_notify();

-- =============================================================
-- 8. Revenue intelligence RPCs (composition-first: no fabricated values)
-- =============================================================
DROP FUNCTION IF EXISTS demand_funnel(uuid, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION demand_funnel(p_business UUID, p_from TIMESTAMPTZ DEFAULT NOW() - INTERVAL '90 days', p_to TIMESTAMPTZ DEFAULT NOW())
RETURNS JSONB
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM get_current_staff() cs WHERE cs.business_id = p_business) THEN RETURN '{"authorized":false}'::jsonb; END IF;
  SELECT jsonb_build_object(
    'leads', (SELECT count(*) FROM leads WHERE business_id = p_business AND created_at BETWEEN p_from AND p_to),
    'requests', (SELECT count(*) FROM lead_requests WHERE business_id = p_business AND created_at BETWEEN p_from AND p_to),
    'quotes', (SELECT count(*) FROM quotes WHERE business_id = p_business AND created_at BETWEEN p_from AND p_to),
    'orders', (SELECT count(*) FROM sales_orders WHERE business_id = p_business AND created_at BETWEEN p_from AND p_to),
    'request_from_lead_pct', (SELECT ROUND(100.0 * count(DISTINCT r.lead_id) / NULLIF(count(*), 0), 1)
                              FROM leads l JOIN lead_requests r ON r.lead_id = l.id
                              WHERE l.business_id = p_business),
    'quote_from_request_pct', (SELECT ROUND(100.0 * count(DISTINCT q.request_id) / NULLIF(count(*), 0), 1)
                                FROM lead_requests r JOIN quotes q ON q.request_id = r.id
                                WHERE r.business_id = p_business),
    'order_from_quote_pct', (SELECT ROUND(100.0 * count(DISTINCT so.quote_id) / NULLIF(count(*), 0), 1)
                              FROM quotes q JOIN sales_orders so ON so.quote_id = q.id
                              WHERE q.business_id = p_business)
  ) INTO v;
  RETURN v;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS demand_revenue(uuid, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION demand_revenue(p_business UUID, p_from TIMESTAMPTZ DEFAULT NOW() - INTERVAL '90 days', p_to TIMESTAMPTZ DEFAULT NOW())
RETURNS JSONB
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM get_current_staff() cs WHERE cs.business_id = p_business) THEN RETURN '{"authorized":false}'::jsonb; END IF;
  RETURN jsonb_build_object(
    'total_revenue', (SELECT COALESCE(SUM(total),0) FROM sales_orders WHERE business_id = p_business AND status != 'cancelled' AND created_at BETWEEN p_from AND p_to),
    'avg_order_value', (SELECT ROUND(COALESCE(AVG(total),0),2) FROM sales_orders WHERE business_id = p_business AND status != 'cancelled'),
    'lost_value', (SELECT COALESCE(SUM(COALESCE(q.total, r.budget)),0)
                    FROM lead_requests r LEFT JOIN quotes q ON q.request_id = r.id
                    WHERE r.business_id = p_business AND r.status IN ('rejected','abandoned')),
    'expired_quote_value', (SELECT COALESCE(SUM(total),0) FROM quotes WHERE business_id = p_business AND status = 'expired' AND expires_at < NOW()),
    'revenue_per_lead', (SELECT ROUND(COALESCE(SUM(so.total),0) / NULLIF(count(DISTINCT so.lead_id),0),2)
                          FROM sales_orders so WHERE so.business_id = p_business AND so.status != 'cancelled'),
    'revenue_by_source', (SELECT jsonb_agg(jsonb_build_object('source', sub.source, 'revenue', sub.rev, 'orders', sub.cnt))
                           FROM (SELECT l.source, ROUND(SUM(so.total),2) AS rev, COUNT(DISTINCT so.id) AS cnt
                                 FROM sales_orders so JOIN leads l ON l.id = so.lead_id
                                 WHERE so.business_id = p_business AND so.status != 'cancelled'
                                 GROUP BY l.source ORDER BY rev DESC NULLS LAST) sub)
  );
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS demand_pipeline(uuid);
CREATE OR REPLACE FUNCTION demand_pipeline(p_business UUID)
RETURNS JSONB
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM get_current_staff() cs WHERE cs.business_id = p_business) THEN RETURN '{"authorized":false}'::jsonb; END IF;
  RETURN jsonb_build_object(
    'open_request_value', (SELECT COALESCE(SUM(q.total),0) FROM lead_requests r JOIN quotes q ON q.request_id = r.id
                            WHERE r.business_id = p_business AND r.status IN ('new','reviewing','qualified','quoted') AND q.status != 'rejected'),
    'open_quote_value', (SELECT COALESCE(SUM(total),0) FROM quotes WHERE business_id = p_business AND status IN ('sent','viewed')),
    'orders_in_fulfilment', (SELECT count(*) FROM sales_orders WHERE business_id = p_business AND status = 'in_fulfilment'),
    'orders_done_90d', (SELECT count(*) FROM sales_orders WHERE business_id = p_business AND status IN ('fulfilled','completed') AND completed_at >= NOW() - INTERVAL '90 days'),
    'avg_sales_days', (SELECT ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (o.completed_at - l.created_at)) ) / 86400,0),1)
                        FROM sales_orders o JOIN leads l ON l.id = o.lead_id
                        WHERE o.business_id = p_business AND o.completed_at IS NOT NULL)
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- Grants (anon needed only for the two token-resp RPCs)
-- =============================================================
REVOKE ALL ON FUNCTION create_lead_request FROM PUBLIC;
REVOKE ALL ON FUNCTION create_quote FROM PUBLIC;
REVOKE ALL ON FUNCTION create_sales_order FROM PUBLIC;
REVOKE ALL ON FUNCTION transition_demand(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION demand_funnel FROM PUBLIC;
REVOKE ALL ON FUNCTION demand_revenue FROM PUBLIC;
REVOKE ALL ON FUNCTION demand_pipeline FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_lead_request TO authenticated;
GRANT EXECUTE ON FUNCTION create_quote TO authenticated;
GRANT EXECUTE ON FUNCTION create_sales_order TO authenticated;
GRANT EXECUTE ON FUNCTION transition_demand(TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION demand_funnel TO authenticated;
GRANT EXECUTE ON FUNCTION demand_revenue TO authenticated;
GRANT EXECUTE ON FUNCTION demand_pipeline TO authenticated;
REVOKE ALL ON FUNCTION get_quote_by_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION respond_to_quote(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_quote_by_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION respond_to_quote(TEXT, BOOLEAN) TO anon, authenticated;

-- Table privileges for the direct PostgREST reads/writes (RLS remains the
-- tenant boundary). Supabase grants these by default on new tables; bare
-- Postgres does not — explicit grants keep the migration portable.
GRANT SELECT, INSERT, UPDATE, DELETE ON lead_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON demand_activity TO authenticated;
GRANT USAGE ON SEQUENCE lead_requests_request_number_seq TO authenticated;
GRANT USAGE ON SEQUENCE sales_orders_order_number_seq TO authenticated;

DROP TRIGGER IF EXISTS trg_lead_requests_updated_at ON lead_requests;
CREATE TRIGGER trg_lead_requests_updated_at BEFORE UPDATE ON lead_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_sales_orders_updated_at ON sales_orders;
CREATE TRIGGER trg_sales_orders_updated_at BEFORE UPDATE ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
