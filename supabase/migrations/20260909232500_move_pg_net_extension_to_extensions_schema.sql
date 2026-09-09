-- Keep pg_net out of the exposed public schema. No application objects depend on
-- the extension objects directly; they remain available through the net schema.
drop extension pg_net;
create extension pg_net schema extensions;
