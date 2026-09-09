-- Country engine defaults. Regulatory values remain configuration data, not hard-coded application logic.

insert into public.avenize_country_rules(country_code,rule_type,rule_key,rule_value,is_active,effective_from)
values
('NG','tax','vat', '{"rate":7.5,"currency":"NGN"}', true, current_date),
('NG','currency','default','{"code":"NGN","minor_unit":2}',true,current_date),
('GH','currency','default','{"code":"GHS","minor_unit":2}',true,current_date),
('KE','currency','default','{"code":"KES","minor_unit":2}',true,current_date),
('ZA','currency','default','{"code":"ZAR","minor_unit":2}',true,current_date),
('EG','currency','default','{"code":"EGP","minor_unit":2}',true,current_date),
('RW','currency','default','{"code":"RWF","minor_unit":0}',true,current_date),
('TZ','currency','default','{"code":"TZS","minor_unit":2}',true,current_date),
('UG','currency','default','{"code":"UGX","minor_unit":0}',true,current_date)
on conflict(country_code,rule_type,rule_key) do update set rule_value=excluded.rule_value,is_active=true,updated_at=now();
