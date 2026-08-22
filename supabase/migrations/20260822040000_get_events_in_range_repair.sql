-- Repair get_events_in_range drift.
--
-- Three compounding defects kept the Calendar permanently empty:
-- 1. The 2-arg overload (p_start, p_end) was corrupted by the zz tenant-guard
--    generator: its body guards on p_business_id, which is not a parameter --
--    it raises an error on any call.
-- 2. The 3-arg overload (p_business_id, p_start_date, p_end_date) -- the one
--    the UI calls -- read e.start_date/e.end_date, but the UI inserts into
--    start_time/end_time. start_date was NULL for every UI-created event, so
--    the RPC always returned [].
-- 3. The 2-arg body also filtered status != 'cancelled', and the UI insert
--    leaves status NULL, which that filter excludes.
--
-- Canonical fix: drop both broken overloads, create ONE 3-arg RPC over
-- start_time/end_time with the standard membership guard, a NULL-safe
-- status filter, and the organizer name resolved via the same sync pattern
-- as contacts (full_name/name).
DROP FUNCTION IF EXISTS public.get_events_in_range(timestamp with time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS public.get_events_in_range(uuid, timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_events_in_range(
  p_business_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  event_type text,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  all_day boolean,
  location text,
  status text,
  organizer_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = p_business_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.description,
    e.event_type,
    e.start_time,
    e.end_time,
    e.all_day,
    e.location,
    e.status,
    COALESCE(s.full_name, s.name) AS organizer_name
  FROM public.events e
  LEFT JOIN public.staff s ON s.id = e.organizer_id
  WHERE e.business_id = p_business_id
    AND (e.status IS NULL OR e.status <> 'cancelled')
    AND e.start_time >= p_start_date
    AND e.start_time <= p_end_date
  ORDER BY e.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_events_in_range(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_events_in_range(uuid, timestamp with time zone, timestamp with time zone) TO authenticated;
