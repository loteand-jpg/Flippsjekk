-- ADVARSEL: KUN for lokal testing (PGlite). Aldri i Supabase.
--
-- Etterligner det ChatGPTs live-verifisering rapporterte for service_role etter migrasjon 7: ingen ekstra SELECT/INSERT/UPDATE/DELETE utover det
-- migrasjonene ga, men i tillegg TRUNCATE, REFERENCES og TRIGGER – rettigheter et GRANT i migrasjon 7 ikke kan fjerne.
-- Med denne filen feiler den forrige matrisen etter migrasjon 1–7 på nøyaktig 0.8 og 8.20 (202 av 204), det samme som ble rapportert live.
-- Hvor rettighetene kommer fra i Supabase er ikke bekreftet av Claude; dette er en realistisk modell av virkningen, ikke av årsaken.
-- Lastes etter local_supabase_stub.sql og før migrasjonene.

alter default privileges in schema public revoke all on tables from service_role;
alter default privileges in schema public grant truncate, references, trigger on tables to service_role;
