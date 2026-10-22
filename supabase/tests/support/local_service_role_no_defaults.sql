-- ADVARSEL: KUN for lokal testing (PGlite). Aldri i Supabase.
--
-- Alternativt utgangspunkt til local_supabase_stub.sql: service_role har INGEN standardrettigheter på nye objekter i public (slik en
-- strengt konfigurert database ville være). Lastes etter local_supabase_stub.sql og før migrasjonene.
-- Migrasjonene skal gi nøyaktig samme rettigheter til service_role uansett om standardene finnes (stubben alene) eller ikke (denne filen).

alter default privileges in schema public revoke all on tables from service_role;
alter default privileges in schema public revoke all on sequences from service_role;
alter default privileges in schema public revoke all on functions from service_role;
