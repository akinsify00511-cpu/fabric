-- Africa localization seed: structural defaults only. Tax rates remain configurable per business/rule effective date.
insert into public.avenize_country_rules(country_code,rule_type,rule_key,rule_value) values
('NG','localization','currency','{"code":"NGN","minor_unit":2}'),('NG','localization','tax_regime','{"name":"VAT","country":"Nigeria"}'),
('GH','localization','currency','{"code":"GHS","minor_unit":2}'),('GH','localization','tax_regime','{"name":"VAT","country":"Ghana"}'),
('KE','localization','currency','{"code":"KES","minor_unit":2}'),('KE','localization','tax_regime','{"name":"VAT","country":"Kenya"}'),
('ZA','localization','currency','{"code":"ZAR","minor_unit":2}'),('ZA','localization','tax_regime','{"name":"VAT","country":"South Africa"}'),
('EG','localization','currency','{"code":"EGP","minor_unit":2}'),('EG','localization','tax_regime','{"name":"VAT","country":"Egypt"}'),
('RW','localization','currency','{"code":"RWF","minor_unit":0}'),('RW','localization','tax_regime','{"name":"VAT","country":"Rwanda"}'),
('TZ','localization','currency','{"code":"TZS","minor_unit":2}'),('TZ','localization','tax_regime','{"name":"VAT","country":"Tanzania"}'),
('UG','localization','currency','{"code":"UGX","minor_unit":0}'),('UG','localization','tax_regime','{"name":"VAT","country":"Uganda"}')
on conflict(country_code,rule_type,rule_key) do update set rule_value=excluded.rule_value,is_active=true,updated_at=now();
