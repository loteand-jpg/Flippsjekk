import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeed, DEMO_USERS } from '../../data/seed';
import { memoryStorage } from '../../data/storage';
import type { Scenario, ScenarioValues } from '../../domain/schemas';
import { ManualClock } from '../../lib/clock';
import { createMockServices } from '../mock';
import { createSupabaseServices } from './compose';
import { isServiceError, type MyPropertyItem, type ServiceError } from '../types';
import { buildDevSeed } from './dev/devSeed';
import { createAnonClient, createPgliteBackend, createUserClient, type PgliteBackend } from './dev/pgliteBackend';
import { SupabaseAnalysisReader } from './analysisReader';
import { SupabasePropertyRepository } from './propertyRepository';
import { SupabaseScenarioRepository } from './scenarioRepository';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Integrasjonstester for Supabase-repositoriene: ekte `@supabase/supabase-js` → PostgREST-emulator → PGlite med Flippsjekks migrasjoner, RLS,
 * grants og triggere (dev/pgliteBackend.ts). Samme demodata som mocken (createSeed) legges inn, og resultatene sammenlignes med mock-repositoriene
 * (kontraktparitet). Dette er en lokal etterligning – faktisk Supabase må verifiseres separat (se docs/supabase.md).
 */
const NOW = new Date('2026-10-22T10:00:00.000Z');
const ADA = DEMO_USERS.ada.id;
const BJORN = DEMO_USERS.bjorn.id;
const state = createSeed(NOW);
const idOf = (key: string) => {
  const p = state.properties.find((x) => x.finnId === key);
  if (!p) throw new Error(`Ukjent FINN-ID ${key}`);
  return p.id;
};

let backend: PgliteBackend;
const changed: string[] = [];

function repos(client: SupabaseClient) {
  const deps = { getClient: async () => client as never, clock: new ManualClock(NOW.toISOString()), notifyChanged: () => void changed.push('x') };
  return { properties: new SupabasePropertyRepository(deps), scenarios: new SupabaseScenarioRepository(deps), analysis: new SupabaseAnalysisReader(deps) };
}

const OPTIONAL_NULLABLE = new Set(['analysisKind', 'derivedFromVersion', 'rawImport', 'unmappedFields', 'history', 'label', 'analyzedAt']);
/** Gjør to representasjoner sammenlignbare: utelater `undefined`, og `null` for felt som er valgfrie (ikke nullable) i domenet. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined || (x === null && OPTIONAL_NULLABLE.has(k))) continue;
      out[k] = canon(x);
    }
    return out;
  }
  return v;
}
/** `link.updatedAt` eies av databasen (trigger) og avviker fra seed-verdien etter at seeden har satt primærscenarioet. */
const comparable = (it: MyPropertyItem) => canon({ ...it, link: { ...it.link, updatedAt: undefined } });
const byProperty = (items: MyPropertyItem[]) => Object.fromEntries(items.map((i) => [i.property.id, comparable(i)]));

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(isServiceError(e), String(e)).toBe(true);
    return (e as ServiceError).code;
  }
  return 'lyktes';
}

async function mockServices() {
  const clock = new ManualClock(NOW.toISOString());
  const s = createMockServices({ storage: memoryStorage(), clock, latencyMs: 0 });
  await s.demo.signInAsProfile(DEMO_USERS.ada.email);
  return s;
}

beforeAll(async () => {
  backend = await createPgliteBackend();
  await backend.createUser(DEMO_USERS.ada.email, ADA);
  await backend.createUser(DEMO_USERS.bjorn.email, BJORN);
  for (const [source, target] of [[ADA, ADA], [BJORN, BJORN]] as const) {
    const seed = buildDevSeed(state, target, { sourceUserId: source });
    for (const stmt of seed.statements) await backend.sql(stmt);
  }
}, 180_000);
afterAll(async () => {
  await backend?.close();
});

describe('PropertyRepository: paritet med mocken (samme demodata)', () => {
  it('listMine gir de samme objektene (inkludert arkivert, primærscenario, grunnlag, buddag, risikoendringer og oppfriskingsbeslutning)', async () => {
    const mock = await mockServices();
    const sb = repos(await createUserClient(backend, ADA, DEMO_USERS.ada.email));
    const want = byProperty(await mock.properties.listMine({ includeArchived: true }));
    const got = byProperty(await sb.properties.listMine({ includeArchived: true }));
    expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
    expect(Object.keys(got)).toHaveLength(12);
    for (const pid of Object.keys(want)) expect(got[pid], `objekt ${pid}`).toEqual(want[pid]);
  });

  it('listMine uten arkiverte skjuler arkivert objekt (som mocken)', async () => {
    const mock = await mockServices();
    const sb = repos(await createUserClient(backend, ADA));
    const want = (await mock.properties.listMine()).map((i) => i.property.id).sort();
    const got = (await sb.properties.listMine()).map((i) => i.property.id).sort();
    expect(got).toEqual(want);
    expect(got.length).toBe(11);
  });

  it('getMine og getById: samme som mocken, også for objekt der grunnlaget (primærscenarioet) er en eldre analyseversjon', async () => {
    const mock = await mockServices();
    const sb = repos(await createUserClient(backend, ADA));
    for (const finn of state.properties.filter((p) => state.userProperties.some((l) => l.userId === ADA && l.propertyId === p.id)).map((p) => p.finnId)) {
      const pid = idOf(finn);
      expect(comparable((await sb.properties.getMine(pid))!), finn).toEqual(comparable((await mock.properties.getMine(pid))!));
      const b = await sb.properties.getById(pid);
      const mb = await mock.properties.getById(pid);
      expect(canon(b), finn).toEqual(canon(mb));
    }
    // p11: Adas scenario bygger på v1, siste publiserte er v2 – begge hentes i full form.
    const p11 = (await sb.properties.getMine(idOf(state.properties.find((p) => state.analyses.some((a) => a.propertyId === p.id && a.version === 2))!.finnId)))!;
    expect(p11.baseAnalysis?.version).not.toBe(p11.latestAnalysis?.version);
    const byFinn = await sb.properties.getByFinnId(state.properties[0].finnId);
    expect(byFinn?.property.finnId).toBe(state.properties[0].finnId);
  });

  it('null for ukjent/ugyldig id og for objekt utenfor egen liste (RLS), aldri tomme falske objekter', async () => {
    const sb = repos(await createUserClient(backend, BJORN));
    const adaOnly = state.userProperties.find((l) => l.userId === ADA && !state.userProperties.some((m) => m.userId === BJORN && m.propertyId === l.propertyId))!.propertyId;
    expect(await sb.properties.getMine(adaOnly)).toBeNull();
    expect(await sb.properties.getById(adaOnly)).toBeNull();
    expect(await sb.properties.getMine('ikke-en-uuid')).toBeNull();
    expect(await sb.properties.getById('00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await sb.analysis.getPublishedAnalysis(adaOnly)).toBeNull();
    expect(await sb.analysis.listVersions(adaOnly)).toEqual([]);
  });

  it('Bjørn ser bare sine egne fire objekter, aldri Adas', async () => {
    const sb = repos(await createUserClient(backend, BJORN));
    const mine = await sb.properties.listMine({ includeArchived: true });
    expect(mine.map((i) => i.property.id).sort()).toEqual(state.userProperties.filter((l) => l.userId === BJORN).map((l) => l.propertyId).sort());
    expect(mine.every((i) => i.link.userId === BJORN)).toBe(true);
    // Adas private notat og Adas scenarioer vises aldri for Bjørn på felles objekt (p01).
    const p01 = mine.find((i) => i.property.id === idOf(state.properties[0].finnId));
    const adaNote = state.userProperties.find((l) => l.userId === ADA && l.notes)?.notes ?? '';
    expect(JSON.stringify(mine)).not.toContain(adaNote);
    expect(p01?.link.userId).toBe(BJORN);
  });
});

describe('analyse (lesing)', () => {
  it('getAnalysis, getPublishedAnalysis og listVersions gir det mocken gir; bestilling av analyse er ikke koblet til', async () => {
    const mock = await mockServices();
    const sb = repos(await createUserClient(backend, ADA));
    const p = state.userProperties.find((l) => l.userId === ADA)!.propertyId;
    const want = await mock.analysis.getPublishedAnalysis(p);
    const got = await sb.analysis.getPublishedAnalysis(p);
    expect(canon(got)).toEqual(canon(want));
    expect(canon(await sb.analysis.getAnalysis(want!.id))).toEqual(canon(want));
    expect(await sb.analysis.listVersions(p)).toEqual(await mock.analysis.listVersions(p));
    expect(await sb.analysis.getJob()).toBeNull();
    for (const call of [
      () => sb.analysis.requestAnalysis({ url: 'https://finn.no/1', idempotencyKey: 'k' }),
      () => sb.analysis.requestRefresh(p, 'light', 'k'),
      () => sb.analysis.retryJob('x'),
    ]) expect(await code(call())).toBe('not_configured');
  });

  it('p11: eldre versjon kan hentes med versjonsnummer, og liste over versjoner er nyeste først', async () => {
    const sb = repos(await createUserClient(backend, ADA));
    const p11 = state.analyses.find((a) => a.version === 2)!.propertyId;
    const versions = await sb.analysis.listVersions(p11);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect((await sb.analysis.getPublishedAnalysis(p11, 1))?.version).toBe(1);
  });
});

describe('ScenarioRepository: paritet og regler', () => {
  const p01 = () => idOf(state.properties[0].finnId);

  it('list gir de samme scenarioene som mocken (verdier uendret)', async () => {
    const mock = await mockServices();
    const sb = repos(await createUserClient(backend, ADA));
    const want = await mock.scenarios.list(p01());
    const got = await sb.scenarios.list(p01());
    expect(got.length).toBe(3);
    expect(canon(got)).toEqual(canon(want));
  });

  it('create/update/duplicate/setPrimary/remove: samme resultat og feilkoder som mocken (for operasjoner begge støtter)', async () => {
    const mock = await mockServices();
    const sb = repos(await createUserClient(backend, ADA));
    const pid = idOf(state.properties.find((p) => state.userProperties.some((l) => l.userId === ADA && l.propertyId === p.id && !l.archivedAt && state.scenarios.filter((s) => s.ownerId === ADA && s.propertyId === p.id).length === 1))!.finnId);
    const analysisId = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === pid)!.analysisId;
    const base = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === pid)!.values;
    const values: ScenarioValues = { ...base, purchasePrice: 1_234_567 };

    for (const [label, s] of [['mock', mock], ['supabase', sb]] as const) {
      const created = await s.scenarios.create(pid, { name: '  Nytt forsøk  ', analysisId, values });
      expect(created.name, label).toBe('Nytt forsøk');
      expect(created.values.purchasePrice, label).toBe(1_234_567);
      expect(created.locked, label).toBeUndefined();
      const renamed = await s.scenarios.update(created.id, { name: 'Omdøpt' });
      expect(renamed.name, label).toBe('Omdøpt');
      const dup = await s.scenarios.duplicate(created.id);
      expect(dup.name, label).toBe('Omdøpt (kopi)');
      expect(await code(s.scenarios.update(created.id, { name: '   ' })), label).toBe('validation');
      expect(await code(s.scenarios.update('00000000-0000-4000-8000-0000000000aa', { name: 'x' })), label).toBe('not_found');
      await s.scenarios.setPrimary(pid, dup.id);
      expect((await s.properties.getMine(pid))!.link.primaryScenarioId, label).toBe(dup.id);
      // Sletter primærscenarioet: primær flyttes til et annet scenario (aldri null).
      await s.scenarios.remove(dup.id);
      const afterRemove = (await s.properties.getMine(pid))!;
      expect(afterRemove.link.primaryScenarioId, label).not.toBeNull();
      expect(afterRemove.link.primaryScenarioId, label).not.toBe(dup.id);
      await s.scenarios.remove(created.id);
      // Siste scenario kan ikke slettes.
      const left = await s.scenarios.list(pid);
      expect(left.length, label).toBe(1);
      expect(await code(s.scenarios.remove(left[0].id)), label).toBe('conflict');
      // Ugyldige verdier avvises før de lagres.
      expect(await code(s.scenarios.create(pid, { name: 'Dårlig', analysisId, values: { ...values, purchasePrice: 'mye' } as never })), label).toBe('validation');
    }
  });

  it('analyseversjonen settes fra analysen: et scenario på en v2-analyse får versjon 2 (ikke en hardkodet verdi)', async () => {
    const sb = repos(await createUserClient(backend, ADA));
    const v2 = state.analyses.find((a) => a.version === 2 && a.visibility === 'shared')!;
    const src = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === v2.propertyId)!;
    const created = await sb.scenarios.create(v2.propertyId, { name: 'På v2', analysisId: v2.id, values: src.values });
    expect(created.analysisId).toBe(v2.id);
    expect(created.analysisVersion).toBe(2);
    const row = await backend.query<{ analysis_version: number }>(`select analysis_version from public.scenarios where id = '${created.id}'`);
    expect(row[0].analysis_version).toBe(2);
    await sb.scenarios.remove(created.id);
  });

  it('feil grunnanalyse: en analyse for et annet objekt, og en analyse som ikke finnes, avvises', async () => {
    const sb = repos(await createUserClient(backend, ADA));
    const [a, b] = state.userProperties.filter((l) => l.userId === ADA).slice(0, 2).map((l) => l.propertyId);
    const otherAnalysis = state.analyses.find((x) => x.propertyId === b && x.visibility === 'shared')!.id;
    const values = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === a)!.values;
    expect(await code(sb.scenarios.create(a, { name: 'x', analysisId: otherAnalysis, values }))).toBe('forbidden');
    expect(await code(sb.scenarios.create(a, { name: 'x', analysisId: '00000000-0000-4000-8000-0000000000bb', values }))).toBe('forbidden');
    expect(await code(sb.scenarios.create(a, { name: 'x', analysisId: 'ikke-uuid', values }))).toBe('forbidden');
  });

  it('antall scenarioer per objekt er begrenset (planens grense) med forståelig melding', async () => {
    const sb = repos(await createUserClient(backend, BJORN));
    const link = state.userProperties.find((l) => l.userId === BJORN)!;
    const sc = state.scenarios.find((s) => s.ownerId === BJORN && s.propertyId === link.propertyId)!;
    let last: ServiceError | null = null;
    for (let i = 0; i < 12; i++) {
      try {
        await sb.scenarios.create(link.propertyId, { name: `Kopi ${i}`, analysisId: sc.analysisId, values: sc.values });
      } catch (e) {
        last = e as ServiceError;
        break;
      }
    }
    expect(last?.code).toBe('limit_reached');
    expect(last?.message).toMatch(/inntil 10 scenarioer/);
    // rydd opp
    await backend.sql(`delete from public.scenarios where owner_id = '${BJORN}' and property_id = '${link.propertyId}' and name like 'Kopi %'`);
  });
});

describe('låst scenario («Nettsidens vurdering») håndheves av databasen', () => {
  const LOCKED = '77777777-7777-4777-8777-777777777777';
  let pid: string;
  let analysisId: string;
  let analysisVersion: number;
  let values: ScenarioValues;

  beforeAll(async () => {
    const link = state.userProperties.find((l) => l.userId === ADA && !l.archivedAt)!;
    pid = link.propertyId;
    const sc = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === pid)!;
    analysisId = sc.analysisId;
    analysisVersion = sc.analysisVersion;
    values = sc.values;
    // Backend (postgres, auth.uid() er null) oppretter det låste grunnlagsscenarioet – klienten kan ikke.
    await backend.sql(`insert into public.scenarios (id, owner_id, property_id, analysis_id, analysis_version, name, locked, "values")
      select '${LOCKED}', '${ADA}', '${pid}', '${analysisId}', ${analysisVersion}, 'Nettsidens vurdering', true, "values" from public.scenarios where owner_id = '${ADA}' and property_id = '${pid}' limit 1`);
  });

  it('listes først, kan ikke redigeres, omdøpes eller slettes, og kan dupliseres til et vanlig scenario', async () => {
    const sb = repos(await createUserClient(backend, ADA));
    const list = await sb.scenarios.list(pid);
    expect(list[0].id).toBe(LOCKED);
    expect(list[0].locked).toBe(true);
    expect(await code(sb.scenarios.update(LOCKED, { values: { ...values, purchasePrice: 1 } }))).toBe('forbidden');
    expect(await code(sb.scenarios.update(LOCKED, { name: 'Min' }))).toBe('forbidden');
    expect(await code(sb.scenarios.remove(LOCKED))).toBe('forbidden');
    const copy = await sb.scenarios.duplicate(LOCKED, 'Min versjon');
    expect(copy.locked).toBeUndefined();
    expect(copy.values).toEqual(list[0].values);
    await sb.scenarios.remove(copy.id);
  });

  it('databasen stopper ulovlige endringer selv om klienten forsøker å omgå repositoryet (direkte PostgREST-kall)', async () => {
    const client = await createUserClient(backend, ADA);
    const upd = await client.from('scenarios').update({ name: 'Hacket' }).eq('id', LOCKED).select('id');
    expect(upd.error?.code).toBe('42501');
    expect(upd.error?.message).toMatch(/er låst/);
    const unlock = await client.from('scenarios').update({ locked: false }).eq('id', LOCKED).select('id');
    expect(unlock.error?.code).toBe('42501'); // locked er ikke en skrivbar kolonne
    const del = await client.from('scenarios').delete().eq('id', LOCKED).select('id');
    expect(del.data).toEqual([]); // RLS: «not locked» i delete-policyen – raden finnes ikke for sletting
    const mk = await client.from('scenarios').insert({ property_id: pid, analysis_id: analysisId, analysis_version: analysisVersion, name: 'Falskt låst', values, locked: true }).select('id');
    expect(mk.error?.code).toBe('42501'); // klienten kan ikke opprette låste rader
    const stillThere = await backend.query<{ n: number }>(`select count(*)::int as n from public.scenarios where id = '${LOCKED}' and name = 'Nettsidens vurdering' and locked`);
    expect(stillThere[0].n).toBe(1);
  });

  it('et låst scenario kan flyttes til ny analyseversjon («rebase») med nye verdier, men uten nytt navn', async () => {
    const sb = repos(await createUserClient(backend, ADA));
    // p11 har to felles analyseversjoner. Backend oppretter det låste scenarioet på v1; brukeren flytter det til v2.
    const v2 = state.analyses.find((a) => a.version === 2 && a.visibility === 'shared')!;
    const v1 = state.analyses.find((a) => a.propertyId === v2.propertyId && a.version === 1)!;
    const lockedP11 = '88888888-8888-4888-8888-888888888888';
    const src = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === v2.propertyId)!;
    await backend.sql(`insert into public.scenarios (id, owner_id, property_id, analysis_id, analysis_version, name, locked, "values")
      values ('${lockedP11}', '${ADA}', '${v2.propertyId}', '${v1.id}', 1, 'Nettsidens vurdering', true, '${JSON.stringify(src.values).replaceAll("'", "''")}'::jsonb)`);
    const rebased = await sb.scenarios.update(lockedP11, { analysisId: v2.id, values: { ...src.values, purchasePrice: 2_000_000 } });
    expect(rebased.locked).toBe(true);
    expect(rebased.name).toBe('Nettsidens vurdering');
    expect(rebased.analysisId).toBe(v2.id);
    expect(rebased.analysisVersion).toBe(2); // versjonen settes fra analysen, ikke fra klienten
    expect(rebased.values.purchasePrice).toBe(2_000_000);
    // Samme analyse er ingen rebase: databasen avviser (låst).
    expect(await code(sb.scenarios.update(lockedP11, { analysisId: v2.id, values: src.values }))).toBe('forbidden');
    await backend.sql(`delete from public.scenarios where id = '${lockedP11}'`);
  });
});

describe('bruker A mot bruker B: private scenarioer', () => {
  it('B kan ikke lese, endre, duplisere, slette eller sette Adas scenarioer som primære (de finnes ikke for B)', async () => {
    const sb = repos(await createUserClient(backend, BJORN));
    const sharedPid = state.userProperties.find((l) => l.userId === BJORN && state.userProperties.some((m) => m.userId === ADA && m.propertyId === l.propertyId))!.propertyId;
    const adaScenario = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === sharedPid)!;
    expect((await sb.scenarios.list(sharedPid)).some((s) => s.ownerId === ADA)).toBe(false);
    expect(await code(sb.scenarios.update(adaScenario.id, { name: 'Hacket av B' }))).toBe('not_found');
    expect(await code(sb.scenarios.duplicate(adaScenario.id))).toBe('not_found');
    expect(await code(sb.scenarios.remove(adaScenario.id))).toBe('not_found');
    expect(await code(sb.scenarios.setPrimary(sharedPid, adaScenario.id))).toBe('not_found');
    const row = await backend.query<{ name: string }>(`select name from public.scenarios where id = '${adaScenario.id}'`);
    expect(row[0].name).toBe(adaScenario.name); // urørt
  });

  it('B kan heller ikke gjøre det via PostgREST direkte: 0 rader, og primærscenario kan ikke peke på Adas scenario (sammensatt fremmednøkkel)', async () => {
    const client = await createUserClient(backend, BJORN);
    const sharedPid = state.userProperties.find((l) => l.userId === BJORN && state.userProperties.some((m) => m.userId === ADA && m.propertyId === l.propertyId))!.propertyId;
    const adaScenario = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === sharedPid)!;
    expect((await client.from('scenarios').select('id').eq('id', adaScenario.id)).data).toEqual([]);
    expect((await client.from('scenarios').update({ name: 'x' }).eq('id', adaScenario.id).select('id')).data).toEqual([]);
    expect((await client.from('scenarios').delete().eq('id', adaScenario.id).select('id')).data).toEqual([]);
    const prim = await client.from('user_properties').update({ primary_scenario_id: adaScenario.id }).eq('property_id', sharedPid).select('id');
    expect(prim.error?.code).toBe('23503');
    const own = await backend.query<{ p: string | null }>(`select primary_scenario_id as p from public.user_properties where user_id = '${BJORN}' and property_id = '${sharedPid}'`);
    expect(own[0].p).not.toBe(adaScenario.id);
  });

  it('primærscenario kan bare peke på eget scenario for SAMME eiendom (to eiendommer, to scenarioer)', async () => {
    const sb = repos(await createUserClient(backend, ADA));
    const [a, b] = state.userProperties.filter((l) => l.userId === ADA && !l.archivedAt).slice(0, 2).map((l) => l.propertyId);
    const scenarioOfB = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === b)!;
    expect(await code(sb.scenarios.setPrimary(a, scenarioOfB.id))).toBe('forbidden');
    const client = await createUserClient(backend, ADA);
    const direct = await client.from('user_properties').update({ primary_scenario_id: scenarioOfB.id }).eq('property_id', a).select('id');
    expect(direct.error?.code).toBe('23503'); // databasen avviser selv om repositoryet omgås
  });

  it('A sin liste og private data er uberørt av alt B forsøkte', async () => {
    const sb = repos(await createUserClient(backend, ADA));
    const pid = state.userProperties.find((l) => l.userId === ADA && !l.archivedAt)!.propertyId;
    const names = (await sb.scenarios.list(pid)).map((s) => s.name);
    expect(names.join('|')).not.toMatch(/Hacket/);
  });
});

describe('UUID-tilgangen er lukket: kjent eiendoms-UUID gir ikke medlemskap eller lesetilgang', () => {
  it('bruker uten liste: kan ikke legge til, lese eller lage scenario på en eiendom hen kjenner id-en til', async () => {
    const C = await backend.createUser('uten-liste@rls-test.invalid');
    const client = await createUserClient(backend, C, 'uten-liste@rls-test.invalid');
    const sb = repos(client);
    const known = state.userProperties.find((l) => l.userId === ADA)!;
    const analysisId = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === known.propertyId)!.analysisId;
    const values = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === known.propertyId)!.values;

    // 1. Direkte innsetting i user_properties (det tidligere hullet) er avvist på rettighet – både for kjent og ukjent UUID (ingen oppslag).
    for (const pid of [known.propertyId, '00000000-0000-4000-8000-0000000000cc']) {
      const ins = await client.from('user_properties').insert({ property_id: pid }).select('id');
      expect(ins.error?.code, pid).toBe('42501');
      expect(ins.error?.message, pid).toMatch(/permission denied/);
      expect(ins.status, pid).toBe(403);
    }
    // 2. Repositoryet har ingen vei inn.
    expect(await code(sb.properties.addToMine())).toBe('not_configured');
    // 3. Fortsatt ingen lesetilgang til felles data.
    expect(await sb.properties.getById(known.propertyId)).toBeNull();
    expect(await sb.properties.listMine({ includeArchived: true })).toEqual([]);
    expect(await sb.analysis.getAnalysis(analysisId)).toBeNull();
    expect(await sb.analysis.getPublishedAnalysis(known.propertyId)).toBeNull();
    // 4. Heller ikke via scenario eller privat analyseutkast.
    expect(await code(sb.scenarios.create(known.propertyId, { name: 'Smugler', analysisId, values }))).toBe('forbidden');
    const draft = await client.from('analyses').insert({ property_id: known.propertyId, snapshot_id: state.snapshots.find((s) => s.propertyId === known.propertyId)!.id, version: 1, schema_version: 1, model_version: '1.2.0', status: 'draft', visibility: 'private', owner_id: C, origin: 'import_v1', estimates: {} }).select('id');
    expect(draft.error?.code).toBe('23503');
    const n = await backend.query<{ n: number }>(`select count(*)::int as n from public.user_properties where user_id = '${C}'`);
    expect(n[0].n).toBe(0);
    // 5. anon har ingenting.
    const anon = createAnonClient(backend);
    const a = await anon.from('properties').select('id');
    expect(a.error?.code).toBe('42501');
    expect(a.status).toBe(401);
  });

  it('backend (postgres/service_role) kan fortsatt opprette lister: etter det får brukeren tilgang som vanlig', async () => {
    const D = await backend.createUser('lagt-til-av-backend@rls-test.invalid');
    const known = state.userProperties.find((l) => l.userId === ADA)!;
    const sb = repos(await createUserClient(backend, D, 'lagt-til-av-backend@rls-test.invalid'));
    expect(await sb.properties.getById(known.propertyId)).toBeNull();
    await backend.sql(`insert into public.user_properties (user_id, property_id) values ('${D}', '${known.propertyId}')`);
    const item = await sb.properties.getMine(known.propertyId);
    expect(item?.property.id).toBe(known.propertyId);
    expect(item?.scenarioCount).toBe(0); // ingen kopierte scenarioer: privat data følger ikke med
    expect(item?.latestAnalysis).not.toBeNull();
    expect(item?.link.userId).toBe(D);
  });
});

describe('personlig status, arkivering og fjerning av objekt', () => {
  it('updatePersonalStatus: arbeidsstatus, favoritt, notat, sist sett versjon og private avkrysninger – samme som mocken', async () => {
    const mock = await mockServices();
    const sb = repos(await createUserClient(backend, BJORN));
    const mockB = createMockServices({ storage: memoryStorage(), clock: new ManualClock(NOW.toISOString()), latencyMs: 0 });
    await mockB.demo.signInAsProfile(DEMO_USERS.bjorn.email);
    void mock;
    const pid = state.userProperties.find((l) => l.userId === BJORN && !l.archivedAt)!.propertyId;
    const patch = { workStatus: 'bud_vurderes' as const, favorite: true, notes: 'x'.repeat(6000), lastSeenAnalysisVersion: 2 };
    const want = await mockB.properties.updatePersonalStatus(pid, patch);
    const got = await sb.properties.updatePersonalStatus(pid, patch);
    expect(canon({ ...got, updatedAt: '', id: '' })).toEqual(canon({ ...want, updatedAt: '', id: '' }));
    expect(got.notes.length).toBe(5000);

    const key = 'vatrom' as never;
    const w2 = await mockB.properties.updatePersonalStatus(pid, { check: { key, confirmed: true, note: 'sjekket' } });
    const g2 = await sb.properties.updatePersonalStatus(pid, { check: { key, confirmed: true, note: 'sjekket' } });
    expect(Object.keys(g2.checks)).toEqual(Object.keys(w2.checks));
    expect(g2.checks[key as string].note).toBe('sjekket');
    const g3 = await sb.properties.updatePersonalStatus(pid, { check: { key, confirmed: false } });
    expect(g3.checks).toEqual({});
    expect(await code(sb.properties.updatePersonalStatus('00000000-0000-4000-8000-0000000000dd', { favorite: true }))).toBe('not_found');
    expect(await code(sb.properties.updatePersonalStatus(state.userProperties.find((l) => l.userId === ADA && !state.userProperties.some((m) => m.userId === BJORN && m.propertyId === l.propertyId))!.propertyId, { favorite: true }))).toBe('not_found');
  });

  it('klienten kan ikke endre felt som eies av backend (analyzed_at), selv utenom repositoryet', async () => {
    const client = await createUserClient(backend, BJORN);
    const r = await client.from('user_properties').update({ analyzed_at: new Date().toISOString() }).eq('user_id', BJORN).select('id');
    expect(r.error?.code).toBe('42501');
  });

  it('archiveMine arkiverer og gjenoppretter; removeMine fjerner bare brukerens egne rader (scenarioer følger med, felles data består)', async () => {
    const E = await backend.createUser('fjerner@rls-test.invalid');
    const link = state.userProperties.find((l) => l.userId === ADA && !l.archivedAt)!;
    const adaSc = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === link.propertyId)!;
    await backend.sql(`insert into public.user_properties (user_id, property_id) values ('${E}', '${link.propertyId}')`);
    const sb = repos(await createUserClient(backend, E, 'fjerner@rls-test.invalid'));
    const created = await sb.scenarios.create(link.propertyId, { name: 'Min', analysisId: adaSc.analysisId, values: adaSc.values });
    const archived = await sb.properties.archiveMine(link.propertyId);
    expect(archived.archivedAt).not.toBeNull();
    expect((await sb.properties.listMine()).length).toBe(0);
    expect((await sb.properties.listMine({ includeArchived: true })).length).toBe(1);
    expect((await sb.properties.archiveMine(link.propertyId, false)).archivedAt).toBeNull();
    await sb.properties.removeMine(link.propertyId);
    expect(await code(sb.properties.removeMine(link.propertyId))).toBe('not_found');
    const left = await backend.query<{ n: number }>(`select (select count(*) from public.scenarios where id = '${created.id}')::int + (select count(*) from public.user_properties where user_id = '${E}')::int as n`);
    expect(left[0].n).toBe(0);
    // Adas rader og de felles dataene er urørt.
    const ada = await backend.query<{ n: number }>(`select (select count(*) from public.scenarios where id = '${adaSc.id}')::int + (select count(*) from public.properties where id = '${link.propertyId}')::int as n`);
    expect(ada[0].n).toBe(2);
  });
});

describe('feil og ugyldige data gir kontrollerte feil – aldri tomme eller korrupte data', () => {
  it('korrupte scenarioverdier i databasen gir en forståelig valideringsfeil (uten verdier i detaljene)', async () => {
    const F = await backend.createUser('korrupt@rls-test.invalid');
    const link = state.userProperties.find((l) => l.userId === ADA)!;
    const sc = state.scenarios.find((s) => s.ownerId === ADA && s.propertyId === link.propertyId)!;
    await backend.sql(`insert into public.user_properties (user_id, property_id) values ('${F}', '${link.propertyId}')`);
    await backend.sql(`insert into public.scenarios (owner_id, property_id, analysis_id, analysis_version, name, "values") values ('${F}', '${link.propertyId}', '${sc.analysisId}', ${sc.analysisVersion}, 'Ødelagt', '{"purchasePrice": "hemmelig tekst"}')`);
    const sb = repos(await createUserClient(backend, F, 'korrupt@rls-test.invalid'));
    let err: ServiceError | null = null;
    try {
      await sb.scenarios.list(link.propertyId);
    } catch (e) {
      err = e as ServiceError;
    }
    expect(err?.code).toBe('validation');
    expect(err?.message).toMatch(/uventet format/);
    expect(JSON.stringify(err?.details)).not.toContain('hemmelig tekst');
    expect(await code(sb.properties.listMine({ includeArchived: true }))).toBe('validation');
  });

  it('databasefeil og nettverksfeil gir ServiceError, ikke tom liste', async () => {
    const sb = repos(await createUserClient(backend, ADA));
    // supabase-js kaster ikke ved nettverksfeil; den gir { data: null, error } – slik gjør også denne klienten.
    const failing = { data: null, status: 0, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' } };
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'is', 'neq', 'limit', 'insert', 'update', 'delete', 'maybeSingle']) builder[m] = () => builder;
    builder.then = (resolve: (v: unknown) => unknown) => resolve(failing);
    const broken = repos({ auth: { getSession: async () => ({ data: { session: { user: { id: ADA } } }, error: null }) }, from: () => builder } as never);
    expect(await code(broken.scenarios.list(idOf(state.properties[0].finnId)))).toBe('unavailable');
    expect(await code(broken.properties.listMine())).toBe('unavailable');
    expect(await code(broken.analysis.getAnalysis('00000000-0000-4000-8000-0000000000ee'))).toBe('unavailable');
    // Klienten selv lar seg ikke laste (f.eks. pakken kunne ikke hentes).
    const noClient = new SupabasePropertyRepository({ getClient: async () => { throw new Error('Failed to fetch dynamically imported module'); }, clock: new ManualClock(NOW.toISOString()) });
    expect(await code(noClient.listMine())).toBe('unavailable');
    void sb;
  });

  it('ikke innlogget: not_authenticated', async () => {
    const client = createAnonClient(backend);
    const sb = repos(client);
    expect(await code(sb.properties.listMine())).toBe('not_authenticated');
    expect(await code(sb.scenarios.list(idOf(state.properties[0].finnId)))).toBe('not_authenticated');
  });

  it('skriveoperasjoner varsler appen (events), slik at lister og sider hentes på nytt', async () => {
    const sb = repos(await createUserClient(backend, BJORN));
    const pid = state.userProperties.find((l) => l.userId === BJORN && !l.archivedAt)!.propertyId;
    const before = changed.length;
    await sb.properties.updatePersonalStatus(pid, { favorite: false });
    expect(changed.length).toBe(before + 1);
  });
});

describe('produksjonskomposisjonen: skriving varsler appen', () => {
  it('scenario- og objektendringer gjennom createSupabaseServices utløser events (så Oversikt og objektsiden hentes på nytt)', async () => {
    const client = await createUserClient(backend, ADA, DEMO_USERS.ada.email);
    const services = createSupabaseServices({ config: { url: backend.url, publishableKey: backend.publishableKey }, getClient: async () => client as never, clock: new ManualClock(NOW.toISOString()), redirect: null, redirectUrl: () => '' });
    let notified = 0;
    services.events.subscribe(() => notified++);
    await new Promise((r) => setTimeout(r, 20));
    notified = 0;
    const pid = state.userProperties.find((l) => l.userId === ADA && !l.archivedAt)!.propertyId;
    const sc = (await services.scenarios.list(pid)).find((x) => !x.locked)!; // et eventuelt låst scenario (fra en tidligere test) kan ikke endres
    const renamed = await services.scenarios.update(sc.id, { name: `${sc.name} x` });
    await new Promise((r) => setTimeout(r, 20));
    expect(notified).toBe(1);
    expect(renamed.name).toBe(`${sc.name} x`);
    await services.properties.updatePersonalStatus(pid, { favorite: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(notified).toBe(2);
    await services.scenarios.update(sc.id, { name: sc.name }); // rydder opp
    expect(await services.scenarios.update(sc.id, {})).toMatchObject({ name: sc.name }); // tom patch skriver ikke
    await new Promise((r) => setTimeout(r, 20));
    expect(notified).toBe(3);
  });
});

describe('typer: valgfrie felt', () => {
  it('Scenario.locked finnes bare når scenarioet er låst', () => {
    const s: Scenario = state.scenarios[0];
    expect(s.locked).toBeUndefined();
  });
});
