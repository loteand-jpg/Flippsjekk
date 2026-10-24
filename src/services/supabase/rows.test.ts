import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeed, DEMO_USERS } from '../../data/seed';
import { ServiceError } from '../types';
import { buildDevSeed } from './dev/devSeed';
import { createPgliteBackend, testJwt, type PgliteBackend } from './dev/pgliteBackend';
import {
  AnalysisRowSchema,
  analysisFromRow,
  analysisMetaFromRow,
  calendarOverrideFromRow,
  privateEventFromRow,
  propertyFromRow,
  scenarioFromRow,
  SELECT,
  snapshotFromRow,
  TABLES,
  userPropertyFromRow,
  userRiskFromRow,
  viewingFromRow,
} from './rows';

const NOW = new Date('2026-10-22T10:00:00.000Z');
const ADA = DEMO_USERS.ada.id;

let backend: PgliteBackend;
const state = createSeed(NOW);

/** Henter rader slik PostgREST ville gjort det for brukeren: JSON-rader gjennom emulatoren (ekte RLS). */
async function fetchRows(table: string, select: string, userId: string, extra = ''): Promise<unknown[]> {
  const res = await backend.handle({
    method: 'GET',
    url: `${backend.url}/rest/v1/${table}?select=${select}${extra}`,
    headers: { authorization: `Bearer ${testJwt(userId)}`, apikey: backend.publishableKey },
  });
  expect(res.status, res.body).toBe(200);
  return JSON.parse(res.body) as unknown[];
}

beforeAll(async () => {
  backend = await createPgliteBackend();
  await backend.createUser(DEMO_USERS.ada.email, ADA);
  await backend.createUser(DEMO_USERS.bjorn.email, DEMO_USERS.bjorn.id);
  const seed = buildDevSeed(state, ADA, { sourceUserId: ADA });
  for (const stmt of seed.statements) await backend.sql(stmt);
}, 120_000);
afterAll(async () => {
  await backend?.close();
});

describe('kolonner: det vi leser finnes i det migrerte skjemaet, og ingen kolonner er glemt', () => {
  for (const [table, schema] of Object.entries(TABLES)) {
    it(table, async () => {
      const cols = await backend.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [table]);
      const inDb = cols.map((c) => c.column_name).sort();
      const inCode = Object.keys(schema.shape).sort();
      expect(inCode, `kolonnene i rad-skjemaet for ${table} må være nøyaktig kolonnene i tabellen`).toEqual(inDb);
    });
  }

  it('SELECT-listene er utledet av rad-skjemaene', () => {
    expect(SELECT.analyses.split(',').sort()).toEqual(Object.keys(AnalysisRowSchema.shape).sort());
    expect(SELECT.analysis_meta.split(',')).not.toContain('estimates');
  });
});

describe('demodata → database → rader → domene (rundtur mot det ekte skjemaet)', () => {
  const strip = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
  /** Valgfrie felt som er `null` i databasen og utelatt i domenet teller som like. */
  const norm = <T extends Record<string, unknown>>(o: T, optionalNullKeys: string[]): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...(strip(o) as Record<string, unknown>) };
    for (const k of optionalNullKeys) if (out[k] === null || out[k] === undefined) delete out[k];
    return out;
  };
  const byId = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x]));

  it('seed-datasettet kom inn i databasen uten å bryte noen constraint', async () => {
    const n = await backend.query<{ n: string }>(`select count(*)::text as n from public.user_properties where user_id = $1`, [ADA]);
    expect(Number(n[0].n)).toBe(12); // Adas 12 objekter
  });

  it('properties', async () => {
    const mapped = (await fetchRows('properties', SELECT.properties, ADA)).map(propertyFromRow);
    const expected = state.properties.filter((p) => state.userProperties.some((l) => l.userId === ADA && l.propertyId === p.id));
    expect(mapped.length).toBe(expected.length);
    expect(byId(mapped)).toEqual(byId(expected));
  });

  it('property_snapshots', async () => {
    const mapped = (await fetchRows('property_snapshots', SELECT.property_snapshots, ADA)).map(snapshotFromRow);
    const expected = state.snapshots.filter((s) => state.userProperties.some((l) => l.userId === ADA && l.propertyId === s.propertyId));
    expect(mapped.length).toBe(expected.length);
    expect(byId(mapped)).toEqual(byId(expected));
  });

  it('viewings', async () => {
    const mapped = (await fetchRows('viewings', SELECT.viewings, ADA)).map(viewingFromRow);
    const expected = state.viewings.filter((v) => state.userProperties.some((l) => l.userId === ADA && l.propertyId === v.propertyId));
    expect(mapped.length).toBe(expected.length);
    expect(byId(mapped)).toEqual(byId(expected));
  });

  it('analyses (hele analysen, alle jsonb-felt) – og metadata uten de tunge feltene', async () => {
    const rows = await fetchRows('analyses', SELECT.analyses, ADA);
    const mapped = rows.map(analysisFromRow);
    const expected = state.analyses.filter((a) => a.visibility === 'shared' && a.status !== 'draft' && state.userProperties.some((l) => l.userId === ADA && l.propertyId === a.propertyId));
    expect(mapped.length).toBe(expected.length);
    const optional = ['analysisKind', 'derivedFromVersion', 'rawImport', 'unmappedFields', 'history'];
    const got = Object.fromEntries(mapped.map((a) => [a.id, norm(a as never, optional)]));
    const want = Object.fromEntries(expected.map((a) => [a.id, norm(a as never, optional)]));
    expect(got).toEqual(want);
    const meta = (await fetchRows('analyses', SELECT.analysis_meta, ADA)).map(analysisMetaFromRow);
    expect(meta.length).toBe(expected.length);
    expect(Object.keys(meta[0])).not.toContain('estimates');
  });

  it('user_properties (egen liste, med checks og primærscenario)', async () => {
    const mapped = (await fetchRows('user_properties', SELECT.user_properties, ADA)).map(userPropertyFromRow);
    const expected = state.userProperties.filter((l) => l.userId === ADA);
    expect(mapped.length).toBe(expected.length);
    const optional = ['label', 'analyzedAt'];
    // `updatedAt` settes av triggeren set_updated_at når seeden setter primærscenarioet etter at scenarioene finnes – databasen eier det feltet.
    const withoutUpdated = (x: Record<string, unknown>) => {
      const { updatedAt, ...rest } = x;
      expect(Date.parse(updatedAt as string)).not.toBeNaN();
      return rest;
    };
    expect(Object.fromEntries(mapped.map((x) => [x.id, withoutUpdated(norm(x as never, optional))]))).toEqual(
      Object.fromEntries(expected.map((x) => [x.id, withoutUpdated(norm(x as never, optional))])),
    );
    // Alle lenker som hadde et primærscenario i demodata har det også i databasen (sammensatt fremmednøkkel eier + eiendom).
    expect(mapped.filter((x) => x.primaryScenarioId).length).toBe(expected.filter((x) => x.primaryScenarioId).length);
  });

  it('scenarios (verdier som jsonb, låst bare når det er låst)', async () => {
    const mapped = (await fetchRows('scenarios', SELECT.scenarios, ADA)).map(scenarioFromRow);
    const expected = state.scenarios.filter((s) => s.ownerId === ADA);
    expect(mapped.length).toBe(expected.length);
    expect(byId(mapped)).toEqual(byId(expected));
  });

  it('user_risks, private_events og calendar_overrides', async () => {
    const risks = (await fetchRows('user_risks', SELECT.user_risks, ADA)).map(userRiskFromRow);
    expect(byId(risks)).toEqual(byId(state.userRisks.filter((r) => r.userId === ADA)));
    const events = (await fetchRows('private_events', SELECT.private_events, ADA)).map(privateEventFromRow);
    expect(byId(events)).toEqual(byId(state.privateEvents.filter((e) => e.userId === ADA)));
    const overrides = (await fetchRows('calendar_overrides', SELECT.calendar_overrides, ADA)).map(calendarOverrideFromRow);
    expect(byId(overrides)).toEqual(byId(state.calendarOverrides.filter((o) => o.userId === ADA)));
    expect(events.length + overrides.length).toBeGreaterThan(0);
  });

  it('Bjørn (annen bruker) ser ingenting av Adas private data og bare sine egne eiendommer', async () => {
    const B = DEMO_USERS.bjorn.id;
    expect(await fetchRows('user_properties', SELECT.user_properties, B)).toEqual([]);
    expect(await fetchRows('scenarios', SELECT.scenarios, B)).toEqual([]);
    expect(await fetchRows('properties', SELECT.properties, B)).toEqual([]); // ingen rader i egen liste ennå → ingen eiendommer
    expect(await fetchRows('analyses', SELECT.analyses, B)).toEqual([]);
  });
});

describe('ugyldige data fra databasen gir kontrollert feil', () => {
  it('manglende kolonne (rad-nivå) og ugyldig verdi (domene-nivå)', () => {
    const good = { id: 'p', finn_id: '123456', canonical_url: 'https://x.no/1', address: 'A', postal_code: null, city: 'C', district: null, municipality: 'M', country_code: 'NO', property_type: 'leilighet', tenure: 'selveier', data_origin: 'demo', created_at: '2026-10-22T10:00:00+00:00' };
    expect(propertyFromRow(good).createdAt).toBe('2026-10-22T10:00:00.000Z');
    for (const [bad, stage] of [
      [{ ...good, city: undefined }, 'rad'],
      [{ ...good, property_type: 'slott' }, 'domene'],
      [{ ...good, finn_id: '12' }, 'domene'],
      [null, 'rad'],
    ] as const) {
      let caught: unknown;
      try {
        propertyFromRow(bad);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ServiceError);
      expect((caught as ServiceError).code).toBe('validation');
      expect((caught as ServiceError).details).toMatchObject({ table: 'properties', stage });
      expect(JSON.stringify((caught as ServiceError).details)).not.toContain('slott'); // verdier lekker ikke
    }
  });

  it('null blir aldri 0: ukjente tall forblir null', () => {
    const snap = snapshotFromRow({
      id: 's', property_id: 'p', version: 1, observed_at: '2026-10-22T10:00:00+00:00', fetched_at: '2026-10-22T10:00:00+00:00', source_url: null, origin: 'demo',
      asking_price: null, shared_debt: null, listing_total_incl_costs: null, monthly_common_costs: null, area_bra_i: null, rooms: null, bedrooms: null, floor: null,
      build_year: null, plot_area: null, sale_status: 'ukjent', sale_status_note: null, energy_label: null, fact_sources: {},
    });
    expect([snap.askingPrice, snap.sharedDebt, snap.areaBRAi, snap.rooms, snap.buildYear]).toEqual([null, null, null, null, null]);
  });

  it('tall som kommer som tekst (numeric) godtas, ikke-tall avvises', () => {
    const base = { id: 's', property_id: 'p', version: '2', observed_at: '2026-10-22T10:00:00+00:00', fetched_at: '2026-10-22T10:00:00+00:00', source_url: null, origin: 'demo', asking_price: '2950000.00', shared_debt: null, listing_total_incl_costs: null, monthly_common_costs: null, area_bra_i: '54.50', rooms: 2, bedrooms: 1, floor: null, build_year: null, plot_area: null, sale_status: 'aktiv', sale_status_note: null, energy_label: null, fact_sources: {} };
    const ok = snapshotFromRow(base);
    expect([ok.version, ok.askingPrice, ok.areaBRAi]).toEqual([2, 2_950_000, 54.5]);
    expect(() => snapshotFromRow({ ...base, asking_price: 'mye' })).toThrow(ServiceError);
  });
});
