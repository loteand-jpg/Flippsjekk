-- ADVARSEL: Denne filen er KUN for lokal testing mot en vanlig Postgres (PGlite i `npm test`). Den skal ALDRI kjøres i Supabase.
--
-- Den etterligner de delene av en Supabase-database som migrasjonene og RLS-testene er avhengige av:
--   * rollene anon, authenticated og service_role (service_role omgår RLS, som i Supabase)
--   * auth.users (bare kolonnene vi bruker), auth.uid(), auth.role() og auth.jwt()
--   * Standardrettigheter på nye tabeller i schema public (ALTER DEFAULT PRIVILEGES). Faktisk Supabase-verifisering viste at service_role hadde
--     FLERE tabellrettigheter enn migrasjon 7 ga (TRUNCATE m.fl.), så en stubb uten standardrettigheter kunne ikke avsløre problemet.
--     Denne filen gir derfor, som worst case, ALT (inkludert TRUNCATE, REFERENCES og TRIGGER) til anon, authenticated og service_role.
--     GRANT fjerner ikke slike rettigheter, så migrasjonene må REVOKE først og gi eksplisitt det som skal være der. Uten denne etterligningen
--     ville testene bestått uten at REVOKE-ene var prøvd. Migrasjon 8 fjerner dessuten disse standardrettighetene for FREMTIDIGE tabeller.
--   * To snevrere varianter kan lastes etter denne filen (se supabase.pglite.test.ts):
--       local_service_role_no_defaults.sql            – service_role uten noen standardrettigheter
--       local_service_role_extra_defaults_only.sql    – service_role med KUN TRUNCATE/REFERENCES/TRIGGER utover det migrasjon 7 gir
--                                                      (gjengir det rapporterte live-utfallet: matrisen 202/204 med 0.8 og 8.20 røde)
--     Migrasjonene skal gi samme sluttresultat i alle tre tilfeller.
--
-- Alle rettigheter service_role skal ha kommer fra migrasjonene (20261022100600 og 20261022100700), aldri fra stubben.
-- Etterligningen er ikke Supabase. Faktisk Supabase må verifiseres separat (se docs/supabase.md).

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;

create table auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text,
  raw_user_meta_data jsonb,
  created_at timestamptz default now()
);

-- Samme logikk som Supabase Auth: sub hentes fra JWT-claims som PostgREST setter for hver forespørsel.
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant usage on schema public to anon, authenticated, service_role;
-- schema auth eies av Supabase (ikke av oss): service_role har tilgang der.
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- Standardrettigheter Supabase gir rollene på nye objekter i public (for objekter opprettet av migrasjonsrollen postgres).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
