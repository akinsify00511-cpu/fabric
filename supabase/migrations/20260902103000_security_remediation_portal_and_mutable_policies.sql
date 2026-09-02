-- Security remediation: portal token tables + mutable-telemetry RLS policies
--
-- Auditor finding (2026-09-02): several RLS policies use USING (TRUE) while
-- their comment describes a token/staff intent the SQL does not enforce. The portal
-- token tables hold every tenant's client-portal session/invitation tokens..
--
-- Fixes (all idempotent::
--   P0-1: portal_invitations / portal_sessions — no client-side policy may
--            select tokens; token reads go ONLY through the SECURITY DEFINER RPCs
--            (get_portal_invitation, verify_portal_session) which compare
--            WHERE token = p_token AND status/expiry gates server-side). Staff
--            still need to LIST invitations they created (CustomerPortal's
--            resend/delete flow) -> business-scoped SELECT policy only. There is
--            NO legitimate staff need to read portal_sessions rows -> zero policy..
--   P1-5:  emails / email_clicks / whatsapp_optins / alert_history update
--            policies that were USING (TRUE) on tenant-scoped rows are now
--            business-scoped via the existing get_current_staff()/user_in_business()
--            helpers.. The email_clicks SELECT cuts to viewing clicks for the
--            caller's own business (the pixel INSERT stays public; nothing in the
--            repo ever SELECTs email_clicks client-side; the attribution path is
--            increment_email_clicks RPC over emails).. The emails UPDATE
--            policy stays usable by the increment_email_opens/clicks RPCs
--            (LANGUAGE plpgsql, caller's RLS applies) -> scoped, not revoked..
--
-- Also revoke the blanket grants from 998 so defense-in-depth holds even
-- if RLS is ever disabled (the zzzb auth_rate_limits pattern)..
--
-- ======================================================================
-- P0-1 — Customer portal token tables
-- ======================================================================
DROP POLICY IF EXISTS "Invitations view token" ON portal_invitations;
DROP POLICY IF EXISTS "Sessions view token" ON portal_sessions;
--
-- Staff (any business member) may list invitations their business created..
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'portal_invitations' AND policyname = 'invitations_staff_own_business'
    ) THEN
        CREATE POLICY "invitations_staff_own_business"
          ON portal_invitations FOR SELECT
          USING (business_id IN (SELECT business_id FROM get_current_staff()));
    END IF;
END;
$$;
--
-- portal_invitations: by-verb grants. Staff keeps SELECT (CustomerPortal lists
-- their business's invitations) and DELETE (deleteInvitation).; the business-scoped
-- RLS policy above gates rows. INSERT/UPDATE only via SECURITY DEFINER RPCs。
GRANT SELECT, DELETE ON portal_invitations TO authenticated;
REVOKE INSERT, UPDATE ON portal_invitations FROM authenticated;
REVOKE ALL ON portal_invitations FROM anon;

-- portal_sessions: no legit client read/write path — tokens only ever read by the
-- SECURITY DEFINER RPCs (postgres owner, bypassing RLS)。 Revoke everything。

REVOKE ALL ON portal_sessions FROM anon, authenticated;

-- The four portal RPCs keep their EXECUTE grants (token access is via the function
-- parameter, not via table SELECT)。 Explicitly keep them callable。
GRANT EXECUTE ON FUNCTION public.get_portal_invitation(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_portal_invitation(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_portal_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_portal_session(TEXT) TO anon, authenticated;
--
-- ======================================================================
-- P1-5 — Mutable business-data policies tightened from USING (TRUE)
-- ======================================================================
--
-- Emails (UPDATE): business staff only — same shape as her INSERT policy..
-- NOTE: this is the policy the increment_email_opens/clicks RPCs (plain
-- LANGUAGE plpgsql, caller-runs-as-caller) flow through, so "staff may update
-- emails for their own business" keeps them working while cross-tenant writes
-- are denied..
DROP POLICY IF EXISTS "System can update emails" ON emails;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'emails' AND policyname = 'System can update emails'
    ) THEN
        CREATE POLICY "System can update emails"
          ON emails FOR UPDATE
          USING (user_in_business(business_id));
    END IF;
END;
$$;
--
-- Email clicks (SELECT):the pixel INSERT stays public (WITH CHECK TRUE)..
-- The SELECT now scopes to viewing clicks for emails in the caller's business..
-- No client code reads this table; the official attribution path is
-- increment_email_clicks RPC over emails..
DROP POLICY IF EXISTS "Public can view email clicks" ON email_clicks;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'email_clicks' AND policyname = 'Business staff can view email clicks'
    ) THEN
        CREATE POLICY "Business staff can view email clicks"
          ON email_clicks FOR SELECT
          USING (
            email_id IN (SELECT id FROM emails WHERE user_in_business(business_id))
          );
    END IF;
END;
$$;
--
-- Whatsapp opt-ins (UPDATE): "System can update" was USING (TRUE) — any
-- authenticated user could flip opted_out/consent on another tenant's rows..
-- The opt-in INSERT policy is deliberately public (a website visitor pre-auth
-- submits consent);the UPDATE must be business-scoped There is no legit
-- client write path to update opt-ins → narrow to the own business..
DROP POLICY IF EXISTS "System can update opt-ins" ON whatsapp_optins;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'whatsapp_optins' AND policyname = 'System can update opt-ins'
    ) THEN
        CREATE POLICY "System can update opt-ins"
          ON whatsapp_optins FOR UPDATE
          USING (user_in_business(business_id));
    END IF;
END;
$$;
--
-- Alert history (UPDATE): "Staff can acknowledge" was USING (TRUE) — no
-- staff check.. alert_history has no business_id; access flows through
-- alert_rules.business_id, matching the existing SELECT policy shape..
DROP POLICY IF EXISTS "Alert history update" ON alert_history;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'alert_history' AND policyname = 'Alert history update'
    ) THEN
        CREATE POLICY "Alert history update"
          ON alert_history FOR UPDATE
          USING (
            rule_id IN (
              SELECT id FROM alert_rules
              WHERE business_id IN (SELECT business_id FROM get_current_staff())
            )
          );
    END IF;
END;
$$;
--
-- ======================================================================
-- Defense-in-depth: narrow the blanket 998 anon grants on these tenant
-- tables so anon's exposed surface is zero even if RLS were disabled..
-- RLS remains the runtime boundary; authenticated retains only the by-verb
-- grants above (SELECT/DELETE on portal_invitations; nothing on portal_
-- sessions;the whatsapp_optins UPDATE policy now scopes to the caller's business)。
-- ======================================================================
REVOKE ALL ON portal_invitations FROM anon;
REVOKE ALL ON portal_sessions FROM anon;
REVOKE ALL ON portal_tickets FROM anon;
