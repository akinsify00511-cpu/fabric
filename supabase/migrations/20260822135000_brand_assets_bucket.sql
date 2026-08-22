-- ============================================================================
-- brand-assets storage bucket (contract-drift repair).
--
-- Found by scripts/generate_contract_manifest.py: BrandingContext.tsx uploads
-- business logos to a 'brand-assets' bucket and renders them via
-- getPublicUrl(), but no migration created the bucket — logo uploads have
-- always failed on a fully-migrated database.
--
-- The bucket is PUBLIC by design: brand logos must render on public
-- surfaces (invoices, quotes, the booking page) without a signed URL. Only
-- business members may WRITE; anyone may READ. This matches how the
-- 'avatars' bucket (046) treats public identity assets.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do update set public = true;

-- Members of a business manage their own brand assets. The path convention is
-- {business_id}/{file}; a member may only write inside their own business
-- prefix. Public read is handled by the bucket being public (storage
-- objects in a public bucket are readable without a policy).
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'brand_assets_member_write') then
    drop policy brand_assets_member_write on storage.objects;
  end if;
end $$;

create policy brand_assets_member_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] in (select business_id::text from public.get_current_staff())
  )
  with check (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] in (select business_id::text from public.get_current_staff())
  );
