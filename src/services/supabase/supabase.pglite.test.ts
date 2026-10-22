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
    expect(migrations).toHaveLength(7);
    expect(migrations.at(-1)).toBe(SERVICE_GRANTS_MIGRATION);
  });

  it('bruker A og B: alle sjekkene i supabase/tests/rls_matrix.sql består', async () => {
    const rows = await runMatrix(db);
    // Et vakuumtest (for få rader) skal ikke kunne bestå.
    expect(rows.length).toBeGreaterThanOrEqual(200);
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
    expect(r.rows.length).toBe(37);
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
  it('stubben gir service_role ingen standardrettigheter (men klientrollene får Supabases standarder, så REVOKE-ene prøves ærlig)', async () => {
    const bare = new PGlite();
    await bare.exec(read('tests/support/local_supabase_stub.sql'));
    await bare.exec('create table public.probe (id int); create function public.probe_fn() returns int language sql as $$ select 1 $$;');
    const r = await bare.query<{ svc: boolean; anon: boolean; auth: boolean; fn_auth: boolean }>(`
      select has_table_privilege('service_role', 'public.probe', 'SELECT') as svc,
             has_table_privilege('anon', 'public.probe', 'SELECT') as anon,
             has_table_privilege('authenticated', 'public.probe', 'SELECT') as auth,
             has_function_privilege('authenticated', 'public.probe_fn()', 'execute') as fn_auth`);
    expect(r.rows[0]).toEqual({ svc: false, anon: true, auth: true, fn_auth: true });
    // Merk: PostgreSQL gir PUBLIC både USAGE på schema public og EXECUTE på nye funksjoner. Det er PostgreSQL-standard og ikke en
    // Supabase-gave til service_role; migrasjon 7 gir likevel service_role USAGE eksplisitt, og trigger-funksjonene trenger ingen EXECUTE.
    await bare.close();
  });

  it('NEGATIV KONTROLL: de seks første migrasjonene alene lar matrisen feile på «permission denied» (service_role mangler rettigheter)', async () => {
    const sixOnly = await freshDb({ only: migrations.filter((m) => m !== SERVICE_GRANTS_MIGRATION) });
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

  it('migrasjon 7 kjører også der funksjonen ikke finnes (lokalt og i andre prosjekter)', async () => {
    const r = await db.query('select to_regprocedure(\'public.rls_auto_enable()\') as f');
    expect((r.rows[0] as { f: unknown }).f).toBeNull();
  });

  it('lukker EXECUTE for PUBLIC, anon og authenticated – og lar funksjonen, kroppen, eieren og event-triggeren være urørt', async () => {
    const before6 = await freshDb({ stubs: STUBS, only: migrations.filter((m) => m !== SERVICE_GRANTS_MIGRATION) });
    const b = (await fnState(before6)).rows[0];
    // Utgangspunktet etterligner det Supabase Security Advisor fant: åpen for PUBLIC, anon og authenticated.
    expect([b.anon, b.auth, b.public_exec, b.secdef, b.evt]).toEqual([true, true, true, true, 1]);
    await before6.exec(read(`migrations/${SERVICE_GRANTS_MIGRATION}`));
    const a = (await fnState(before6)).rows[0];
    expect([a.anon, a.auth, a.public_exec]).toEqual([false, false, false]);
    expect({ md5: a.md5, secdef: a.secdef, owner: a.owner, config: a.config, evt: a.evt }).toEqual({ md5: b.md5, secdef: b.secdef, owner: b.owner, config: b.config, evt: b.evt });
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
