-- Close the operational contract between procurement, sales, inventory and finance.

create table if not exists public.avenize_document_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  relation text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(business_id,source_type,source_id,target_type,target_id,relation)
);

alter table public.avenize_document_links enable row level security;
drop policy if exists avenize_document_links_select on public.avenize_document_links;
drop policy if exists avenize_document_links_insert on public.avenize_document_links;
create policy avenize_document_links_select on public.avenize_document_links for select to authenticated using (business_id=(select business_id from public.get_current_staff() limit 1));
create policy avenize_document_links_insert on public.avenize_document_links for insert to authenticated with check (business_id=(select business_id from public.get_current_staff() limit 1));

create index if not exists idx_avenize_document_links_source on public.avenize_document_links(business_id,source_type,source_id);
create index if not exists idx_avenize_document_links_target on public.avenize_document_links(business_id,target_type,target_id);

create or replace function public.avenize_link_business_documents(
  p_business_id uuid,p_source_type text,p_source_id uuid,p_target_type text,p_target_id uuid,p_relation text
) returns uuid
language plpgsql security invoker set search_path=public,extensions,pg_temp
as $$
declare v_id uuid;
begin
  if p_business_id<>(select business_id from public.get_current_staff() limit 1) then raise exception 'business access denied'; end if;
  insert into public.avenize_document_links(business_id,source_type,source_id,target_type,target_id,relation,created_by)
  values(p_business_id,p_source_type,p_source_id,p_target_type,p_target_id,p_relation,auth.uid())
  on conflict (business_id,source_type,source_id,target_type,target_id,relation) do update set relation=excluded.relation
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.avenize_link_business_documents(uuid,text,uuid,text,uuid,text) from public,anon;
grant execute on function public.avenize_link_business_documents(uuid,text,uuid,text,uuid,text) to authenticated;
