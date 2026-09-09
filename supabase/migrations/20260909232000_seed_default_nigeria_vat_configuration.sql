-- Ensure every business has a usable Nigeria VAT configuration by default.
-- Checkout already applies 7.5% VAT to subscription plans; invoice tax RPCs use
-- the business configuration created here.

insert into public.tax_configurations (business_id, tax_type, name, rate_percentage, is_active)
select b.id, 'vat', 'Nigeria VAT', 7.5, true
from public.businesses b
where not exists (
  select 1
  from public.tax_configurations tc
  where tc.business_id = b.id
    and tc.is_active = true
);

create or replace function public.handle_new_business_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, auth, storage, pg_temp
as $function$
begin
  insert into public.business_entitlements (business_id) values (new.id)
    on conflict (business_id) do nothing;

  insert into public.business_branding (business_id) values (new.id)
    on conflict (business_id) do nothing;

  insert into public.tax_configurations (business_id, tax_type, name, rate_percentage, is_active)
  select new.id, 'vat', 'Nigeria VAT', 7.5, true
  where not exists (
    select 1 from public.tax_configurations tc
    where tc.business_id = new.id and tc.is_active = true
  );

  return new;
end;
$function$;
