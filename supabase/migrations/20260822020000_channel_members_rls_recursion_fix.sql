-- Fix infinite recursion in the chat RLS policy cycle.
--
-- 005_chat.sql's "Channel members visible" policy is self-referential
-- (channel_id IN (SELECT channel_id FROM channel_members ...)) and 998's
-- "Channel members can view channels" policy subqueries channel_members,
-- so reading/writing any chat table recurses:
--   channels policy -> channel_members policy -> channels policy -> ...
-- Every chat SELECT/INSERT aborted with
--   "infinite recursion detected in policy for relation channel_members"
-- (or "channels") -- chat was completely broken.
--
-- Fix: a SECURITY DEFINER helper that checks "is this channel in one of my
-- businesses" while bypassing RLS (breaking the cycle), then point the
-- channel_members SELECT policy at it. Tenant isolation is preserved:
-- channels are business-scoped and the helper compares against the caller's
-- own staff rows via get_current_staff().
CREATE OR REPLACE FUNCTION public.channel_in_my_business(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = p_channel_id
      AND c.business_id IN (SELECT business_id FROM public.get_current_staff())
  );
$$;

REVOKE ALL ON FUNCTION public.channel_in_my_business(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_in_my_business(uuid) TO authenticated;

DROP POLICY IF EXISTS "Channel members visible" ON public.channel_members;
CREATE POLICY "Channel members visible"
  ON public.channel_members FOR SELECT
  USING (public.channel_in_my_business(channel_id));
