import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as enums from '../../domain/enums';
import * as schemas from '../../domain/schemas';

/**
 * Statiske kontroller av SQL-filene i supabase/migrations. De kjører uten database og fanger de vanligste sikkerhetsfeilene (tabell uten RLS,
 * rettigheter til anon, policy som slipper alle inn, SECURITY DEFINER uten fast search_path, hemmeligheter i repoet) og at CHECK-listene
 * i SQL er de samme som appens enum-er og Zod-skjemaer. De erstatter ikke en kontroll mot faktisk Supabase.
 */
const dir = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const sql = files.map((f) => ({ file: f, text: readFileSync(`${dir}${f}`, 'utf8') }));
const all = sql.map((s) => s.text).join('\n');
/** SQL uten kommentarer (linjekommentarer starter med --), så søk ikke treffer forklaringer. */
const code = all.replace(/--[^\n]*/g, '');

export const FLIPPSJEKK_TABLES = [
  'profiles', 'properties', 'property_snapshots', 'analyses', 'viewings', 'user_properties', 'scenarios', 'user_comparables',
  'user_risks', 'private_events', 'calendar_overrides', 'subscriptions', 'course_purchases', 'usage_events', 'analysis_jobs',
] as const;

describe('migrasjonsfilene', () => {
  it('har sporbare, stigende navn (tidsstempel_navn.sql)', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) expect(f, f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(new Set(files.map((f) => f.slice(0, 14))).size).toBe(files.length);
    expect([...files].sort()).toEqual(files);
  });

  it('oppretter nøyaktig de 15 tabellene i schema public – ingen flere og ingen færre', () => {
    const created = [...code.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]).sort();
    expect(created).toEqual([...FLIPPSJEKK_TABLES].sort());
  });

  it('slår på RLS og tar bort standardrettighetene (REVOKE) for hver tabell', () => {
    for (const t of FLIPPSJEKK_TABLES) {
      expect(code, `RLS for ${t}`).toMatch(new RegExp(`alter table public\\.${t} enable row level security;`));
      expect(code, `REVOKE for ${t}`).toMatch(new RegExp(`revoke all on table public\\.${t} from anon, authenticated;`));
    }
  });

  it('gir aldri rettigheter til anon eller public, og aldri «grant all»', () => {
    const grants = [...code.matchAll(/grant\s[\s\S]*?;/gi)].map((m) => m[0]).filter((g) => !/^revoke/i.test(g));
    expect(grants.length).toBeGreaterThan(10);
    for (const g of grants) {
      expect(g, g).not.toMatch(/\bto\b[^;]*\banon\b/i);
      expect(g, g).not.toMatch(/\bto\b[^;]*\bpublic\b/i);
      expect(g, g).not.toMatch(/grant\s+all\b/i);
    }
  });

  it('gir bare SELECT til klienten på felles tabeller og på abonnement, kurskjøp, forbruk og jobber', () => {
    for (const t of ['properties', 'property_snapshots', 'viewings', 'subscriptions', 'course_purchases', 'usage_events', 'analysis_jobs']) {
      const mine = [...code.matchAll(new RegExp(`grant\\s[^;]*?on table (?:[\\w.]+, )*public\\.${t}\\b[^;]*?to authenticated;`, 'gi'))].map((m) => m[0]);
      expect(mine.length, `grant for ${t}`).toBeGreaterThan(0);
      for (const g of mine) expect(g, g).toMatch(/^grant select on table/i);
      expect(code, `policy-skriving på ${t}`).not.toMatch(new RegExp(`create policy \\w+ on public\\.${t}\\s+for (insert|update|delete|all)`, 'i'));
    }
  });

  it('har bare policyer for rollen authenticated, aldri «using (true)» og unike navn', () => {
    // Policyer som er opprettet og senere droppet (migrasjon 9 dropper user_properties_insert_own) teller ikke lenger.
    const dropped = new Set([...code.matchAll(/drop policy (?:if exists )?(\w+) on public\.(\w+)/gi)].map((m) => `${m[1]}.${m[2]}`));
    const policies = [...code.matchAll(/create policy[\s\S]*?;/gi)]
      .map((m) => m[0].replace(/\s+/g, ' '))
      .filter((p) => {
        const m = /create policy (\w+) on public\.(\w+)/.exec(p)!;
        return !dropped.has(`${m[1]}.${m[2]}`);
      });
    expect([...dropped]).toEqual(['user_properties_insert_own.user_properties']);
    // Antall policyer per tabell er bevisst fastlåst: en ny eller fjernet policy skal være et overlagt valg som oppdaterer denne listen.
    const perTable: Record<string, number> = {};
    for (const p of policies) {
      const t = /on public\.(\w+)/.exec(p)![1];
      perTable[t] = (perTable[t] ?? 0) + 1;
    }
    expect(perTable).toEqual({
      profiles: 2, properties: 1, user_properties: 3, property_snapshots: 1, viewings: 1, analyses: 4, scenarios: 4, user_comparables: 4,
      user_risks: 4, private_events: 4, calendar_overrides: 4, subscriptions: 1, course_purchases: 1, usage_events: 1, analysis_jobs: 1,
    });
    for (const p of policies) {
      expect(p, p).toMatch(/\bto authenticated\b/);
      expect(p, p).not.toMatch(/using \(\s*true\s*\)/i);
      expect(p, p).not.toMatch(/with check \(\s*true\s*\)/i);
    }
    const names = policies.map((p) => /create policy (\w+) on public\.(\w+)/.exec(p)!.slice(1, 3).join('.'));
    expect(new Set(names).size).toBe(names.length);
  });

  it('bruker (select auth.uid()) i policyer (ytelse) og aldri brukerredigerbar metadata til tilgangsstyring', () => {
    const policies = [...code.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);
    for (const p of policies) expect(p, p).not.toMatch(/auth\.uid\(\)(?<!\(select auth\.uid\(\))/);
    for (const p of policies) expect(p, p).not.toMatch(/user_metadata|raw_user_meta_data|app_metadata/i);
  });

  it('har fast search_path på alle funksjoner, og SECURITY DEFINER bare der det er begrunnet og EXECUTE er tatt bort', () => {
    const fns = [...code.matchAll(/create (?:or replace )?function public\.(\w+)\([\s\S]*?\n\$\$;/g)];
    expect(fns.map((m) => m[1]).sort()).toEqual(
      ['enforce_immutable_columns', 'enforce_row_limit_per_property', 'guard_published_analysis', 'handle_new_user', 'handle_user_email_change', 'scenarios_check_refs', 'scenarios_guard_locked', 'set_updated_at'],
    );
    const definers: string[] = [];
    for (const m of fns) {
      expect(m[0], m[1]).toMatch(/set search_path = ''/);
      expect(code, `REVOKE EXECUTE for ${m[1]}`).toMatch(new RegExp(`revoke execute on function public\\.${m[1]}\\(\\) from public, anon, authenticated;`));
      if (/security definer/i.test(m[0])) definers.push(m[1]);
    }
    expect(definers.sort()).toEqual(['handle_new_user', 'handle_user_email_change']);
  });

  it('alle fremmednøkler til auth.users har eksplisitt ON DELETE', () => {
    const refs = [...code.matchAll(/references auth\.users \(id\)(?![^\n]*on delete)/g)];
    expect(refs).toHaveLength(0);
    expect([...code.matchAll(/references auth\.users \(id\)/g)].length).toBeGreaterThan(10);
  });

  it('har ingen hemmeligheter, tilfeldige verdier i skjemaet eller avhengighet av utvidelser', () => {
    expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
    expect(all).not.toMatch(/sb_secret_[A-Za-z0-9]/);
    expect(all).not.toMatch(/\bpassword\s*[:=]/i);
    expect(code).not.toMatch(/create extension/i);
    expect(code).not.toMatch(/uuid_generate_v4|\brandom\(\)/i);
  });

  it('har indeks på fremmednøkler (også delvis uten WHERE, så Supabase-advisor ikke flagger dem)', () => {
    for (const idx of ['user_properties_property_id_idx', 'user_properties_primary_scenario_idx', 'scenarios_owner_property_idx', 'scenarios_analysis_idx', 'analyses_owner_property_idx', 'analyses_snapshot_idx', 'viewings_replaces_idx', 'user_comparables_owner_property_idx', 'user_risks_owner_property_idx', 'private_events_owner_property_idx', 'analysis_jobs_property_idx', 'analysis_jobs_created_by_idx', 'analysis_jobs_result_analysis_idx', 'analysis_jobs_result_snapshot_idx', 'usage_events_property_idx', 'usage_events_job_idx', 'usage_events_analysis_idx', 'subscriptions_user_idx', 'analysis_jobs_requested_by_idx']) {
      expect(code, idx).toMatch(new RegExp(`create (?:unique )?index ${idx}\\b`));
    }
    // Indeksene som dekker fremmednøkler er ikke delvise (WHERE), bortsett fra de to unike indeksene som håndhever regler.
    const partial = [...code.matchAll(/create (?:unique )?index (\w+)[^;]*\swhere\s[^;]*;/g)].map((m) => m[1]).sort();
    expect(partial).toEqual(['analyses_shared_version_key', 'analysis_jobs_active_dedupe', 'subscriptions_agreement_key', 'user_risks_base_key'].sort());
  });
});

/** CHECK-listene i SQL skal være de samme som appens enum-er og Zod-skjemaer (kilden til sannhet). */
function enumOptions(schema: unknown): string[] {
  let cur = schema as { options?: readonly string[]; unwrap?: () => unknown };
  while (cur && !cur.options && typeof cur.unwrap === 'function') cur = cur.unwrap() as typeof cur;
  if (!cur?.options) throw new Error('Ikke et enum-skjema');
  return [...cur.options];
}

function tableBlock(table: string): string {
  const start = code.indexOf(`create table public.${table} (`);
  expect(start, `fant ikke ${table}`).toBeGreaterThanOrEqual(0);
  const end = code.indexOf('\n);', start);
  return code.slice(start, end);
}

function sqlList(table: string, column: string): string[] {
  const m = new RegExp(`\\b${column} in \\(([^)]*)\\)`).exec(tableBlock(table));
  expect(m, `${table}.${column}`).not.toBeNull();
  return [...(m![1].matchAll(/'([^']*)'/g))].map((x) => x[1]);
}

const same = (a: readonly string[], b: readonly string[]) => expect([...a].sort()).toEqual([...b].sort());

describe('CHECK-listene i SQL følger appens enum-er og Zod-skjemaer', () => {
  it('eiendom, snapshot, visning og analyse', () => {
    same(sqlList('properties', 'property_type'), enums.PROPERTY_TYPES);
    same(sqlList('properties', 'tenure'), enums.TENURES);
    same(sqlList('properties', 'data_origin'), enumOptions(schemas.PropertySchema.shape.dataOrigin));
    same(sqlList('property_snapshots', 'sale_status'), enums.SALE_STATUSES);
    same(sqlList('property_snapshots', 'origin'), enumOptions(schemas.PropertySnapshotSchema.shape.origin));
    same(sqlList('viewings', 'status'), enums.VIEWING_STATUSES);
    same(sqlList('analyses', 'status'), enumOptions(schemas.SharedAnalysisSchema.shape.status));
    same(sqlList('analyses', 'visibility'), enumOptions(schemas.SharedAnalysisSchema.shape.visibility));
    same(sqlList('analyses', 'origin'), enumOptions(schemas.SharedAnalysisSchema.shape.origin));
    same(sqlList('analyses', 'analysis_kind'), enumOptions(schemas.SharedAnalysisSchema.shape.analysisKind));
    same(sqlList('analyses', 'recommendation'), enums.RECOMMENDATIONS);
  });

  it('brukerens liste, egne referanser, risikoer og kalender', () => {
    same(sqlList('user_properties', 'work_status'), enums.WORK_STATUSES);
    same(sqlList('user_comparables', 'kind'), enums.COMPARABLE_KINDS);
    same(sqlList('user_comparables', 'property_type'), enums.PROPERTY_TYPES);
    same(sqlList('user_comparables', 'tenure'), enums.TENURES);
    same(sqlList('user_comparables', 'location_level'), enums.LOCATION_LEVELS);
    same(sqlList('user_comparables', 'standard_class'), enums.STANDARD_CLASSES);
    same(sqlList('user_comparables', 'layout_match'), enums.LAYOUT_MATCHES);
    same(sqlList('user_comparables', 'data_quality'), enums.DATA_QUALITY_LEVELS);
    same(sqlList('user_risks', 'category'), enums.RISK_CATEGORIES);
    same(sqlList('private_events', 'kind'), enumOptions(schemas.PrivateEventSchema.shape.kind));
    same(sqlList('calendar_overrides', 'origin'), enumOptions(schemas.CalendarOverrideSchema.shape.origin));
  });

  it('abonnement, kurskjøp, forbruk og jobber', () => {
    same(sqlList('subscriptions', 'interval'), enumOptions(schemas.SubscriptionSchema.shape.interval));
    same(sqlList('subscriptions', 'status'), enums.SUBSCRIPTION_STATUSES);
    same(sqlList('subscriptions', 'provider'), enumOptions(schemas.SubscriptionSchema.shape.provider));
    same(sqlList('usage_events', 'kind'), enums.USAGE_KINDS);
    same(sqlList('analysis_jobs', 'type'), enums.JOB_TYPES);
    same(sqlList('analysis_jobs', 'status'), enums.JOB_STATUSES);
  });

  it('RISK_CATEGORIES-listen er den samme også for risikoer i felles analyse (Zod) som for brukerens egne', () => {
    same(enumOptions(schemas.UserRiskSchema.shape.category), enums.RISK_CATEGORIES);
    same(enumOptions(schemas.RiskSchema.shape.category), enums.RISK_CATEGORIES);
  });
});

/** Ingen hemmeligheter i repoet: nøkler, tokens og tilkoblingsstrenger skal aldri ligge i kode, dokumenter eller konfigurasjon. */
describe('ingen hemmeligheter i repoet', () => {
  const repo = fileURLToPath(new URL('../../../', import.meta.url));
  const walk = (rel: string): string[] => {
    const abs = `${repo}${rel}`;
    if (!statSync(abs).isDirectory()) return [rel];
    return readdirSync(abs).flatMap((name) => (['node_modules', 'dist', 'test-results', '.git'].includes(name) ? [] : walk(`${rel}${rel.endsWith('/') || rel === '' ? '' : '/'}${name}`)));
  };
  const files = [...walk('src'), ...walk('supabase'), ...walk('docs'), ...walk('e2e'), '.env.example', 'package.json', 'README.md', 'ai.md', 'index.html']
    // Testfiler bygger bevisst falske nøkler for å teste avvisningen.
    .filter((f) => !/\.test\.tsx?$/.test(f) && !/_snapshots?\//.test(f) && !/\.(png|jpg|ico|svg)$/.test(f));

  it('finner ingen JWT-er, sb_secret_-nøkler, tilkoblingsstrenger med passord eller private nøkler', () => {
    expect(files.length).toBeGreaterThan(50);
    const patterns: [string, RegExp][] = [
      ['JWT', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./],
      ['sb_secret_-nøkkel', /sb_secret_[A-Za-z0-9]{8,}/],
      ['tilkoblingsstreng med passord', /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/i],
      ['privat nøkkel', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
      ['service-role-nøkkel tildelt en verdi', /SERVICE_ROLE[A-Z_]*\s*[:=]\s*['"]?[A-Za-z0-9._-]{20,}/i],
    ];
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(`${repo}${f}`, 'utf8');
      for (const [name, re] of patterns) if (re.test(text)) hits.push(`${f}: ${name}`);
    }
    expect(hits).toEqual([]);
  });

  it('.env.example har bare offentlige VITE_-variabler uten verdier for Supabase, og ekte .env-filer er git-ignorert', () => {
    const example = readFileSync(`${repo}.env.example`, 'utf8');
    const assigned = [...example.matchAll(/^([A-Z_]+)=(.*)$/gm)].map((m) => [m[1], m[2]]);
    expect(assigned.map(([k]) => k).sort()).toEqual(['VITE_FLIPPROM_MODE', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_URL']);
    expect(Object.fromEntries(assigned)).toMatchObject({ VITE_FLIPPROM_MODE: 'demo', VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' });
    const assignmentsOnly = example.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(assignmentsOnly).not.toMatch(/service_role|DB_PASSWORD|DATABASE_URL|sb_secret/i);
    const ignore = readFileSync(`${repo}.gitignore`, 'utf8').split('\n').map((l) => l.trim());
    for (const rule of ['.env', '.env.*', '!.env.example', 'supabase/.temp/', 'supabase/.env']) expect(ignore, rule).toContain(rule);
  });
});

/**
 * Migrasjon 1–8 er anvendt i Flippsjekks faktiske Supabase-utviklingsdatabase og er en del av historikken. De skal aldri redigeres:
 * endringer leveres som en NY migrasjon. Sjekksummene låser filene; feiler denne testen, lag en ny migrasjon i stedet for å endre en gammel.
 */
const APPLIED_MIGRATION_SHA256: Record<string, string> = {
  '20261022100000_helpers.sql': '4849a9be811a2cb49f345f8e1ef2e50e23e9471cff67721c7a5943ff7991c748',
  '20261022100100_profiles.sql': '7511ad50cc7615af85d5b69c28294f2d570185e2ecf53fb184c4d57a14bf8364',
  '20261022100200_properties_and_user_properties.sql': 'f3a1aafc6a3076734c8cb00dc6ce6c6e0b3a1ae7ef156a16098d8c00af8eb06b',
  '20261022100300_shared_analysis_data.sql': 'b05a53bcec04469f3d7eecb1848df753e9cbec3bbf414cbe63d587724aab42a9',
  '20261022100400_user_data.sql': '114aa2671867ef0e7055d867994299fdddee81cb9e2e4b2765320cac023aca76',
  '20261022100500_billing_usage_jobs.sql': '58dee79e7358cd7cfe3a16a7a6b05a336e28356de31e91a9a2ab7c15ea8f8c79',
  '20261022100600_service_role_grants.sql': '8bb5292e8cf6ddf80739856dce74c29c1ee663005d434695a4c8b656e398018e',
  '20261022100700_service_role_privilege_reset.sql': '5f182d55119781bd9cd9b3cab12da013fd8ac70c234d83c077bc79d72a0270dd',
};

describe('anvendte migrasjoner er urørt', () => {
  it('migrasjon 1–8 har uendret innhold (sjekksum), og alt nytt ligger i senere migrasjoner', () => {
    for (const [file, expected] of Object.entries(APPLIED_MIGRATION_SHA256)) {
      const text = sql.find((s) => s.file === file)?.text;
      expect(text, `${file} finnes`).toBeDefined();
      expect(createHash('sha256').update(text as string).digest('hex'), `${file} er endret – lag en NY migrasjon i stedet`).toBe(expected);
    }
    const later = files.filter((f) => !(f in APPLIED_MIGRATION_SHA256));
    expect(later).toEqual(['20261024121059_user_properties_backend_only_insert.sql']);
    for (const f of later) expect(f > '20261022100700').toBe(true);
  });
});

describe('migrasjon 7: eksplisitte service_role-rettigheter og rls_auto_enable()', () => {
  const m7 = sql.find((s) => s.file === '20261022100600_service_role_grants.sql')!.text.replace(/--[^\n]*/g, '');
  const matrix = readFileSync(fileURLToPath(new URL('../../../supabase/tests/rls_matrix.sql', import.meta.url)), 'utf8');

  /** tabell -> sortert liste over privilegier fra «grant … on table public.X to service_role». */
  const grantsOf = (text: string): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const m of text.matchAll(/grant ([a-z, ]+) on table public\.(\w+) to service_role;/gi)) out[m[2]] = m[1].split(',').map((x) => x.trim().toUpperCase()).sort();
    return out;
  };

  it('gir bare rettigheter til service_role – aldri anon, authenticated eller public – og aldri ALL, TRUNCATE, REFERENCES eller TRIGGER', () => {
    const grants = [...m7.matchAll(/\bgrant\b[\s\S]*?;/gi)].map((g) => g[0].replace(/\s+/g, ' '));
    expect(grants.length).toBe(16); // 15 tabeller + USAGE på schema public
    for (const g of grants) {
      expect(g, g).toMatch(/ to service_role;$/);
      expect(g, g).not.toMatch(/\bto\b[^;]*\b(anon|authenticated)\b/i);
      expect(g, g).not.toMatch(/\ball\b|truncate|references|trigger|sequence|function/i);
    }
    expect(grants).toContain('grant usage on schema public to service_role;');
  });

  it('gir nøyaktig de bestemte tabellrettighetene til alle 15 tabeller, og det samme som matrisen forventer', () => {
    const granted = grantsOf(m7);
    expect(Object.keys(granted).sort()).toEqual([...FLIPPSJEKK_TABLES].sort());
    // matrisens forventning (_expected_service) leses fra SQL-filen og må være identisk
    const block = /insert into _expected_service \(tbl, priv\)([\s\S]*?)\) v\(t, ps\)/.exec(matrix)![1];
    const expected: Record<string, string[]> = {};
    for (const m of block.matchAll(/\('(\w+)', array\[([^\]]*)\]\)/g)) expected[m[1]] = [...m[2].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort();
    expect(expected).toEqual(granted);
    // minste privilegium: regnskap og betalingshistorikk kan ikke slettes eller endres bakover
    expect(granted.usage_events).toEqual(['INSERT', 'SELECT']);
    expect(granted.course_purchases).toEqual(['INSERT', 'SELECT']);
    expect(granted.subscriptions).not.toContain('DELETE');
    for (const p of Object.values(granted)) expect(p).toContain('SELECT');
  });

  it('lukker EXECUTE på rls_auto_enable() for public, anon og authenticated – betinget, uten å røre funksjonen eller event-triggeren', () => {
    expect(m7).toMatch(/if to_regprocedure\('public\.rls_auto_enable\(\)'\) is not null then\s+revoke execute on function public\.rls_auto_enable\(\) from public, anon, authenticated;\s+end if;/);
    expect(m7).not.toMatch(/\bdrop\b|\balter function\b|\balter event trigger\b|create (or replace )?function|security invoker|security definer|\bgrant\b[^;]*rls_auto_enable/i);
    // service_role og andre roller røres ikke på funksjonen, og ingen EXECUTE gis til noen
    expect(m7).not.toMatch(/grant execute/i);
  });

  it('endrer ingenting for anon og authenticated (ingen nye grants til dem i denne migrasjonen)', () => {
    expect(m7).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i);
  });
});

describe('migrasjon 8: REVOKE før GRANT for service_role og deny-by-default for nye tabeller', () => {
  const FILE = '20261022100700_service_role_privilege_reset.sql';
  const m8 = sql.find((x) => x.file === FILE)!.text.replace(/--[^\n]*/g, '');
  const m7 = sql.find((x) => x.file === '20261022100600_service_role_grants.sql')!.text.replace(/--[^\n]*/g, '');
  const stmts = m8.split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const grantsOf = (text: string): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const m of text.matchAll(/grant ([a-z, ]+) on table public\.(\w+) to service_role;/gi)) out[m[2]] = m[1].split(',').map((x) => x.trim().toUpperCase()).sort();
    return out;
  };

  it('fjerner ALLE eksisterende tabellrettigheter fra service_role på nøyaktig de 15 tabellene – før noe GRANT', () => {
    const revoke = stmts.find((x) => /^revoke all privileges on table /i.test(x))!;
    expect(revoke, 'REVOKE ALL PRIVILEGES ON TABLE finnes').toBeDefined();
    expect(revoke).toMatch(/ from service_role$/);
    const tables = [...revoke.matchAll(/public\.(\w+)/g)].map((m) => m[1]).sort();
    expect(tables).toEqual([...FLIPPSJEKK_TABLES].sort());
    // Den første rettighets-setningen i filen er REVOKE ALL, og den står foran alle GRANT-ene.
    const firstGrant = m8.search(/\bgrant\b/i);
    expect(m8.search(/revoke all privileges on table/i)).toBeGreaterThanOrEqual(0);
    expect(m8.search(/revoke all privileges on table/i)).toBeLessThan(firstGrant);
    // Eksakt ett slikt REVOKE (ikke bare for noen tabeller), og aldri mot andre roller.
    expect(stmts.filter((x) => /^revoke all privileges on table /i.test(x))).toHaveLength(1);
  });

  it('gir tilbake nøyaktig de samme tabellrettighetene som migrasjon 7 (og det matrisen forventer) – aldri TRUNCATE, REFERENCES, TRIGGER eller ALL', () => {
    const granted = grantsOf(m8);
    expect(granted).toEqual(grantsOf(m7));
    expect(Object.keys(granted).sort()).toEqual([...FLIPPSJEKK_TABLES].sort());
    expect(granted.profiles).toEqual(['INSERT', 'SELECT', 'UPDATE']);
    expect(granted.usage_events).toEqual(['INSERT', 'SELECT']);
    expect(granted.course_purchases).toEqual(['INSERT', 'SELECT']);
    expect(granted.subscriptions).toEqual(['INSERT', 'SELECT', 'UPDATE']);
    expect(granted.property_snapshots).toEqual(['INSERT', 'SELECT', 'UPDATE']);
    const grants = stmts.filter((x) => /^grant\b/i.test(x));
    expect(grants).toHaveLength(16); // 15 tabeller + USAGE på schema public
    for (const g of grants) {
      expect(g, g).toMatch(/ to service_role$/);
      expect(g, g).not.toMatch(/\ball\b|truncate|references|trigger|sequence|function|\banon\b|\bauthenticated\b|\bpublic$|grant option/i);
    }
  });

  it('schema public: USAGE gis eksplisitt og CREATE tas bort fra service_role', () => {
    expect(stmts).toContain('revoke create on schema public from service_role');
    expect(stmts).toContain('grant usage on schema public to service_role');
    expect(m8).not.toMatch(/grant[^;]*\bcreate\b/i);
  });

  it('standardrettigheter: bare REVOKE ALL ON TABLES for postgres i schema public, for service_role, anon og authenticated – ingen GRANT, ingen globale, ingen andre objekttyper eller roller', () => {
    const defaults = stmts.filter((x) => /^alter default privileges/i.test(x));
    expect(defaults.sort()).toEqual([
      'alter default privileges for role postgres in schema public revoke all on tables from anon',
      'alter default privileges for role postgres in schema public revoke all on tables from authenticated',
      'alter default privileges for role postgres in schema public revoke all on tables from service_role',
    ]);
    for (const d of defaults) expect(d, d).not.toMatch(/\bgrant\b|functions|sequences|supabase_admin|schemas|types/i);
    expect(m8).not.toMatch(/alter default privileges\s+(?!for role postgres in schema public)/i);
  });

  it('rører verken klientrollenes tabell-/kolonnerettigheter, policyer, funksjoner, triggere eller rls_auto_enable()', () => {
    const rest = stmts.filter((x) => !/^alter default privileges/i.test(x));
    for (const x of rest) expect(x, x).not.toMatch(/\banon\b|\bauthenticated\b/i);
    // «revoke all privileges on table … from service_role» lister kolonner ikke; ingen kolonnerettigheter for noen rolle
    expect(m8).not.toMatch(/\bgrant\b[^;]*\(\s*\w+\s*(,\s*\w+\s*)*\)/i);
    expect(m8).not.toMatch(/rls_auto_enable|\bdrop\b|create policy|alter policy|alter table|create (or replace )?function|alter function|create trigger|event trigger|security definer|security invoker|disable row level|force row level/i);
    expect(m8).not.toMatch(/grant execute|revoke execute|on all (tables|sequences|functions)|on function|on sequence|truncate/i);
    // Hele migrasjonen er fastlåst til nøyaktig disse setningene: 1 REVOKE ALL + 15 GRANT (tabeller) + REVOKE CREATE + GRANT USAGE + 3 standardregler.
    expect(stmts).toHaveLength(1 + 15 + 1 + 1 + 3);
  });
});

describe('migrasjon 9: brukerens liste (user_properties) kan bare opprettes av backend', () => {
  const FILE = '20261024121059_user_properties_backend_only_insert.sql';
  const m9 = sql.find((x) => x.file === FILE)!.text.replace(/--[^\n]*/g, '');
  const stmts = m9.split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);

  it('består av nøyaktig to setninger: tar INSERT fra authenticated og dropper insert-policyen', () => {
    expect(stmts).toEqual([
      'revoke insert on table public.user_properties from authenticated',
      'drop policy if exists user_properties_insert_own on public.user_properties',
    ]);
  });

  it('gir ingenting til noen, innfører ingen funksjon/RPC, og rører bare user_properties', () => {
    expect(m9).not.toMatch(/\bgrant\b|create (or replace )?function|security definer|\bto (anon|public|service_role)\b/i);
    expect(m9.match(/public\.\w+/g)!.every((t) => t === 'public.user_properties')).toBe(true);
  });

  it('ingen annen migrasjon gir authenticated INSERT på user_properties etter at migrasjon 9 er anvendt (rekkefølgen er stigende)', () => {
    const after = files.filter((f) => f > FILE);
    expect(after).toEqual([]);
  });
});
