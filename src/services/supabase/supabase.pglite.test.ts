import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schemas from '../../domain/schemas';

/**
 * Kjører migrasjonene og RLS-testmatrisen (supabase/tests/rls_matrix.sql) mot PGlite: en vanlig PostgreSQL (WASM) med en etterlignet
 * Supabase-oppsett (supabase/tests/support/local_supabase_stub.sql). Dette er lokal verifisering av SQL-en og policyene – IKKE Supabase.
 * Faktisk Supabase (versjon, Auth, standardrettigheter, PostgREST) må verifiseres separat, se docs/supabase.md.
 */
const root = fileURLToPath(new URL('../../../supabase/', import.meta.url));
const read = (rel: string) => readFileSync(`${root}${rel}`, 'utf8');
const migrations = readdirSync(`${root}migrations`).filter((f) => f.endsWith('.sql')).sort();

interface MatrixRow {
  n: number;
  test: string;
  ok: boolean;
  detail: string | null;
}

const SERVICE_GRANTS_MIGRATION = '20261022100600_service_role_grants.sql';
const PRIVILEGE_RESET_MIGRATION = '20261022100700_service_role_privilege_reset.sql';
const USER_PROPERTIES_MIGRATION = '20261024100000_user_properties_backend_only_insert.sql';
/** Migrasjon 1–8: det som var anvendt før fase 2B. */
const UP_TO_RESET = migrations.slice(0, 8);
/** Migrasjon 1–6: før noen service_role-rettigheter ble gitt eksplisitt. */
const FIRST_SIX = migrations.slice(0, 6);
/** Migrasjon 1–7: det som var anvendt i Supabase da avviket ble funnet. */
const UP_TO_GRANTS = migrations.slice(0, 7);
/** Stubb-varianter for service_role sine standardrettigheter (lastes etter hovedstubben). Hovedstubben alene = brede standarder (worst case). */
const STUB_NO_DEFAULTS = 'tests/support/local_service_role_no_defaults.sql';
const STUB_EXTRA_ONLY = 'tests/support/local_service_role_extra_defaults_only.sql';
/**
 * Matrisetester som fantes og hadde samme mening før korrekturen (migrasjon 8). Utelatt: de nye fra migrasjon 8 (0.8b, 0.9b, 0.15, 0.16, 8.20b) og
 * de fra fase 2B (migrasjon 9) som er lagt til (0.17, 3.16, 3.17, 8.7b, 8.7c) eller bevisst endret (0.11 kolonneinventar, 3.8, 3.9, 3.13: klienten kan ikke lenger opprette rader).
 */
const isLegacyCheck = (test: string) => !/^(0\.8b|0\.9b|0\.11|0\.15|0\.16|0\.17|3\.8|3\.9|3\.13|3\.16|3\.17|8\.7b|8\.7c|8\.20b)\s/.test(test);

interface FreshOptions {
  /** SQL som kjøres etter stubben og før migrasjonene. */
  before?: string;
  /** Ekstra stub-filer (relativt til supabase/) som lastes før migrasjonene. */
  stubs?: string[];
  /** Hvilke migrasjoner som anvendes (standard: alle). */
  only?: string[];
}

async function freshDb(opts: FreshOptions = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(read('tests/support/local_supabase_stub.sql'));
  for (const f of opts.stubs ?? []) await db.exec(read(f));
  if (opts.before) await db.exec(opts.before);
  for (const f of opts.only ?? migrations) await db.exec(read(`migrations/${f}`));
  return db;
}

async function runMatrix(target: PGlite): Promise<MatrixRow[]> {
  const results = await target.exec(read('tests/rls_matrix.sql'));
  return (results.find((r) => r.fields?.some((f) => f.name === 'ok'))?.rows ?? []) as MatrixRow[];
}

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
}, 60_000);
afterAll(async () => {
  await db?.close();
});

describe('RLS- og eierskapsmatrise (lokalt mot PGlite)', () => {
  it('alle migrasjonene kan anvendes i rekkefølge', () => {
    expect(migrations).toHaveLength(9);
    expect(migrations.at(-3)).toBe(SERVICE_GRANTS_MIGRATION);
    expect(migrations.at(-2)).toBe(PRIVILEGE_RESET_MIGRATION);
    expect(migrations.at(-1)).toBe(USER_PROPERTIES_MIGRATION);
  });

  it('bruker A og B: alle sjekkene i supabase/tests/rls_matrix.sql består', async () => {
    const rows = await runMatrix(db);
    // Et vakuumtest (for få rader) skal ikke kunne bestå.
    expect(rows.length).toBeGreaterThanOrEqual(204);
    const failed = rows.filter((r) => !r.ok).map((r) => `#${r.n} ${r.test} — ${r.detail ?? ''}`);
    expect(failed, failed.join('\n')).toEqual([]);
    // Dekning: hver tabell nevnes i minst én test, og hvert tema er med.
    const names = rows.map((r) => r.test).join('\n');
    for (const topic of ['RLS', 'anon', 'primær', 'låst', 'idempotency', 'dedupe', 'versjon', 'cascade', 'Bs ', 'As ']) expect(names, topic).toContain(topic);
  }, 120_000);

  it('matrisen etterlater ingenting (ROLLBACK): databasen er tom for testdata og uten åpen transaksjon', async () => {
    const r = await db.query<{ n: string }>('select (select count(*) from public.profiles) + (select count(*) from public.properties) as n');
    expect(Number(r.rows[0].n)).toBe(0);
  });

  it('alle policyer i databasen gjelder bare rollen authenticated', async () => {
    const r = await db.query<{ tablename: string; policyname: string; roles: string }>(`select tablename, policyname, roles::text as roles from pg_policies where schemaname = 'public'`);
    expect(r.rows.length).toBe(36); // 37 i fase 1; migrasjon 9 droppet user_properties_insert_own
    for (const p of r.rows) expect(p.roles, `${p.tablename}.${p.policyname}`).toBe('{authenticated}');
  });

  it('de to SECURITY DEFINER-funksjonene er de eneste, og klientrollene kan ikke kjøre dem', async () => {
    const r = await db.query<{ proname: string; anon: boolean; auth: boolean }>(`
      select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef order by 1`);
    expect(r.rows.map((x) => x.proname)).toEqual(['handle_new_user', 'handle_user_email_change']);
    for (const f of r.rows) expect([f.anon, f.auth]).toEqual([false, false]);
  });

  it('brukere som finnes før migrasjonene får profil (engangs-etterfylling)', async () => {
    const pre = await freshDb({ before: `insert into auth.users (id, aud, role, email, raw_user_meta_data) values ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'eldre@rls-test.invalid', '{"full_name": "Eldre Bruker"}');` });
    const r = await pre.query<{ display_name: string; email: string }>(`select display_name, email from public.profiles where user_id = '99999999-9999-4999-8999-999999999999'`);
    expect(r.rows).toEqual([{ display_name: 'Eldre Bruker', email: 'eldre@rls-test.invalid' }]);
    await pre.close();
  }, 60_000);
});

describe('service_role-rettigheter kommer fra migrasjonene, ikke fra Supabase-standarder', () => {
  it('stubben gir som worst case brede standardrettigheter til alle tre rollene, og variantene avgrenser dem (så REVOKE må virke)', async () => {
    const probe = async (stubs: string[]) => {
      const t = new PGlite();
      await t.exec(read('tests/support/local_supabase_stub.sql'));
      for (const f of stubs) await t.exec(read(f));
      await t.exec('create table public.probe (id int); create function public.probe_fn() returns int language sql as $$ select 1 $$;');
      const r = await t.query<{ svc: string; anon: boolean; auth: boolean; fn_auth: boolean }>(`
        select (select string_agg(p, ',' order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p where has_table_privilege('service_role', 'public.probe', p)) as svc,
               has_table_privilege('anon', 'public.probe', 'SELECT') as anon,
               has_table_privilege('authenticated', 'public.probe', 'SELECT') as auth,
               has_function_privilege('authenticated', 'public.probe_fn()', 'execute') as fn_auth`);
      await t.close();
      return r.rows[0];
    };
    // A: alt, også TRUNCATE/REFERENCES/TRIGGER (worst case, slik GRANT aldri kan fjerne).
    expect(await probe([])).toEqual({ svc: 'DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE', anon: true, auth: true, fn_auth: true });
    // B: ingen standardrettigheter for service_role (klientrollene har dem fortsatt).
    expect(await probe([STUB_NO_DEFAULTS])).toEqual({ svc: null, anon: true, auth: true, fn_auth: true });
    // C: bare de tre ekstra rettighetene (det rapporterte live-utfallet).
    expect(await probe([STUB_EXTRA_ONLY])).toEqual({ svc: 'REFERENCES,TRIGGER,TRUNCATE', anon: true, auth: true, fn_auth: true });
    // Merk: PostgreSQL gir PUBLIC både USAGE på schema public og EXECUTE på nye funksjoner. Det er PostgreSQL-standard og ikke en
    // Supabase-gave til service_role; migrasjon 7/8 gir likevel service_role USAGE eksplisitt, og trigger-funksjonene trenger ingen EXECUTE.
  });

  it('NEGATIV KONTROLL: de seks første migrasjonene alene lar matrisen feile på «permission denied» (service_role mangler rettigheter)', async () => {
    // Uten standardrettigheter for service_role (stubb B) – ellers ville de brede standardene skjult at migrasjon 7 mangler.
    const sixOnly = await freshDb({ stubs: [STUB_NO_DEFAULTS], only: FIRST_SIX });
    const rows = await runMatrix(sixOnly);
    const failed = rows.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThanOrEqual(15);
    expect(failed.some((r) => /permission denied/.test(r.detail ?? ''))).toBe(true);
    // Rettighetsinventaret (0.8) fanger det eksplisitt.
    expect(failed.map((r) => r.test).join('\n')).toMatch(/0\.8 service_role har NØYAKTIG/);
    // De tidligere «vakuumtestene» (guard-triggere som utga seg for å teste, men stoppet på permission denied) feiler nå også.
    const names = failed.map((r) => r.test).join('\n');
    for (const t of ['2.30', '2.32', '4.37', '4.38']) expect(names, t).toContain(t);
    await sixOnly.close();
  }, 120_000);

  it('med migrasjon 7 når service_role-testene de faktiske constraintene (ikke permission denied)', async () => {
    const rows = await runMatrix(db);
    const byPrefix = (p: string) => rows.filter((r) => r.test.startsWith(`${p} `));
    // 2.33 unik versjon, 2.34/2.35/2.36 check, 2.37 fremmednøkkel, 6.19 idempotens, 6.21/6.22 dedupe, 6.25/6.26 kurs, 6.27 abonnementsstatus
    const expectations: Record<string, string> = { '2.33': '23505', '2.34': '23514', '2.35': '23514', '2.36': '23514', '2.37': '23503', '4.35': '23503', '6.19': '23505', '6.21': '23505', '6.22': '23505', '6.25': '23505', '6.26': '23505', '6.27': '23514' };
    for (const [n, code] of Object.entries(expectations)) {
      const row = byPrefix(n)[0];
      expect(row, n).toBeDefined();
      expect(row.ok, `${n}: ${row.detail}`).toBe(true);
      expect(row.detail, n).toContain(`avvist ${code}`);
      expect(row.detail, n).not.toMatch(/permission denied/);
    }
  }, 120_000);
});

/**
 * Migrasjon 8 (20261022100700): REVOKE ALL før eksplisitte GRANTs for service_role + deny-by-default for nye tabeller.
 * Korrekturen etter at faktisk Supabase-verifisering viste at service_role hadde flere rettigheter enn migrasjon 7 ga (matrisen 202/204:
 * 0.8 og 8.20). GRANT kan ikke fjerne rettigheter; derfor måtte stubben etterligne brede standarder for at testene skulle kunne avsløre det.
 */
describe('migrasjon 8: service_role-rettigheter normaliseres med REVOKE før GRANT', () => {
  const failedNames = (rows: MatrixRow[]) => rows.filter((r) => !r.ok).map((r) => r.test);

  it('NEGATIV KONTROLL (live-gjengivelse): migrasjon 1–7 med de ekstra standardrettighetene feiler på nøyaktig 0.8 og 8.20 av de opprinnelige 204 testene', async () => {
    const before = await freshDb({ stubs: [STUB_EXTRA_ONLY], only: UP_TO_GRANTS });
    const rows = await runMatrix(before);
    const legacyFailed = failedNames(rows).filter(isLegacyCheck);
    expect(legacyFailed).toHaveLength(2);
    expect(legacyFailed[0]).toMatch(/^0\.8 service_role har NØYAKTIG/);
    expect(legacyFailed[1]).toMatch(/^8\.20 backend kan ikke TRUNCATE/);
    // Detaljene viser at det er nettopp TRUNCATE/REFERENCES/TRIGGER som er for mye – ikke noe som mangler.
    const r08 = rows.find((r) => r.test.startsWith('0.8 '))!;
    expect(r08.detail).toMatch(/TRUNCATE finnes men skal ikke/);
    expect(r08.detail).toMatch(/REFERENCES finnes men skal ikke/);
    expect(r08.detail).toMatch(/TRIGGER finnes men skal ikke/);
    expect(r08.detail).not.toMatch(/mangler/);
    expect(rows.find((r) => r.test.startsWith('8.20 '))!.detail).toMatch(/gikk gjennom/);
    // De nye testene fanger det samme (alle 15 tabellene) og at fremtidige tabeller ville fått brede rettigheter.
    expect(failedNames(rows).filter((t) => t.startsWith('8.20b'))).toHaveLength(15);
    expect(failedNames(rows).some((t) => t.startsWith('0.15'))).toBe(true);
    expect(failedNames(rows).some((t) => t.startsWith('0.16'))).toBe(true);
    await before.close();
  }, 120_000);

  it('NEGATIV KONTROLL: med brede standarder (worst case) feiler 1–7 også på 0.8 og 8.20, og backend kunne ha slettet regnskap', async () => {
    const before = await freshDb({ only: UP_TO_GRANTS });
    const failed = failedNames(await runMatrix(before));
    for (const t of ['0.8 ', '8.13', '8.15', '8.17', '8.20 ']) expect(failed.some((n) => n.startsWith(t)), t).toBe(true);
    await before.close();
  }, 120_000);

  it('NEGATIV KONTROLL: uten standardrettigheter for service_role holder migrasjon 7 nok for tabellene (det forklarer hvorfor avviket ikke ble sett lokalt), men ikke for fremtidige tabeller', async () => {
    const before = await freshDb({ stubs: [STUB_NO_DEFAULTS], only: UP_TO_GRANTS });
    const failed = failedNames(await runMatrix(before));
    expect(failed.filter((t) => t.startsWith('0.8 ') || t.startsWith('8.'))).toEqual([]);
    expect(failed.some((t) => t.startsWith('0.15'))).toBe(true);
    expect(failed.some((t) => t.startsWith('0.16'))).toBe(true);
    await before.close();
  }, 120_000);

  for (const [label, stubs] of [
    ['brede standarder (worst case)', []],
    ['ingen standarder for service_role', [STUB_NO_DEFAULTS]],
    ['bare TRUNCATE/REFERENCES/TRIGGER som ekstra (live-gjengivelse)', [STUB_EXTRA_ONLY]],
  ] as const) {
    it(`med migrasjon 1–8 består hele matrisen – ${label}`, async () => {
      const after = await freshDb({ stubs: [...stubs] });
      const rows = await runMatrix(after);
      expect(rows.length).toBeGreaterThanOrEqual(204);
      const failed = rows.filter((r) => !r.ok).map((r) => `#${r.n} ${r.test} — ${r.detail ?? ''}`);
      expect(failed, failed.join('\n')).toEqual([]);
      // 0.8 og 8.20 (de to som feilet live) er med og består.
      for (const t of ['0.8 ', '0.8b', '0.9b', '0.15', '0.16', '8.20 ']) expect(rows.some((r) => r.test.startsWith(t) && r.ok), t).toBe(true);
      expect(rows.filter((r) => r.test.startsWith('8.20b') && r.ok)).toHaveLength(15);
      // TRUNCATE avvises med «permission denied» (42501), ikke av en tilfeldig annen grunn.
      expect(rows.find((r) => r.test.startsWith('8.20 '))!.detail).toMatch(/avvist 42501: permission denied/);
      await after.close();
    }, 120_000);
  }

  it('slutt-ACL på alle 15 tabeller (etter alle migrasjoner) er nøyaktig det som er bestemt, uten TRUNCATE, REFERENCES eller TRIGGER (og uten kolonnerettigheter)', async () => {
    const r = await db.query<{ tbl: string; privs: string }>(`
      select c.relname as tbl, string_agg(a.privilege_type, ',' order by a.privilege_type) as privs
        from pg_class c
        cross join lateral aclexplode(c.relacl) a
        join pg_roles g on g.oid = a.grantee and g.rolname = 'service_role'
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       group by c.relname order by c.relname`);
    const crud = (...p: string[]) => p.sort().join(',');
    expect(Object.fromEntries(r.rows.map((x) => [x.tbl, x.privs]))).toEqual({
      analyses: crud('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
      analysis_jobs: crud('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
      calendar_overrides: crud('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
      course_purchases: crud('SELECT', 'INSERT'),
      private_events: crud('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
      profiles: crud('SELECT', 'INSERT', 'UPDATE'),
      properties: crud('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
      property_snapshots: crud('SELECT', 'INSERT', 'UPDATE'),
      scenarios: crud('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
      subscriptions: crud('SELECT', 'INSERT', 'UPDATE'),
      usage_events: crud('SELECT', 'INSERT'),
      user_comparables: crud('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
      user_properties: crud('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
      user_risks: crud('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
      viewings: crud('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
    });
    // Kolonnerettigheter finnes bare for authenticated (bevisste, uendret); ingen for service_role.
    const cols = await db.query<{ n: string }>(`
      select count(*) as n from pg_attribute a join pg_class c on c.oid = a.attrelid
        cross join lateral aclexplode(a.attacl) x join pg_roles g on g.oid = x.grantee and g.rolname = 'service_role'
       where c.relnamespace = 'public'::regnamespace and a.attacl is not null`);
    expect(Number(cols.rows[0].n)).toBe(0);
    // Ingen CREATE på schema public, men USAGE.
    const sch = await db.query<{ usage: boolean; create: boolean }>(`select has_schema_privilege('service_role', 'public', 'USAGE') as usage, has_schema_privilege('service_role', 'public', 'CREATE') as "create"`);
    expect(sch.rows[0]).toEqual({ usage: true, create: false });
  });

  it('migrasjonen rører ikke anon, authenticated, policyer, funksjonsrettigheter eller andre tabeller enn de 15', async () => {
    // Utgangspunkt: 1–7 i worst-case-miljøet, med en ekstra tabell som ikke er Flippsjekks og en tabell opprettet av en annen rolle.
    const pre = await freshDb({ stubs: ['tests/support/local_rls_auto_enable_stub.sql'], only: UP_TO_GRANTS });
    await pre.exec(`
      create table public.annen_tabell (id int);
      create role supabase_admin nologin;
      alter default privileges for role supabase_admin in schema public grant all on tables to service_role;`);
    const snapshot = async (t: PGlite) => {
      const clients = await t.query<{ k: string }>(`
        select 'tabell ' || c.relname || ' ' || g.rolname || ' ' || a.privilege_type || ' ' || a.is_grantable as k
          from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a join pg_roles g on g.oid = a.grantee
         where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and g.rolname in ('anon', 'authenticated')
        union all
        select 'kolonne ' || c.relname || '.' || at.attname || ' ' || g.rolname || ' ' || a.privilege_type
          from pg_class c join pg_attribute at on at.attrelid = c.oid and at.attacl is not null
          cross join lateral aclexplode(at.attacl) a join pg_roles g on g.oid = a.grantee
         where c.relnamespace = 'public'::regnamespace and g.rolname in ('anon', 'authenticated')
        union all
        select 'funksjon ' || p.proname || ' ' || coalesce(g.rolname, 'PUBLIC') || ' ' || a.privilege_type
          from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a left join pg_roles g on g.oid = a.grantee
         where p.pronamespace = 'public'::regnamespace and coalesce(g.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated')
        order by 1`);
      const policies = await t.query<{ h: string }>(`select md5(string_agg(tablename || '.' || policyname || '.' || roles::text || '.' || cmd || '.' || coalesce(qual, '') || '.' || coalesce(with_check, ''), '|' order by tablename, policyname)) as h from pg_policies where schemaname = 'public'`);
      const other = await t.query<{ relacl: string }>(`select relacl::text from pg_class where oid = 'public.annen_tabell'::regclass`);
      const fn = await t.query<{ s: string }>(`select md5(p.prosrc) || p.prosecdef::text || p.proowner::regrole::text || coalesce(p.proconfig::text, '') as s from pg_proc p where p.oid = to_regprocedure('public.rls_auto_enable()')`);
      const evt = await t.query<{ n: number }>(`select count(*)::int as n from pg_event_trigger`);
      const nonPostgresDefaults = await t.query<{ k: string }>(`select d.defaclrole::regrole::text || ' ' || d.defaclobjtype::text || ' ' || d.defaclacl::text as k from pg_default_acl d where d.defaclrole <> 'postgres'::regrole order by 1`);
      const seqFnDefaults = await t.query<{ k: string }>(`select d.defaclobjtype::text || ' ' || d.defaclacl::text as k from pg_default_acl d where d.defaclrole = 'postgres'::regrole and d.defaclobjtype in ('S', 'f') order by 1`);
      return { clients: clients.rows, policies: policies.rows[0].h, other: other.rows[0].relacl, fn: fn.rows[0]?.s ?? 'rls_auto_enable() finnes ikke', evt: evt.rows[0].n, nonPostgresDefaults: nonPostgresDefaults.rows, seqFnDefaults: seqFnDefaults.rows };
    };
    const before = await snapshot(pre);
    expect(before.clients.length).toBeGreaterThan(0);
    expect(before.other).toMatch(/service_role=arwdDxt/); // kontroll: «annen_tabell» har de brede standardene før migrasjonen
    expect(before.fn).not.toBe('rls_auto_enable() finnes ikke');
    expect(before.evt).toBeGreaterThan(0);
    expect(before.nonPostgresDefaults.length).toBeGreaterThan(0);
    expect(before.seqFnDefaults.length).toBeGreaterThan(0);
    await pre.exec(read(`migrations/${PRIVILEGE_RESET_MIGRATION}`));
    const after = await snapshot(pre);
    expect(after).toEqual(before);
    await pre.close();
  }, 120_000);

  it('standardrettigheter: nye tabeller fra postgres i public får ingenting for service_role, anon eller authenticated – før migrasjonen fikk de alt', async () => {
    const aclOf = async (t: PGlite, table: string) => {
      const r = await t.query<{ k: string }>(`
        select g.rolname || '=' || string_agg(a.privilege_type, ',' order by a.privilege_type) as k
          from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a join pg_roles g on g.oid = a.grantee
         where c.oid = $1::regclass and g.rolname in ('service_role', 'anon', 'authenticated') group by g.rolname order by 1`, [table]);
      return r.rows.map((x) => x.k);
    };
    const t = await freshDb({ only: UP_TO_GRANTS });
    await t.exec('create table public.__ny_for_8 (id int);');
    const control = await aclOf(t, 'public.__ny_for_8');
    expect(control).toHaveLength(3);
    expect(control.every((k) => /TRUNCATE/.test(k) && /REFERENCES/.test(k) && /TRIGGER/.test(k))).toBe(true);
    await t.exec(read(`migrations/${PRIVILEGE_RESET_MIGRATION}`));
    // Den allerede opprettede tabellen beholder det den hadde (migrasjonen endrer ikke andre tabeller) …
    expect(await aclOf(t, 'public.__ny_for_8')).toEqual(control);
    // … mens en NY tabell etter migrasjonen er deny-by-default, og en migrasjon må gi eksplisitt det den vil ha.
    await t.exec('create table public.__ny_etter_8 (id int);');
    expect(await aclOf(t, 'public.__ny_etter_8')).toEqual([]);
    await t.exec('grant select on table public.__ny_etter_8 to service_role;');
    expect(await aclOf(t, 'public.__ny_etter_8')).toEqual(['service_role=SELECT']);
    const rls = await t.query<{ ok: boolean }>(`select not has_table_privilege('authenticated', 'public.__ny_etter_8', 'SELECT') as ok`);
    expect(rls.rows[0].ok).toBe(true);
    await t.close();
  }, 60_000);

  it('migrasjonen kan kjøres to ganger uten feil og uten å endre noe (idempotent)', async () => {
    const t = await freshDb();
    const acl = () => t.query<{ a: string }>(`select string_agg(c.relname || ':' || coalesce(c.relacl::text, ''), '|' order by c.relname) as a from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'`);
    const defaults = () => t.query<{ a: string }>(`select coalesce(string_agg(d.defaclobjtype::text || ':' || d.defaclacl::text, '|' order by d.defaclobjtype::text), '') as a from pg_default_acl d`);
    const first = [(await acl()).rows[0].a, (await defaults()).rows[0].a];
    await t.exec(read(`migrations/${PRIVILEGE_RESET_MIGRATION}`));
    expect([(await acl()).rows[0].a, (await defaults()).rows[0].a]).toEqual(first);
    await t.close();
  }, 60_000);
});

/**
 * Migrasjon 9 (fase 2B): lukker den kjente veien der en innlogget bruker som kjente en eiendoms UUID kunne legge den i egen liste og dermed få
 * lesetilgang til felles data. Medlemskap (user_properties) opprettes nå bare av backend.
 */
describe('migrasjon 9: brukerens liste kan bare opprettes av backend', () => {
  const USER = '11111111-aaaa-4aaa-8aaa-111111111111';
  const PROPERTY = '22222222-bbbb-4bbb-8bbb-222222222222';
  const seed = `
    insert into auth.users (id, aud, role, email) values ('${USER}', 'authenticated', 'authenticated', 'probe@rls-test.invalid');
    insert into public.properties (id, finn_id, canonical_url, address, city, municipality, property_type, tenure, data_origin)
      values ('${PROPERTY}', '900000777', 'https://example.invalid/p', 'Probeveien 1', 'Trondheim', 'Trondheim', 'leilighet', 'selveier', 'demo');`;
  const asClientInsert = (role: 'authenticated' | 'service_role') => `
    begin;
    select set_config('request.jwt.claims', '{"sub":"${USER}","role":"${role}"}', true), set_config('request.jwt.claim.sub', '${USER}', true);
    set local role ${role};
    insert into public.user_properties (${role === 'service_role' ? 'user_id, ' : ''}property_id) values (${role === 'service_role' ? `'${USER}', ` : ''}'${PROPERTY}');
    select count(*) as n from public.user_properties;
    rollback;`;
  const rowsOf = async (t: PGlite, sqlText: string) => {
    const res = await t.exec(sqlText);
    return (res.find((r) => r.fields?.some((f) => f.name === 'n'))?.rows as { n: number | string }[] | undefined)?.map((r) => ({ n: Number(r.n) }));
  };

  it('NEGATIV KONTROLL: uten migrasjon 9 (1–8) kan klienten legge en kjent UUID i egen liste, og matrisen avslører det (3.13, 0.17)', async () => {
    const before = await freshDb({ only: UP_TO_RESET });
    await before.exec(seed);
    expect((await rowsOf(before, asClientInsert('authenticated')))?.[0].n).toBe(1); // hullet er åpent: innsettingen lyktes
    const failed = (await runMatrix(before)).filter((r) => !r.ok).map((r) => r.test);
    expect(failed.some((n) => n.startsWith('3.13'))).toBe(true);
    expect(failed.some((n) => n.startsWith('0.17'))).toBe(true);
    await before.close();
  }, 120_000);

  it('med migrasjon 9: klienten får «permission denied» (uten å avsløre om eiendommen finnes), mens backend fortsatt kan opprette rader', async () => {
    const after = await freshDb();
    await after.exec(seed);
    await expect(after.exec(asClientInsert('authenticated'))).rejects.toThrow(/permission denied for table user_properties/);
    await after.exec('rollback;').catch(() => undefined);
    // Samme avvisning for en UUID som ikke finnes (ingen oppslagsmulighet).
    await expect(after.exec(asClientInsert('authenticated').replace(PROPERTY, '99999999-9999-4999-8999-999999999999'))).rejects.toThrow(/permission denied for table user_properties/);
    await after.exec('rollback;').catch(() => undefined);
    expect((await rowsOf(after, asClientInsert('service_role')))?.[0].n).toBe(1);
    // Ingen INSERT-policy og ingen kolonnerettighet igjen.
    const cat = await after.query<{ policies: string; cols: string }>(`
      select (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'user_properties' and cmd in ('INSERT', 'ALL')) as policies,
             (select count(*)::text from pg_attribute a where a.attrelid = 'public.user_properties'::regclass and a.attnum > 0 and not a.attisdropped
                and has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')) as cols`);
    expect(cat.rows[0]).toEqual({ policies: '0', cols: '0' });
    await after.close();
  }, 60_000);

  it('migrasjon 9 endrer bare INSERT på user_properties for klientrollene: alle øvrige tabell-, kolonne- og funksjonsrettigheter og policyer er uendret', async () => {
    const snapshot = async (t: PGlite) => {
      const privs = await t.query<{ k: string }>(`
        select 'tabell ' || c.relname || ' ' || g.rolname || ' ' || a.privilege_type as k
          from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a join pg_roles g on g.oid = a.grantee
         where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and g.rolname in ('anon', 'authenticated', 'service_role')
        union all
        select 'kolonne ' || c.relname || '.' || at.attname || ' ' || g.rolname || ' ' || a.privilege_type
          from pg_class c join pg_attribute at on at.attrelid = c.oid and at.attacl is not null
          cross join lateral aclexplode(at.attacl) a join pg_roles g on g.oid = a.grantee
         where c.relnamespace = 'public'::regnamespace and g.rolname in ('anon', 'authenticated', 'service_role')
        union all
        select 'policy ' || tablename || '.' || policyname from pg_policies where schemaname = 'public'
        union all
        select 'funksjon ' || p.proname || ' ' || coalesce(g.rolname, 'PUBLIC') || ' ' || a.privilege_type
          from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a left join pg_roles g on g.oid = a.grantee
         where p.pronamespace = 'public'::regnamespace
        order by 1`);
      return privs.rows.map((r) => r.k);
    };
    const pre = await freshDb({ only: UP_TO_RESET });
    const before = await snapshot(pre);
    await pre.exec(read(`migrations/${USER_PROPERTIES_MIGRATION}`));
    const after = await snapshot(pre);
    const removed = before.filter((k) => !after.includes(k));
    const added = after.filter((k) => !before.includes(k));
    expect(added).toEqual([]);
    expect(removed.sort()).toEqual([
      'kolonne user_properties.checks authenticated INSERT',
      'kolonne user_properties.favorite authenticated INSERT',
      'kolonne user_properties.label authenticated INSERT',
      'kolonne user_properties.last_seen_analysis_version authenticated INSERT',
      'kolonne user_properties.notes authenticated INSERT',
      'kolonne user_properties.property_id authenticated INSERT',
      'kolonne user_properties.work_status authenticated INSERT',
      'policy user_properties.user_properties_insert_own',
    ]);
    await pre.close();
  }, 60_000);

  it('service_role beholder INSERT på user_properties (analysetjenesten bruker den veien senere)', async () => {
    const t = await freshDb();
    const r = await t.query<{ ok: boolean }>(`select has_table_privilege('service_role', 'public.user_properties', 'INSERT') as ok`);
    expect(r.rows[0].ok).toBe(true);
    await t.close();
  });
});

describe('public.rls_auto_enable() (Supabase-funksjon som ikke er vår)', () => {
  const STUBS = ['tests/support/local_rls_auto_enable_stub.sql'];
  const fnState = (target: PGlite) =>
    target.query<{ md5: string; secdef: boolean; owner: string; config: string; anon: boolean; auth: boolean; public_exec: boolean; svc: boolean; evt: number }>(`
      select md5(p.prosrc) as md5, p.prosecdef as secdef, p.proowner::regrole::text as owner, coalesce(p.proconfig::text, '') as config,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as auth,
             exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec,
             has_function_privilege('service_role', p.oid, 'execute') as svc,
             (select count(*)::int from pg_event_trigger e where e.evtfoid = p.oid) as evt
        from pg_proc p where p.oid = to_regprocedure('public.rls_auto_enable()')`);

  it('migrasjon 7 og 8 kjører også der funksjonen ikke finnes (lokalt og i andre prosjekter)', async () => {
    const r = await db.query('select to_regprocedure(\'public.rls_auto_enable()\') as f');
    expect((r.rows[0] as { f: unknown }).f).toBeNull();
  });

  it('lukker EXECUTE for PUBLIC, anon og authenticated – og lar funksjonen, kroppen, eieren og event-triggeren være urørt', async () => {
    const before6 = await freshDb({ stubs: STUBS, only: FIRST_SIX });
    const b = (await fnState(before6)).rows[0];
    // Utgangspunktet etterligner det Supabase Security Advisor fant: åpen for PUBLIC, anon og authenticated.
    expect([b.anon, b.auth, b.public_exec, b.secdef, b.evt]).toEqual([true, true, true, true, 1]);
    await before6.exec(read(`migrations/${SERVICE_GRANTS_MIGRATION}`));
    const a = (await fnState(before6)).rows[0];
    expect([a.anon, a.auth, a.public_exec]).toEqual([false, false, false]);
    expect({ md5: a.md5, secdef: a.secdef, owner: a.owner, config: a.config, evt: a.evt }).toEqual({ md5: b.md5, secdef: b.secdef, owner: b.owner, config: b.config, evt: b.evt });
    // Migrasjon 8 lar funksjonen stå helt som den er etter migrasjon 7 (den har ingenting med funksjonen å gjøre).
    await before6.exec(read(`migrations/${PRIVILEGE_RESET_MIGRATION}`));
    expect((await fnState(before6)).rows[0]).toEqual(a);
    // Event-triggeren virker fortsatt: en ny tabell i public får RLS slått på automatisk.
    await before6.exec('create table public.__probe_ny_tabell (id int);');
    const rls = await before6.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where oid = 'public.__probe_ny_tabell'::regclass`);
    expect(rls.rows[0].relrowsecurity).toBe(true);
    await before6.close();
  }, 60_000);

  it('hele matrisen består også i et miljø der funksjonen finnes (0.13 og 0.14 tester den på ekte)', async () => {
    const withFn = await freshDb({ stubs: STUBS });
    const rows = await runMatrix(withFn);
    const failed = rows.filter((r) => !r.ok).map((r) => `#${r.n} ${r.test} — ${r.detail}`);
    expect(failed, failed.join('\n')).toEqual([]);
    const r13 = rows.find((r) => r.test.startsWith('0.13'))!;
    const r14 = rows.find((r) => r.test.startsWith('0.14'))!;
    expect(r13.detail).toContain('finnes og er lukket');
    expect(r14.detail).toContain('på plass');
    await withFn.close();
  }, 120_000);
});

/**
 * Tabellene følger appens Zod-skjemaer: hvert felt har en kolonne (med dokumenterte avvik), og felt som aldri er null i appen er NOT NULL
 * i databasen (unntatt der avviket er bevisst).
 */
const SPECIAL_COLUMN: Record<string, string> = { areaBRAi: 'area_bra_i', start: 'start_at', end: 'end_at' };
const toColumn = (key: string): string => SPECIAL_COLUMN[key] ?? key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

interface Coverage {
  table: string;
  schema: { shape: Record<string, { safeParse: (v: unknown) => { success: boolean } }> };
  /** Felt som bevisst ikke finnes i databasen. */
  excluded?: string[];
  /** Felt som er nullable i databasen selv om appen ikke tillater null (dokumentert avvik). */
  nullableInDb?: string[];
}

const COVERAGE: Coverage[] = [
  { table: 'profiles', schema: schemas.ProfileSchema, nullableInDb: ['defaults'] },
  { table: 'properties', schema: schemas.PropertySchema },
  { table: 'property_snapshots', schema: schemas.PropertySnapshotSchema },
  { table: 'viewings', schema: schemas.ViewingSchema },
  { table: 'analyses', schema: schemas.SharedAnalysisSchema },
  { table: 'user_properties', schema: schemas.UserPropertySchema },
  { table: 'scenarios', schema: schemas.ScenarioSchema },
  { table: 'user_comparables', schema: schemas.UserComparableSchema },
  { table: 'user_risks', schema: schemas.UserRiskSchema },
  { table: 'private_events', schema: schemas.PrivateEventSchema },
  { table: 'calendar_overrides', schema: schemas.CalendarOverrideSchema },
  { table: 'subscriptions', schema: schemas.SubscriptionSchema },
  { table: 'course_purchases', schema: schemas.CoursePurchaseSchema },
  { table: 'usage_events', schema: schemas.UsageEventSchema },
  { table: 'analysis_jobs', schema: schemas.AnalysisJobSchema, excluded: ['simulatedFailure'], nullableInDb: ['createdBy'] },
];

const accepts = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown): boolean => {
  try {
    return s.safeParse(v).success;
  } catch {
    return false;
  }
};

describe('tabellene dekker appens datamodell (Zod-skjemaene)', () => {
  for (const c of COVERAGE) {
    it(`${c.table}: alle felt har en kolonne, og påkrevde felt er NOT NULL`, async () => {
      const r = await db.query<{ column_name: string; is_nullable: string }>(`select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = $1`, [c.table]);
      const cols = new Map(r.rows.map((x) => [x.column_name, x.is_nullable === 'YES']));
      const missing: string[] = [];
      const looseNull: string[] = [];
      for (const [key, field] of Object.entries(c.schema.shape)) {
        if (c.excluded?.includes(key)) continue;
        const col = toColumn(key);
        if (!cols.has(col)) {
          missing.push(`${key} → ${col}`);
          continue;
        }
        const appAllowsNull = accepts(field, null) || accepts(field, undefined);
        if (!appAllowsNull && cols.get(col) && !c.nullableInDb?.includes(key)) looseNull.push(col);
      }
      expect(missing, `mangler kolonner i ${c.table}`).toEqual([]);
      expect(looseNull, `bør være NOT NULL i ${c.table}`).toEqual([]);
    });
  }
});
