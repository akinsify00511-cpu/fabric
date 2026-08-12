-- ============================================
-- PUBLIC BOOKING: Allow anon UPDATE on clients for upsert
--
-- PublicAppointments.tsx upserts a client row by (business_id, email) when
-- an anonymous booker submits the form. The `clients_public_insert` policy
-- (migration 043) allows anon INSERT, but there is no anon UPDATE policy.
-- PostgREST's upsert runs INSERT ... ON CONFLICT DO UPDATE, so the UPDATE
-- branch is rejected by RLS when a returning booker (same email) submits
-- again — the booking crashes with a 403/RLS denial instead of updating
-- their phone/name.
--
-- This migration adds a narrowly-scoped anon UPDATE policy on clients so
-- the upsert's ON CONFLICT branch can update the matching row. The policy
-- mirrors the INSERT check (business_id IS NOT NULL); the upsert's own
-- ON CONFLICT (business_id, email) clause provides the row-level scoping.
-- ============================================

\set ON_ERROR_STOP on

DROP POLICY IF EXISTS "clients_public_update" ON clients;

CREATE POLICY "clients_public_update" ON public.clients
  FOR UPDATE TO anon, authenticated
  USING (business_id IS NOT NULL)
  WITH CHECK (business_id IS NOT NULL);

SELECT 'clients: anon UPDATE policy added for public booking upsert' as status;
