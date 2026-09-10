-- Keep pg_net out of the exposed public schema. On Supabase production the
-- extension is normally installed; clean CI databases may not provide it.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    execute 'drop extension pg_net';
  end if;

  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension pg_net schema extensions';
  end if;
end $$;
