-- 079_settings_type_and_secret_rls.sql
--
-- Two problems fixed here:
--
-- 1. The `settings` table was created (046) WITHOUT a `type` column, but the
--    client (smsService / SMS page / WhatsApp integration) upserts rows with
--    `type: 'secret'`. PostgREST rejects unknown columns, so saving an
--    integration API key has been silently failing (the error is swallowed by
--    the page's try/catch). This adds the missing column so those writes
--    succeed, and backfills known secret keys.
--
-- 2. The `settings_business_all` policy let ANY business staff member read
--    every settings row — including rows holding provider API keys / access
--    tokens (type='secret'). A non-admin staff member could exfiltrate the
--    Termii API key or WhatsApp token by querying the table directly via the
--    Postgres REST API. This tightens RLS so secret rows are readable (and
--    writable) only by owner/manager roles; non-secret rows stay
--    business-readable as before.
--
-- Pure internal SQL — no new dependency, no external service.

\set ON_ERROR_STOP on

-- (1) Add the missing column. Nullable so existing rows default to NULL.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS type TEXT;

-- Backfill known integration-secret keys so the new RLS gate covers them.
UPDATE public.settings
SET type = 'secret'
WHERE type IS NULL
  AND key IN (
    'termii_api_key',
    'whatsapp_access_token',
    'whatsapp_phone_number_id',
    'whatsapp_business_id',
    'paystack_secret_key',
    'flutterwave_secret_key',
    'mailgun_api_key',
    'sendgrid_api_key',
    'postmark_api_token',
    'smtp_password'
  );

-- (2) Tighten RLS. Drop the broad business-wide policy.
DROP POLICY IF EXISTS "settings_business_all" ON public.settings;

-- Read: all business staff may read NON-secret settings; only owner/manager
-- may read secret settings.
CREATE POLICY "settings_select_non_secret" ON public.settings
  FOR SELECT USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
    AND (type IS DISTINCT FROM 'secret')
  );

CREATE POLICY "settings_select_secret_admin" ON public.settings
  FOR SELECT USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
    AND type = 'secret'
    AND (SELECT role FROM public.get_current_staff()) IN ('owner', 'manager')
  );

-- Writes: owner/manager may write secret rows; any business staff may write
-- non-secret rows (preserves existing write behaviour for config keys).
CREATE POLICY "settings_insert" ON public.settings
  FOR INSERT WITH CHECK (
    business_id = (SELECT business_id FROM public.get_current_staff())
    AND (
      type IS DISTINCT FROM 'secret'
      OR (SELECT role FROM public.get_current_staff()) IN ('owner', 'manager')
    )
  );

CREATE POLICY "settings_update" ON public.settings
  FOR UPDATE USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
    AND (
      type IS DISTINCT FROM 'secret'
      OR (SELECT role FROM public.get_current_staff()) IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    business_id = (SELECT business_id FROM public.get_current_staff())
    AND (
      type IS DISTINCT FROM 'secret'
      OR (SELECT role FROM public.get_current_staff()) IN ('owner', 'manager')
    )
  );

CREATE POLICY "settings_delete" ON public.settings
  FOR DELETE USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
    AND (
      type IS DISTINCT FROM 'secret'
      OR (SELECT role FROM public.get_current_staff()) IN ('owner', 'manager')
    )
  );
