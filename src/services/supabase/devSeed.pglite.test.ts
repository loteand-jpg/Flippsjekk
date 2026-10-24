import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeed, DEMO_USERS } from '../../data/seed';
import { ManualClock } from '../../lib/clock';
import { devSeedScript, insertSql, SEED_USER_PLACEHOLDER } from './dev/devSeed';
import { createPgliteBackend, createUserClient, type PgliteBackend } from './dev/pgliteBackend';
import { SupabasePropertyRepository } from './propertyRepository';
import { SupabaseScenarioRepository } from './scenarioRepository';

/**
 * Utviklingsseed (scripts/devSeed.ts): SQL-teksten som en person med tilgang kjører i utviklingsprosjektet for å få data til Oversikt og scenarioflyten
 * (klienten kan ikke selv opprette objektlisten, migrasjon 9). Testen kjører den GENERERTE teksten mot PGlite med migrasjonene.
 */
const NOW = new Date('2026-10-22T10:00:00.000Z');
const state = createSeed(NOW);
const ADA = DEMO_USERS.ada.id;
const own = state.userProperties.filter((l) => l.userId === ADA).map((l) => state.properties.find((p) => p.id === l.propertyId)!.finnId);

let backend: PgliteBackend;
beforeAll(async () => {
  backend = await createPgliteBackend();
}, 120_000);
afterAll(async () => {
  await backend?.close();
});

describe('devSeedScript', () => {
  const script = devSeedScript(state, "o'brien@eksempel.no", { sourceUserId: ADA, finnIds: own.slice(0, 2) });

  it('er ren SQL-tekst: bare insert/update, ingen sletting, ingen rettighetsendring, ingen hemmeligheter, og e-posten er sitert trygt', () => {
    expect(script).toMatch(/^-- Flippsjekk: utviklingsdata/);
    expect(script).toMatch(/\nbegin;\n/);
    expect(script).toMatch(/\ncommit;\n$/);
    expect(script).not.toMatch(/\b(delete|drop|truncate|grant|revoke|alter|create)\b\s/i);
    expect(script).not.toMatch(/service_role|sb_secret_|eyJ[A-Za-z0-9_-]{15,}\./);
    expect(script).toContain("lower('o''brien@eksempel.no')");
    // Plassholderen finnes bare i JSON-teksten og erstattes ved kjøring.
    expect(script).toContain(`replace($flippsjekk$`);
    expect(script).toContain(SEED_USER_PLACEHOLDER);
    for (const line of script.split('\n').filter((l) => /^(insert|update) /.test(l))) {
      expect(line).toMatch(/^insert into public\.(properties|property_snapshots|analyses|viewings|user_properties|scenarios|private_events|calendar_overrides|user_risks) |^update public\.user_properties set primary_scenario_id = /);
    }
    expect(script.match(/on conflict do nothing;/g)!.length).toBeGreaterThanOrEqual(6);
  });

  it('avviser farlige verdier i identifikatorer', () => {
    expect(() => insertSql('properties; drop table x', [{ a: 1 }])).toThrow(/Ugyldig tabellnavn/);
    expect(() => insertSql('properties', [{ 'a"; drop': 1 }])).toThrow(/Ugyldig kolonnenavn/);
    expect(() => insertSql('properties', [{ id: 'x$flippsjekk$y' }])).toThrow(/avgrenseren/);
  });

  it('feiler tydelig og uten å skrive noe når brukeren ikke finnes i auth.users', async () => {
    await expect(backend.sql(devSeedScript(state, 'finnes-ikke@eksempel.no', { sourceUserId: ADA, finnIds: own.slice(0, 1) }))).rejects.toThrow(/Fant ingen bruker med e-post finnes-ikke@eksempel\.no/);
    await backend.sql('rollback;').catch(() => undefined);
    const n = await backend.query<{ n: number }>('select count(*)::int as n from public.properties');
    expect(n[0].n).toBe(0);
  });

  it('kjørt for en bruker (slått opp på e-post): riktige rader til riktig bruker, og repositoryene leser dem som vanlig', async () => {
    const email = 'seed-bruker@eksempel.no';
    const uid = await backend.createUser(email);
    const finnIds = own.slice(0, 3);
    await backend.sql(devSeedScript(state, email, { sourceUserId: ADA, finnIds }));

    const links = await backend.query<{ user_id: string; primary_scenario_id: string | null }>('select user_id, primary_scenario_id from public.user_properties');
    expect(links).toHaveLength(3);
    expect(links.every((l) => l.user_id === uid)).toBe(true); // Adas id (kilden) ble byttet ut med brukerens
    expect(links.every((l) => l.primary_scenario_id !== null)).toBe(true);
    const owners = await backend.query<{ owner_id: string }>('select distinct owner_id from public.scenarios');
    expect(owners).toEqual([{ owner_id: uid }]);

    const client = await createUserClient(backend, uid, email);
    const deps = { getClient: async () => client as never, clock: new ManualClock(NOW.toISOString()) };
    const repo = new SupabasePropertyRepository(deps);
    const items = await repo.listMine({ includeArchived: true });
    expect(items.map((i) => i.property.finnId).sort()).toEqual([...finnIds].sort());
    expect(items.every((i) => i.primaryScenario !== null && i.latestAnalysis !== null && i.link.userId === uid)).toBe(true);
    const scen = await new SupabaseScenarioRepository(deps).list(items[0].property.id);
    expect(scen.length).toBeGreaterThan(0);
  });

  it('kan kjøres to ganger uten å endre noe (idempotent)', async () => {
    const email = 'seed-bruker@eksempel.no';
    const count = () => backend.query<{ n: number }>('select (select count(*) from public.properties)::int + (select count(*) from public.scenarios)::int + (select count(*) from public.user_properties)::int + (select count(*) from public.analyses)::int as n');
    const before = (await count())[0].n;
    await backend.sql(devSeedScript(state, email, { sourceUserId: ADA, finnIds: own.slice(0, 3) }));
    expect((await count())[0].n).toBe(before);
  });

  it('en annen bruker får egne rader, mens felles eiendomsdata deles (ikke duplisert) og privat data aldri går på tvers', async () => {
    const email = 'seed-bruker-2@eksempel.no';
    const uid2 = await backend.createUser(email);
    const props = (await backend.query<{ n: number }>('select count(*)::int as n from public.properties'))[0].n;
    await backend.sql(devSeedScript(state, email, { sourceUserId: ADA, finnIds: own.slice(0, 2) }));
    expect((await backend.query<{ n: number }>('select count(*)::int as n from public.properties'))[0].n).toBe(props); // samme felles eiendommer
    const mine = await backend.query<{ n: number }>('select count(*)::int as n from public.scenarios where owner_id = $1', [uid2]);
    expect(mine[0].n).toBeGreaterThan(0);
    const client = await createUserClient(backend, uid2, email);
    const repo = new SupabaseScenarioRepository({ getClient: async () => client as never, clock: new ManualClock(NOW.toISOString()) });
    const link = (await backend.query<{ property_id: string }>('select property_id from public.user_properties where user_id = $1 limit 1', [uid2]))[0];
    const names = (await repo.list(link.property_id)).map((s) => s.name);
    expect(names.length).toBeGreaterThan(0);
  });
});
