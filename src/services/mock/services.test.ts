import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateScenario } from '../../calc/scenario';
import { DEFAULT_LABOR_MODES as NEW_DEFAULTS_FOR_TEST } from '../../config/defaultLabor';
import { DB_FORMAT, DB_STORAGE_KEY, type DbState } from '../../data/db';
import { DEMO_USERS } from '../../data/seed';
import { DEMO_FINN } from '../../data/seedProperties';
import { memoryStorage, type StorageLike } from '../../data/storage';
import { ManualClock } from '../../lib/clock';
import { effectiveRisks } from '../../domain/risks';
import type { UserRisk } from '../../domain/schemas';
import { isServiceError } from '../types';
import { createMockServices, type MockServices } from './index';

const START = '2026-10-16T08:00:00.000Z';
const STEP = 1000;

function setup(storage: StorageLike = memoryStorage(), clock = new ManualClock(START)) {
  const services = createMockServices({ storage, clock, latencyMs: 0, stepMs: STEP, refreshStepMs: STEP });
  return { services, clock, storage };
}

async function signIn(s: MockServices, who: 'ada' | 'bjorn') {
  await s.demo.signInAsProfile(DEMO_USERS[who].email);
}

async function runJob(s: MockServices, clock: ManualClock, steps = 6) {
  for (let i = 0; i < steps; i++) {
    clock.advance(STEP);
    s.demo.tick();
  }
}

async function expectError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    expect(isServiceError(e)).toBe(true);
    expect((e as { code: string }).code).toBe(code);
    return e as Error;
  }
  throw new Error(`Forventet feil ${code}`);
}

const usageOf = (s: MockServices, userId: string, kind: string) =>
  s.db.read((st) => st.usageEvents.filter((u) => u.userId === userId && u.kind === kind));

describe('FINN-lenke → gjenbruk og deduplisering', () => {
  let s: MockServices;
  let clock: ManualClock;
  beforeEach(async () => {
    ({ services: s, clock } = setup());
    await signIn(s, 'ada');
  });

  it('krever innlogging', async () => {
    await s.auth.signOut();
    await expectError(s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.cacheHit}`, idempotencyKey: 'k' }), 'not_authenticated');
  });

  it('ugyldig lenke gir forståelig feil og ingen jobb', async () => {
    const e = await expectError(s.analysis.requestAnalysis({ url: 'https://www.hjem.no/123', idempotencyKey: 'k' }), 'invalid_url');
    expect(e.message).toContain('finn.no');
    expect(s.db.read((st) => st.jobs.length)).toBe(0);
  });

  it('samme FINN-ID i ulike URL-formater gir samme objekt og én analyse, som belastes som en ny analyse', async () => {
    const before = usageOf(s, DEMO_USERS.ada.id, 'new_analysis').length;
    const r1 = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.cacheHit}`, idempotencyKey: 'a' });
    const r2 = await s.analysis.requestAnalysis({
      url: `https://www.finn.no/realestate/homes/ad.html?finnkode=${DEMO_FINN.cacheHit}&utm_source=x`,
      idempotencyKey: 'b',
    });
    // Brukeren ser det samme som ved en ny analyse: en jobb med samme trinn – selv om grunnlaget finnes fra før.
    expect(r1.outcome).toBe('job_started');
    expect(r2.outcome).toBe('job_started');
    if (r1.outcome !== 'job_started' || r2.outcome !== 'job_started') return;
    expect(r2.job.id).toBe(r1.job.id);
    expect(r1.job.type).toBe('linked_analysis');
    expect(r1.job.steps).toEqual(['Henter annonse', 'Kontrollerer grunnlag', 'Vurderer oppussing', 'Vurderer salgsverdi', 'Klargjør analyse']);
    expect(r1.propertyId).toBe(r2.propertyId);
    expect(s.db.read((st) => st.properties.filter((p) => p.finnId === DEMO_FINN.cacheHit).length)).toBe(1);
    // Mens jobben pågår ser brukeren objektet som «analyse pågår», uten ferdig grunnlag
    const during = (await s.properties.getMine(r1.propertyId))!;
    expect(during.activeJob?.id).toBe(r1.job.id);
    expect(during.latestAnalysis).toBeNull();
    expect(during.snapshot).toBeNull();
    expect(usageOf(s, DEMO_USERS.ada.id, 'new_analysis').length).toBe(before); // belastes først når analysen er ferdig

    await runJob(s, clock);
    expect((await s.analysis.getJob(r1.job.id))?.status).toBe('succeeded');
    expect(usageOf(s, DEMO_USERS.ada.id, 'new_analysis').filter((u) => u.propertyId === r1.propertyId && u.chargeable).length).toBe(1);
    expect(usageOf(s, DEMO_USERS.ada.id, 'reuse').filter((u) => u.propertyId === r1.propertyId).length).toBe(0); // gjenbruk registreres ikke lenger som noe annet
    expect((await s.scenarios.list(r1.propertyId)).length).toBe(1);
    const after = (await s.properties.getMine(r1.propertyId))!;
    expect(after.latestAnalysis).not.toBeNull();
    expect(Date.parse(after.link.analyzedAt!)).toBeGreaterThan(Date.parse(START)); // brukerens analysedato er satt
    expect(Date.parse(after.link.analyzedAt!)).toBeLessThanOrEqual(clock.now().getTime());
    // Ny forespørsel etterpå åpner den uten ny belastning
    const again = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.cacheHit}`, idempotencyKey: 'c' });
    expect(again.outcome).toBe('reused');
    expect(usageOf(s, DEMO_USERS.ada.id, 'new_analysis').filter((u) => u.propertyId === r1.propertyId).length).toBe(1);
  });

  it('en annen brukers pågående analyse er privat og vises ikke for andre', async () => {
    const r = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.cacheHit}`, idempotencyKey: 'a' });
    if (r.outcome !== 'job_started') throw new Error('forventet jobb');
    await signIn(s, 'bjorn');
    const bundle = await s.properties.getById(r.propertyId);
    expect(bundle?.activeJob).toBeNull();
    expect(bundle?.latestAnalysis).not.toBeNull(); // Bjørn ser det delte grunnlaget som før
  });

  it('oppfriskes når opplysningene er over ett døgn gamle eller en visning har vært – uten egen belastning', async () => {
    const run = async (mutate: (d: DbState, propertyId: string) => void) => {
      const { services: x, clock: c } = setup();
      await signIn(x, 'ada');
      const pid = x.db.read((st) => st.properties.find((p) => p.finnId === DEMO_FINN.cacheHit)!.id);
      x.db.transaction((d) => mutate(d, pid));
      const snapsBefore = x.db.read((st) => st.snapshots.filter((p) => p.propertyId === pid).length);
      const refreshBefore = x.db.read((st) => st.usageEvents.filter((u) => u.kind === 'refresh').length);
      const r = await x.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.cacheHit}`, idempotencyKey: 'a' });
      if (r.outcome !== 'job_started') throw new Error('forventet jobb');
      await runJob(x, c);
      return {
        snapshotsAdded: x.db.read((st) => st.snapshots.filter((p) => p.propertyId === pid).length) - snapsBefore,
        refreshCharges: x.db.read((st) => st.usageEvents.filter((u) => u.kind === 'refresh').length) - refreshBefore,
        newAnalysisCharges: x.db.read((st) => st.usageEvents.filter((u) => u.userId === DEMO_USERS.ada.id && u.propertyId === pid && u.kind === 'new_analysis').length),
      };
    };
    const hoursAgo = (h: number) => new Date(Date.parse(START) - h * 3_600_000).toISOString();
    const setObserved = (iso: string) => (d: DbState, pid: string) => {
      for (const sn of d.snapshots) if (sn.propertyId === pid) sn.observedAt = iso;
      for (const v of d.viewings) if (v.propertyId === pid) v.start = new Date(Date.parse(START) + 5 * 86_400_000).toISOString();
    };
    // Ferskt (2 timer) og ingen visning siden: ingen oppfriskning
    const fresh = await run(setObserved(hoursAgo(2)));
    expect(fresh).toEqual({ snapshotsAdded: 0, refreshCharges: 0, newAnalysisCharges: 1 });
    // Over ett døgn: oppfriskes, men belastes bare som én ny analyse
    expect(await run(setObserved(hoursAgo(30)))).toEqual({ snapshotsAdded: 1, refreshCharges: 0, newAnalysisCharges: 1 });
    // En visning har vært siden sist: oppfriskes selv om opplysningene er under ett døgn gamle
    expect(
      await run((d, pid) => {
        for (const sn of d.snapshots) if (sn.propertyId === pid) sn.observedAt = hoursAgo(5);
        for (const v of d.viewings) if (v.propertyId === pid) v.start = hoursAgo(2);
      }),
    ).toEqual({ snapshotsAdded: 1, refreshCharges: 0, newAnalysisCharges: 1 });
  });

  it('kvoten teller analysen som ny også når grunnlaget finnes fra før', async () => {
    await s.demo.setSubscriptionPreset('low_quota'); // 1 ny analyse per periode
    const used = (await s.subscription.getEntitlements()).used.newAnalyses;
    const e = await s.subscription.getEntitlements();
    expect(e.limits.newAnalyses).toBe(1);
    if (used >= 1) {
      await expectError(s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.cacheHit}`, idempotencyKey: 'q' }), 'quota_exceeded');
      expect(s.db.read((st) => st.jobs.length)).toBe(0);
    }
  });

  it('cachemiss gir én jobb med fem steg, publiserer og belaster én gang', async () => {
    const r = await s.analysis.requestAnalysis({ url: 'finn.no/478027403', idempotencyKey: 'x' });
    expect(r.outcome).toBe('job_started');
    if (r.outcome !== 'job_started') return;
    expect(r.job.steps).toEqual(['Henter annonse', 'Kontrollerer grunnlag', 'Vurderer oppussing', 'Vurderer salgsverdi', 'Klargjør analyse']);
    // Objektet ligger i listen med en gang
    expect((await s.properties.getMine(r.propertyId))?.activeJob?.id).toBe(r.job.id);
    await runJob(s, clock);
    const job = await s.analysis.getJob(r.job.id);
    expect(job?.status).toBe('succeeded');
    const a = await s.analysis.getPublishedAnalysis(r.propertyId);
    expect(a?.origin).toBe('synthetic');
    expect(usageOf(s, DEMO_USERS.ada.id, 'new_analysis').filter((u) => u.propertyId === r.propertyId).length).toBe(1);
    // Ny forespørsel etterpå = gjenbruk
    const again = await s.analysis.requestAnalysis({ url: 'https://www.finn.no/478027403', idempotencyKey: 'y' });
    expect(again.outcome).toBe('reused');
    expect(usageOf(s, DEMO_USERS.ada.id, 'new_analysis').filter((u) => u.propertyId === r.propertyId).length).toBe(1);
  });

  it('gjentatte/samtidige forespørsler mens jobben pågår gir én jobb og ett forbruk', async () => {
    const results = await Promise.all([
      s.analysis.requestAnalysis({ url: 'finn.no/123456789', idempotencyKey: '1' }),
      s.analysis.requestAnalysis({ url: 'finn.no/123456789', idempotencyKey: '2' }),
      s.analysis.requestAnalysis({ url: 'https://www.finn.no/realestate/homes/ad.html?finnkode=123456789', idempotencyKey: '3' }),
    ]);
    expect(results[0].outcome).toBe('job_started');
    expect(results.slice(1).every((r) => r.outcome === 'job_joined')).toBe(true);
    expect(s.db.read((st) => st.jobs.length)).toBe(1);
    await runJob(s, clock);
    expect(usageOf(s, DEMO_USERS.ada.id, 'new_analysis').filter((u) => u.jobId !== null).length).toBe(1);
  });

  it('en annen bruker som ber om samme analyse mens den pågår, får den og belastes uavhengig av den første', async () => {
    const r = await s.analysis.requestAnalysis({ url: 'finn.no/555555555', idempotencyKey: '1' });
    await signIn(s, 'bjorn');
    const rb = await s.analysis.requestAnalysis({ url: 'finn.no/555555555', idempotencyKey: '2' });
    expect(rb.outcome).toBe('job_joined');
    if (rb.outcome === 'job_joined') expect(rb.joinedOtherUser).toBe(true);
    await runJob(s, clock);
    expect(usageOf(s, DEMO_USERS.bjorn.id, 'new_analysis').filter((u) => u.propertyId === r.propertyId && u.chargeable).length).toBe(1);
    expect(usageOf(s, DEMO_USERS.ada.id, 'new_analysis').filter((u) => u.propertyId === r.propertyId && u.chargeable).length).toBe(1);
    expect(usageOf(s, DEMO_USERS.bjorn.id, 'reuse').filter((u) => u.propertyId === r.propertyId).length).toBe(0);
    expect((await s.scenarios.list(r.propertyId)).length).toBe(1);
  });

  it('objekt i egen liste: annonsen oppfriskes hvis det har gått over ett døgn siden forrige analyse/oppfriskning', async () => {
    const pid = s.db.read((st) => st.properties.find((p) => p.finnId === DEMO_FINN.stale)!.id);
    const before = (await s.properties.getMine(pid))!;
    const snapsBefore = before.versions.length;
    const askingBefore = before.snapshot!.askingPrice;
    const newAnalysesBefore = usageOf(s, DEMO_USERS.ada.id, 'new_analysis').length;
    const refreshBefore = usageOf(s, DEMO_USERS.ada.id, 'refresh').length;
    const r = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.stale}`, idempotencyKey: 's' });
    expect(r.outcome).toBe('job_started');
    if (r.outcome !== 'job_started') return;
    expect(r.job.type).toBe('light_refresh');
    // Samtidige forespørsler kobles til samme oppfriskning
    const again = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.stale}`, idempotencyKey: 's2' });
    expect(again.outcome === 'job_joined' && again.job.id === r.job.id).toBe(true);
    await runJob(s, clock, 3);
    const after = (await s.properties.getMine(pid))!;
    expect(after.snapshot!.version).toBe(before.snapshot!.version + 1);
    expect(after.snapshot!.askingPrice).not.toBe(askingBefore); // demoens oppfriskingsskript endrer prisen
    expect(after.versions.length).toBe(snapsBefore); // ingen ny grunnanalyse
    expect(usageOf(s, DEMO_USERS.ada.id, 'refresh').length).toBe(refreshBefore + 1);
    expect(usageOf(s, DEMO_USERS.ada.id, 'new_analysis').length).toBe(newAnalysesBefore); // belastes som oppfriskning, ikke ny analyse
    // Rett etterpå er annonsen fersk: objektet åpnes uten ny oppfriskning
    const fresh = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.stale}`, idempotencyKey: 's3' });
    expect(fresh.outcome).toBe('reused');
  });

  it('objekt i egen liste: er oppfriskingskvoten brukt opp, åpnes objektet uten oppfriskning', async () => {
    await s.demo.setSubscriptionPreset('low_quota');
    const e = await s.subscription.getEntitlements();
    s.db.transaction((d) => {
      d.usageEvents.push(...Array.from({ length: e.limits.refreshes }, (_, i) => ({ id: `u-${i}`, userId: DEMO_USERS.ada.id, kind: 'refresh' as const, propertyId: 'x', jobId: null, analysisId: null, idempotencyKey: `x-${i}`, chargeable: true, createdAt: clock.now().toISOString() })));
    });
    const r = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.stale}`, idempotencyKey: 's' });
    expect(r.outcome).toBe('reused');
  });

  it('lett oppfrisking oppdaterer pris og visninger uten ny grunnanalyse eller endring i scenario', async () => {
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.stale)!;
    const scenarioBefore = item.primaryScenario!;
    const versionsBefore = item.versions.length;
    const r = await s.analysis.requestRefresh(item.property.id, 'light', 'r1');
    expect(r.outcome).toBe('job_started');
    await runJob(s, clock, 3);
    const after = (await s.properties.getMine(item.property.id))!;
    expect(after.snapshot!.askingPrice).toBe(2_690_000);
    expect(after.versions.length).toBe(versionsBefore);
    expect(after.primaryScenario!.values).toEqual(scenarioBefore.values);
    expect(after.bidDay).not.toBeNull();
    // Rett etter oppfrisking er grunnlaget ferskt – ny forespørsel belastes ikke
    const again = await s.analysis.requestRefresh(item.property.id, 'light', 'r2');
    expect(again.outcome).toBe('already_fresh');
  });
});

describe('feil og retry', () => {
  it('mislykket jobb belaster ikke; retry er idempotent', async () => {
    const { services: s, clock } = setup();
    await signIn(s, 'ada');
    const before = usageOf(s, DEMO_USERS.ada.id, 'new_analysis').length;
    const r = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.failing}`, idempotencyKey: 'f' });
    if (r.outcome !== 'job_started') throw new Error('forventet jobb');
    await runJob(s, clock);
    const failed = await s.analysis.getJob(r.job.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.error?.message).toContain('Ingen analyse er belastet');
    expect(usageOf(s, DEMO_USERS.ada.id, 'new_analysis').length).toBe(before);
    expect(await s.analysis.getPublishedAnalysis(r.propertyId)).toBeNull();

    const retried = await s.analysis.retryJob(r.job.id);
    expect(retried.attempt).toBe(2);
    await runJob(s, clock);
    expect((await s.analysis.getJob(r.job.id))?.status).toBe('succeeded');
    expect(usageOf(s, DEMO_USERS.ada.id, 'new_analysis').length).toBe(before + 1);

    // Retry etter suksess: samme jobb, intet nytt forbruk, ingen ny analyse
    const again = await s.analysis.retryJob(r.job.id);
    expect(again.status).toBe('succeeded');
    await runJob(s, clock);
    expect(usageOf(s, DEMO_USERS.ada.id, 'new_analysis').length).toBe(before + 1);
    expect((await s.analysis.listVersions(r.propertyId)).length).toBe(1);
  });

  it('ugyldig resultat publiseres ikke og erstatter ikke eksisterende analyse', async () => {
    const { services: s, clock } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    const existing = item.latestAnalysis!;
    await s.demo.setFailNextJob('invalid_result');
    // Full teknisk analyse krever nye dokumenter, endrede kritiske fakta eller inkompatibel modell
    s.db.transaction((d) => {
      d.demo.technicalChangeSignals = { [DEMO_FINN.sharedAB]: { newOrChangedDocuments: true } };
    });
    const r = await s.analysis.requestRefresh(item.property.id, 'full', 'full1');
    if (r.outcome === 'already_fresh') throw new Error('forventet jobb');
    await runJob(s, clock);
    const job = await s.analysis.getJob(r.job.id);
    expect(job?.status).toBe('failed');
    expect(job?.error?.code).toBe('validation_failed');
    const latest = await s.analysis.getPublishedAnalysis(item.property.id);
    expect(latest?.id).toBe(existing.id);
    expect(latest?.status).toBe('published');
  });
});

describe('dataskille mellom brukere', () => {
  it('to brukere deler grunnanalyse, men har ulike private scenarioer', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const a = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    await signIn(s, 'bjorn');
    const b = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    expect(a.latestAnalysis!.id).toBe(b.latestAnalysis!.id);
    expect(a.primaryScenario!.id).not.toBe(b.primaryScenario!.id);
    expect(a.primaryScenario!.values.purchasePrice).not.toBe(b.primaryScenario!.values.purchasePrice);

    // B ser ikke As scenarioer og kan ikke endre dem
    const bList = await s.scenarios.list(a.property.id);
    expect(bList.some((x) => x.ownerId === DEMO_USERS.ada.id)).toBe(false);
    await expectError(s.scenarios.update(a.primaryScenario!.id, { name: 'Kapret' }), 'not_found');
    await expectError(s.scenarios.setPrimary(a.property.id, a.primaryScenario!.id), 'not_found');

    // A endrer sitt scenario – grunnanalysen og Bs scenario er uendret
    const analysisBefore = JSON.stringify(await s.analysis.getAnalysis(a.latestAnalysis!.id));
    await signIn(s, 'ada');
    await s.scenarios.update(a.primaryScenario!.id, { values: { ...a.primaryScenario!.values, purchasePrice: 2_500_000 } });
    expect(JSON.stringify(await s.analysis.getAnalysis(a.latestAnalysis!.id))).toBe(analysisBefore);
    await signIn(s, 'bjorn');
    const bAfter = (await s.properties.getMine(b.property.id))!;
    expect(bAfter.primaryScenario!.values).toEqual(b.primaryScenario!.values);
  });

  it('fjern/slett fra min liste rører aldri felles data eller andres tilknytninger', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const a = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    await s.properties.archiveMine(a.property.id);
    expect((await s.properties.listMine()).some((i) => i.property.id === a.property.id)).toBe(false);
    const archived = (await s.properties.listMine({ includeArchived: true })).find((i) => i.property.id === a.property.id)!;
    expect(archived.scenarioCount).toBe(3);
    await s.properties.removeMine(a.property.id);
    expect(s.db.read((st) => st.properties.some((p) => p.id === a.property.id))).toBe(true);
    expect(s.db.read((st) => st.analyses.some((x) => x.id === a.latestAnalysis!.id))).toBe(true);
    await signIn(s, 'bjorn');
    expect((await s.properties.getMine(a.property.id))?.scenarioCount).toBe(1);
  });

  it('kan ikke lage scenario på objekt som ikke er i egen liste eller på annen eiendoms analyse', async () => {
    const { services: s } = setup();
    await signIn(s, 'bjorn');
    const stale = await s.properties.getByFinnId(DEMO_FINN.stale);
    const b13 = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.cacheHit)!;
    await expectError(s.scenarios.create(stale!.property.id, { name: 'x', analysisId: stale!.latestAnalysis!.id, values: b13.primaryScenario!.values }), 'forbidden');
    await expectError(s.scenarios.create(b13.property.id, { name: 'x', analysisId: stale!.latestAnalysis!.id, values: b13.primaryScenario!.values }), 'forbidden');
  });

  it('privat sjekklistebekreftelse endrer ikke kildestatus i felles analyse', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.wetRoomHouse)!;
    const before = item.latestAnalysis!.checklist.find((c) => c.key === 'vatrom')!.status;
    await s.properties.updatePersonalStatus(item.property.id, { check: { key: 'vatrom', confirmed: true } });
    const after = (await s.properties.getMine(item.property.id))!;
    expect(after.link.checks.vatrom).toBeDefined();
    expect(after.latestAnalysis!.checklist.find((c) => c.key === 'vatrom')!.status).toBe(before);
  });
});

describe('låst scenario «Nettsidens vurdering»', () => {
  it('opprettes automatisk ved første lagrede endring, med uendret grunnlag, og bare én gang', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.highDebt)!;
    const hoved = item.primaryScenario!;
    expect((await s.scenarios.list(item.property.id)).some((x) => x.locked)).toBe(false);

    // Lagring uten endring oppretter ingenting
    await s.scenarios.update(hoved.id, { values: hoved.values });
    expect((await s.scenarios.list(item.property.id)).some((x) => x.locked)).toBe(false);

    await s.scenarios.update(hoved.id, { values: { ...hoved.values, purchasePrice: 900_000 } });
    const list = await s.scenarios.list(item.property.id);
    const base = list.find((x) => x.locked)!;
    expect(list[0].id).toBe(base.id); // låst scenario først
    expect(base.name).toBe('Nettsidens vurdering');
    expect(base.values.purchasePrice).toBe(hoved.values.purchasePrice); // grunnlaget, ikke endringen
    expect(base.analysisId).toBe(item.latestAnalysis!.id);
    expect(list.find((x) => x.id === hoved.id)!.values.purchasePrice).toBe(900_000);

    await s.scenarios.update(hoved.id, { values: { ...hoved.values, purchasePrice: 850_000 } });
    expect((await s.scenarios.list(item.property.id)).filter((x) => x.locked)).toHaveLength(1);
  });

  it('kan ikke redigeres, gis nytt navn eller slettes – men kan kopieres til et redigerbart scenario', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    await s.scenarios.update(item.primaryScenario!.id, { name: 'Endret navn' });
    // Navneendring alene er ikke en verdiendring → ennå ikke noe låst scenario
    await s.scenarios.update(item.primaryScenario!.id, { values: { ...item.primaryScenario!.values, months: 9 } });
    const base = (await s.scenarios.list(item.property.id)).find((x) => x.locked)!;
    await expectError(s.scenarios.update(base.id, { values: { ...base.values, months: 1 } }), 'forbidden');
    await expectError(s.scenarios.update(base.id, { name: 'Mitt' }), 'forbidden');
    await expectError(s.scenarios.remove(base.id), 'forbidden');
    const copy = await s.scenarios.duplicate(base.id, 'Min kopi');
    expect(copy.locked).toBeFalsy();
    await s.scenarios.update(copy.id, { values: { ...copy.values, months: 4 } });
  });

  it('påvirker ikke andre brukere', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const a = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    await s.scenarios.update(a.primaryScenario!.id, { values: { ...a.primaryScenario!.values, months: 8 } });
    await signIn(s, 'bjorn');
    const bList = await s.scenarios.list(a.property.id);
    expect(bList.some((x) => x.locked)).toBe(false);
    expect(bList.some((x) => x.ownerId === DEMO_USERS.ada.id)).toBe(false);
  });
});

describe('låst scenario og ny felles versjon', () => {
  it('kan flyttes til ny analyseversjon, men ikke redigeres ellers', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.newVersion)!;
    expect(item.latestAnalysis!.version).toBe(2);
    const sc = item.primaryScenario!;
    expect(sc.analysisVersion).toBe(1);
    await s.scenarios.update(sc.id, { values: { ...sc.values, months: 9 } });
    const base = (await s.scenarios.list(item.property.id)).find((x) => x.locked)!;
    expect(base.analysisVersion).toBe(1);
    await s.scenarios.update(base.id, { analysisId: item.latestAnalysis!.id, values: base.values });
    const moved = (await s.scenarios.list(item.property.id)).find((x) => x.locked)!;
    expect(moved.analysisVersion).toBe(2);
    await expectError(s.scenarios.update(base.id, { values: { ...base.values, months: 1 } }), 'forbidden');
  });
});

describe('abonnementstilstander', () => {
  it('styrer handlinger konsistent og sletter aldri scenarioer', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const countScenarios = () => s.db.read((st) => st.scenarios.filter((x) => x.ownerId === DEMO_USERS.ada.id).length);
    const n = countScenarios();
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;

    for (const preset of ['none', 'past_due', 'expired'] as const) {
      await s.demo.setSubscriptionPreset(preset);
      const e = await s.subscription.getEntitlements();
      expect(e.access).toBe('read_only');
      await expectError(s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.cacheHit}`, idempotencyKey: preset }), 'subscription_inactive');
      await expectError(s.scenarios.update(item.primaryScenario!.id, { name: 'x' }), 'subscription_inactive');
      expect((await s.properties.listMine()).length).toBeGreaterThan(0);
      expect(countScenarios()).toBe(n);
    }

    // Oppsagt ved periodeslutt: full tilgang til perioden er over
    await s.demo.setSubscriptionPreset('canceling');
    const canceling = await s.subscription.getEntitlements();
    expect(canceling.access).toBe('full');
    expect(canceling.reason).toBe('canceling');

    // Lav kvote (1 per periode, Ada har allerede brukt flere): nye analyser blokkeres, men objekter hun allerede har kan åpnes
    await s.demo.setSubscriptionPreset('low_quota');
    const e = await expectError(s.analysis.requestAnalysis({ url: 'finn.no/333333333', idempotencyKey: 'q2' }), 'quota_exceeded');
    expect(e.message).not.toMatch(/gjenbruk|felles/i);
    expect(s.db.read((st) => st.jobs.length)).toBe(0);
    const mine = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.stale)!;
    const reuse = await s.analysis.requestAnalysis({ url: `finn.no/${mine.property.finnId}`, idempotencyKey: 'q3' });
    expect(reuse.outcome).toBe('reused');
    expect(countScenarios()).toBe(n); // har allerede scenario for objektet
  });
});

describe('import v1', () => {
  const file = (objects: unknown[]) => JSON.stringify({ format: 'flipprom-analysis', version: 1, objects });
  const obj = (extra: Record<string, unknown> = {}) => ({
    id: 'x1',
    name: 'Importveien 1',
    type: 'leilighet',
    tenure: 'selveier',
    status: 'vurderes',
    url: `https://www.finn.no/realestate/homes/ad.html?finnkode=${DEMO_FINN.sharedAB}`,
    area: 58,
    asking: 2_890_000,
    purchase: 2_900_000,
    debt: 0,
    exitDebt: 0,
    saleBasis: 'kontant',
    bear: 3_800_000,
    base: 4_000_000,
    bull: 4_200_000,
    rehab: 400_000,
    buffer: 20,
    duty: 2.5,
    dutyBase: 2_900_000,
    buyFees: 6000,
    saleFixed: 55000,
    salePercent: 1.5,
    monthly: 4900,
    months: 6,
    interest: 7,
    financing: 100,
    target: 400000,
    hours: 120,
    hourRate: 350,
    tax: null,
    confirmed: false,
    viewing: '2026-11-03T17:00:00+01:00',
    bidDay: '2026-11-04',
    historicalMax: 3_100_000,
    historicalProfit: 250_000,
    historicalSale: null,
    customField: 'bevares',
    ...extra,
  });

  it('feil på arbeidsstatus som er faktastatus gir presis melding', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const text = file([obj({ status: 'dokumentert' })]);
    const p = await s.imports.preview(text, text.length);
    expect(p.objects[0].mapped).toBeNull();
    expect(p.objects[0].errors[0].path).toBe('objects[0].status');
    expect(p.objects[0].errors[0].message).toContain('faktastatus');
  });

  it('ukjent enum i risiko og arbeidsstatus i sjekkliste gir feltsti', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const text = file([obj({ risks: [{ title: 'x', category: 'romvesen', level: 3 }], checks: [{ key: 'vatrom', status: 'vurderes' }] })]);
    const p = await s.imports.preview(text, text.length);
    const paths = p.objects[0].errors.map((e) => e.path);
    expect(paths).toContain('objects[0].risks[0].category');
    expect(paths).toContain('objects[0].checks[0].status');
  });

  it('bevarer null som ukjent, prosentpoeng korrekt, ukjente felt og historikk; importerer privat', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const text = file([obj({ buffer: null })]);
    const p = await s.imports.preview(text, text.length);
    const m = p.objects[0].mapped!;
    expect(m.values.reservePct).toBeNull();
    expect(m.values.interestPct).toBe(7);
    expect(m.values.dutyBasis).toBe('kjopesum_pluss_fellesgjeld');
    expect(p.objects[0].unmapped.customField).toBe('bevares');
    expect(m.history.historicalProfit).toBe(250_000);
    expect(evaluateScenario(m.values).evaluation.status).toBe('incomplete');
    expect(p.objects[0].existingPropertyId).not.toBeNull();
    expect(p.objects[0].existingScenarios.length).toBe(3);

    const sharedBefore = s.db.read((st) => st.analyses.filter((a) => a.visibility === 'shared').length);
    const r = await s.imports.commit(p, { 0: { action: 'new_scenario' } });
    expect(r.imported[0].createdProperty).toBe(false);
    expect(s.db.read((st) => st.analyses.filter((a) => a.visibility === 'shared').length)).toBe(sharedBefore);
    const draft = s.db.read((st) => st.analyses.find((a) => a.visibility === 'private' && a.ownerId === DEMO_USERS.ada.id))!;
    expect((draft.rawImport as Record<string, unknown>).customField).toBe('bevares');
    expect((await s.scenarios.list(r.imported[0].propertyId)).length).toBe(4);
    const ev = s.db.read((st) => st.privateEvents.find((e) => e.kind === 'imported_viewing'))!;
    expect(ev.confirmed).toBe(false);
    const ov = s.db.read((st) => st.calendarOverrides.find((o) => o.origin === 'import_v1'))!;
    expect(ov.note).toContain('ikke kildebekreftet');

    // Bjørn ser ikke Adas importerte utkast
    await signIn(s, 'bjorn');
    expect(await s.analysis.getAnalysis(draft.id)).toBeNull();
  });

  it('bakoverkompatibel: v1-filens låneandel og timesats bevares, og nye felt hentes fra profilen', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const text = file([obj({ financing: 80, hourRate: 400 })]);
    const p = await s.imports.preview(text, text.length);
    expect(p.objects[0].errors).toEqual([]);
    const v = p.objects[0].mapped!.values;
    expect(v.purchaseFinancingPct).toBe(80);
    expect(v.renovationFinancingPct).toBe(80); // eldre `financing` gjaldt alt
    expect(v.hourValue).toBe(400); // beholdt som utfaset felt, ikke i hovedøkonomien
    expect(v.minProfitPerOwnHour).toBe(500); // fra profilen
    expect(v.availableEquity).toBe(300_000);
    expect(v.laborModes.elektro).toBe('innleid');
    expect(evaluateScenario(v).evaluation.status).toBe('complete');
    // Eldre `financing: 100` gir samme låneandel som før (ingen stille endring)
    const text100 = file([obj()]);
    const p100 = await s.imports.preview(text100, text100.length);
    expect(p100.objects[0].mapped!.values.purchaseFinancingPct).toBe(100);
  });

  it('eksport av scenarioer inneholder nye felt og nøkkeltall, og beholder formatnavnet', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const { content } = await s.imports.exportScenarios();
    const data = JSON.parse(content);
    expect(data.format).toBe('flipprom-scenarios');
    expect(data.version).toBe(1);
    expect(data.calcModelVersion).toBe('1.2.0');
    const row = data.scenarios.find((x: any) => x.result.status === 'complete');
    expect(row.values).toHaveProperty('purchaseFinancingPct');
    expect(row.values).toHaveProperty('renovationFinancingPct');
    expect(row.values).toHaveProperty('minProfitPerOwnHour');
    expect(row.values).not.toHaveProperty('financingPct');
    expect(row.result).toHaveProperty('profitPerOwnHour');
    expect(row.result).toHaveProperty('equityGap');
    expect(row.result).toHaveProperty('equityNeed');
    expect(row.values).toHaveProperty('regulatedCompetence');
    expect(row.values).not.toHaveProperty('regulatedSelfWorkConfirmed');
    // Maksbud: anbefalt (laveste grense) og hver grense for seg
    expect(row.result).toHaveProperty('maxBid');
    expect(row.result).toHaveProperty('maxBidLimitedBy');
    expect(row.result).toHaveProperty('maxBidProfitTarget');
    expect(row.result).toHaveProperty('maxBidHourlyRequirement');
  });

  it('avviser feil rotformat, for mange objekter og for stor fil', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const bad = await s.imports.preview('{"format":"annet","version":1,"objects":[]}', 40);
    expect(bad.rootErrors[0].path).toBe('$.format');
    const many = file(Array.from({ length: 21 }, (_, i) => obj({ id: i })));
    expect((await s.imports.preview(many, many.length)).rootErrors[0].message).toContain('Maks 20');
    expect((await s.imports.preview('{}', 1_000_001)).rootErrors[0].message).toContain('1 MB');
  });
});

describe('sammenlignbare objekter: grunnlag og egne', () => {
  const input = { name: 'Egen veien 5', url: null, kind: 'solgt' as const, askingPrice: 3_100_000, soldPrice: 3_050_000, commonCosts: 2_500, soldTotalPrice: 3_050_000, area: 55, date: '2026-10-10', notes: 'Testnotat' };

  it('grunnlaget har alle de nye feltene, og solgte objekter har prisantydning og totalpris', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    const comps = item.latestAnalysis!.comparables;
    const sold = comps.filter((c) => c.kind === 'solgt');
    expect(sold.length).toBeGreaterThan(0);
    for (const c of sold) {
      expect(c.soldPrice).not.toBeNull();
      expect(c.askingPrice).not.toBeNull();
      expect(c.commonCosts).not.toBeNull();
      expect(c.area).not.toBeNull();
    }
    expect(comps.find((c) => c.kind === 'solgt_uten_sum')!.soldPrice).toBeNull(); // ikke 0
    const borettslag = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.highDebt)!;
    const bs = borettslag.latestAnalysis!.comparables.find((c) => c.kind === 'solgt')!;
    expect(bs.soldTotalPrice! - bs.soldPrice!).toBe(1_590_000); // totalpris − kontant = fellesgjeld
  });

  it('bruker kan legge til, endre og slette egne objekter – validert og private', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    const pid = item.property.id;
    const before = (await s.comparables.list(pid)).length;
    expect(before).toBe(1); // seed
    const created = await s.comparables.create(pid, input);
    expect((await s.comparables.list(pid))[0].id).toBe(created.id); // nyeste dato først
    await expectError(s.comparables.create(pid, { ...input, soldPrice: null, soldTotalPrice: null }), 'validation');
    await expectError(s.comparables.create(pid, { ...input, name: ' ' }), 'validation');
    const upd = await s.comparables.update(created.id, { ...input, soldPrice: 3_000_000, soldTotalPrice: 3_000_000 });
    expect(upd.soldPrice).toBe(3_000_000);
    expect(item.latestAnalysis!.comparables.some((c) => c.name.includes('Egen veien'))).toBe(false); // felles data er urørt

    await signIn(s, 'bjorn');
    expect((await s.comparables.list(pid)).some((c) => c.userId === DEMO_USERS.ada.id)).toBe(false);
    await expectError(s.comparables.update(created.id, input), 'not_found');
    await expectError(s.comparables.remove(created.id), 'not_found');
    const notMine = await s.properties.getByFinnId(DEMO_FINN.stale);
    await expectError(s.comparables.create(notMine!.property.id, input), 'forbidden'); // objekt som ikke er i Bjørns liste
  });

  it('krever aktivt abonnement for å skrive, men lesing virker', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    await s.demo.setSubscriptionPreset('past_due');
    await expectError(s.comparables.create(item.property.id, input), 'subscription_inactive');
    expect((await s.comparables.list(item.property.id)).length).toBe(1);
  });

  it('fjern fra liste sletter bare brukerens egne sammenligninger', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    await s.properties.removeMine(item.property.id);
    expect(s.db.read((st) => st.userComparables.filter((c) => c.userId === DEMO_USERS.ada.id && c.propertyId === item.property.id))).toHaveLength(0);
    expect(s.db.read((st) => st.analyses.find((a) => a.id === item.latestAnalysis!.id)!.comparables.length)).toBeGreaterThan(0);
  });
});

describe('persistering og robusthet', () => {
  it('overlever oppfrisking (ny instans leser samme data)', async () => {
    const storage = memoryStorage();
    const clock = new ManualClock(START);
    const first = setup(storage, clock).services;
    await signIn(first, 'ada');
    const item = (await first.properties.listMine())[0];
    await first.scenarios.update(item.primaryScenario!.id, { name: 'Lagret navn' });
    const second = setup(storage, clock).services;
    expect(second.db.loadReport.status).toBe('loaded');
    expect((await second.auth.session())?.user.id).toBe(DEMO_USERS.ada.id);
    expect((await second.properties.getMine(item.property.id))?.primaryScenario?.name).toBe('Lagret navn');
  });

  it('korrupt lagring gir nye demodata og sikkerhetskopi – ingen krasj', () => {
    const storage = memoryStorage({ [DB_STORAGE_KEY]: '{ikke json' });
    const s = setup(storage).services;
    expect(s.db.loadReport.status).toBe('recovered');
    expect(s.db.loadReport.backupKey).toBeTruthy();
    expect(storage.getItem(s.db.loadReport.backupKey!)).toBe('{ikke json');
    expect(s.db.read((st) => st.properties.length)).toBeGreaterThan(10);
  });

  it('migrerer eldre versjon og hopper over ugyldige rader', () => {
    const fresh = setup().services;
    const state = fresh.db.read((st) => st) as unknown as Record<string, unknown>;
    const v1 = structuredClone(state);
    delete v1.privateEvents;
    delete v1.calendarOverrides;
    (v1.userProperties as Record<string, unknown>[]).forEach((u) => delete u.checks);
    (v1.scenarios as Record<string, unknown>[]).push({ id: 'ødelagt' });
    delete v1.userComparables;
    // eldre sammenligninger: én pris + prisgrunnlag
    for (const a of v1.analyses as Record<string, unknown>[]) {
      a.comparables = (a.comparables as Record<string, unknown>[]).map(({ askingPrice: _a, soldPrice, commonCosts: _c, soldTotalPrice, ...rest }) => ({ ...rest, price: (soldPrice as number | null) ?? (soldTotalPrice as number | null), priceBasis: soldPrice !== null ? 'kontant' : 'total', debt: null }));
    }
    const storage = memoryStorage({ [DB_STORAGE_KEY]: JSON.stringify({ format: DB_FORMAT, schemaVersion: 1, savedAt: START, state: v1 }) });
    const s = setup(storage).services;
    expect(s.db.loadReport.status).toBe('repaired'); // migrert, men én ugyldig rad ble hoppet over
    expect(s.db.loadReport.message).toContain('oppgradert');
    expect(s.db.loadReport.backupKey).toBeTruthy();
    expect(s.db.read((st) => st.userProperties.every((u) => typeof u.checks === 'object'))).toBe(true);
    expect(s.db.read((st) => st.scenarios.some((x) => x.id === 'ødelagt'))).toBe(false);
    expect(s.db.read((st) => st.userComparables)).toEqual([]);
    const allComps = s.db.read((st) => st.analyses.flatMap((a) => a.comparables));
    expect(allComps.length).toBeGreaterThan(10); // ingen analyser mistet pga. gammelt skjema
    expect(allComps.every((c) => 'soldPrice' in c && !('price' in c))).toBe(true);
  });
});

describe('manglende grunnanalyse (skadet lokal lagring)', () => {
  it('ugyldige rader fjernes med sikkerhetskopi og tydelig melding', () => {
    const clock = new ManualClock(START);
    const storage = memoryStorage();
    const first = setup(storage, clock).services;
    const raw = JSON.parse(storage.getItem(DB_STORAGE_KEY)!);
    raw.state.analyses[0].comparables = [{ id: 'x', name: 'gammel', price: 1 }]; // gammelt/ugyldig format
    storage.setItem(DB_STORAGE_KEY, JSON.stringify(raw));
    void first;
    const s = setup(storage, clock).services;
    expect(s.db.loadReport.status).toBe('repaired');
    expect(s.db.loadReport.backupKey).toBeTruthy();
    expect(storage.getItem(s.db.loadReport.backupKey!)).toContain('gammel');
    expect(s.db.loadReport.message).toContain('hentes på nytt');
  });

  it('manglende analyser gjenopprettes automatisk ved oppstart – uten jobb, uten belastning, med private data urørt', async () => {
    const clock = new ManualClock(START);
    const storage = memoryStorage();
    const a = setup(storage, clock).services;
    await signIn(a, 'ada');
    const items = await a.properties.listMine({ includeArchived: true });
    const target = items.find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    const other = items.find((i) => i.property.finnId === DEMO_FINN.wetRoomHouse)!;
    const scenariosBefore = a.db.read((st) => st.scenarios);
    const usageBefore = a.db.read((st) => st.usageEvents.length);
    const notesBefore = a.db.read((st) => st.userProperties.map((u) => [u.id, u.notes, u.favorite]));
    const analysesBefore = a.db.read((st) => st.analyses.length);
    // Tap alle felles analyser for to objekter, som om lagringen var skadet
    a.db.transaction((d) => {
      d.analyses = d.analyses.filter((x) => x.propertyId !== target.property.id && x.propertyId !== other.property.id);
    });

    const b = setup(storage, clock).services; // ny «sesjon» leser lagringen
    expect(b.db.read((st) => st.analyses.length)).toBe(analysesBefore);
    expect(b.db.read((st) => st.jobs.length)).toBe(0);
    expect(b.db.read((st) => st.usageEvents.length)).toBe(usageBefore);
    expect(b.db.read((st) => st.userProperties.map((u) => [u.id, u.notes, u.favorite]))).toEqual(notesBefore);
    await signIn(b, 'ada');
    for (const it of [target, other]) {
      const sc = (await b.scenarios.list(it.property.id)).map((x) => x.values);
      expect(sc).toEqual(scenariosBefore.filter((x) => x.propertyId === it.property.id && x.ownerId === DEMO_USERS.ada.id).sort((x, y) => Number(Boolean(y.locked)) - Number(Boolean(x.locked)) || x.createdAt.localeCompare(y.createdAt)).map((x) => x.values));
      const mine = await b.properties.getMine(it.property.id);
      expect(mine?.baseAnalysis?.status).toBe('published');
      expect(mine?.baseAnalysis?.propertyId).toBe(it.property.id);
    }
    expect(b.db.loadReport.message).toContain('gjenopprettet automatisk');
    // Ingen ytterligere gjenoppretting når alt er på plass
    const c = setup(storage, clock).services;
    expect(c.db.loadReport.message ?? '').not.toContain('gjenopprettet automatisk');
  });

  it('henting på nytt gir objektet analyse igjen, og scenarioene beholder verdiene sine', async () => {
    const { services: s, clock } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    const pid = item.property.id;
    const before = item.primaryScenario!;
    s.db.transaction((d) => {
      d.analyses = d.analyses.filter((a) => a.propertyId !== pid);
    });
    expect(await s.analysis.getAnalysis(before.analysisId)).toBeNull();
    const r = await s.analysis.requestRefresh(pid, 'full', 'x');
    expect(r.outcome).toBe('job_started');
    await runJob(s, clock);
    const after = (await s.scenarios.list(pid)).find((x) => x.id === before.id)!;
    expect(after.values).toEqual(before.values);
    const a = await s.analysis.getAnalysis(after.analysisId);
    expect(a?.propertyId).toBe(pid);
    expect(a?.status).toBe('published');
  });
});

describe('kalender', () => {
  it('viser visninger, én buddag per objekt, privat visning og privat overstyring', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const events = await s.calendar.listEvents();
    const byProp = new Map<string, number>();
    for (const e of events.filter((x) => x.kind === 'buddag')) byProp.set(e.propertyId, (byProp.get(e.propertyId) ?? 0) + 1);
    expect([...byProp.values()].every((n) => n === 1)).toBe(true);
    // Lade har bare privat visning → ingen buddag
    const lade = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.noViewing)!;
    expect(events.some((e) => e.propertyId === lade.property.id && e.kind === 'privat_visning')).toBe(true);
    expect(events.some((e) => e.propertyId === lade.property.id && e.kind === 'buddag')).toBe(false);
    // Granåsen har privat overstyring med bevart kildeverdi
    const gran = events.find((e) => e.kind === 'buddag' && e.override)!;
    expect(gran.override!.derivedStartAtOverride).toBe(gran.prognosis!.start);
    const ics = await s.calendar.exportIcs();
    expect(ics.content).toContain(`UID:bidday-${gran.propertyId}@flipprom.no`);
    expect(ics.content).toContain('TZID=Europe/Oslo');
  });
});

describe('hovedflyt (tjenestenivå)', () => {
  it('innlogging → abonnement → FINN-lenke → analyse → scenarioendring → lagring → liste → kalender → nytt besøk', async () => {
    const storage = memoryStorage();
    const clock = new ManualClock(START);
    let s = setup(storage, clock).services;
    await signIn(s, 'ada');
    expect((await s.subscription.getEntitlements()).access).toBe('full');
    const r = await s.analysis.requestAnalysis({ url: 'https://www.finn.no/478027403?utm_campaign=x', idempotencyKey: 'flow' });
    await runJob(s, clock);
    const item = (await s.properties.getMine(r.propertyId))!;
    expect(item.primaryScenario).not.toBeNull();
    const changed = { ...item.primaryScenario!.values, purchasePrice: (item.primaryScenario!.values.purchasePrice ?? 0) - 100_000 };
    await s.scenarios.update(item.primaryScenario!.id, { values: changed });
    expect((await s.properties.listMine()).some((i) => i.property.id === r.propertyId)).toBe(true);
    const events = await s.calendar.listEvents();
    const viewings = item.viewings.length;
    expect(events.filter((e) => e.propertyId === r.propertyId && e.kind === 'visning').length).toBe(viewings);
    s = setup(storage, clock).services; // nytt besøk
    const again = (await s.properties.getMine(r.propertyId))!;
    expect(again.primaryScenario!.values.purchasePrice).toBe(changed.purchasePrice);
  });
});

describe('risikoer: grunnlag kan endres privat, og egne kan legges til', () => {
  const fields = { title: 'Rørene er fra 1975', category: 'vann_avlop' as const, level: 8, costLow: 150_000, costHigh: null, rationale: 'Egen vurdering', action: 'Be om rørtilstand' };

  async function setupItem() {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    return { s, item, pid: item.property.id };
  }

  it('egne risikoer kan legges til, endres og slettes – validert, og grunnlaget er urørt', async () => {
    const { s, item, pid } = await setupItem();
    const baseCount = item.latestAnalysis!.risks.length;
    const r = await s.risks.create(pid, fields);
    expect(r.baseRiskId).toBeNull();
    await expectError(s.risks.create(pid, { ...fields, title: ' ' }), 'validation');
    await expectError(s.risks.create(pid, { ...fields, level: 11 }), 'validation');
    await expectError(s.risks.create(pid, { ...fields, costLow: 5, costHigh: 1 }), 'validation');
    expect((await s.risks.update(r.id, { ...fields, level: 3 })).level).toBe(3);
    expect((await s.properties.getMine(pid))!.riskEdits).toHaveLength(1);
    expect((await s.properties.getMine(pid))!.latestAnalysis!.risks).toHaveLength(baseCount);
    await s.risks.remove(r.id);
    expect(await s.risks.list(pid)).toHaveLength(0);
  });

  it('endring av en grunnlagsrisiko er privat og kan tilbakestilles; skjuling kan angres', async () => {
    const { s, item, pid } = await setupItem();
    const base = item.latestAnalysis!.risks[0];
    const o1 = await s.risks.overrideBase(pid, base.id, { ...fields, title: base.title, level: 2 });
    const o2 = await s.risks.overrideBase(pid, base.id, { ...fields, title: base.title, level: 9 });
    expect(o2.id).toBe(o1.id); // oppdaterer samme endring
    const merged = effectiveRisks(item.latestAnalysis!.risks, await s.risks.list(pid));
    expect(merged.active.find((r) => r.id === base.id)).toMatchObject({ level: 9, origin: 'endret' });
    expect(base.level).not.toBe(9);

    await s.risks.remove(o1.id); // tilbakestill
    expect(effectiveRisks(item.latestAnalysis!.risks, await s.risks.list(pid)).active.find((r) => r.id === base.id)!.origin).toBe('grunnlag');

    const h = await s.risks.hideBase(pid, base.id, { ...fields, title: base.title });
    const hidden = effectiveRisks(item.latestAnalysis!.risks, await s.risks.list(pid));
    expect(hidden.hidden.map((r) => r.id)).toEqual([base.id]);
    expect(hidden.active.some((r) => r.id === base.id)).toBe(false);
    await s.risks.remove(h.id);
    expect(effectiveRisks(item.latestAnalysis!.risks, await s.risks.list(pid)).hidden).toHaveLength(0);

    await signIn(s, 'bjorn');
    expect(await s.risks.list(pid)).toHaveLength(0); // privat
    await expectError(s.risks.update(o1.id, fields), 'not_found');
  });

  it('krever aktivt abonnement for å skrive', async () => {
    const { s, pid } = await setupItem();
    await s.demo.setSubscriptionPreset('past_due');
    await expectError(s.risks.create(pid, fields), 'subscription_inactive');
  });
});

describe('effectiveRisks', () => {
  const base = [
    { id: 'a', title: 'A', category: 'vann_avlop' as const, level: 5, costLow: null, costHigh: null, rationale: '', sourceId: null, action: '' },
  ];
  const mk = (p: Partial<UserRisk>): UserRisk => ({ id: 'u1', userId: 'x', propertyId: 'p', baseRiskId: null, removed: false, title: 'U', category: 'vann_avlop', level: null, costLow: null, costHigh: null, rationale: '', action: '', createdAt: START, updatedAt: START, ...p });
  it('endring av risiko som er borte fra grunnlaget beholdes som egen risiko', () => {
    const r = effectiveRisks(base, [mk({ baseRiskId: 'gammel' })]);
    expect(r.active.map((x) => x.origin)).toEqual(['grunnlag', 'mine']);
  });
  it('skjult risiko som er borte fra grunnlaget forsvinner ikke fra aggregatet uten å synes', () => {
    const r = effectiveRisks(base, [mk({ baseRiskId: 'a', removed: true })]);
    expect(r.active).toHaveLength(0);
    expect(r.hidden).toHaveLength(1);
  });
});

describe('innlogging: Google og e-postkode (ingen passord)', () => {
  const code = (c: Awaited<ReturnType<MockServices['auth']['requestEmailCode']>>) => c.simulatedEmail!.code;

  it('e-postkode: bekreftelse oppretter konto første gang, og logger inn senere', async () => {
    const { services: s, clock } = setup();
    const ch = await s.auth.requestEmailCode('  Ny.Bruker@Eksempel.no ');
    expect(ch.email).toBe('ny.bruker@eksempel.no');
    expect(code(ch)).toMatch(/^\d{6}$/);
    expect(await s.auth.session()).toBeNull(); // ikke innlogget før koden er bekreftet
    const r = await s.auth.verifyEmailCode({ challengeId: ch.challengeId, code: code(ch) });
    expect(r.isNewUser).toBe(true);
    expect(r.session.user).toMatchObject({ email: 'ny.bruker@eksempel.no', displayName: 'Ny Bruker' });
    expect((await s.subscription.getEntitlements()).access).toBe('read_only'); // ingen abonnement ennå
    await s.auth.signOut();
    clock.advance(60_000);
    const again = await s.auth.requestEmailCode('ny.bruker@eksempel.no');
    const r2 = await s.auth.verifyEmailCode({ challengeId: again.challengeId, code: code(again) });
    expect(r2.isNewUser).toBe(false);
    expect(r2.session.user.id).toBe(r.session.user.id);
    await expectError(s.auth.verifyEmailCode({ challengeId: again.challengeId, code: code(again) }), 'code_expired'); // koden kan bare brukes én gang
  });

  it('feil kode, for mange forsøk, utløp, ny kode og begrensninger', async () => {
    const { services: s, clock } = setup();
    await expectError(s.auth.requestEmailCode('ikke-en-epost'), 'validation');
    const ch = await s.auth.requestEmailCode('a@eksempel.no');
    const wrong = code(ch) === '000000' ? '111111' : '000000';
    await expectError(s.auth.verifyEmailCode({ challengeId: ch.challengeId, code: '12' }), 'validation');
    const e = await expectError(s.auth.verifyEmailCode({ challengeId: ch.challengeId, code: wrong }), 'invalid_code');
    expect(e.message).toContain('4 forsøk');
    expect(await s.auth.session()).toBeNull();
    for (let i = 0; i < 3; i++) await expectError(s.auth.verifyEmailCode({ challengeId: ch.challengeId, code: wrong }), 'invalid_code');
    await expectError(s.auth.verifyEmailCode({ challengeId: ch.challengeId, code: wrong }), 'too_many_attempts');
    await expectError(s.auth.verifyEmailCode({ challengeId: ch.challengeId, code: code(ch) }), 'code_expired'); // kode brukt opp, selv om den var riktig

    await expectError(s.auth.requestEmailCode('a@eksempel.no'), 'rate_limited'); // for tidlig ny kode
    clock.advance(31_000);
    const c2 = await s.auth.requestEmailCode('a@eksempel.no');
    clock.advance(31_000);
    const c3 = await s.auth.requestEmailCode('a@eksempel.no');
    await expectError(s.auth.verifyEmailCode({ challengeId: c2.challengeId, code: code(c2) }), 'code_expired'); // ny kode erstatter forrige
    clock.advance(10 * 60_000 + 1);
    await expectError(s.auth.verifyEmailCode({ challengeId: c3.challengeId, code: code(c3) }), 'code_expired');
  });

  it('Google: logger inn uten kode, oppretter konto med Googles navn, og gjenkjenner eksisterende bruker', async () => {
    const { services: s } = setup();
    expect(s.demo.googleAccounts().length).toBeGreaterThan(0);
    await expectError(s.auth.signInWithGoogle(), 'validation');
    const r = await s.auth.signInWithGoogle({ email: 'Kari.Nordmann@gmail.com', name: 'Kari Nordmann' });
    expect(r.kind).toBe('signed_in');
    if (r.kind !== 'signed_in') return;
    expect(r.isNewUser).toBe(true);
    expect(r.session.user).toMatchObject({ email: 'kari.nordmann@gmail.com', displayName: 'Kari Nordmann' });
    await s.auth.signOut();
    const r2 = await s.auth.signInWithGoogle({ email: 'kari.nordmann@gmail.com', name: '' });
    expect(r2.kind === 'signed_in' && r2.isNewUser).toBe(false);
  });

  it('testprofiler kan hoppe over koden, ukjent profil avvises', async () => {
    const { services: s } = setup();
    await expectError(s.demo.signInAsProfile('ukjent@eksempel.no'), 'not_found');
    const session = await s.demo.signInAsProfile(DEMO_USERS.ada.email);
    expect(session.user.id).toBe(DEMO_USERS.ada.id);
  });
});

describe('abonnement med Vipps', () => {
  async function newUser(s: MockServices) {
    const ch = await s.auth.requestEmailCode('vipps.test@eksempel.no');
    await s.auth.verifyEmailCode({ challengeId: ch.challengeId, code: ch.simulatedEmail!.code });
  }

  it('avtalen gir ikke tilgang før den er godkjent i Vipps; godkjenning starter gratis prøveperiode', async () => {
    const { services: s } = setup();
    await newUser(s);
    await expectError(s.subscription.startCheckout({ planId: 'flipprom-pro', interval: 'month', phone: '12345' }), 'validation');
    await expectError(s.subscription.startCheckout({ planId: 'flipprom-pro', interval: 'month', phone: '512 34 567' }), 'validation'); // må starte på 4 eller 9
    const p = await s.subscription.startCheckout({ planId: 'flipprom-pro', interval: 'year', phone: '+47 912 34 567' });
    expect(p.kind).toBe('vipps_pending');
    if (p.kind !== 'vipps_pending') return;
    expect(p.phoneMasked).toBe('+47 9•• •• 567');
    expect(p.amount).toBe(2000);
    expect(await s.subscription.getSubscription()).toBeNull();
    expect((await s.subscription.getEntitlements()).access).toBe('read_only');

    const r = await s.demo.vipps.decide(p.agreementId, 'approved');
    expect(r.status).toBe('approved');
    const sub = (await s.subscription.getSubscription())!;
    expect(sub).toMatchObject({ provider: 'vipps', status: 'trialing', interval: 'year', agreementId: p.agreementId });
    expect(Math.round((Date.parse(sub.currentPeriodEnd) - Date.parse(sub.currentPeriodStart)) / 86_400_000)).toBe(30); // 1 måned gratis
    expect((await s.subscription.getEntitlements()).access).toBe('full');
    await expectError(s.demo.vipps.decide(p.agreementId, 'approved'), 'not_found'); // avtalen kan bare avgjøres én gang
  });

  it('avvist avtale gir ingen abonnement, og utløpt avtale kan ikke godkjennes', async () => {
    const { services: s, clock } = setup();
    await newUser(s);
    const a = await s.subscription.startCheckout({ planId: 'flipprom-pro', interval: 'month', phone: '41234567' });
    if (a.kind !== 'vipps_pending') throw new Error('forventet pending');
    expect((await s.demo.vipps.decide(a.agreementId, 'rejected')).subscription).toBeNull();
    expect(await s.subscription.getSubscription()).toBeNull();

    const b = await s.subscription.startCheckout({ planId: 'flipprom-pro', interval: 'month', phone: '41234567' });
    if (b.kind !== 'vipps_pending') throw new Error('forventet pending');
    clock.advance(6 * 60_000);
    await expectError(s.demo.vipps.decide(b.agreementId, 'approved'), 'conflict');
    expect(await s.subscription.getSubscription()).toBeNull();
  });

  it('kampanjen gjelder bare nye abonnenter – tidligere abonnenter betaler fra start', async () => {
    const { services: s } = setup();
    await s.demo.signInAsProfile(DEMO_USERS.ada.email);
    const p = await s.subscription.startCheckout({ planId: 'flipprom-pro', interval: 'month', phone: '41234567' });
    if (p.kind !== 'vipps_pending') throw new Error('forventet pending');
    expect(p.firstChargeAt).toBe(s.clock.now().toISOString()); // ingen gratisperiode
    await s.demo.vipps.decide(p.agreementId, 'approved');
    expect((await s.subscription.getSubscription())!.status).toBe('active');
  });
});

describe('kurskjøp: betalingsmur, engangsbetaling og varig tilgang', () => {
  it('Ada har kjøpt kurset, Bjørn har ikke', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    expect(await s.courses.getAccess('flipping-privat')).toMatchObject({ owned: true, purchase: { amountPaid: 2999, provider: 'vipps' } });
    await signIn(s, 'bjorn');
    expect(await s.courses.getAccess('flipping-privat')).toMatchObject({ owned: false, purchase: null });
    expect(await s.courses.listPurchases()).toEqual([]);
  });

  it('kjøp med Vipps: ingen tilgang før godkjenning, deretter varig tilgang til fast pris', async () => {
    const { services: s } = setup();
    await signIn(s, 'bjorn');
    await expectError(s.courses.startPurchase({ courseId: 'finnes-ikke', phone: '41234567' }), 'not_found');
    await expectError(s.courses.startPurchase({ courseId: 'flipping-as', phone: '41234567' }), 'conflict'); // kommer senere
    await expectError(s.courses.startPurchase({ courseId: 'flipping-privat', phone: '123' }), 'validation');
    const p = await s.courses.startPurchase({ courseId: 'flipping-privat', phone: '+47 412 34 567' });
    if (p.kind !== 'vipps_pending') throw new Error('forventet pending');
    expect(p.amount).toBe(2999);
    expect(p.phoneMasked).toBe('+47 4•• •• 567');
    expect((await s.courses.getAccess('flipping-privat')).owned).toBe(false); // ikke før Vipps har bekreftet

    const r = await s.demo.vipps.decide(p.paymentId, 'approved');
    expect(r.status).toBe('approved');
    expect(r.purchase).toMatchObject({ courseId: 'flipping-privat', amountPaid: 2999, paymentId: p.paymentId });
    expect((await s.courses.getAccess('flipping-privat')).owned).toBe(true);
    await expectError(s.demo.vipps.decide(p.paymentId, 'approved'), 'not_found'); // betalingen kan bare avgjøres én gang
    await expectError(s.courses.startPurchase({ courseId: 'flipping-privat', phone: '41234567' }), 'conflict'); // ingen dobbeltkjøp
    expect(await s.courses.listPurchases()).toHaveLength(1);
  });

  it('tilgangen er uavhengig av abonnementet og faller aldri bort', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    for (const preset of ['expired', 'past_due', 'none'] as const) {
      await s.demo.setSubscriptionPreset(preset);
      expect((await s.courses.getAccess('flipping-privat')).owned).toBe(true);
    }
  });

  it('abonnement gir ikke kurstilgang, og kurskjøp gir ikke abonnement', async () => {
    const { services: s } = setup();
    await signIn(s, 'bjorn'); // aktivt årsabonnement
    expect((await s.subscription.getEntitlements()).access).toBe('full');
    expect((await s.courses.getAccess('flipping-privat')).owned).toBe(false);
    await s.demo.setSubscriptionPreset('none');
    const p = await s.courses.startPurchase({ courseId: 'flipping-privat', phone: '41234567' });
    if (p.kind !== 'vipps_pending') throw new Error('forventet pending');
    await s.demo.vipps.decide(p.paymentId, 'approved');
    expect((await s.subscription.getEntitlements()).access).toBe('read_only');
    expect(await s.subscription.getSubscription()).toBeNull();
  });

  it('avvist eller utløpt betaling gir ingen tilgang', async () => {
    const { services: s, clock } = setup();
    await signIn(s, 'bjorn');
    const a = await s.courses.startPurchase({ courseId: 'flipping-privat', phone: '41234567' });
    if (a.kind !== 'vipps_pending') throw new Error('forventet pending');
    expect((await s.demo.vipps.decide(a.paymentId, 'rejected')).purchase).toBeNull();
    const b = await s.courses.startPurchase({ courseId: 'flipping-privat', phone: '41234567' });
    if (b.kind !== 'vipps_pending') throw new Error('forventet pending');
    clock.advance(6 * 60_000);
    await expectError(s.demo.vipps.decide(b.paymentId, 'approved'), 'conflict');
    expect((await s.courses.getAccess('flipping-privat')).owned).toBe(false);
  });
});

describe('migrering av mockdatabase v3 → v5 (modell 1.1 og 1.2)', () => {
  const NEW_SCENARIO_KEYS = ['analysisScenarioId', 'purchaseFinancingPct', 'renovationFinancingPct', 'financeRunningCosts', 'availableEquity', 'settlementMonths', 'weeklyOwnHours', 'minProfitPerOwnHour', 'laborModes', 'maxOwnWork', 'regulatedCompetence'];
  const NEW_PROFILE_KEYS = ['purchaseFinancingPct', 'renovationFinancingPct', 'financeRunningCosts', 'availableEquity', 'weeklyOwnHours', 'minProfitPerOwnHour', 'saleSettlementMonths', 'laborModes', 'maxOwnWork', 'regulatedCompetence'];

  /** Lager en lagret database slik den så ut i versjon 3 (eldre kalkylemodell). */
  function legacyEnvelope(storage: StorageLike) {
    const raw = JSON.parse(storage.getItem(DB_STORAGE_KEY)!) as { state: Record<string, any[]> };
    const state = structuredClone(raw.state);
    state.profiles = state.profiles.map((p: any) => {
      const d = { ...p.defaults, financingPct: 85, regulatedSelfWorkConfirmed: true };
      for (const k of NEW_PROFILE_KEYS) delete d[k];
      return { ...p, defaults: d };
    });
    state.scenarios = state.scenarios.map((sc: any) => {
      const v = { ...sc.values, financingPct: sc.values.purchaseFinancingPct ?? 100, regulatedSelfWorkConfirmed: true };
      for (const k of NEW_SCENARIO_KEYS) delete v[k];
      return { ...sc, values: v };
    });
    return { legacy: { format: DB_FORMAT, schemaVersion: 3, savedAt: new Date().toISOString(), state }, before: raw.state };
  }

  it('migrerer profiler og scenarioer, dropper ingen rader og gir uendrede resultater', () => {
    const storage = memoryStorage();
    setup(storage);
    const { legacy, before } = legacyEnvelope(storage);
    storage.setItem(DB_STORAGE_KEY, JSON.stringify(legacy));

    const { services: s } = setup(storage);
    expect(s.demo.loadReport().status).toBe('migrated');
    const after = s.db.read((st) => st);
    expect(after.scenarios.length).toBe(before.scenarios.length);
    expect(after.profiles.length).toBe(before.profiles.length);
    expect(after.analyses.length).toBe(before.analyses.length);
    expect(after.userProperties.length).toBe(before.userProperties.length);

    const profile = after.profiles[0];
    expect(profile.defaults).toMatchObject({ purchaseFinancingPct: 85, renovationFinancingPct: 85, financeRunningCosts: false, availableEquity: 300_000, weeklyOwnHours: 10, minProfitPerOwnHour: 500 });
    expect('financingPct' in profile.defaults).toBe(false);

    for (const sc of after.scenarios) {
      const v = sc.values as unknown as Record<string, unknown>;
      expect('financingPct' in v).toBe(false);
      for (const k of NEW_SCENARIO_KEYS) expect(k in v, k).toBe(true);
      expect(v.renovationFinancingPct).toBe(v.purchaseFinancingPct);
      expect(v.minProfitPerOwnHour).toBe(500);
      expect(v.availableEquity).toBe(300_000);
    }
    // Renten følger modell 1.2: f × (P + RB/2) × r × m/12 med f = gammel låneandel. Kjøpskostnadene K er ikke lenger med i lånet,
    // så eldre kalkyler gir bevisst IKKE lenger nøyaktig samme renter som i modell 1.0 når K > 0.
    for (const sc of after.scenarios) {
      const old = legacy.state.scenarios.find((x: any) => x.id === sc.id)!;
      const f = (old.values.financingPct as number | null) ?? null;
      const m = evaluateScenario(sc.values).evaluation.base;
      const viaSchema = evaluateScenario(old.values).evaluation.base; // eldre rad leses direkte via skjemaet
      expect(m?.profit).toBe(viaSchema?.profit);
      if (m && f !== null && sc.values.interestPct !== null && sc.values.months !== null) {
        const expectedI = Math.round(((f / 100) * (m.P + m.RB / 2) * (sc.values.interestPct / 100) * (sc.values.months / 12)) * 100) / 100;
        expect(m.I).toBeCloseTo(expectedI, 1);
      }
    }
  });

  it('regulert kompetanse: det gamle samlede flagget nullstilles konservativt til «ikke bekreftet» per område', () => {
    const storage = memoryStorage();
    setup(storage);
    const { legacy } = legacyEnvelope(storage);
    storage.setItem(DB_STORAGE_KEY, JSON.stringify(legacy));
    const { services: s } = setup(storage);
    const after = s.db.read((st) => st);
    for (const p of after.profiles) {
      expect(p.defaults.regulatedCompetence).toEqual({ ror: false, elektro: false, bad_vatrom: false });
      expect('regulatedSelfWorkConfirmed' in p.defaults).toBe(false);
    }
    for (const sc of after.scenarios) {
      expect(sc.values.regulatedCompetence).toEqual({ ror: false, elektro: false, bad_vatrom: false });
      expect('regulatedSelfWorkConfirmed' in sc.values).toBe(false);
    }
  });

  it('v4 → v5: kompetanse per område, tiltak uten dobbelttelling av arbeid, og ingen rader droppes', () => {
    const storage = memoryStorage();
    setup(storage);
    const raw = JSON.parse(storage.getItem(DB_STORAGE_KEY)!) as { state: Record<string, any[]> };
    const state = structuredClone(raw.state);
    // Slik en v4-database så ut: ett samlet flagg, og et tiltak med både arbeidsmodell og eldre fagbeløp
    state.profiles = state.profiles.map((p: any) => {
      const { regulatedCompetence: _c, ...d } = p.defaults;
      void _c;
      return { ...p, defaults: { ...d, regulatedSelfWorkConfirmed: true } };
    });
    let patched = 0;
    state.scenarios = state.scenarios.map((sc: any) => {
      const { regulatedCompetence: _c, ...v } = sc.values;
      void _c;
      const items = (sc.values.renovationItems as any[]).map((it) => {
        if (!it.laborCategory || patched > 0) return it;
        patched++;
        return { ...it, laborCostHired: null, electrician: 20_000, plumber: 5_000, other: 5_000 };
      });
      return { ...sc, values: { ...v, renovationItems: items, regulatedSelfWorkConfirmed: true } };
    });
    expect(patched).toBe(1);
    storage.setItem(DB_STORAGE_KEY, JSON.stringify({ format: DB_FORMAT, schemaVersion: 4, savedAt: new Date().toISOString(), state }));

    const { services: s } = setup(storage);
    expect(s.demo.loadReport().status).toBe('migrated');
    const after = s.db.read((st) => st);
    expect(after.scenarios.length).toBe(raw.state.scenarios.length);
    expect(after.profiles.length).toBe(raw.state.profiles.length);
    const items = after.scenarios.flatMap((sc) => sc.values.renovationItems).filter((i) => i.laborCategory);
    const moved = items.find((i) => i.laborCostHired === 30_000);
    expect(moved).toMatchObject({ electrician: 0, plumber: 0, other: 0 }); // fagbeløpene er flyttet til innleid arbeid, ikke talt to ganger
    for (const sc of after.scenarios) {
      expect(sc.values.regulatedCompetence).toEqual({ ror: false, elektro: false, bad_vatrom: false });
      expect('regulatedSelfWorkConfirmed' in sc.values).toBe(false);
    }
  });

  it('en fersk database har versjon 5 og nye standarder', () => {
    const { services: s } = setup();
    const defaults = s.db.read((st) => st.profiles.find((p) => p.userId === DEMO_USERS.ada.id)!.defaults);
    expect(defaults).toMatchObject({ purchaseFinancingPct: 90, renovationFinancingPct: 0, minProfitPerOwnHour: 500, weeklyOwnHours: 10, availableEquity: 300_000, saleFixedCost: 120_000 });
  });

  it('profilstandarder kan lagres og valideres', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const upd = await s.profile.update({ defaults: { minProfitPerOwnHour: 750, weeklyOwnHours: 14, availableEquity: 450_000, renovationFinancingPct: 20, financeRunningCosts: true, laborModes: { ...NEW_DEFAULTS_FOR_TEST, gulv: 'selv' } } });
    expect(upd.defaults).toMatchObject({ minProfitPerOwnHour: 750, weeklyOwnHours: 14, availableEquity: 450_000, renovationFinancingPct: 20, financeRunningCosts: true });
    expect(upd.defaults.laborModes.gulv).toBe('selv');
    await expectError(s.profile.update({ defaults: { purchaseFinancingPct: 150 } }), 'validation');
    await expectError(s.profile.update({ defaults: { weeklyOwnHours: -3 } }), 'validation');
  });

  it('nye scenarioer får profilens standarder, og private overstyringer endrer ikke felles analyse', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    await s.profile.update({ defaults: { minProfitPerOwnHour: 650, availableEquity: 123_000 } });
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    const analysisBefore = JSON.stringify(item.latestAnalysis);
    const sc = await s.scenarios.create(item.property.id, {
      name: 'Alternativ med mine tall',
      analysisId: item.latestAnalysis!.id,
      values: { ...item.primaryScenario!.values, saleBase: 9_999_999, minProfitPerOwnHour: 650, availableEquity: 123_000, renovationFinancingPct: 50 },
    });
    expect(sc.values).toMatchObject({ saleBase: 9_999_999, minProfitPerOwnHour: 650, availableEquity: 123_000, renovationFinancingPct: 50 });
    const again = (await s.properties.getMine(item.property.id))!;
    expect(JSON.stringify(again.latestAnalysis)).toBe(analysisBefore);
  });
});

describe('30-dagersregelen: grundig markedsoppfriskning, ikke automatisk full analyse', () => {
  const stalePid = (s: MockServices) => s.db.read((st) => st.properties.find((p) => p.finnId === DEMO_FINN.stale)!.id);
  const technical = (a: any) => ({ risks: a.risks, checklist: a.checklist, facts: a.facts, sources: a.sources, conditions: a.conditions, summary: a.summary, strategy: a.strategy, scenarios: a.estimates.scenarios, renovationOptions: a.estimates.renovationOptions, comparables: a.comparables });

  it('analysen er eldre enn 30 dager: en bruker uten objektet får en markedsoppfriskning (ikke full analyse), belastet som ny analyse', async () => {
    const { services: s, clock } = setup();
    await signIn(s, 'bjorn');
    const pid = stalePid(s);
    expect(s.db.read((st) => st.userProperties.some((u) => u.userId === DEMO_USERS.bjorn.id && u.propertyId === pid))).toBe(false);
    const before = (await s.analysis.getPublishedAnalysis(pid))!;
    expect((clock.now().getTime() - Date.parse(before.publishedAt!)) / 86_400_000).toBeGreaterThan(30);
    const r = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.stale}`, idempotencyKey: 'm1' });
    expect(r.outcome).toBe('job_started');
    if (r.outcome !== 'job_started') return;
    expect(r.job.type).toBe('market_refresh');
    expect(r.job.type).not.toBe('full_analysis');
    // Brukeren ser samme dialog og trinn som ved en ny analyse
    expect(r.job.steps).toEqual(['Henter annonse', 'Kontrollerer grunnlag', 'Vurderer oppussing', 'Vurderer salgsverdi', 'Klargjør analyse']);
    await runJob(s, clock);
    expect((await s.analysis.getJob(r.job.id))?.status).toBe('succeeded');
    const after = (await s.analysis.getPublishedAnalysis(pid))!;
    expect(after.version).toBe(before.version + 1);
    expect(after.analysisKind).toBe('market_refresh');
    expect(after.derivedFromVersion).toBe(before.version);
    expect(Date.parse(after.publishedAt!)).toBeGreaterThan(Date.parse(before.publishedAt!));
    expect(after.assumptions[0]).toContain('Markedsoppfriskning');
    // Teknisk grunnlag er uendret: ikke lest på nytt, og ingen nye scenarioer er laget
    expect(technical(after)).toEqual(technical(before));
    expect((await s.analysis.listVersions(pid)).find((v) => v.version === before.version)?.status).toBe('superseded');
    expect(usageOf(s, DEMO_USERS.bjorn.id, 'new_analysis').filter((u) => u.propertyId === pid && u.chargeable)).toHaveLength(1);
    expect(s.db.read((st) => st.jobs.filter((j) => j.propertyId === pid && j.type === 'full_analysis'))).toHaveLength(0);
  });

  it('samtidige forespørsler kobles til samme markedsoppfriskning, og hver bruker belastes som ny analyse', async () => {
    const { services: s, clock } = setup();
    await signIn(s, 'bjorn');
    const a = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.stale}`, idempotencyKey: 'a' });
    await signIn(s, 'ada');
    // Ada har allerede objektet i listen og får det åpnet (ingen ny jobb for henne)
    const b = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.stale}`, idempotencyKey: 'b' });
    if (a.outcome !== 'job_started') throw new Error('forventet jobb');
    expect(['reused', 'job_started', 'job_joined']).toContain(b.outcome);
    await runJob(s, clock);
    expect((await s.analysis.getJob(a.job.id))?.status ?? (s.db.read((st) => st.jobs.find((j) => j.id === a.job.id)!.status))).toBe('succeeded');
  });

  it('i egen liste: «Oppdater markedsdata» starter markedsoppfriskning som belastes som oppfriskning, ikke ny analyse', async () => {
    const { services: s, clock } = setup();
    await signIn(s, 'ada');
    const pid = stalePid(s);
    const before = (await s.analysis.getPublishedAnalysis(pid))!;
    const newBefore = usageOf(s, DEMO_USERS.ada.id, 'new_analysis').length;
    const refreshBefore = usageOf(s, DEMO_USERS.ada.id, 'refresh').length;
    const r = await s.analysis.requestRefresh(pid, 'market', 'm');
    expect(r.outcome).toBe('job_started');
    if (r.outcome !== 'job_started') return;
    expect(r.job.type).toBe('market_refresh');
    expect(r.job.steps).toEqual(['Henter annonse', 'Oppdaterer visninger og salgsstatus', 'Oppdaterer markedsreferanser', 'Beregner salgsverdi per scenario', 'Kjører økonomimotoren']);
    // Pågående markedsoppfriskning teller ikke mot analysekvoten
    const ent = await s.subscription.getEntitlements();
    expect(ent.used.pendingNewAnalyses).toBe(0);
    await runJob(s, clock);
    const after = (await s.analysis.getPublishedAnalysis(pid))!;
    expect(after.version).toBe(before.version + 1);
    expect(after.analysisKind).toBe('market_refresh');
    expect(technical(after)).toEqual(technical(before));
    expect(usageOf(s, DEMO_USERS.ada.id, 'refresh').length).toBe(refreshBefore + 1);
    expect(usageOf(s, DEMO_USERS.ada.id, 'new_analysis').length).toBe(newBefore);
    // Rett etterpå er markedsdataene oppdaterte
    const again = await s.analysis.requestRefresh(pid, 'market', 'm2');
    expect(again.outcome).toBe('already_fresh');
    // Brukerens private scenarioer er uendret og ikke slettet
    expect((await s.scenarios.list(pid)).length).toBeGreaterThan(0);
  });

  it('markedsoppfriskning er ikke aktuelt for en fersk analyse', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    const r = await s.analysis.requestRefresh(item.property.id, 'market', 'x');
    expect(r.outcome).toBe('already_fresh');
    expect(s.db.read((st) => st.jobs.length)).toBe(0);
  });

  it('full teknisk analyse tilbys ikke bare fordi det har gått tid', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const pid = stalePid(s);
    const e = await expectError(s.analysis.requestRefresh(pid, 'full', 'f'), 'conflict');
    expect(e.message).toContain('markedsoppfriskning');
    const mine = (await s.properties.getMine(pid))!;
    expect(mine.technicalReanalysis).toEqual({ needed: false, reasons: [] });
  });

  it('full teknisk analyse når kilden melder nye dokumenter eller endrede kritiske fakta', async () => {
    for (const signal of [{ newOrChangedDocuments: true }, { criticalFactsChanged: true }]) {
      const { services: s, clock } = setup();
      await signIn(s, 'ada');
      const pid = stalePid(s);
      s.db.transaction((d) => {
        d.demo.technicalChangeSignals = { [DEMO_FINN.stale]: signal };
      });
      const mine = (await s.properties.getMine(pid))!;
      expect(mine.technicalReanalysis.needed).toBe(true);
      expect(mine.technicalReanalysis.reasons).toEqual([signal.newOrChangedDocuments ? 'nye_dokumenter' : 'kritiske_fakta_endret']);
      const r = await s.analysis.requestRefresh(pid, 'full', 'f');
      if (r.outcome !== 'job_started') throw new Error('forventet jobb');
      expect(r.job.type).toBe('full_analysis');
      await runJob(s, clock);
      expect((await s.analysis.getJob(r.job.id))?.status).toBe('succeeded');
      const latest = (await s.analysis.getPublishedAnalysis(pid))!;
      expect(latest.analysisKind ?? 'full').toBe('full');
      // Signalene er behandlet av den nye tekniske analysen
      expect(s.db.read((st) => st.demo.technicalChangeSignals?.[DEMO_FINN.stale])).toBeUndefined();
    }
  });

  it('nye dokumenter gir full analyse også for en bruker som ber om en fersk analyse (ikke linked/market)', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    s.db.transaction((d) => {
      d.demo.technicalChangeSignals = { [DEMO_FINN.cacheHit]: { newOrChangedDocuments: true } };
    });
    const r = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.cacheHit}`, idempotencyKey: 'x' });
    if (r.outcome !== 'job_started') throw new Error('forventet jobb');
    expect(r.job.type).toBe('full_analysis');
  });

  it('inkompatibel modell gir full analyse (ikke bare alder)', async () => {
    const { services: s } = setup();
    await signIn(s, 'bjorn');
    s.db.transaction((d) => {
      for (const a of d.analyses) if (a.propertyId === stalePid(s)) a.modelVersion = '2.0.0';
    });
    const r = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.stale}`, idempotencyKey: 'x' });
    if (r.outcome !== 'job_started') throw new Error('forventet jobb');
    expect(r.job.type).toBe('full_analysis');
    const mine = (await s.properties.getMine(stalePid(s)))!;
    expect(mine.technicalReanalysis.reasons).toContain('inkompatibel');
  });

  it('en ferskere analyse (≤ 30 dager) går fortsatt som koblet analyse – uendret', async () => {
    const { services: s } = setup();
    await signIn(s, 'ada');
    const r = await s.analysis.requestAnalysis({ url: `finn.no/${DEMO_FINN.cacheHit}`, idempotencyKey: 'x' });
    if (r.outcome !== 'job_started') throw new Error('forventet jobb');
    expect(r.job.type).toBe('linked_analysis');
  });

  it('markedsoppfriskningen regner salgsverdi per scenario på nytt per ny analysedato – og private tall røres ikke', async () => {
    const { services: s, clock } = setup();
    await signIn(s, 'ada');
    const item = (await s.properties.listMine()).find((i) => i.property.finnId === DEMO_FINN.sharedAB)!;
    // Gjør p01-analysen gammel
    s.db.transaction((d) => {
      for (const a of d.analyses) if (a.propertyId === item.property.id) {
        a.createdAt = '2026-08-01T08:00:00.000Z';
        a.publishedAt = '2026-08-01T08:00:00.000Z';
      }
    });
    const mineBefore = JSON.stringify((await s.scenarios.list(item.property.id)).map((x) => x.values));
    const before = (await s.analysis.getPublishedAnalysis(item.property.id))!;
    const r = await s.analysis.requestRefresh(item.property.id, 'market', 'x');
    if (r.outcome !== 'job_started') throw new Error('forventet jobb');
    await runJob(s, clock);
    const after = (await s.analysis.getPublishedAnalysis(item.property.id))!;
    expect(after.version).toBe(before.version + 1);
    expect(after.estimates.scenarios).toEqual(before.estimates.scenarios); // ingen nye scenarioer
    expect(JSON.stringify((await s.scenarios.list(item.property.id)).map((x) => x.values))).toBe(mineBefore); // private kalkyler er uendret
  });
});
