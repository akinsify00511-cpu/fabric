-- Defense-in-depth for SECURITY DEFINER RPCs exposed to authenticated users.
-- Keep authorization inside the function because SECURITY DEFINER bypasses RLS.

create or replace function public.check_in_attendee(p_registration_id uuid)
returns void language plpgsql security definer set search_path='pg_catalog','public','pg_temp' as $$
declare v_staff record; v_reg record;
begin
  select * into v_staff from public.get_current_staff() limit 1;
  select er.*, e.business_id into v_reg from public.event_registrations er join public.events e on e.id=er.event_id where er.id=p_registration_id;
  if v_staff.business_id is null or v_reg.business_id is null or v_reg.business_id <> v_staff.business_id then raise exception 'Not authorized'; end if;
  if v_staff.role not in ('owner','admin','manager') then raise exception 'Not authorized'; end if;
  update public.event_registrations set checked_in=true,checked_in_at=now(),status='attended',updated_at=now() where id=p_registration_id;
end; $$;

create or replace function public.cancel_registration(p_registration_id uuid)
returns void language plpgsql security definer set search_path='pg_catalog','public','pg_temp' as $$
declare v_reg record; v_staff record;
begin
  select * into v_reg from public.event_registrations where id=p_registration_id;
  if v_reg.id is null then raise exception 'Registration not found'; end if;
  select * into v_staff from public.get_current_staff() limit 1;
  if v_staff.business_id is null or not exists (select 1 from public.events e where e.id=v_reg.event_id and e.business_id=v_staff.business_id) then raise exception 'Not authorized'; end if;
  if v_reg.status = 'cancelled' then return; end if;
  update public.event_registrations set status='cancelled', updated_at=now() where id=p_registration_id;
  update public.events set current_registrations=greatest(current_registrations-1,0) where id=v_reg.event_id;
  insert into public.event_waitlist(event_id,email,full_name,position)
  select v_reg.event_id,v_reg.email,v_reg.full_name,coalesce((select max(position)+1 from public.event_waitlist ew where ew.event_id=v_reg.event_id),1);
end; $$;

create or replace function public.check_achievements(p_user_id uuid)
returns table(achievement_id uuid,key text,name text,xp_reward integer) language plpgsql security definer set search_path='pg_catalog','public','pg_temp' as $$
declare v_user_xp record; v_ach record;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'Not authorized'; end if;
  select * into v_user_xp from public.user_xp where user_id=p_user_id;
  if v_user_xp.user_id is null then return; end if;
  for v_ach in select a.* from public.achievements a where a.id not in (select achievement_id from public.user_achievements where user_id=p_user_id) loop
    if v_ach.key='streak_3' and v_user_xp.streak_days >= 3 then
      perform public.unlock_achievement(p_user_id,v_ach.id);
      return query select v_ach.id,v_ach.key,v_ach.name,v_ach.xp_reward;
    end if;
  end loop;
end; $$;

create or replace function public.award_xp_with_streak(p_user_id uuid,p_xp_amount integer,p_action text,p_description text default null)
returns table(xp_total integer,level integer,streak_days integer,longest_streak integer,last_active_date date,leveled_up boolean) language plpgsql security definer set search_path='pg_catalog','public','pg_temp' as $$
declare v_current_xp integer:=0; v_new_xp integer; v_old_level integer; v_new_level integer; v_streak integer:=0; v_longest integer:=0; v_last date; v_today date:=current_date; v_yesterday date:=current_date-1;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'Not authorized'; end if;
  if p_xp_amount is null or p_xp_amount<0 or p_xp_amount>10000 then raise exception 'Invalid XP amount'; end if;
  insert into public.user_xp(user_id,xp_total,level,streak_days,longest_streak,last_active_date) values(p_user_id,0,1,0,0,null) on conflict(user_id) do nothing;
  select xp_total,streak_days,longest_streak,last_active_date into v_current_xp,v_streak,v_longest,v_last from public.user_xp where user_id=p_user_id for update;
  v_current_xp:=coalesce(v_current_xp,0); v_new_xp:=v_current_xp+p_xp_amount; v_old_level:=public.calculate_level(v_current_xp); v_new_level:=public.calculate_level(v_new_xp);
  if v_last is null or v_last<v_yesterday then v_streak:=1; elsif v_last=v_yesterday then v_streak:=v_streak+1; end if;
  v_longest:=greatest(coalesce(v_longest,0),v_streak);
  update public.user_xp set xp_total=v_new_xp,level=v_new_level,streak_days=v_streak,longest_streak=v_longest,last_active_date=v_today,updated_at=now() where user_id=p_user_id;
  insert into public.xp_history(user_id,amount,action,description) values(p_user_id,p_xp_amount,p_action,p_description);
  return query select v_new_xp,v_new_level,v_streak,v_longest,v_today,(v_new_level>v_old_level);
end; $$;

create or replace function public.get_ticket_with_replies(p_ticket_id uuid)
returns table(ticket_id uuid,subject text,description text,status text,priority text,category text,customer_name text,customer_email text,assignee_id uuid,assignee_name text,created_at timestamptz,reply_id uuid,reply_sender_type text,reply_sender_name text,reply_content text,reply_is_internal boolean,reply_created_at timestamptz)
language plpgsql security definer set search_path='pg_catalog','public','pg_temp' as $$
declare v_staff record;
begin
  select * into v_staff from public.get_current_staff() limit 1;
  if v_staff.business_id is null or not exists(select 1 from public.tickets t where t.id=p_ticket_id and t.business_id=v_staff.business_id) then raise exception 'Not authorized'; end if;
  return query select t.id,t.subject,t.description,t.status,t.priority,t.category,t.customer_name,t.customer_email,t.assignee_id,coalesce(a.full_name,a.name),t.created_at,r.id,r.sender_type,r.sender_name,r.content,r.is_internal,r.created_at from public.tickets t left join public.staff a on a.id=t.assignee_id left join public.ticket_replies r on r.ticket_id=t.id where t.id=p_ticket_id order by r.created_at asc nulls first;
end; $$;

create or replace function public.get_unread_notification_count(p_user_id uuid)
returns integer language plpgsql security definer set search_path='pg_catalog','public','pg_temp' as $$
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'Not authorized'; end if;
  return (select count(*)::integer from public.notifications where user_id=auth.uid() and read=false and sent=true);
end; $$;

create or replace function public.record_decision_learning(p_decision_id uuid,p_actual_outcome text,p_what_worked text,p_what_learned text,p_tags text[] default '{}')
returns void language plpgsql security definer set search_path='pg_catalog','public','pg_temp' as $$
declare v_staff record;
begin
  select * into v_staff from public.get_current_staff() limit 1;
  if v_staff.business_id is null or not exists(select 1 from public.decisions d where d.id=p_decision_id and d.business_id=v_staff.business_id) then raise exception 'Not authorized'; end if;
  update public.decisions set actual_outcome=p_actual_outcome,what_worked=p_what_worked,what_learned=p_what_learned,learning_tags=p_tags,status='reviewed',updated_at=now() where id=p_decision_id;
end; $$;
