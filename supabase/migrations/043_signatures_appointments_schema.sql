-- ============================================================================
-- Migration 043: Electronic Signatures + Public Appointments schema
-- ----------------------------------------------------------------------------
-- Fixes UI <-> schema drift: ElectronicSignatures.tsx and PublicAppointments.tsx
-- query tables that had no migration. This makes both pages work end-to-end.
--
-- Personas served:
--   * Staff sender      — creates a signature request, tracks signer progress
--   * External signer   — opens signing link, signs, leaves audit trail
--   * External booker   — picks a service/time on a public booking page
--   * Staff provider    — sees confirmed appointments on their calendar
--
-- Reuses existing primitives: businesses, staff, clients (created here if the
-- table is absent — CRM contacts remain the canonical client record), the
-- update_updated_at() trigger, and the get_current_staff() RLS helper.
-- ============================================================================

\set ON_ERROR_STOP on

-- update_updated_at() is defined in 007_automations.sql; define defensively.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- clients table: the appointments page upserts a "client" per external booker.
-- If CRM contacts is the intended canonical client record, this stays a thin
-- external-facing wrapper so public bookings do not require a CRM contact row.
CREATE TABLE IF NOT EXISTS public.clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  business_name TEXT,                                  -- name the booker gave themselves
  email         TEXT NOT NULL,
  phone         TEXT,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, email)
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_business_select" ON public.clients
  FOR SELECT USING (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE POLICY "clients_business_modify" ON public.clients
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_clients_business_email ON public.clients(business_id, email);

-- businesses.slug: the public booking page resolves a business by slug.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_slug ON public.businesses(slug) WHERE slug IS NOT NULL;

-- staff.bio: the public booking page shows a provider bio alongside their name.
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS bio TEXT;

-- ============================================================================
-- 1. SERVICES  (what a business offers for booking)
--    Persona: business admin sets up service catalog; booker picks from it.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.services (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  price            DECIMAL(15, 2),
  color            TEXT,                               -- optional UI accent
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services_business_select" ON public.services
  FOR SELECT USING (business_id = (SELECT business_id FROM public.get_current_staff())
                     OR is_active = TRUE);             -- active services are public
CREATE POLICY "services_business_modify" ON public.services
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_services_business ON public.services(business_id);
CREATE TRIGGER services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 2. APPOINTMENTS  (a confirmed booking)
--    Persona: external booker creates it; staff provider sees it on calendar.
--    Public insert is allowed (anon) but scoped to the business's services.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id        UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  service_id       UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  staff_id         UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  start_time       TIMESTAMPTZ NOT NULL,
  end_time         TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),
  notes            TEXT,
  booking_reference TEXT UNIQUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
-- Business staff can read everything.
CREATE POLICY "appointments_business_select" ON public.appointments
  FOR SELECT USING (business_id = (SELECT business_id FROM public.get_current_staff()));
-- Business staff manage their own appointments.
CREATE POLICY "appointments_business_modify" ON public.appointments
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_appointments_business_time ON public.appointments(business_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_staff_time ON public.appointments(staff_id, start_time) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_reference ON public.appointments(booking_reference);
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Public booking: allow anonymous INSERT of an appointment + its client.
-- RLS FOR INSERT has no staff context, so we validate business_id against the
-- service the booker picked (service must belong to that business).
CREATE POLICY "appointments_public_insert" ON public.appointments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.services s
            WHERE s.id = service_id AND s.business_id = appointments.business_id
              AND s.is_active = TRUE)
  );

-- A booker must be able to create their own client row to attach to the booking.
CREATE POLICY "clients_public_insert" ON public.clients
  FOR INSERT WITH CHECK (business_id IS NOT NULL);

-- Bookers confirm their booking via the reference number; they may read by ref.
CREATE POLICY "appointments_public_select_by_ref" ON public.appointments
  FOR SELECT USING (booking_reference IS NOT NULL);

-- ============================================================================
-- 3. SIGNATURE REQUESTS  (e-signature envelope)
--    Persona: staff sender creates request; external signer signs via link.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.signature_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_by    UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  document_id   UUID,                                   -- optional link to documents hub
  title         TEXT NOT NULL,
  description   TEXT,
  document_name TEXT NOT NULL,
  document_url  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','pending','viewed','signed','declined','expired','voided')),
  message       TEXT,                                   -- note shown to signers
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sigreq_business_select" ON public.signature_requests
  FOR SELECT USING (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE POLICY "sigreq_business_modify" ON public.signature_requests
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_sigreq_business_created ON public.signature_requests(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sigreq_status ON public.signature_requests(status);
CREATE TRIGGER sigreq_updated_at BEFORE UPDATE ON public.signature_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 4. SIGNATURE SIGNERS  (each party who must sign, in order)
--    Persona: signer receives a turn, views doc, signs or declines.
--    A signing token lets an external signer act without a login.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.signature_signers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  business_id      UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- signer identification (external email by default; staff/contacts optional)
  signer_type      TEXT NOT NULL DEFAULT 'external_email'
                   CHECK (signer_type IN ('staff','contact','external_email','portal_user')),
  signer_ref       UUID,                                -- staff.id / contacts.id when applicable
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  order_index      INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','viewed','signed','declined')),
  signed_at        TIMESTAMPTZ,
  signature_image_url TEXT,                             -- drawn/typed/uploaded signature
  ip_address       INET,
  user_agent       TEXT,
  signing_token    TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  viewed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.signature_signers ENABLE ROW LEVEL SECURITY;
-- Business staff see all signers for their requests.
CREATE POLICY "sigsig_business_select" ON public.signature_signers
  FOR SELECT USING (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE POLICY "sigsig_business_modify" ON public.signature_signers
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
-- External signer can read & update their own signer row via token (no login).
CREATE POLICY "sigsig_signer_select_by_token" ON public.signature_signers
  FOR SELECT USING (signing_token IS NOT NULL AND signing_token = current_setting('signer_token', true));
CREATE POLICY "sigsig_signer_update_by_token" ON public.signature_signers
  FOR UPDATE USING (signing_token IS NOT NULL AND signing_token = current_setting('signer_token', true))
  WITH CHECK (signing_token IS NOT NULL AND signing_token = current_setting('signer_token', true));
CREATE INDEX IF NOT EXISTS idx_sigsig_request_order ON public.signature_signers(request_id, order_index);
CREATE INDEX IF NOT EXISTS idx_sigsig_business ON public.signature_signers(business_id);
CREATE INDEX IF NOT EXISTS idx_sigsig_status ON public.signature_signers(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sigsig_token ON public.signature_signers(signing_token) WHERE signing_token IS NOT NULL;
CREATE TRIGGER sigsig_updated_at BEFORE UPDATE ON public.signature_signers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 5. AUDIT HOOKS  (the Master Build guide requires every important action to
--    create an audit entry; signatures are legally material)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.audit_signature_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (business_id, action, entity_type, entity_id, new_values)
  VALUES (
    NEW.business_id,
    CASE WHEN NEW.status = 'signed' THEN 'sign'
         WHEN TG_OP = 'INSERT' THEN 'create'
         ELSE 'update' END,
    'signature_signer',
    NEW.id,
    jsonb_build_object('status', NEW.status, 'email', NEW.email, 'request_id', NEW.request_id,
                       'signed_at', NEW.signed_at)
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_signature_signer ON public.signature_signers;
CREATE TRIGGER audit_signature_signer
  AFTER INSERT OR UPDATE OF status ON public.signature_signers
  FOR EACH ROW EXECUTE FUNCTION public.audit_signature_event();
