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

async function freshDb(beforeMigrations?: string): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(read('tests/support/local_supabase_stub.sql'));
  if (beforeMigrations) await db.exec(beforeMigrations);
  for (const f of migrations) await db.exec(read(`migrations/${f}`));
  return db;
}

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
}, 60_000);
afterAll(async () => {
  await db?.close();
});

interface MatrixRow {
  n: number;
  test: string;
  ok: boolean;
  detail: string | null;
}

describe('RLS- og eierskapsmatrise (lokalt mot PGlite)', () => {
  it('alle migrasjonene kan anvendes i rekkefølge', () => {
    expect(migrations).toHaveLength(6);
  });

  it('bruker A og B: alle sjekkene i supabase/tests/rls_matrix.sql består', async () => {
    const results = await db.exec(read('tests/rls_matrix.sql'));
    const rows = (results.find((r) => r.fields?.some((f) => f.name === 'ok'))?.rows ?? []) as MatrixRow[];
    // Et vakuumtest (for få rader) skal ikke kunne bestå.
    expect(rows.length).toBeGreaterThanOrEqual(170);
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
    const pre = await freshDb(`insert into auth.users (id, aud, role, email, raw_user_meta_data) values ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'eldre@rls-test.invalid', '{"full_name": "Eldre Bruker"}');`);
    const r = await pre.query<{ display_name: string; email: string }>(`select display_name, email from public.profiles where user_id = '99999999-9999-4999-8999-999999999999'`);
    expect(r.rows).toEqual([{ display_name: 'Eldre Bruker', email: 'eldre@rls-test.invalid' }]);
    await pre.close();
  }, 60_000);
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
