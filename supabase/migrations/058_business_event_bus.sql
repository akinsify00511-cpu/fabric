-- 058_business_event_bus.sql
-- The Business Event Bus (Architecture §10, table 4). A single append-only
-- event log that represents meaningful business moments — DealWon,
-- PaymentReceived, EmployeeJoined, EmployeeExited, InventoryLow,
-- CampaignConverted, TaskOverdue, ContractExpiring, PayrollDue — plus
-- per-event downstream handlers that update all dependent state so a
-- business event updates every relevant module automatically (capture once).
--
-- This is the spine the intelligence layer reasons over: indexes, the
-- observer view, and exceptions all read this stream.

CREATE TABLE IF NOT EXISTS business_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Canonical event type (DealWon, PaymentReceived, ...). Free TEXT so
  -- domains can declare new events without a migration.
  event_type TEXT NOT NULL,
  -- The thing the event happened to, in canonical (entity_type, entity_id)
  -- form so the context graph can resolve impact.
  entity_type TEXT NOT NULL,
  entity_id UUID,
  -- Related entities on this event (e.g. DealWon -> [deal, customer, sales_owner]).
  related_entities JSONB DEFAULT '[]'::JSONB,
  -- The material payload — parsed values from capture or the change diff.
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Who/what caused it: staff, system trigger, automation, AI gateway.
  source TEXT DEFAULT 'system' CHECK (source IN ('staff','system','automation','ai_gateway','integration')),
  actor_id UUID,
  -- Provenance: was this captured from natural language, a form, an import?
  capture_mode TEXT,
  confidence NUMERIC(4,3), -- for AI-captured events, 0..1
  -- Lifecycle of the event's propagation.
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE business_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_events_viewable
  ON business_events FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY business_events_inserting
  ON business_events FOR INSERT
  WITH CHECK (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_business_events_business_type
  ON business_events(business_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_events_entity
  ON business_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_business_events_unprocessed
  ON business_events(business_id) WHERE processed = FALSE;

CREATE TRIGGER business_events_updated_at BEFORE UPDATE ON business_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- emit_business_event: the single entry point domains call to raise an
-- event. Idempotent on (business_id, event_type, entity_id, payload hash)
-- so re-emitting (retries, replays) does not duplicate downstream effects.
CREATE OR REPLACE FUNCTION emit_business_event(
  p_business_id UUID,
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::JSONB,
  p_related_entities JSONB DEFAULT '[]'::JSONB,
  p_source TEXT DEFAULT 'system',
  p_actor_id UUID DEFAULT NULL,
  p_capture_mode TEXT DEFAULT NULL,
  p_confidence NUMERIC DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_hash TEXT;
BEGIN
  v_hash := md5(
    coalesce(p_business_id::TEXT,'') || '|' || p_event_type || '|' ||
    coalesce(p_entity_id::TEXT,'') || '|' || p_payload::TEXT
  );

  -- Idempotency: if the exact same event was already raised, return it.
  SELECT id INTO v_id FROM business_events
  WHERE business_id = p_business_id
    AND event_type = p_event_type
    AND coalesce(entity_id::TEXT,'') = coalesce(p_entity_id::TEXT,'')
    AND md5(coalesce(business_id::TEXT,'') || '|' || event_type || '|' ||
            coalesce(entity_id::TEXT,'') || '|' || payload::TEXT) = v_hash
  ORDER BY occurred_at DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO business_events (
    business_id, event_type, entity_type, entity_id, payload,
    related_entities, source, actor_id, capture_mode, confidence
  ) VALUES (
    p_business_id, p_event_type, p_entity_type, p_entity_id, p_payload,
    p_related_entities, p_source, p_actor_id, p_capture_mode, p_confidence
  ) RETURNING id INTO v_id;

  -- Fire downstream handlers. Each handler is a separate function so a
  -- failure in one does not block the others or the event commit.
  PERFORM process_business_event(v_id);

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- process_business_event: dispatches to registered handlers. Handlers are
-- registered in business_event_handlers; each is a SECURITY DEFINER fn
-- that takes the event row and returns void. Failures are recorded on the
-- event row (processing_error) but do not roll the event back.
CREATE OR REPLACE FUNCTION process_business_event(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  ev RECORD;
  h RECORD;
  v_err TEXT;
BEGIN
  SELECT * INTO ev FROM business_events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE business_events SET processed = FALSE WHERE id = p_event_id;

  FOR h IN
    SELECT handler_fn FROM business_event_handlers
    WHERE event_type = ev.event_type AND is_active
    ORDER BY run_order
  LOOP
    BEGIN
      EXECUTE format('SELECT %I(%L)', h.handler_fn, p_event_id);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      UPDATE business_events
      SET processing_error = coalesce(processing_error,'') || h.handler_fn || ': ' || v_err || E'\n'
      WHERE id = p_event_id;
    END;
  END LOOP;

  UPDATE business_events
  SET processed = TRUE, processed_at = NOW()
  WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Handler registry. Domains register a (event_type -> fn) mapping here.
CREATE TABLE IF NOT EXISTS business_event_handlers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  handler_fn TEXT NOT NULL, -- name of a SECURITY DEFINER fn(UUID)
  run_order INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_type, handler_fn)
);

-- A reference handler: every event pushes a freshness row for its entity so
-- the real-time mirror knows when each canonical entity was last touched.
CREATE OR REPLACE FUNCTION handler_update_entity_freshness(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  ev RECORD;
BEGIN
  SELECT * INTO ev FROM business_events WHERE id = p_event_id;
  IF NOT FOUND OR ev.entity_id IS NULL THEN RETURN; END IF;

  INSERT INTO entity_freshness (business_id, entity_type, entity_id, last_event_type, last_event_at, last_event_id)
  VALUES (ev.business_id, ev.entity_type, ev.entity_id, ev.event_type, ev.occurred_at, ev.id)
  ON CONFLICT (business_id, entity_type, entity_id)
  DO UPDATE SET
    last_event_type = EXCLUDED.last_event_type,
    last_event_at = EXCLUDED.last_event_at,
    last_event_id = EXCLUDED.last_event_id,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Register the freshness handler for every event type (NULL event_type =
-- catch-all is not supported here; register explicitly per type instead).
INSERT INTO business_event_handlers (event_type, handler_fn, run_order, description)
VALUES
  ('DealWon','handler_update_entity_freshness',10,'Refresh deal/customer freshness'),
  ('PaymentReceived','handler_update_entity_freshness',10,'Refresh invoice/customer freshness'),
  ('EmployeeJoined','handler_update_entity_freshness',10,'Refresh staff freshness'),
  ('EmployeeExited','handler_update_entity_freshness',10,'Refresh staff freshness'),
  ('InventoryLow','handler_update_entity_freshness',10,'Refresh product freshness'),
  ('CampaignConverted','handler_update_entity_freshness',10,'Refresh campaign freshness'),
  ('TaskOverdue','handler_update_entity_freshness',10,'Refresh task freshness'),
  ('ContractExpiring','handler_update_entity_freshness',10,'Refresh contract freshness'),
  ('PayrollDue','handler_update_entity_freshness',10,'Refresh payroll freshness')
ON CONFLICT (event_type, handler_fn) DO NOTHING;

-- entity_freshness: created here because the freshness handler writes to
-- it and the real-time mirror / freshness indicators (§8) read it.
CREATE TABLE IF NOT EXISTS entity_freshness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  last_event_type TEXT,
  last_event_at TIMESTAMPTZ,
  last_event_id UUID REFERENCES business_events(id) ON DELETE SET NULL,
  -- Computed staleness tier for UI badges: fresh (<1h), today (<24h),
  -- stale (<7d), old (>7d). Recomputed on read by a view below.
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, entity_type, entity_id)
);

ALTER TABLE entity_freshness ENABLE ROW LEVEL SECURITY;
CREATE POLICY entity_freshness_viewable
  ON entity_freshness FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_entity_freshness_entity
  ON entity_freshness(business_id, entity_type, entity_id);

-- Freshness tier view — the UI reads this to render freshness badges.
CREATE OR REPLACE VIEW entity_freshness_status AS
SELECT
  id, business_id, entity_type, entity_id,
  last_event_type, last_event_at, updated_at,
  CASE
    WHEN last_event_at IS NULL THEN 'unknown'
    WHEN now() - last_event_at < interval '1 hour' THEN 'fresh'
    WHEN now() - last_event_at < interval '24 hours' THEN 'today'
    WHEN now() - last_event_at < interval '7 days' THEN 'stale'
    ELSE 'old'
  END AS freshness_tier,
  CASE WHEN last_event_at IS NULL THEN NULL
       ELSE EXTRACT(EPOCH FROM (now() - last_event_at))::INTEGER END AS seconds_since_update
FROM entity_freshness;

COMMENT ON TABLE business_events IS
  'Append-only Business Event Bus (§10). emit_business_event() is the single entry point; handlers in business_event_handlers propagate effects.';
COMMENT ON TABLE entity_freshness IS
  'Last-touched timestamp per canonical entity, written by event handlers (§8 real-time mirror freshness).';
