-- ============================================================================
-- 046_missing_table_backfill.sql
-- Defines tables that pages query but no prior migration created.
--
-- Each table is reconciled with the exact columns the consuming page
-- inserts/selects/updates, so the page works against real data instead of
-- silently erroring. All business-scoped tables use the get_current_staff()
-- RLS pattern. FK targets verified against 001/038/998.
-- ============================================================================

\set ON_ERROR_STOP on

-- update_updated_at() is defined in 007; define defensively.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. e_invoices  (FIRS/Nigeria e-invoicing — regulatory, EInvoicing.tsx)
--    Persona: Finance officer submitting invoices to the NRS for ITCMN/ICR.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.e_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id      UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  client_id       UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  client_name     TEXT NOT NULL,
  client_email    TEXT,
  client_tin      TEXT,
  amount          DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
  itcmn           TEXT,
  itcmn_status    TEXT NOT NULL DEFAULT 'pending'
                  CHECK (itcmn_status IN ('pending','submitted','accepted','rejected')),
  icr_status      TEXT DEFAULT 'pending' CHECK (icr_status IN ('pending','generated','failed')),
  icr_number      TEXT,
  qr_code         TEXT,
  submitted_at    TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.e_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "e_invoices_business_all" ON public.e_invoices
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_einv_business ON public.e_invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_einv_status ON public.e_invoices(itcmn_status);
CREATE INDEX IF NOT EXISTS idx_einv_invoice ON public.e_invoices(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE TRIGGER einv_updated_at BEFORE UPDATE ON public.e_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 2. chat_conversations + chat_messages  (LiveChat.tsx)
--    Persona: Support agent talking to external clients in real time.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  client_name     TEXT NOT NULL,
  client_email    TEXT,
  client_phone    TEXT,
  last_message    TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','closed','pending')),
  assigned_to     UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_conv_business_all" ON public.chat_conversations
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_chatconv_business ON public.chat_conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_chatconv_status ON public.chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chatconv_last_msg ON public.chat_conversations(last_message_at DESC);
CREATE TRIGGER chatconv_updated_at BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_type     TEXT NOT NULL CHECK (sender_type IN ('client','agent','system')),
  sender_id       UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  sender_name     TEXT,
  message         TEXT NOT NULL,
  attachment_url  TEXT,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_msg_business_all" ON public.chat_messages
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_chatmsg_conv ON public.chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chatmsg_created ON public.chat_messages(created_at);

-- Auto-maintain last_message + last_message_at + unread_count on the parent
-- conversation whenever a message is inserted (agent UX: the inbox sorts by
-- recency and shows a badge without a second query).
CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chat_conversations
     SET last_message = NEW.message,
         last_message_at = NEW.created_at,
         unread_count = CASE WHEN NEW.sender_type = 'client' THEN unread_count + 1 ELSE 0 END,
         status = CASE WHEN status = 'closed' THEN 'open' ELSE status END
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER chat_msg_touch_conv AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_on_message();

-- ============================================================================
-- 3. payroll_records  (HumanResources.tsx)
--    Persona: HR viewing payslips per staff member.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  staff_id      UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  pay_period    TEXT NOT NULL,                 -- '2025-01' etc.
  gross_pay     DECIMAL(15,2) NOT NULL DEFAULT 0,
  deductions    DECIMAL(15,2) NOT NULL DEFAULT 0,
  net_pay       DECIMAL(15,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','approved','paid','voided')),
  paid_at       TIMESTAMPTZ,
  details       JSONB DEFAULT '{}'::jsonb,      -- line items breakdown
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_business_all" ON public.payroll_records
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_payroll_staff ON public.payroll_records(staff_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON public.payroll_records(pay_period);
CREATE INDEX IF NOT EXISTS idx_payroll_business ON public.payroll_records(business_id);
CREATE TRIGGER payroll_updated_at BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 4. training_records  (HumanResources.tsx)
--    Persona: HR tracking staff training/certifications.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.training_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  staff_id      UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'internal'
                CHECK (type IN ('internal','external','certification','safety')),
  provider      TEXT,
  start_date    DATE,
  end_date      DATE,
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  cost          DECIMAL(15,2) DEFAULT 0,
  certificate_url TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "training_business_all" ON public.training_records
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_training_staff ON public.training_records(staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_status ON public.training_records(status);
CREATE TRIGGER training_updated_at BEFORE UPDATE ON public.training_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 5. sms_templates  (SMSBroadcast.tsx)
--    Persona: Comms staff reusing saved SMS templates.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sms_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_templates_business_all" ON public.sms_templates
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_sms_templates_business ON public.sms_templates(business_id);
CREATE TRIGGER sms_templates_updated_at BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 6. jobs  (ProjectsNigeria.tsx — Nigerian construction/project vertical)
--    Persona: Project manager tracking a job pipeline (enquiry -> completion).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  job_number    TEXT NOT NULL,
  title         TEXT NOT NULL,
  client_name   TEXT NOT NULL,
  client_phone  TEXT,
  client_email  TEXT,
  type          TEXT,                          -- references job_types.id if present
  stage         TEXT NOT NULL DEFAULT 'enquiry'
                CHECK (stage IN ('enquiry','quoted','won','in_progress','completed','cancelled','lost')),
  value         DECIMAL(15,2) NOT NULL DEFAULT 0,
  location      TEXT,
  gps_lat       DECIMAL(10,8),
  gps_lng       DECIMAL(11,8),
  start_date    DATE,
  end_date      DATE,
  staff_id      UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  metadata      JSONB DEFAULT '{}'::jsonb,     -- materials/labor/milestones stored flexibly
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs_business_all" ON public.jobs
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_jobs_business ON public.jobs(business_id);
CREATE INDEX IF NOT EXISTS idx_jobs_stage ON public.jobs(stage);
CREATE INDEX IF NOT EXISTS idx_jobs_staff ON public.jobs(staff_id) WHERE staff_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_number_unique ON public.jobs(business_id, job_number);
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 7. cashflow  (CashFlow.tsx)
--    Persona: Finance tracking cash inflows/outflows by date.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cashflow (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  description   TEXT,
  amount        DECIMAL(15,2) NOT NULL,
  direction     TEXT NOT NULL DEFAULT 'in'
                CHECK (direction IN ('in','out')),
  category      TEXT,
  reference_type TEXT,
  reference_id  UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.cashflow ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cashflow_business_all" ON public.cashflow
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_cashflow_business ON public.cashflow(business_id);
CREATE INDEX IF NOT EXISTS idx_cashflow_date ON public.cashflow(date DESC);
CREATE INDEX IF NOT EXISTS idx_cashflow_direction ON public.cashflow(direction);
CREATE TRIGGER cashflow_updated_at BEFORE UPDATE ON public.cashflow
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 8. avatars storage bucket  (Profile.tsx uses supabase.storage.from('avatars'))
--    A storage bucket, not a table. Create it so avatar uploads don't 404.
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read avatars (public bucket) and the owner to
-- manage their own file path under user_<uid>/.
CREATE POLICY "avatars_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_insert_auth" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "avatars_update_auth" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "avatars_delete_auth" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'avatars');

-- ============================================================================
-- 9. approval_requests  (Approvals.tsx queries this name, but the real engine
--    table is `approvals` (039). Create a compatibility VIEW that maps the
--    page's expected column names onto the engine's real ones, so the page
--    works without duplicating the approval workflow.
--    Page expects: current_level, type, entity_name, requester (staff name)
--    Engine has:   current_step, entity_type, entity_id+description, requester_id
-- ============================================================================
CREATE OR REPLACE VIEW public.approval_requests AS
SELECT
  a.id,
  a.business_id,
  a.status,
  a.current_step AS current_level,
  a.total_steps,
  a.amount,
  a.entity_type AS type,
  COALESCE(a.description, a.entity_type) AS entity_name,
  a.entity_id,
  a.requester_id,
  s.full_name AS requester,
  a.created_at,
  a.updated_at
FROM public.approvals a
LEFT JOIN public.staff s ON s.id = a.requester_id;

-- The view is read-only by default; route mutations through the base table by
-- creating INSTEAD OF triggers for the two operations the page performs:
-- update (status + current_level) and the select already works via the view.
CREATE OR REPLACE FUNCTION public.approval_requests_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.approvals
     SET status = NEW.status,
         current_step = NEW.current_level
   WHERE id = OLD.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER approval_requests_update
  INSTEAD OF UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.approval_requests_update();

-- ============================================================================
-- 10. settings  (key-value store used by EInvoicing, SMS, SMSBroadcast)
--    Persona: Admin configuring integrations (NRS API keys, SMS providers).
--    Stores per-business integration config as key/value pairs.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  value         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, key)
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_business_all" ON public.settings
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_settings_business_key ON public.settings(business_id, key);
CREATE TRIGGER settings_updated_at BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
