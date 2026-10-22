-- ADVARSEL: Denne filen er KUN for lokal testing mot en vanlig Postgres (PGlite i `npm test`). Den skal ALDRI kjøres i Supabase.
--
-- Den etterligner de delene av en Supabase-database som migrasjonene og RLS-testene er avhengige av:
--   * rollene anon, authenticated og service_role (service_role omgår RLS, som i Supabase)
--   * auth.users (bare kolonnene vi bruker), auth.uid(), auth.role() og auth.jwt()
--   * standardrettighetene Supabase gir på nye tabeller i schema public (alt til anon, authenticated og service_role).
--     Migrasjonene tar bort det som ikke skal være der med eksplisitte REVOKE, så denne etterligningen må være ærlig:
--     uten den ville testene bestått uten at REVOKE-ene var prøvd.
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
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
