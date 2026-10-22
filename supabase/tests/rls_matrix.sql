-- Flippsjekk: RLS- og eierskapstest (testmatrise) for backend fase 1.
--
-- HVORDAN DEN KJØRES
--   * Lokalt, uten Supabase: `npm test` kjører denne mot PGlite etter local_supabase_stub.sql (som IKKE gir service_role noen
--     standardrettigheter) og migrasjonene
--     (src/services/supabase/supabase.pglite.test.ts). Det er en ETTERLIGNING av Supabase, ikke Supabase.
--   * Mot det faktiske Supabase-utviklingsprosjektet (etter at migrasjonene er anvendt): kjør hele filen som postgres
--     (SQL-editor, `psql` eller MCP execute_sql). Scriptet oppretter egne testbrukere og testdata inne i en transaksjon og
--     ender med ROLLBACK, så ingenting blir liggende. Siste uttrykk før ROLLBACK returnerer ett resultat per test: kolonnen
--     «ok» skal være true på alle rader. Kjør ALDRI mot et prosjekt med ekte brukerdata uten å først lese gjennom scriptet.
--   * Rollebytte: scriptet bruker `set local role authenticated|anon|service_role` og setter JWT-claims
--     (`request.jwt.claims`), slik PostgREST gjør. Rollen som kjører scriptet må kunne gjøre `set role` til disse.
--     Hvis verktøyet ikke tillater begin/rollback i én kjøring: fjern begin/rollback og slett testdata manuelt etterpå
--     (alle testbrukere har e-post på @rls-test.invalid).
--
-- TESTBRUKERE: A (aaaaaaaa-…) og B (bbbbbbbb-…).
--   Eiendommer: P1 kun i A sin liste, P2 kun i B sin liste, P3 i begge lister.
--
-- Hver test har et navn og forventet utfall. Avviste statements forventes med en bestemt SQLSTATE
-- (42501 = rettighet/RLS/guard-trigger, 23503 = fremmednøkkel, 23505 = unik, 23514 = check, 54000 = radgrense),
-- slik at en skrivefeil i testen ikke kan telle som «avvist».

begin;

create temp table _test_results (n integer primary key, test text not null, ok boolean not null, detail text);
grant all on _test_results to public;

-- ---------------------------------------------------------------------------
-- Hjelpefunksjoner (lever bare i denne sesjonen)
-- ---------------------------------------------------------------------------
create function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void
language plpgsql as $$
begin
  insert into _test_results (n, test, ok, detail)
  values ((select coalesce(max(n), 0) + 1 from _test_results), p_name, coalesce(p_ok, false), p_detail);
end $$;

create function pg_temp.as_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
end $$;

create function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  set local role anon;
end $$;

create function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  set local role service_role;
end $$;

create function pg_temp.as_owner() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end $$;

-- Statementet SKAL avvises med en av de oppgitte SQLSTATE-kodene. Uventet suksess (eller feil kode) gir ok = false.
-- p_like (valgfri): feilmeldingen må matche mønsteret (ilike). Brukes der koden er 42501, som både «permission denied» (manglende GRANT)
-- og våre egne guard-triggere bruker – uten mønster kunne en manglende GRANT utgi seg for å være guarden.
-- Virkningen rulles alltid tilbake (delt transaksjon i en underblokk), så testene påvirker ikke hverandre.
create function pg_temp.expect_fail(p_name text, p_stmt text, p_states text[], p_like text default null) returns void
language plpgsql as $$
begin
  begin
    execute p_stmt;
    raise exception using errcode = 'P0001', message = '__uventet_suksess__';
  exception when others then
    if sqlerrm = '__uventet_suksess__' then
      perform pg_temp.check(p_name, false, 'FORVENTET AVVIST, men statementet gikk gjennom');
    elsif not (sqlstate = any (p_states)) then
      perform pg_temp.check(p_name, false, 'avvist med uventet kode ' || sqlstate || ' (forventet ' || array_to_string(p_states, '/') || '): ' || left(sqlerrm, 110));
    elsif p_like is not null and sqlerrm not ilike p_like then
      perform pg_temp.check(p_name, false, 'avvist ' || sqlstate || ', men av feil grunn (forventet melding som ' || p_like || '): ' || left(sqlerrm, 110));
    else
      perform pg_temp.check(p_name, true, 'avvist ' || sqlstate || ': ' || left(sqlerrm, 110));
    end if;
  end;
end $$;

-- Statementet SKAL lykkes. Virkningen beholdes (brukes til å bygge opp testdata som brukeren selv har rett til å lage).
create function pg_temp.expect_ok(p_name text, p_stmt text) returns void
language plpgsql as $$
begin
  execute p_stmt;
  perform pg_temp.check(p_name, true, 'lyktes');
exception when others then
  perform pg_temp.check(p_name, false, 'FORVENTET OK, men feilet ' || sqlstate || ': ' || left(sqlerrm, 160));
end $$;

-- Statementet SKAL lykkes, men virkningen rulles tilbake.
create function pg_temp.expect_ok_rollback(p_name text, p_stmt text) returns void
language plpgsql as $$
begin
  begin
    execute p_stmt;
    raise exception using errcode = 'P0001', message = '__rull_tilbake__';
  exception when others then
    if sqlerrm = '__rull_tilbake__' then
      perform pg_temp.check(p_name, true, 'lyktes (rullet tilbake)');
    else
      perform pg_temp.check(p_name, false, 'FORVENTET OK, men feilet ' || sqlstate || ': ' || left(sqlerrm, 160));
    end if;
  end;
end $$;

-- Statementet (update/delete/insert) SKAL berøre nøyaktig p_expected rader. RLS gir 0 rader (ikke feil) for andres rader.
create function pg_temp.expect_rows(p_name text, p_stmt text, p_expected bigint) returns void
language plpgsql as $$
declare
  n bigint;
begin
  execute p_stmt;
  get diagnostics n = row_count;
  perform pg_temp.check(p_name, n = p_expected, 'berørte ' || n || ' rader (forventet ' || p_expected || ')');
exception when others then
  perform pg_temp.check(p_name, false, 'feilet ' || sqlstate || ': ' || left(sqlerrm, 160));
end $$;

-- «select count(*) …» SKAL gi p_expected.
create function pg_temp.expect_count(p_name text, p_sql text, p_expected bigint) returns void
language plpgsql as $$
declare
  n bigint;
begin
  execute p_sql into n;
  perform pg_temp.check(p_name, n = p_expected, 'fant ' || n || ' (forventet ' || p_expected || ')');
exception when others then
  perform pg_temp.check(p_name, false, 'feilet ' || sqlstate || ': ' || left(sqlerrm, 160));
end $$;

-- ---------------------------------------------------------------------------
-- Testdata (settes inn som eier/postgres, som omgår RLS)
-- ---------------------------------------------------------------------------
-- Brukere. Triggeren på auth.users oppretter profilene.
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'a@rls-test.invalid', '{"name": "Bruker A"}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'b@rls-test.invalid', '{}');

-- Eiendommer, snapshots og felles analyser
insert into public.properties (id, finn_id, canonical_url, address, city, municipality, property_type, tenure, data_origin) values
  ('11111111-1111-4111-8111-111111111111', '900000901', 'https://example.invalid/1', 'Testveien 1', 'Trondheim', 'Trondheim', 'leilighet', 'selveier', 'demo'),
  ('22222222-2222-4222-8222-222222222222', '900000902', 'https://example.invalid/2', 'Testveien 2', 'Trondheim', 'Trondheim', 'leilighet', 'selveier', 'demo'),
  ('33333333-3333-4333-8333-333333333333', '900000903', 'https://example.invalid/3', 'Testveien 3', 'Trondheim', 'Trondheim', 'rekkehus', 'selveier', 'demo');

insert into public.property_snapshots (id, property_id, version, observed_at, fetched_at, origin, sale_status) values
  ('a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 1, now(), now(), 'demo', 'aktiv'),
  ('a2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 1, now(), now(), 'demo', 'aktiv'),
  ('a3333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 1, now(), now(), 'demo', 'aktiv');

insert into public.viewings (id, property_id, start_at, status, verified_at) values
  ('e1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', now() + interval '2 days', 'planlagt', now()),
  ('e2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', now() + interval '2 days', 'planlagt', now());

-- Brukernes lister: A har P1 og P3, B har P2 og P3.
insert into public.user_properties (id, user_id, property_id) values
  ('f1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('f1111113-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333'),
  ('f2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222'),
  ('f2222223-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333');

insert into public.analyses (id, property_id, snapshot_id, version, schema_version, model_version, status, visibility, owner_id, origin, recommendation, estimates) values
  ('c1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 1, 1, '1.2.0', 'published', 'shared', null, 'demo', 'interessant', '{}'),
  ('c1111112-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 2, 1, '1.2.0', 'published', 'shared', null, 'demo', 'interessant', '{}'),
  ('c2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', 1, 1, '1.2.0', 'published', 'shared', null, 'demo', 'folg_med', '{}'),
  ('c3333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'a3333333-3333-4333-8333-333333333333', 1, 1, '1.2.0', 'published', 'shared', null, 'demo', 'interessant', '{}'),
  ('c3333334-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'a3333333-3333-4333-8333-333333333333', 2, 1, '1.2.0', 'draft', 'shared', null, 'demo', null, '{}'),
  ('c3333335-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'a3333333-3333-4333-8333-333333333333', 1, 1, '1.2.0', 'draft', 'private', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'import_v1', null, '{}'),
  ('c3333336-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'a3333333-3333-4333-8333-333333333333', 1, 1, '1.2.0', 'draft', 'private', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'import_v1', null, '{}');

-- Scenarioer: A har ett vanlig og ett låst på P1 og ett på P3. B har ett på P2 og ett på P3.
insert into public.scenarios (id, owner_id, property_id, analysis_id, analysis_version, name, locked, "values") values
  ('d1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 1, 'A hovedscenario', false, '{"purchasePrice": 1}'),
  ('d1111112-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 1, 'Nettsidens vurdering', true, '{"purchasePrice": 1}'),
  ('d3333331-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'c3333333-3333-4333-8333-333333333333', 1, 'A på P3', false, '{"purchasePrice": 1}'),
  ('d2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'c2222222-2222-4222-8222-222222222222', 1, 'B på P2', false, '{"purchasePrice": 2}'),
  ('d3333332-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'c3333333-3333-4333-8333-333333333333', 1, 'B på P3', false, '{"purchasePrice": 2}');

update public.user_properties set primary_scenario_id = 'd1111111-1111-4111-8111-111111111111' where id = 'f1111111-1111-4111-8111-111111111111';
update public.user_properties set primary_scenario_id = 'd2222222-2222-4222-8222-222222222222' where id = 'f2222222-2222-4222-8222-222222222222';

-- Private data
insert into public.user_comparables (id, user_id, property_id, name, kind, asking_price) values
  ('b1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'A sin referanse', 'prisantydning', 3000000);
insert into public.user_risks (id, user_id, property_id, title, category) values
  ('b2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'A sin risiko', 'vatrom');
insert into public.private_events (id, user_id, property_id, kind, start_at) values
  ('b3333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'private_viewing', now() + interval '3 days');
insert into public.calendar_overrides (id, user_id, property_id, start_at, origin) values
  ('b4444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', now() + interval '4 days', 'manual');

-- Abonnement, kurskjøp, forbruk og jobber (skrives bare av backend)
insert into public.subscriptions (id, user_id, plan_id, interval, status, current_period_start, current_period_end, provider) values
  ('91111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'flipprom-pro', 'month', 'active', now() - interval '5 days', now() + interval '25 days', 'vipps'),
  ('92222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'flipprom-pro', 'month', 'canceled', now() - interval '40 days', now() - interval '10 days', 'vipps');
insert into public.course_purchases (id, user_id, course_id, amount_paid, payment_id) values
  ('93333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'flipping-privat', 2999, 'pay_a_1');
insert into public.usage_events (id, user_id, kind, property_id, idempotency_key, chargeable) values
  ('94444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'new_analysis', '11111111-1111-4111-8111-111111111111', 'new_analysis:test:a', true),
  ('95555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'new_analysis', '22222222-2222-4222-8222-222222222222', 'new_analysis:test:b', true);
insert into public.analysis_jobs (id, property_id, finn_id, type, schema_version, model_version, dedupe_key, status, created_by, requested_by) values
  ('96666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', '900000901', 'full_analysis', 1, '1.2.0', 'job:p1:full:v1', 'succeeded', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']::uuid[]),
  ('97777777-7777-4777-8777-777777777777', '22222222-2222-4222-8222-222222222222', '900000902', 'full_analysis', 1, '1.2.0', 'job:p2:full:v1', 'running', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', array['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']::uuid[]);

-- ===========================================================================
-- 0. INVENTAR (som eier): RLS på alle tabeller, ingen farlige rettigheter og ingen SECURITY DEFINER-funksjoner for klienter
-- ===========================================================================
select pg_temp.check(
  '0.1 RLS er slått på for alle 15 Flippsjekk-tabeller',
  (select count(*) = 15 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname in ('profiles','properties','property_snapshots','analyses','viewings','user_properties','scenarios','user_comparables',
                        'user_risks','private_events','calendar_overrides','subscriptions','course_purchases','usage_events','analysis_jobs')),
  null);

create temp table _tables (name text primary key);
insert into _tables values ('profiles'), ('properties'), ('property_snapshots'), ('analyses'), ('viewings'), ('user_properties'), ('scenarios'),
  ('user_comparables'), ('user_risks'), ('private_events'), ('calendar_overrides'), ('subscriptions'), ('course_purchases'), ('usage_events'), ('analysis_jobs');

select pg_temp.check(
  '0.2 anon har ingen rettigheter (heller ikke på kolonner) på noen Flippsjekk-tabell',
  (select count(*) = 0 from _tables t
    where has_any_column_privilege('anon', format('public.%I', t.name), 'SELECT,INSERT,UPDATE,REFERENCES')
       or has_table_privilege('anon', format('public.%I', t.name), 'DELETE,TRUNCATE,TRIGGER')),
  null);

select pg_temp.check(
  '0.3 authenticated har bare SELECT på felles tabeller og abonnement/forbruk/jobber (ingen INSERT/UPDATE/DELETE/TRUNCATE)',
  (select count(*) = 0 from _tables t
    where t.name in ('properties','property_snapshots','viewings','subscriptions','course_purchases','usage_events','analysis_jobs')
      and (has_any_column_privilege('authenticated', format('public.%I', t.name), 'INSERT,UPDATE,REFERENCES')
        or has_table_privilege('authenticated', format('public.%I', t.name), 'DELETE,TRUNCATE,TRIGGER'))),
  null);

select pg_temp.check(
  '0.4 authenticated har ikke TRUNCATE, TRIGGER eller REFERENCES på noen Flippsjekk-tabell',
  (select count(*) = 0 from _tables t
    where has_table_privilege('authenticated', format('public.%I', t.name), 'TRUNCATE,TRIGGER')
       or has_any_column_privilege('authenticated', format('public.%I', t.name), 'REFERENCES')),
  null);

select pg_temp.check(
  '0.5 ingen av Flippsjekks funksjoner i public kan kjøres av anon eller authenticated (trigger-funksjoner er ikke RPC)',
  (select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_updated_at','enforce_immutable_columns','handle_new_user','handle_user_email_change','guard_published_analysis',
                        'scenarios_check_refs','scenarios_guard_locked','enforce_row_limit_per_property')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  null);

select pg_temp.check(
  '0.6 alle Flippsjekk-funksjoner har fast search_path, og bare de to nødvendige er SECURITY DEFINER',
  (select count(*) = 8 and bool_and(exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'))
          and count(*) filter (where p.prosecdef) = 2
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_updated_at','enforce_immutable_columns','handle_new_user','handle_user_email_change','guard_published_analysis',
                        'scenarios_check_refs','scenarios_guard_locked','enforce_row_limit_per_property')),
  null);

select pg_temp.check('0.7 triggeren oppretter profil for nye brukere (visningsnavn fra metadata, ellers fra e-post)',
  (select count(*) = 2
      and bool_and(case user_id when 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then display_name = 'Bruker A' else display_name = 'b' end)
     from public.profiles where user_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),
  null);

-- Forventede rettigheter. GitHub (migrasjonene) er autoritativ: testene under feiler hvis det hostede Supabase har gitt mer ELLER mindre.
create temp table _expected_service (tbl text not null, priv text not null);
insert into _expected_service (tbl, priv)
select t, p from (values
  ('profiles', array['SELECT','INSERT','UPDATE']),
  ('properties', array['SELECT','INSERT','UPDATE','DELETE']),
  ('property_snapshots', array['SELECT','INSERT','UPDATE']),
  ('analyses', array['SELECT','INSERT','UPDATE','DELETE']),
  ('viewings', array['SELECT','INSERT','UPDATE','DELETE']),
  ('user_properties', array['SELECT','INSERT','UPDATE','DELETE']),
  ('scenarios', array['SELECT','INSERT','UPDATE','DELETE']),
  ('user_comparables', array['SELECT','INSERT','UPDATE','DELETE']),
  ('user_risks', array['SELECT','INSERT','UPDATE','DELETE']),
  ('private_events', array['SELECT','INSERT','UPDATE','DELETE']),
  ('calendar_overrides', array['SELECT','INSERT','UPDATE','DELETE']),
  ('subscriptions', array['SELECT','INSERT','UPDATE']),
  ('course_purchases', array['SELECT','INSERT']),
  ('usage_events', array['SELECT','INSERT']),
  ('analysis_jobs', array['SELECT','INSERT','UPDATE','DELETE'])
) v(t, ps), unnest(v.ps) p;

create temp table _expected_authenticated (tbl text not null, priv text not null);
insert into _expected_authenticated (tbl, priv)
select t, p from (values
  ('profiles', array['SELECT']),
  ('properties', array['SELECT']),
  ('property_snapshots', array['SELECT']),
  ('analyses', array['SELECT','INSERT','UPDATE','DELETE']),
  ('viewings', array['SELECT']),
  ('user_properties', array['SELECT','DELETE']),
  ('scenarios', array['SELECT','DELETE']),
  ('user_comparables', array['SELECT','DELETE']),
  ('user_risks', array['SELECT','DELETE']),
  ('private_events', array['SELECT','DELETE']),
  ('calendar_overrides', array['SELECT','DELETE']),
  ('subscriptions', array['SELECT']),
  ('course_purchases', array['SELECT']),
  ('usage_events', array['SELECT']),
  ('analysis_jobs', array['SELECT'])
) v(t, ps), unnest(v.ps) p;

-- Kolonnerettigheter for authenticated (INSERT/UPDATE) på tabeller uten tabellnivå-rettighet. analyses har tabellnivå (alle kolonner) og hoppes over.
create temp table _expected_cols (tbl text not null, priv text not null, cols text[] not null);
insert into _expected_cols (tbl, priv, cols) values
  ('profiles', 'UPDATE', array['display_name','defaults']),
  ('user_properties', 'INSERT', array['property_id','favorite','work_status','notes','label','last_seen_analysis_version','checks']),
  ('user_properties', 'UPDATE', array['favorite','work_status','notes','primary_scenario_id','label','archived_at','last_seen_analysis_version','checks']),
  ('scenarios', 'INSERT', array['property_id','analysis_id','analysis_version','name','values']),
  ('scenarios', 'UPDATE', array['analysis_id','analysis_version','name','values']),
  ('user_comparables', 'INSERT', array['property_id','name','url','kind','asking_price','sold_price','common_costs','sold_total_price','area','date','notes','bedrooms','property_type','tenure','shared_debt','location_level','standard_class','layout_match','floor','elevator','balcony','parking','view_note','data_quality','market_adjustment','original_asking_price']),
  ('user_comparables', 'UPDATE', array['name','url','kind','asking_price','sold_price','common_costs','sold_total_price','area','date','notes','bedrooms','property_type','tenure','shared_debt','location_level','standard_class','layout_match','floor','elevator','balcony','parking','view_note','data_quality','market_adjustment','original_asking_price']),
  ('user_risks', 'INSERT', array['property_id','base_risk_id','removed','title','category','level','cost_low','cost_high','rationale','action']),
  ('user_risks', 'UPDATE', array['removed','title','category','level','cost_low','cost_high','rationale','action']),
  ('private_events', 'INSERT', array['property_id','kind','start_at','end_at','note','confirmed']),
  ('private_events', 'UPDATE', array['kind','start_at','end_at','note','confirmed']),
  ('calendar_overrides', 'INSERT', array['property_id','event_key','start_at','note','origin','derived_start_at_override']),
  ('calendar_overrides', 'UPDATE', array['start_at','note','origin','derived_start_at_override']);

select pg_temp.check(
  '0.8 service_role har NØYAKTIG de bestemte tabellrettighetene (ikke flere, ikke færre) – uavhengig av Supabase-standarder',
  m.n = 0, case when m.n = 0 then 'alle 15 tabeller stemmer' else m.list end)
from (
  select count(*) as n, string_agg(x.tbl || ' ' || x.priv || (case when x.actual then ' finnes men skal ikke' else ' mangler' end), '; ') as list
    from (
      select t.name as tbl, p.priv,
             has_table_privilege('service_role', format('public.%I', t.name), p.priv) as actual,
             exists (select 1 from _expected_service e where e.tbl = t.name and e.priv = p.priv) as expected
        from _tables t cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv)
    ) x where x.actual <> x.expected
) m;

select pg_temp.check(
  '0.9 service_role har USAGE på schema public',
  has_schema_privilege('service_role', 'public', 'USAGE'), null);

select pg_temp.check(
  '0.10 authenticated har NØYAKTIG de bestemte tabellrettighetene (tabellnivå) – ikke utvidet av service_role-korrekturen',
  m.n = 0, case when m.n = 0 then 'alle 15 tabeller stemmer' else m.list end)
from (
  select count(*) as n, string_agg(x.tbl || ' ' || x.priv || (case when x.actual then ' finnes men skal ikke' else ' mangler' end), '; ') as list
    from (
      select t.name as tbl, p.priv,
             has_table_privilege('authenticated', format('public.%I', t.name), p.priv) as actual,
             exists (select 1 from _expected_authenticated e where e.tbl = t.name and e.priv = p.priv) as expected
        from _tables t cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv)
    ) x where x.actual <> x.expected
) m;

select pg_temp.check(
  '0.11 authenticated har NØYAKTIG de bestemte kolonnerettighetene for INSERT og UPDATE',
  m.n = 0, case when m.n = 0 then 'alle stemmer' else m.list end)
from (
  select count(*) as n, string_agg(x.tbl || ' ' || x.priv || ': har {' || array_to_string(x.actual, ',') || '} skal ha {' || array_to_string(x.expected, ',') || '}', '; ') as list
    from (
      select t.name as tbl, p.priv,
             (select coalesce(array_agg(a.attname::text order by a.attname::text), '{}')
                from pg_attribute a
               where a.attrelid = format('public.%I', t.name)::regclass and a.attnum > 0 and not a.attisdropped
                 and has_column_privilege('authenticated', a.attrelid, a.attnum, p.priv)) as actual,
             (select coalesce(array_agg(c order by c), '{}') from unnest(coalesce(e.cols, '{}'::text[])) c) as expected
        from _tables t
        cross join (values ('INSERT'), ('UPDATE')) p(priv)
        left join _expected_cols e on e.tbl = t.name and e.priv = p.priv
       where t.name <> 'analyses'
    ) x where x.actual <> x.expected
) m;

select pg_temp.check(
  '0.12 ingen av tabellene bruker sekvenser (alle id-er er uuid), så ingen sekvensrettigheter trengs',
  (select count(*) = 0 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name in (select name from _tables)
      and (c.column_default like 'nextval(%' or c.is_identity = 'YES'))
  and (select count(*) = 0 from pg_class s join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
         join pg_class t on t.oid = d.refobjid
        where s.relkind = 'S' and t.relnamespace = 'public'::regnamespace and t.relname in (select name from _tables)),
  null);

-- rls_auto_enable() er en Supabase-funksjon (ikke vår) som finnes i det hostede prosjektet, men ikke nødvendigvis lokalt.
-- Finnes den ikke, er testene bestått (ikke feilet) og sier det i detaljene.
select pg_temp.check(
  '0.13 public.rls_auto_enable() (hvis den finnes) kan ikke kjøres av PUBLIC, anon eller authenticated',
  coalesce((
    select not (
             has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute')
          or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
      from pg_proc p where p.oid = to_regprocedure('public.rls_auto_enable()')
  ), true),
  case when to_regprocedure('public.rls_auto_enable()') is null then 'funksjonen finnes ikke i dette miljøet (hoppet over)' else 'funksjonen finnes og er lukket for klientrollene' end);

select pg_temp.check(
  '0.14 public.rls_auto_enable() (hvis den finnes) er uendret SECURITY DEFINER og event-triggeren som bruker den finnes fortsatt',
  coalesce((
    select p.prosecdef and exists (select 1 from pg_event_trigger e where e.evtfoid = p.oid)
      from pg_proc p where p.oid = to_regprocedure('public.rls_auto_enable()')
  ), true),
  case when to_regprocedure('public.rls_auto_enable()') is null then 'funksjonen finnes ikke i dette miljøet (hoppet over)' else 'funksjon og event-trigger er på plass' end);

-- ===========================================================================
-- 1. PROFILER
-- ===========================================================================
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.expect_count('1.1 A leser bare sin egen profil', 'select count(*) from public.profiles', 1);
select pg_temp.expect_count('1.2 A finner ikke Bs profil', $$select count(*) from public.profiles where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 0);
select pg_temp.expect_rows('1.3 A kan endre visningsnavn på egen profil', $$update public.profiles set display_name = 'A Aksnes' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 1);
select pg_temp.expect_ok('1.4 A kan lagre standardforutsetninger (jsonb-objekt)', $$update public.profiles set defaults = '{"months": 4}' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$);
select pg_temp.expect_rows('1.5 A kan IKKE endre Bs profil (0 rader)', $$update public.profiles set display_name = 'Hacket' where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 0);
select pg_temp.expect_fail('1.6 A kan ikke endre e-posten i profilen', $$update public.profiles set email = 'x@x.invalid' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, array['42501']);
select pg_temp.expect_fail('1.7 A kan ikke flytte profilen til en annen bruker', $$update public.profiles set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, array['42501']);
select pg_temp.expect_fail('1.8 A kan ikke opprette en profil selv', $$insert into public.profiles (user_id, display_name) values (gen_random_uuid(), 'Falsk')$$, array['42501']);
select pg_temp.expect_fail('1.9 A kan ikke slette profilen', $$delete from public.profiles where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, array['42501']);
select pg_temp.expect_fail('1.10 defaults må være et objekt', $$update public.profiles set defaults = '[1,2]' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, array['23514']);
select pg_temp.as_anon();
select pg_temp.expect_fail('1.11 anon kan ikke lese profiler', 'select count(*) from public.profiles', array['42501']);
select pg_temp.as_owner();
update auth.users set email = 'a2@rls-test.invalid' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check('1.12 e-post i profilen følger auth.users', (select email = 'a2@rls-test.invalid' from public.profiles where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null);

-- ===========================================================================
-- 2. FELLES DATA: lesing begrenset til egen liste, ingen klientskriving
-- ===========================================================================
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.expect_count('2.1 A ser eiendommene i egen liste (P1 og P3)', 'select count(*) from public.properties', 2);
select pg_temp.expect_count('2.2 A ser ikke B sin eiendom P2', $$select count(*) from public.properties where id = '22222222-2222-4222-8222-222222222222'$$, 0);
select pg_temp.expect_count('2.3 A ser snapshots bare for P1 og P3', 'select count(*) from public.property_snapshots', 2);
select pg_temp.expect_count('2.4 A ser visninger bare for P1', 'select count(*) from public.viewings', 1);
select pg_temp.expect_count('2.5 A ser felles analyser for P1 (v1, v2) og P3 (v1) og egen privat analyse – ikke P2, ikke felles utkast, ikke Bs private',
  'select count(*) from public.analyses', 4);
select pg_temp.expect_count('2.6 A ser ikke felles analyseutkast', $$select count(*) from public.analyses where id = 'c3333334-3333-4333-8333-333333333333'$$, 0);
select pg_temp.expect_count('2.7 A ser ikke Bs private analyse', $$select count(*) from public.analyses where id = 'c3333336-3333-4333-8333-333333333333'$$, 0);
select pg_temp.expect_count('2.8 A ser sin egen private analyse', $$select count(*) from public.analyses where id = 'c3333335-3333-4333-8333-333333333333'$$, 1);

select pg_temp.expect_fail('2.9 A kan ikke opprette eiendom', $$insert into public.properties (finn_id, canonical_url, address, city, municipality, property_type, tenure, data_origin) values ('900000999', 'https://x.invalid', 'X', 'X', 'X', 'leilighet', 'selveier', 'demo')$$, array['42501']);
select pg_temp.expect_fail('2.10 A kan ikke endre eiendom', $$update public.properties set address = 'Hacket' where id = '11111111-1111-4111-8111-111111111111'$$, array['42501']);
select pg_temp.expect_fail('2.11 A kan ikke slette eiendom', $$delete from public.properties where id = '11111111-1111-4111-8111-111111111111'$$, array['42501']);
select pg_temp.expect_fail('2.12 A kan ikke skrive snapshots', $$update public.property_snapshots set asking_price = 1 where property_id = '11111111-1111-4111-8111-111111111111'$$, array['42501']);
select pg_temp.expect_fail('2.13 A kan ikke skrive visninger', $$delete from public.viewings where property_id = '11111111-1111-4111-8111-111111111111'$$, array['42501']);
select pg_temp.expect_fail('2.14 A kan ikke opprette en FELLES analyse (RLS)',
  $$insert into public.analyses (property_id, snapshot_id, version, schema_version, model_version, status, visibility, origin, recommendation, estimates) values ('11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 9, 1, '1.2.0', 'published', 'shared', 'demo', 'interessant', '{}')$$, array['42501']);
select pg_temp.expect_rows('2.15 A kan ikke endre en felles analyse (0 rader)', $$update public.analyses set summary = 'Hacket' where id = 'c1111111-1111-4111-8111-111111111111'$$, 0);
select pg_temp.expect_rows('2.16 A kan ikke slette en felles analyse (0 rader)', $$delete from public.analyses where id = 'c1111111-1111-4111-8111-111111111111'$$, 0);
select pg_temp.expect_ok_rollback('2.17 A kan opprette en privat analyse for bolig i egen liste',
  $$insert into public.analyses (property_id, snapshot_id, version, schema_version, model_version, status, visibility, owner_id, origin, estimates) values ('11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 1, 1, '1.2.0', 'draft', 'private', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'import_v1', '{}')$$);
select pg_temp.expect_fail('2.18 A kan ikke opprette en privat analyse med B som eier (RLS)',
  $$insert into public.analyses (property_id, snapshot_id, version, schema_version, model_version, status, visibility, owner_id, origin, estimates) values ('11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 1, 1, '1.2.0', 'draft', 'private', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'import_v1', '{}')$$, array['42501']);
select pg_temp.expect_fail('2.19 A kan ikke opprette en privat analyse for en bolig som ikke er i egen liste (P2)',
  $$insert into public.analyses (property_id, snapshot_id, version, schema_version, model_version, status, visibility, owner_id, origin, estimates) values ('22222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', 1, 1, '1.2.0', 'draft', 'private', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'import_v1', '{}')$$, array['23503']);
select pg_temp.expect_fail('2.20 A kan ikke gjøre en privat analyse felles (visibility kan ikke endres)',
  $$update public.analyses set visibility = 'shared', owner_id = null where id = 'c3333335-3333-4333-8333-333333333333'$$, array['42501'], '%kan ikke endres etter opprettelse%');
select pg_temp.expect_ok('2.21 A kan endre sin egen private analyse', $$update public.analyses set summary = 'Mitt utkast' where id = 'c3333335-3333-4333-8333-333333333333'$$);

select pg_temp.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select pg_temp.expect_count('2.22 B ser eiendommene i egen liste (P2 og P3)', 'select count(*) from public.properties', 2);
select pg_temp.expect_count('2.23 B ser ikke A sin eiendom P1', $$select count(*) from public.properties where id = '11111111-1111-4111-8111-111111111111'$$, 0);
select pg_temp.expect_count('2.24 B ser ikke As private analyse (samme eiendom P3)', $$select count(*) from public.analyses where id = 'c3333335-3333-4333-8333-333333333333'$$, 0);
select pg_temp.expect_rows('2.25 B kan ikke endre As private analyse (0 rader)', $$update public.analyses set summary = 'Hacket' where id = 'c3333335-3333-4333-8333-333333333333'$$, 0);
select pg_temp.expect_rows('2.26 B kan ikke slette As private analyse (0 rader)', $$delete from public.analyses where id = 'c3333335-3333-4333-8333-333333333333'$$, 0);

select pg_temp.as_anon();
select pg_temp.expect_fail('2.27 anon kan ikke lese eiendommer', 'select count(*) from public.properties', array['42501']);
select pg_temp.expect_fail('2.28 anon kan ikke lese analyser', 'select count(*) from public.analyses', array['42501']);

-- Felles analyser: uforanderlige, versjonert, konsistente (som eier/backend – gjelder også service-rollen)
select pg_temp.as_service();
select pg_temp.expect_ok_rollback('2.29 service_role kan skrive felles data (omgår RLS)',
  $$insert into public.properties (finn_id, canonical_url, address, city, municipality, property_type, tenure, data_origin) values ('900000998', 'https://x.invalid', 'Y', 'Y', 'Y', 'leilighet', 'selveier', 'demo')$$);
select pg_temp.expect_fail('2.30 en publisert felles analyse kan ikke endres, heller ikke av backend',
  $$update public.analyses set summary = 'Endret' where id = 'c1111111-1111-4111-8111-111111111111'$$, array['42501'], '%publisert felles analyse kan ikke endres%');
select pg_temp.expect_ok_rollback('2.31 published -> superseded er tillatt', $$update public.analyses set status = 'superseded' where id = 'c1111111-1111-4111-8111-111111111111'$$);
select pg_temp.expect_fail('2.32 superseded -> published er ikke tillatt',
  $stmt$do $do$ begin
      update public.analyses set status = 'superseded' where id = 'c1111111-1111-4111-8111-111111111111';
      update public.analyses set status = 'published' where id = 'c1111111-1111-4111-8111-111111111111';
    end $do$$stmt$, array['42501'], '%bare gå fra published til superseded%');
select pg_temp.expect_fail('2.33 to felles analyser for samme eiendom kan ikke ha samme versjon (partial unique)',
  $$insert into public.analyses (property_id, snapshot_id, version, schema_version, model_version, status, visibility, origin, recommendation, estimates) values ('11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 1, 1, '1.2.0', 'published', 'shared', 'demo', 'interessant', '{}')$$, array['23505']);
select pg_temp.expect_fail('2.34 en felles analyse kan ikke ha eier',
  $$insert into public.analyses (property_id, snapshot_id, version, schema_version, model_version, status, visibility, owner_id, origin, recommendation, estimates) values ('11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 7, 1, '1.2.0', 'published', 'shared', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'demo', 'interessant', '{}')$$, array['23514']);
select pg_temp.expect_fail('2.35 en privat analyse må ha eier',
  $$insert into public.analyses (property_id, snapshot_id, version, schema_version, model_version, status, visibility, origin, estimates) values ('11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 8, 1, '1.2.0', 'draft', 'private', 'import_v1', '{}')$$, array['23514']);
select pg_temp.expect_fail('2.36 en publisert felles analyse krever anbefaling',
  $$insert into public.analyses (property_id, snapshot_id, version, schema_version, model_version, status, visibility, origin, estimates) values ('11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 6, 1, '1.2.0', 'published', 'shared', 'demo', '{}')$$, array['23514']);
select pg_temp.expect_fail('2.37 snapshotet må tilhøre samme eiendom som analysen',
  $$insert into public.analyses (property_id, snapshot_id, version, schema_version, model_version, status, visibility, origin, recommendation, estimates) values ('11111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222', 5, 1, '1.2.0', 'published', 'shared', 'demo', 'interessant', '{}')$$, array['23503']);
select pg_temp.as_owner();

-- ===========================================================================
-- 3. user_properties (egen liste)
-- ===========================================================================
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.expect_count('3.1 A leser bare sine egne rader (P1 og P3)', 'select count(*) from public.user_properties', 2);
select pg_temp.expect_count('3.2 A ser ikke Bs rader', $$select count(*) from public.user_properties where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 0);
select pg_temp.expect_rows('3.3 A kan oppdatere egen rad (favoritt og status)', $$update public.user_properties set favorite = true, work_status = 'bud_vurderes' where property_id = '11111111-1111-4111-8111-111111111111'$$, 1);
select pg_temp.expect_fail('3.4 ugyldig arbeidsstatus avvises', $$update public.user_properties set work_status = 'ukjent_status' where property_id = '11111111-1111-4111-8111-111111111111'$$, array['23514']);
select pg_temp.expect_fail('3.5 A kan ikke sette analyzed_at (kun backend)', $$update public.user_properties set analyzed_at = now() where property_id = '11111111-1111-4111-8111-111111111111'$$, array['42501']);
select pg_temp.expect_fail('3.6 A kan ikke flytte raden til en annen eiendom', $$update public.user_properties set property_id = '22222222-2222-4222-8222-222222222222' where property_id = '11111111-1111-4111-8111-111111111111'$$, array['42501']);
select pg_temp.expect_fail('3.7 A kan ikke opprette rad for B (user_id er ikke skrivbar)', $$insert into public.user_properties (user_id, property_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222')$$, array['42501']);
select pg_temp.expect_fail('3.8 en rad må peke på en eksisterende eiendom', $$insert into public.user_properties (property_id) values (gen_random_uuid())$$, array['23503']);
select pg_temp.expect_fail('3.9 samme eiendom kan ikke legges til to ganger', $$insert into public.user_properties (property_id) values ('11111111-1111-4111-8111-111111111111')$$, array['23505']);

select pg_temp.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select pg_temp.expect_count('3.10 B leser bare sine egne rader (P2 og P3)', 'select count(*) from public.user_properties', 2);
select pg_temp.expect_rows('3.11 B kan ikke oppdatere As rad (0 rader)', $$update public.user_properties set favorite = true where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 0);
select pg_temp.expect_rows('3.12 B kan ikke slette As rad (0 rader)', $$delete from public.user_properties where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 0);
-- KJENT BEGRENSNING I FASE 1: en innlogget bruker kan legge en eiendom til i egen liste hvis hen kjenner UUID-en, og får da lesetilgang
-- til den (abonnement og kvote håndheves ikke i databasen ennå). Testen dokumenterer dagens oppførsel; stram inn før lansering.
select pg_temp.expect_ok_rollback('3.13 (kjent begrensning fase 1) B kan legge til P1 i egen liste hvis UUID-en er kjent', $$insert into public.user_properties (property_id) values ('11111111-1111-4111-8111-111111111111')$$);
select pg_temp.expect_count('3.14 B kan ikke finne P1 uten å være medlem (ingen oppslag av andres eiendommer)', $$select count(*) from public.properties where id = '11111111-1111-4111-8111-111111111111'$$, 0);
select pg_temp.as_anon();
select pg_temp.expect_fail('3.15 anon kan ikke lese user_properties', 'select count(*) from public.user_properties', array['42501']);
select pg_temp.as_owner();

-- ===========================================================================
-- 4. SCENARIOER og primary_scenario_id
-- ===========================================================================
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.expect_count('4.1 A ser bare egne scenarioer (3)', 'select count(*) from public.scenarios', 3);
select pg_temp.expect_ok('4.2 A kan opprette scenario på egen bolig med felles analyse (P1, v1)',
  $$insert into public.scenarios (property_id, analysis_id, analysis_version, name, "values") values ('11111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 1, 'Nytt scenario', '{"x": 1}')$$);
select pg_temp.expect_ok_rollback('4.3 A kan bygge scenario på egen privat analyse (P3)',
  $$insert into public.scenarios (property_id, analysis_id, analysis_version, name, "values") values ('33333333-3333-4333-8333-333333333333', 'c3333335-3333-4333-8333-333333333333', 1, 'På privat', '{}')$$);
select pg_temp.expect_fail('4.4 A kan ikke bygge scenario på Bs private analyse (samme eiendom)',
  $$insert into public.scenarios (property_id, analysis_id, analysis_version, name, "values") values ('33333333-3333-4333-8333-333333333333', 'c3333336-3333-4333-8333-333333333333', 1, 'Stjålet', '{}')$$, array['42501'], '%må bygge på en analyse%');
select pg_temp.expect_fail('4.5 A kan ikke bygge scenario på et felles analyseutkast',
  $$insert into public.scenarios (property_id, analysis_id, analysis_version, name, "values") values ('33333333-3333-4333-8333-333333333333', 'c3333334-3333-4333-8333-333333333333', 2, 'På utkast', '{}')$$, array['42501'], '%må bygge på en analyse%');
select pg_temp.expect_fail('4.6 analysen må gjelde samme eiendom som scenarioet (P1 med P2 sin analyse)',
  $$insert into public.scenarios (property_id, analysis_id, analysis_version, name, "values") values ('11111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222', 1, 'Feil analyse', '{}')$$, array['42501'], '%må bygge på en analyse%');
select pg_temp.expect_fail('4.7 analysis_version må stemme med analysen',
  $$insert into public.scenarios (property_id, analysis_id, analysis_version, name, "values") values ('11111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 2, 'Feil versjon', '{}')$$, array['23514']);
select pg_temp.expect_fail('4.8 A kan ikke lage scenario på bolig som ikke er i egen liste (P2)',
  $$insert into public.scenarios (property_id, analysis_id, analysis_version, name, "values") values ('22222222-2222-4222-8222-222222222222', 'c2222222-2222-4222-8222-222222222222', 1, 'Utenfor liste', '{}')$$, array['42501'], '%må bygge på en analyse%');
select pg_temp.expect_fail('4.9 A kan ikke opprette scenario med B som eier (owner_id er ikke skrivbar)',
  $$insert into public.scenarios (owner_id, property_id, analysis_id, analysis_version, name, "values") values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 1, 'Falsk eier', '{}')$$, array['42501']);
select pg_temp.expect_fail('4.10 A kan ikke opprette et låst scenario selv', $$insert into public.scenarios (property_id, analysis_id, analysis_version, name, locked, "values") values ('11111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 1, 'Låst', true, '{}')$$, array['42501']);
select pg_temp.expect_fail('4.11 values må være et objekt', $$insert into public.scenarios (property_id, analysis_id, analysis_version, name, "values") values ('11111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 1, 'Feil values', '[]')$$, array['23514']);
select pg_temp.expect_fail('4.12 navn kan ikke være tomt', $$insert into public.scenarios (property_id, analysis_id, analysis_version, name, "values") values ('11111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 1, '  ', '{}')$$, array['23514']);
select pg_temp.expect_rows('4.13 A kan endre eget scenario', $$update public.scenarios set name = 'Omdøpt' where id = 'd1111111-1111-4111-8111-111111111111'$$, 1);
select pg_temp.expect_fail('4.14 A kan ikke flytte scenarioet til en annen eiendom', $$update public.scenarios set property_id = '33333333-3333-4333-8333-333333333333' where id = 'd1111111-1111-4111-8111-111111111111'$$, array['42501']);
-- Låst scenario
select pg_temp.expect_fail('4.15 A kan ikke gi låst scenario nytt navn', $$update public.scenarios set name = 'Mitt' where id = 'd1111112-1111-4111-8111-111111111111'$$, array['42501'], '%er låst%');
select pg_temp.expect_fail('4.16 A kan ikke redigere verdiene i et låst scenario', $$update public.scenarios set "values" = '{"purchasePrice": 5}' where id = 'd1111112-1111-4111-8111-111111111111'$$, array['42501'], '%er låst%');
select pg_temp.expect_fail('4.17 A kan ikke låse opp et låst scenario (locked er ikke skrivbar)', $$update public.scenarios set locked = false where id = 'd1111112-1111-4111-8111-111111111111'$$, array['42501']);
select pg_temp.expect_ok_rollback('4.18 A kan flytte låst scenario til ny analyseversjon (rebase)', $$update public.scenarios set analysis_id = 'c1111112-1111-4111-8111-111111111111', analysis_version = 2, "values" = '{"purchasePrice": 9}' where id = 'd1111112-1111-4111-8111-111111111111'$$);
select pg_temp.expect_rows('4.19 A kan ikke slette låst scenario (0 rader)', $$delete from public.scenarios where id = 'd1111112-1111-4111-8111-111111111111'$$, 0);

select pg_temp.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select pg_temp.expect_count('4.20 B ser bare egne scenarioer (2)', 'select count(*) from public.scenarios', 2);
select pg_temp.expect_count('4.21 B kan ikke lese As scenario', $$select count(*) from public.scenarios where id = 'd1111111-1111-4111-8111-111111111111'$$, 0);
select pg_temp.expect_rows('4.22 B kan ikke endre As scenario (0 rader)', $$update public.scenarios set name = 'Hacket' where id = 'd1111111-1111-4111-8111-111111111111'$$, 0);
select pg_temp.expect_rows('4.23 B kan ikke slette As scenario (0 rader)', $$delete from public.scenarios where id = 'd1111111-1111-4111-8111-111111111111'$$, 0);
select pg_temp.expect_fail('4.24 B kan ikke lage scenario på As eiendom P1 (ikke i Bs liste)',
  $$insert into public.scenarios (property_id, analysis_id, analysis_version, name, "values") values ('11111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 1, 'Utenfor liste', '{}')$$, array['42501'], '%må bygge på en analyse%');
-- primary_scenario_id (sammensatt fremmednøkkel: samme eier og samme eiendom)
select pg_temp.expect_fail('4.25 B kan ikke sette As scenario som primært på Bs bolig (feil eier og eiendom)',
  $$update public.user_properties set primary_scenario_id = 'd1111111-1111-4111-8111-111111111111' where property_id = '22222222-2222-4222-8222-222222222222'$$, array['23503']);
select pg_temp.expect_fail('4.26 B kan ikke sette As scenario som primært på P3 (samme eiendom-liste, feil eier)',
  $$update public.user_properties set primary_scenario_id = 'd3333331-3333-4333-8333-333333333333' where property_id = '33333333-3333-4333-8333-333333333333'$$, array['23503']);
select pg_temp.expect_fail('4.27 B kan ikke sette eget scenario for en annen eiendom som primært (P2-scenario på P3)',
  $$update public.user_properties set primary_scenario_id = 'd2222222-2222-4222-8222-222222222222' where property_id = '33333333-3333-4333-8333-333333333333'$$, array['23503']);
select pg_temp.expect_rows('4.28 B kan sette eget scenario for samme eiendom som primært (P3)',
  $$update public.user_properties set primary_scenario_id = 'd3333332-3333-4333-8333-333333333333' where property_id = '33333333-3333-4333-8333-333333333333'$$, 1);

select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.expect_fail('4.29 A kan ikke sette Bs scenario som primært', $$update public.user_properties set primary_scenario_id = 'd3333332-3333-4333-8333-333333333333' where property_id = '33333333-3333-4333-8333-333333333333'$$, array['23503']);
select pg_temp.expect_fail('4.30 A kan ikke sette eget scenario for P1 som primært på P3', $$update public.user_properties set primary_scenario_id = 'd1111111-1111-4111-8111-111111111111' where property_id = '33333333-3333-4333-8333-333333333333'$$, array['23503']);
select pg_temp.expect_rows('4.31 A kan sette eget scenario som primært på samme eiendom (P3)', $$update public.user_properties set primary_scenario_id = 'd3333331-3333-4333-8333-333333333333' where property_id = '33333333-3333-4333-8333-333333333333'$$, 1);
select pg_temp.expect_ok('4.32 A kan slette sitt primære scenario på P1', $$delete from public.scenarios where id = 'd1111111-1111-4111-8111-111111111111'$$);
select pg_temp.expect_count('4.33 primary_scenario_id settes til null når det primære scenarioet slettes (raden består)',
  $$select count(*) from public.user_properties where property_id = '11111111-1111-4111-8111-111111111111' and primary_scenario_id is null$$, 1);
select pg_temp.as_anon();
select pg_temp.expect_fail('4.34 anon kan ikke lese scenarioer', 'select count(*) from public.scenarios', array['42501']);
select pg_temp.as_owner();

-- Integriteten ligger i databasen og gjelder uavhengig av klientrettigheter: også service-rollen (som omgår RLS) stoppes av
-- fremmednøklene og triggerne. (Triggeren avviser først når analysen ikke finnes for eiendommen; ellers tar fremmednøklene over.)
select pg_temp.as_service();
select pg_temp.expect_fail('4.35 (som backend) scenario for en bolig som ikke er i brukerens liste avvises av fremmednøkkelen',
  $$insert into public.scenarios (owner_id, property_id, analysis_id, analysis_version, name, "values") values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'c2222222-2222-4222-8222-222222222222', 1, 'Feil', '{}')$$, array['23503']);
select pg_temp.expect_fail('4.36 (som backend) scenario med analyse for en annen eiendom avvises',
  $$insert into public.scenarios (owner_id, property_id, analysis_id, analysis_version, name, "values") values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222', 1, 'Feil', '{}')$$, array['42501'], '%må bygge på en analyse%');
select pg_temp.expect_fail('4.37 (som backend) scenario som bygger på en annen brukers private analyse avvises',
  $$insert into public.scenarios (owner_id, property_id, analysis_id, analysis_version, name, "values") values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'c3333336-3333-4333-8333-333333333333', 1, 'Feil', '{}')$$, array['42501'], '%annen brukers private analyse%');
select pg_temp.expect_fail('4.38 (som backend) scenario på et felles analyseutkast avvises',
  $$insert into public.scenarios (owner_id, property_id, analysis_id, analysis_version, name, "values") values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'c3333334-3333-4333-8333-333333333333', 2, 'Feil', '{}')$$, array['42501'], '%felles analyseutkast%');
select pg_temp.expect_fail('4.39 (som backend) primary_scenario_id kan ikke peke på en annen brukers scenario',
  $$update public.user_properties set primary_scenario_id = 'd3333332-3333-4333-8333-333333333333' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and property_id = '33333333-3333-4333-8333-333333333333'$$, array['23503']);
select pg_temp.expect_fail('4.40 (som backend) primary_scenario_id kan ikke peke på scenario for en annen eiendom',
  $$update public.user_properties set primary_scenario_id = 'd1111112-1111-4111-8111-111111111111' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and property_id = '33333333-3333-4333-8333-333333333333'$$, array['23503']);
select pg_temp.expect_fail('4.41 (som backend) en bruker kan ikke ha et privat analyseutkast for en bolig utenfor egen liste',
  $$insert into public.analyses (property_id, snapshot_id, version, schema_version, model_version, status, visibility, owner_id, origin, estimates) values ('22222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', 1, 1, '1.2.0', 'draft', 'private', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'import_v1', '{}')$$, array['23503']);
select pg_temp.as_owner();

-- ===========================================================================
-- 5. EGNE SAMMENLIGNBARE OBJEKTER, RISIKOER, PRIVATE HENDELSER OG OVERSTYRING AV BUDDAG
-- ===========================================================================
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.expect_count('5.1 A ser egen referanse', 'select count(*) from public.user_comparables', 1);
select pg_temp.expect_ok('5.2 A kan opprette egen referanse (faktisk salg med solgt pris)', $$insert into public.user_comparables (property_id, name, kind, sold_price, sold_total_price, area, date) values ('11111111-1111-4111-8111-111111111111', 'Solgt i gata', 'solgt', 3500000, 3600000, 58, '2026-09-01')$$);
select pg_temp.expect_rows('5.3 A kan endre egen referanse', $$update public.user_comparables set notes = 'Ok' where id = 'b1111111-1111-4111-8111-111111111111'$$, 1);
select pg_temp.expect_fail('5.4 faktisk salg uten solgt pris avvises', $$insert into public.user_comparables (property_id, name, kind) values ('11111111-1111-4111-8111-111111111111', 'Uten sum', 'solgt')$$, array['23514']);
select pg_temp.expect_fail('5.5 prisantydning kan ikke ha solgt pris', $$insert into public.user_comparables (property_id, name, kind, sold_price) values ('11111111-1111-4111-8111-111111111111', 'Feil', 'prisantydning', 1000000)$$, array['23514']);
select pg_temp.expect_fail('5.6 solgt totalpris kan ikke være lavere enn solgt pris', $$insert into public.user_comparables (property_id, name, kind, sold_price, sold_total_price) values ('11111111-1111-4111-8111-111111111111', 'Feil', 'solgt', 3000000, 2900000)$$, array['23514']);
select pg_temp.expect_fail('5.7 negative beløp avvises', $$insert into public.user_comparables (property_id, name, kind, asking_price) values ('11111111-1111-4111-8111-111111111111', 'Feil', 'prisantydning', -1)$$, array['23514']);
select pg_temp.expect_fail('5.8 A kan ikke opprette referanse for B (user_id er ikke skrivbar)', $$insert into public.user_comparables (user_id, property_id, name, kind, asking_price) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Falsk', 'prisantydning', 1)$$, array['42501']);
select pg_temp.expect_fail('5.9 A kan ikke opprette referanse for bolig som ikke er i egen liste (P2)', $$insert into public.user_comparables (property_id, name, kind, asking_price) values ('22222222-2222-4222-8222-222222222222', 'Utenfor', 'prisantydning', 1)$$, array['23503']);
select pg_temp.expect_ok('5.10 A kan lagre inntil 50 referanser per bolig', $$insert into public.user_comparables (property_id, name, kind, asking_price) select '11111111-1111-4111-8111-111111111111', 'Ref ' || g, 'prisantydning', 1000000 from generate_series(1, 48) g$$);
select pg_temp.expect_fail('5.11 referanse nummer 51 per bolig avvises (radgrense)', $$insert into public.user_comparables (property_id, name, kind, asking_price) values ('11111111-1111-4111-8111-111111111111', 'Nr 51', 'prisantydning', 1)$$, array['54000']);
select pg_temp.expect_count('5.12 A ser egne risikoer', 'select count(*) from public.user_risks', 1);
select pg_temp.expect_ok('5.13 A kan endre risiko fra grunnlaget (upsert-nøkkel)', $$insert into public.user_risks (property_id, base_risk_id, title, category, level) values ('11111111-1111-4111-8111-111111111111', 'risk-1', 'Endret', 'elektrisk', 4)$$);
select pg_temp.expect_fail('5.14 samme grunnlagsrisiko kan bare endres én gang per bolig', $$insert into public.user_risks (property_id, base_risk_id, title, category) values ('11111111-1111-4111-8111-111111111111', 'risk-1', 'Dobbel', 'elektrisk')$$, array['23505']);
select pg_temp.expect_fail('5.15 egen risiko kan ikke være skjult (removed uten grunnlagsrisiko)', $$insert into public.user_risks (property_id, title, category, removed) values ('11111111-1111-4111-8111-111111111111', 'Skjult', 'annet', true)$$, array['23514']);
select pg_temp.expect_fail('5.16 laveste kostnad kan ikke være over høyeste', $$insert into public.user_risks (property_id, title, category, cost_low, cost_high) values ('11111111-1111-4111-8111-111111111111', 'Feil', 'annet', 100, 10)$$, array['23514']);
select pg_temp.expect_fail('5.17 alvorlighet må være 1–10', $$insert into public.user_risks (property_id, title, category, level) values ('11111111-1111-4111-8111-111111111111', 'Feil', 'annet', 11)$$, array['23514']);
select pg_temp.expect_count('5.18 A ser egen private hendelse og egen overstyring', 'select (select count(*) from public.private_events) + (select count(*) from public.calendar_overrides)', 2);
select pg_temp.expect_fail('5.19 sluttid må være etter starttid', $$insert into public.private_events (property_id, kind, start_at, end_at) values ('11111111-1111-4111-8111-111111111111', 'private_viewing', now(), now() - interval '1 hour')$$, array['23514']);
select pg_temp.expect_fail('5.20 én overstyring av buddag per bolig', $$insert into public.calendar_overrides (property_id, start_at, origin) values ('11111111-1111-4111-8111-111111111111', now(), 'manual')$$, array['23505']);

select pg_temp.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select pg_temp.expect_count('5.21 B ser ingen av As referanser, risikoer, hendelser eller overstyringer',
  'select (select count(*) from public.user_comparables) + (select count(*) from public.user_risks) + (select count(*) from public.private_events) + (select count(*) from public.calendar_overrides)', 0);
select pg_temp.expect_rows('5.22 B kan ikke endre As referanse (0 rader)', $$update public.user_comparables set notes = 'Hacket' where id = 'b1111111-1111-4111-8111-111111111111'$$, 0);
select pg_temp.expect_rows('5.23 B kan ikke slette As referanse (0 rader)', $$delete from public.user_comparables where id = 'b1111111-1111-4111-8111-111111111111'$$, 0);
select pg_temp.expect_rows('5.24 B kan ikke endre As risiko (0 rader)', $$update public.user_risks set title = 'Hacket' where id = 'b2222222-2222-4222-8222-222222222222'$$, 0);
select pg_temp.expect_rows('5.25 B kan ikke slette As risiko (0 rader)', $$delete from public.user_risks where id = 'b2222222-2222-4222-8222-222222222222'$$, 0);
select pg_temp.expect_rows('5.26 B kan ikke endre As private hendelse (0 rader)', $$update public.private_events set note = 'Hacket' where id = 'b3333333-3333-4333-8333-333333333333'$$, 0);
select pg_temp.expect_rows('5.27 B kan ikke slette As overstyring (0 rader)', $$delete from public.calendar_overrides where id = 'b4444444-4444-4444-8444-444444444444'$$, 0);
select pg_temp.expect_fail('5.28 B kan ikke opprette referanse på As bolig P1', $$insert into public.user_comparables (property_id, name, kind, asking_price) values ('11111111-1111-4111-8111-111111111111', 'Falsk', 'prisantydning', 1)$$, array['23503']);
select pg_temp.expect_fail('5.29 B kan ikke opprette risiko på As bolig P1', $$insert into public.user_risks (property_id, title, category) values ('11111111-1111-4111-8111-111111111111', 'Falsk', 'annet')$$, array['23503']);
select pg_temp.as_anon();
select pg_temp.expect_fail('5.30 anon kan ikke lese user_comparables', 'select count(*) from public.user_comparables', array['42501']);
select pg_temp.as_owner();

-- ===========================================================================
-- 6. ABONNEMENT, KURS, FORBRUK OG JOBBER: lesing for eier, ingen klientskriving
-- ===========================================================================
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.expect_count('6.1 A ser bare eget abonnement', 'select count(*) from public.subscriptions', 1);
select pg_temp.expect_fail('6.2 A kan ikke sette abonnementet sitt til active', $$update public.subscriptions set status = 'active' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, array['42501']);
select pg_temp.expect_fail('6.3 A kan ikke forlenge abonnementet', $$update public.subscriptions set current_period_end = now() + interval '10 years' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, array['42501']);
select pg_temp.expect_fail('6.4 A kan ikke opprette abonnement', $$insert into public.subscriptions (user_id, plan_id, interval, status, current_period_start, current_period_end, provider) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'p', 'month', 'active', now(), now() + interval '1 month', 'vipps')$$, array['42501']);
select pg_temp.expect_fail('6.5 A kan ikke slette abonnementet', $$delete from public.subscriptions where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, array['42501']);
select pg_temp.expect_count('6.6 A ser bare egne kurskjøp', 'select count(*) from public.course_purchases', 1);
select pg_temp.expect_fail('6.7 A kan ikke opprette kurskjøp', $$insert into public.course_purchases (user_id, course_id, amount_paid, payment_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'annet-kurs', 0, 'pay_fake')$$, array['42501']);
select pg_temp.expect_count('6.8 A ser bare eget forbruk', 'select count(*) from public.usage_events', 1);
select pg_temp.expect_fail('6.9 A kan ikke skrive forbruk (heller ikke for å gi seg selv kvote)', $$insert into public.usage_events (user_id, kind, property_id, idempotency_key, chargeable) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'reuse', '11111111-1111-4111-8111-111111111111', 'fake', false)$$, array['42501']);
select pg_temp.expect_fail('6.10 A kan ikke slette forbruk', $$delete from public.usage_events where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, array['42501']);
select pg_temp.expect_count('6.11 A ser bare jobber hen er koblet til', 'select count(*) from public.analysis_jobs', 1);
select pg_temp.expect_fail('6.12 A kan ikke skrive jobber', $$update public.analysis_jobs set status = 'failed' where id = '96666666-6666-4666-8666-666666666666'$$, array['42501']);

select pg_temp.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select pg_temp.expect_count('6.13 B ser bare eget abonnement, kurskjøp, forbruk og jobber',
  'select (select count(*) from public.subscriptions) + (select count(*) from public.course_purchases) + (select count(*) from public.usage_events) + (select count(*) from public.analysis_jobs)', 3);
select pg_temp.expect_count('6.14 B ser ikke As abonnement', $$select count(*) from public.subscriptions where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 0);
select pg_temp.expect_count('6.15 B ser ikke As jobb', $$select count(*) from public.analysis_jobs where id = '96666666-6666-4666-8666-666666666666'$$, 0);

select pg_temp.as_anon();
select pg_temp.expect_fail('6.16 anon kan ikke lese abonnement', 'select count(*) from public.subscriptions', array['42501']);
select pg_temp.expect_fail('6.17 anon kan ikke lese forbruk', 'select count(*) from public.usage_events', array['42501']);
select pg_temp.expect_fail('6.18 anon kan ikke lese jobber', 'select count(*) from public.analysis_jobs', array['42501']);

-- Databasegrunnlag for idempotens og jobb-dedupe (skriving gjøres av backend; testes som eier)
select pg_temp.as_service();
select pg_temp.expect_fail('6.19 samme idempotency_key kan ikke registreres to ganger', $$insert into public.usage_events (user_id, kind, property_id, idempotency_key, chargeable) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'new_analysis', '22222222-2222-4222-8222-222222222222', 'new_analysis:test:a', true)$$, array['23505']);
select pg_temp.expect_ok_rollback('6.20 forskjellige idempotency_key er tillatt', $$insert into public.usage_events (user_id, kind, property_id, idempotency_key, chargeable) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'new_analysis', '22222222-2222-4222-8222-222222222222', 'new_analysis:test:c', true)$$);
select pg_temp.expect_fail('6.21 to aktive jobber (running) med samme dedupe_key avvises', $$insert into public.analysis_jobs (property_id, finn_id, type, schema_version, model_version, dedupe_key, status) values ('22222222-2222-4222-8222-222222222222', '900000902', 'full_analysis', 1, '1.2.0', 'job:p2:full:v1', 'running')$$, array['23505']);
select pg_temp.expect_fail('6.22 en kjørende og en køet jobb med samme dedupe_key avvises', $$insert into public.analysis_jobs (property_id, finn_id, type, schema_version, model_version, dedupe_key, status) values ('22222222-2222-4222-8222-222222222222', '900000902', 'full_analysis', 1, '1.2.0', 'job:p2:full:v1', 'queued')$$, array['23505']);
select pg_temp.expect_ok_rollback('6.23 en ny jobb med samme dedupe_key er tillatt når forrige er ferdig (succeeded)', $$insert into public.analysis_jobs (property_id, finn_id, type, schema_version, model_version, dedupe_key, status) values ('11111111-1111-4111-8111-111111111111', '900000901', 'full_analysis', 1, '1.2.0', 'job:p1:full:v1', 'running')$$);
select pg_temp.expect_ok_rollback('6.24 mislykkede jobber med samme dedupe_key kan finnes flere', $$insert into public.analysis_jobs (property_id, finn_id, type, schema_version, model_version, dedupe_key, status) values ('11111111-1111-4111-8111-111111111111', '900000901', 'full_analysis', 1, '1.2.0', 'job:p1:full:v1', 'failed')$$);
select pg_temp.expect_fail('6.25 samme kurs kan ikke kjøpes to ganger av samme bruker', $$insert into public.course_purchases (user_id, course_id, amount_paid, payment_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'flipping-privat', 2999, 'pay_a_2')$$, array['23505']);
select pg_temp.expect_fail('6.26 samme betaling kan ikke gi to kjøp (payment_id er unik)', $$insert into public.course_purchases (user_id, course_id, amount_paid, payment_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'flipping-privat', 2999, 'pay_a_1')$$, array['23505']);
select pg_temp.expect_fail('6.27 ugyldig abonnementsstatus avvises', $$update public.subscriptions set status = 'gratis' where id = '91111111-1111-4111-8111-111111111111'$$, array['23514']);
select pg_temp.as_owner();

-- ===========================================================================
-- 6b. SERVICE_ROLE (backend): nødvendige operasjoner lykkes, og minste privilegium gjelder (ingen sletting av regnskap, ingen TRUNCATE).
--     Constraints, fremmednøkler og triggere gjelder fortsatt – de er testet over (2.x, 4.35–4.41, 6.19–6.27).
-- ===========================================================================
select pg_temp.as_service();
select pg_temp.expect_ok_rollback('8.1 backend kan opprette, endre og slette en felles eiendom',
  $stmt$do $do$ declare pid uuid; begin
      insert into public.properties (finn_id, canonical_url, address, city, municipality, property_type, tenure, data_origin) values ('900000997', 'https://x.invalid', 'Z', 'Z', 'Z', 'leilighet', 'selveier', 'demo') returning id into pid;
      update public.properties set address = 'Z2' where id = pid;
      delete from public.properties where id = pid;
    end $do$$stmt$);
select pg_temp.expect_ok_rollback('8.2 backend kan lese og endre profiler',
  $stmt$do $do$ begin
      perform 1 from public.profiles limit 1;
      update public.profiles set display_name = 'Endret av backend' where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    end $do$$stmt$);
select pg_temp.expect_ok_rollback('8.3 backend kan skrive en ny versjon av annonsefaktaene og rette en eksisterende',
  $stmt$do $do$ begin
      insert into public.property_snapshots (property_id, version, observed_at, fetched_at, origin, sale_status) values ('11111111-1111-4111-8111-111111111111', 2, now(), now(), 'demo', 'aktiv');
      update public.property_snapshots set asking_price = 3000000 where property_id = '11111111-1111-4111-8111-111111111111' and version = 2;
    end $do$$stmt$);
select pg_temp.expect_ok_rollback('8.4 backend kan publisere en ny felles analyse og sette forrige til superseded',
  $stmt$do $do$ begin
      update public.analyses set status = 'superseded' where id = 'c1111112-1111-4111-8111-111111111111';
      insert into public.analyses (property_id, snapshot_id, version, schema_version, model_version, status, visibility, origin, recommendation, estimates) values ('11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 3, 1, '1.2.0', 'published', 'shared', 'agent', 'interessant', '{}');
    end $do$$stmt$);
select pg_temp.expect_ok_rollback('8.5 backend kan slette et felles analyseutkast (opprydding)', $$delete from public.analyses where id = 'c3333334-3333-4333-8333-333333333333'$$);
select pg_temp.expect_ok_rollback('8.6 backend kan opprette, endre og slette visninger',
  $stmt$do $do$ declare vid uuid; begin
      insert into public.viewings (property_id, start_at, status, verified_at) values ('11111111-1111-4111-8111-111111111111', now() + interval '5 days', 'planlagt', now()) returning id into vid;
      update public.viewings set status = 'avlyst' where id = vid;
      delete from public.viewings where id = vid;
    end $do$$stmt$);
select pg_temp.expect_ok_rollback('8.7 backend kan legge en bolig i brukerens liste og sette analyzed_at (klienten kan ikke)',
  $stmt$do $do$ begin
      insert into public.user_properties (user_id, property_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111');
      update public.user_properties set analyzed_at = now() where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and property_id = '11111111-1111-4111-8111-111111111111';
    end $do$$stmt$);
select pg_temp.expect_ok_rollback('8.8 backend kan opprette, flytte og slette et LÅST scenario (guarden gjelder bare innloggede brukere)',
  $stmt$do $do$ declare sid uuid; begin
      insert into public.scenarios (owner_id, property_id, analysis_id, analysis_version, name, locked, "values") values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'c3333333-3333-4333-8333-333333333333', 1, 'Nettsidens vurdering', true, '{}') returning id into sid;
      update public.scenarios set "values" = '{"endret": true}' where id = sid;
      delete from public.scenarios where id = sid;
    end $do$$stmt$);
select pg_temp.expect_ok_rollback('8.9 backend kan skrive og slette brukerens private data (import, support, vedlikehold)',
  $stmt$do $do$ begin
      -- P3 (ikke P1): A har allerede 50 referanser på P1, og radgrensen gjelder også backend.
      insert into public.user_comparables (user_id, property_id, name, kind, asking_price) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'Importert', 'prisantydning', 1);
      insert into public.user_risks (user_id, property_id, title, category) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'Importert', 'annet');
      update public.user_comparables set notes = 'Backend' where name = 'Importert';
      delete from public.user_comparables where name = 'Importert';
      delete from public.user_risks where title = 'Importert';
      update public.private_events set note = 'Backend' where id = 'b3333333-3333-4333-8333-333333333333';
      delete from public.calendar_overrides where id = 'b4444444-4444-4444-8444-444444444444';
    end $do$$stmt$);
select pg_temp.expect_ok_rollback('8.10 backend kan opprette og endre abonnement (Vipps-webhook)',
  $stmt$do $do$ begin
      insert into public.subscriptions (user_id, plan_id, interval, status, current_period_start, current_period_end, provider, agreement_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'flipprom-pro', 'year', 'active', now(), now() + interval '1 year', 'vipps', 'agr_test');
      update public.subscriptions set cancel_at_period_end = true where agreement_id = 'agr_test';
    end $do$$stmt$);
select pg_temp.expect_ok_rollback('8.11 backend kan registrere kurskjøp og forbruk',
  $stmt$do $do$ begin
      insert into public.course_purchases (user_id, course_id, amount_paid, payment_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'flipping-privat', 2999, 'pay_b_1');
      insert into public.usage_events (user_id, kind, property_id, idempotency_key, chargeable) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'refresh', '22222222-2222-4222-8222-222222222222', 'refresh:test:1', true);
    end $do$$stmt$);
select pg_temp.expect_ok_rollback('8.12 backend kan opprette, oppdatere og rydde bort analysejobber',
  $stmt$do $do$ declare jid uuid; begin
      insert into public.analysis_jobs (property_id, finn_id, type, schema_version, model_version, dedupe_key, status, requested_by) values ('22222222-2222-4222-8222-222222222222', '900000902', 'light_refresh', 1, '1.2.0', 'job:p2:light:v1', 'queued', array['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']::uuid[]) returning id into jid;
      update public.analysis_jobs set status = 'running', step_index = 1 where id = jid;
      update public.analysis_jobs set status = 'succeeded', finished_at = now() where id = jid;
      delete from public.analysis_jobs where id = jid;
    end $do$$stmt$);
-- Minste privilegium: regnskap og betalingshistorikk kan ikke slettes eller endres bakover, heller ikke av backend.
select pg_temp.expect_fail('8.12b radgrensen (50 per bolig) gjelder også backend', $$insert into public.user_comparables (user_id, property_id, name, kind, asking_price) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Nr 51 fra backend', 'prisantydning', 1)$$, array['54000']);
select pg_temp.expect_fail('8.13 backend kan ikke slette forbruk', $$delete from public.usage_events where id = '94444444-4444-4444-8444-444444444444'$$, array['42501'], 'permission denied%');
select pg_temp.expect_fail('8.14 backend kan ikke endre forbruk', $$update public.usage_events set chargeable = false where id = '94444444-4444-4444-8444-444444444444'$$, array['42501'], 'permission denied%');
select pg_temp.expect_fail('8.15 backend kan ikke slette abonnement', $$delete from public.subscriptions where id = '91111111-1111-4111-8111-111111111111'$$, array['42501'], 'permission denied%');
select pg_temp.expect_fail('8.16 backend kan ikke endre eller slette kurskjøp', $$update public.course_purchases set amount_paid = 0 where id = '93333333-3333-4333-8333-333333333333'$$, array['42501'], 'permission denied%');
select pg_temp.expect_fail('8.17 backend kan ikke slette kurskjøp', $$delete from public.course_purchases where id = '93333333-3333-4333-8333-333333333333'$$, array['42501'], 'permission denied%');
select pg_temp.expect_fail('8.18 backend kan ikke slette profiler direkte (de følger auth.users via cascade)', $$delete from public.profiles where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, array['42501'], 'permission denied%');
select pg_temp.expect_fail('8.19 backend kan ikke slette snapshots direkte', $$delete from public.property_snapshots where id = 'a1111111-1111-4111-8111-111111111111'$$, array['42501'], 'permission denied%');
select pg_temp.expect_fail('8.20 backend kan ikke TRUNCATE tabeller', $$truncate public.properties cascade$$, array['42501'], 'permission denied%');
select pg_temp.as_owner();

-- ===========================================================================
-- 7. FJERNE BOLIG FRA EGEN LISTE: bare egne rader forsvinner, felles data og andres data berøres ikke
-- ===========================================================================
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.expect_rows('7.1 A kan fjerne P3 fra egen liste', $$delete from public.user_properties where property_id = '33333333-3333-4333-8333-333333333333'$$, 1);
select pg_temp.expect_count('7.2 As scenarioer, private analyser og referanser på P3 forsvant (cascade)',
  $$select (select count(*) from public.scenarios where property_id = '33333333-3333-4333-8333-333333333333') + (select count(*) from public.analyses where visibility = 'private')$$, 0);
select pg_temp.as_owner();
select pg_temp.check('7.3 felles analyser på P3 består', (select count(*) = 2 from public.analyses where property_id = '33333333-3333-4333-8333-333333333333' and visibility = 'shared'), null);
select pg_temp.check('7.4 Bs data på P3 består (scenario, privat analyse, primærscenario)',
  (select count(*) = 1 from public.scenarios where owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and property_id = '33333333-3333-4333-8333-333333333333')
  and (select count(*) = 1 from public.analyses where owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  and (select primary_scenario_id = 'd3333332-3333-4333-8333-333333333333' from public.user_properties where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and property_id = '33333333-3333-4333-8333-333333333333'),
  null);
select pg_temp.check('7.5 eiendommen P3 og forbruket består (eiendom kan ikke slettes av å fjerne den fra en liste)', (select count(*) = 1 from public.properties where id = '33333333-3333-4333-8333-333333333333'), null);

-- Sletter brukeren: alt privat følger med, felles data består
delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check('7.6 sletting av bruker A fjerner profil, liste, scenarioer, referanser, abonnement og kurskjøp',
  (select count(*) = 0 from public.profiles where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  and (select count(*) = 0 from public.user_properties where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  and (select count(*) = 0 from public.scenarios where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  and (select count(*) = 0 from public.user_comparables where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  and (select count(*) = 0 from public.subscriptions where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  and (select count(*) = 0 from public.course_purchases where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  null);
select pg_temp.check('7.7 felles data består etter at en bruker slettes', (select count(*) = 3 from public.properties) and (select count(*) >= 5 from public.analyses where visibility = 'shared'), null);

-- ---------------------------------------------------------------------------
-- Resultat: én rad per test. Alle rader skal ha ok = true.
-- ---------------------------------------------------------------------------
select n, test, ok, detail from _test_results order by n;

rollback;
