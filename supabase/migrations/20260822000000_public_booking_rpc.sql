-- ============================================================================
-- PUBLIC BOOKING RPC + bare-postgres anon GRANT parity
--
-- The public booking page (PublicAppointments.tsx) previously wrote the
-- client + appointment rows via direct anonymous table access. That works on
-- hosted Supabase (default privileges grant table verbs to anon) but fails on
-- any bare-postgres deployment ("42501 permission denied for table clients"),
-- and the clients upsert's RETURNING needs a SELECT policy anon will never
-- have. This migration moves the write path behind a SECURITY DEFINER RPC —
-- the same pattern the public signing flow (050) uses — and adds explicit,
-- role-guarded anon GRANTs for the read path (services, availability) so the
-- flow behaves identically on hosted Supabase and bare postgres.
-- ============================================================================
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.book_appointment_by_slug(
  p_business_slug TEXT,
  p_service_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_start_time TIMESTAMPTZ,
  p_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL
)
RETURNS TABLE (booking_reference TEXT, appointment_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_duration INTEGER;
  v_client_id UUID;
  v_end TIMESTAMPTZ;
  v_ref TEXT;
  v_appointment_id UUID;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' OR p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'name and email are required' USING ERRCODE = '22023';
  END IF;

  SELECT b.id INTO v_business_id
  FROM public.businesses b
  WHERE b.slug = p_business_slug;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'booking page not found' USING ERRCODE = '22023';
  END IF;

  SELECT s.duration_minutes INTO v_duration
  FROM public.services s
  WHERE s.id = p_service_id
    AND s.business_id = v_business_id
    AND s.is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service not available' USING ERRCODE = '22023';
  END IF;

  v_end := p_start_time + make_interval(mins => COALESCE(v_duration, 60));

  -- Defensive double-booking guard (mirrors the page's availability check):
  -- an overlapping confirmed/pending appointment for the same business (and
  -- the same staff member when one is chosen) blocks the slot.
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.business_id = v_business_id
      AND a.status IN ('confirmed', 'pending')
      AND (p_staff_id IS NULL OR a.staff_id IS NULL OR a.staff_id = p_staff_id)
      AND a.start_time < v_end
      AND a.end_time > p_start_time
  ) THEN
    RAISE EXCEPTION 'that time slot has just been taken' USING ERRCODE = '23505';
  END IF;

  -- Upsert the client by (business_id, email) — repeat bookers reuse their row.
  INSERT INTO public.clients (business_id, business_name, email, phone)
  VALUES (v_business_id, btrim(p_name), lower(btrim(p_email)), p_phone)
  ON CONFLICT (business_id, email)
  DO UPDATE SET business_name = EXCLUDED.business_name,
                phone = COALESCE(EXCLUDED.phone, public.clients.phone)
  RETURNING id INTO v_client_id;

  v_ref := 'APT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.appointments (
    business_id, client_id, service_id, staff_id,
    start_time, end_time, status, notes, booking_reference
  )
  VALUES (
    v_business_id, v_client_id, p_service_id, p_staff_id,
    p_start_time, v_end, 'confirmed', p_notes, v_ref
  )
  RETURNING id INTO v_appointment_id;

  booking_reference := v_ref;
  appointment_id := v_appointment_id;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.book_appointment_by_slug(TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, UUID)
  IS 'Public booking write path. SECURITY DEFINER so anonymous bookers need no table privileges; validates business slug + active service, guards double-booking, upserts the client, inserts the appointment.';

-- Grant EXECUTE to anon + authenticated, guarded for bare postgres (the roles
-- always exist on hosted Supabase).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.book_appointment_by_slug(TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, UUID) TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.book_appointment_by_slug(TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, UUID) TO authenticated';
  END IF;
END $$;

-- Read path parity for bare postgres: the booking page reads active services
-- and the day's booked windows directly. Hosted Supabase grants these to anon
-- via default privileges; bare postgres needs them explicitly. RLS policies
-- (services_business_select is_active branch, appointments_public_select_by_ref)
-- still gate what rows are visible.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT SELECT ON public.services TO anon';
    EXECUTE 'GRANT SELECT ON public.appointments TO anon';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
