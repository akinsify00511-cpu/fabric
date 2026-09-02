create or replace function public.update_user_engagement(
  p_user_id uuid,
  p_session_id text,
  p_event_type text,
  p_duration_seconds integer default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_business_id uuid;
begin
  if auth.uid() is null then
    return;
  end if;

  if v_user_id is distinct from auth.uid() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select s.business_id into v_business_id
  from public.staff s
  where s.user_id = auth.uid()
    and coalesce(s.is_active, s.active, true) = true
  order by s.created_at asc
  limit 1;

  if v_business_id is null then
    return;
  end if;

  perform public.record_analytics_event(
    v_business_id,
    v_user_id,
    coalesce(p_event_type, 'session_event'),
    'engagement',
    null,
    null,
    null,
    jsonb_build_object(
      'session_id', p_session_id,
      'duration_seconds', p_duration_seconds
    ),
    p_duration_seconds * 1000,
    p_session_id
  );
end;
$$;

grant execute on function public.update_user_engagement(uuid, text, text, integer) to authenticated;
