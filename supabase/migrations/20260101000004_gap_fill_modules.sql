-- ============================================
-- AVENIZE GAP-FILL MIGRATION
-- Adds the tables required by the Master Build Guide that were missing:
--   1. Legal (contracts, cases, obligations)
--   2. Procurement RFQs (request → solicit → compare → PO)
--   3. Company Wall polls + poll_votes
--   4. Organizational memory / decision learning
--   5. Reality-gap tracking (intended / recorded / actual / outcome)
--   6. Reversal / provenance on consequential actions
-- All tables follow the existing business_id-scoped RLS pattern.
-- ============================================

-- ============================================================
-- 1. LEGAL MODULE
-- ============================================================
CREATE TABLE IF NOT EXISTS legal_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  title TEXT NOT NULL,
  contract_type TEXT NOT NULL DEFAULT 'agreement' CHECK (contract_type IN ('agreement','employment','vendor','lease','nda','service','partnership','other')),
  counterparty TEXT,
  counterparty_type TEXT DEFAULT 'external' CHECK (counterparty_type IN ('vendor','customer','employee','partner','external')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_signature','active','expiring','expired','terminated','disputed')),
  start_date DATE,
  end_date DATE,
  signed_date DATE,
  document_url TEXT,
  value NUMERIC(15,2),
  currency TEXT DEFAULT 'NGN',
  notice_period_days INTEGER,
  owner_id UUID,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_legal_contracts_business ON legal_contracts(business_id);
CREATE INDEX IF NOT EXISTS idx_legal_contracts_status ON legal_contracts(business_id, status);
CREATE INDEX IF NOT EXISTS idx_legal_contracts_end_date ON legal_contracts(business_id, end_date) WHERE end_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS legal_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  title TEXT NOT NULL,
  case_type TEXT DEFAULT 'civil' CHECK (case_type IN ('civil','criminal','administrative','arbitration','mediation','compliance','other')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','on_hold','closed','won','lost','settled')),
  counterparty TEXT,
  external_ref TEXT,
  filed_date DATE,
  closed_date DATE,
  next_hearing_date DATE,
  estimated_exposure NUMERIC(15,2),
  owner_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_legal_cases_business ON legal_cases(business_id, status);

CREATE TABLE IF NOT EXISTS legal_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  contract_id UUID REFERENCES legal_contracts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  obligation_type TEXT DEFAULT 'deliverable' CHECK (obligation_type IN ('deliverable','payment','notice','compliance','reporting','renewal','other')),
  description TEXT,
  due_date DATE,
  completed_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','overdue','waived')),
  owner_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_legal_obligations_business ON legal_obligations(business_id, status);

-- ============================================================
-- 2. PROCUREMENT RFQ MODULE
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  requested_by UUID,
  department TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','rfq_sent','quotes_received','po_created','fulfilled','cancelled')),
  budget_estimate NUMERIC(15,2),
  needed_by DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_business ON purchase_requests(business_id, status);

CREATE TABLE IF NOT EXISTS purchase_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'unit',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  request_id UUID REFERENCES purchase_requests(id) ON DELETE CASCADE,
  vendor_id UUID,
  vendor_name TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('draft','sent','responded','awarded','rejected','expired')),
  sent_date DATE,
  response_date DATE,
  total_quoted NUMERIC(15,2),
  currency TEXT DEFAULT 'NGN',
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rfqs_business ON rfqs(business_id, status);
CREATE INDEX IF NOT EXISTS idx_rfqs_request ON rfqs(request_id);

CREATE TABLE IF NOT EXISTS rfq_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2),
  total NUMERIC(15,2)
);

-- ============================================================
-- 3. COMPANY WALL — POLLS
-- ============================================================
CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by UUID,
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_polls_business ON polls(business_id, status);

CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  option TEXT NOT NULL,
  voter_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, voter_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

-- ============================================================
-- 4. ORGANIZATIONAL MEMORY / DECISION LEARNING
-- ============================================================
CREATE TABLE IF NOT EXISTS organizational_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  topic TEXT NOT NULL,
  lesson TEXT NOT NULL,
  context TEXT,
  evidence JSONB DEFAULT '{}',
  confidence NUMERIC(3,2) DEFAULT 0.5,
  source TEXT,
  source_event_id UUID,
  recorded_by UUID,
  applies_to TEXT,
  last_applied_at TIMESTAMPTZ,
  times_applied INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','superseded','deprecated')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_memory_business ON organizational_memory(business_id, status);
CREATE INDEX IF NOT EXISTS idx_org_memory_topic ON organizational_memory USING GIN (to_tsvector('english', topic || ' ' || lesson));

CREATE TABLE IF NOT EXISTS decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  title TEXT NOT NULL,
  decision_type TEXT DEFAULT 'operational' CHECK (decision_type IN ('operational','financial','strategic','personnel','procurement','legal','other')),
  summary TEXT,
  rationale TEXT,
  alternatives_considered JSONB DEFAULT '[]',
  decided_by UUID,
  decided_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'decided' CHECK (status IN ('proposed','decided','implemented','reversed','superseded')),
  expected_outcome TEXT,
  actual_outcome TEXT,
  review_date DATE,
  related_entity_type TEXT,
  related_entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_decision_log_business ON decision_log(business_id, status);

-- ============================================================
-- 5. REALITY-GAP TRACKING (intended / recorded / actual / outcome)
-- ============================================================
CREATE TABLE IF NOT EXISTS reality_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  intended TEXT,
  recorded TEXT,
  actual TEXT,
  outcome TEXT,
  gap_type TEXT DEFAULT 'process' CHECK (gap_type IN ('process','data','outcome','expectation','other')),
  severity TEXT DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  owner_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reality_gaps_business ON reality_gaps(business_id, severity);

-- ============================================================
-- 6. REVERSAL / PROVENANCE ON CONSEQUENTIAL ACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS action_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  original_entity_type TEXT NOT NULL,
  original_entity_id UUID NOT NULL,
  reversal_type TEXT DEFAULT 'reverse' CHECK (reversal_type IN ('reverse','void','correct','amend')),
  reason TEXT NOT NULL,
  performed_by UUID,
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  snapshot JSONB,
  related_approval_id UUID,
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_action_reversals_entity ON action_reversals(business_id, original_entity_type, original_entity_id);

-- ============================================================
-- RLS — enable + business-scoped policies for all new tables
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'legal_contracts','legal_cases','legal_obligations',
    'purchase_requests','rfqs',
    'polls','poll_votes',
    'organizational_memory','decision_log',
    'reality_gaps','action_reversals'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS business_id UUID;', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));',
      'staff_access_' || t, t
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t
    );
  END LOOP;
END $$;

-- update_updated_at trigger helper
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'legal_contracts','legal_cases',
    'purchase_requests','rfqs',
    'organizational_memory','decision_log'
  ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated ON %I; CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
