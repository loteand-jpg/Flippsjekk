import { describe, expect, it } from 'vitest';
import { createSeed } from '../../data/seed';
import { createMockServices } from '../../services/mock';
import { memoryStorage } from '../../data/storage';
import { ManualClock } from '../../lib/clock';
import { DEMO_USERS } from '../../data/seed';
import { EXAMPLE_PROFILE_DEFAULTS } from '../../config/defaults';
import { applyFilters, EMPTY_FILTERS, sortRows } from './listLogic';
import { buildRow } from './rowModel';
import { DEMO_FINN } from '../../data/seedProperties';

async function rows() {
  void createSeed;
  const clock = new ManualClock('2026-10-16T08:00:00.000Z');
  const s = createMockServices({ storage: memoryStorage(), clock, latencyMs: 0 });
  await s.demo.signInAsProfile(DEMO_USERS.ada.email);
  const items = await s.properties.listMine({ includeArchived: true });
  return items.map((i) => buildRow(i, EXAMPLE_PROFILE_DEFAULTS, clock.now()));
}

describe('objektliste', () => {
  it('aktiv liste skjuler arkiverte, solgte og trukne; arkivet viser dem', async () => {
    const all = await rows();
    const active = applyFilters(all, EMPTY_FILTERS, 'active');
    const archive = applyFilters(all, EMPTY_FILTERS, 'archive');
    const ids = (xs: typeof all) => xs.map((r) => r.finnId);
    expect(ids(active)).not.toContain(DEMO_FINN.sold);
    expect(ids(active)).not.toContain(DEMO_FINN.withdrawn);
    expect(ids(active)).not.toContain(DEMO_FINN.unprofitable); // arkivert av brukeren
    expect(ids(active)).toContain(DEMO_FINN.unknownStatus); // ukjent status ≠ solgt
    expect(ids(archive)).toEqual(expect.arrayContaining([DEMO_FINN.sold, DEMO_FINN.withdrawn, DEMO_FINN.unprofitable]));
    expect(ids(applyFilters(all, { ...EMPTY_FILTERS, showClosed: true }, 'active'))).toContain(DEMO_FINN.sold);
    // Arkiverte objekter beholder private scenarioer
    expect(archive.find((r) => r.finnId === DEMO_FINN.unprofitable)!.item.scenarioCount).toBe(1);
  });

  it('sorterer fortjeneste numerisk med ukjente sist i begge retninger', async () => {
    const all = applyFilters(await rows(), EMPTY_FILTERS, 'active');
    for (const dir of ['asc', 'desc'] as const) {
      const sorted = sortRows(all, 'profit', dir);
      const vals = sorted.map((r) => r.profit);
      const firstNull = vals.indexOf(null);
      expect(firstNull).toBeGreaterThan(0);
      expect(vals.slice(firstNull).every((v) => v === null)).toBe(true);
      const known = vals.slice(0, firstNull) as number[];
      expect(known).toEqual([...known].sort((a, b) => (dir === 'asc' ? a - b : b - a)));
    }
  });

  it('ukjent risiko er ikke 0 og sorteres sist', async () => {
    const all = applyFilters(await rows(), EMPTY_FILTERS, 'active');
    const asc = sortRows(all, 'risk', 'asc');
    const uncertain = all.find((r) => r.finnId === DEMO_FINN.missingDocs)!;
    expect(uncertain.riskScore).toBeNull();
    expect(asc[asc.length - 1].riskScore).toBeNull();
  });

  it('fortjenestefilter utelater ufullstendige kalkyler og filtrerer på verdi', async () => {
    const all = await rows();
    const f = applyFilters(all, { ...EMPTY_FILTERS, profitMin: 250_000 }, 'active');
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((r) => r.profit !== null && r.profit >= 250_000)).toBe(true);
  });

  it('merker «Mitt scenario» når primært scenario avviker fra grunnanalysen', async () => {
    const all = await rows();
    expect(all.find((r) => r.finnId === DEMO_FINN.sharedAB)!.scenarioSource).toBe('mitt_scenario');
    expect(all.find((r) => r.finnId === DEMO_FINN.highDebt)!.scenarioSource).toBe('grunnanalyse');
    expect(all.find((r) => r.finnId === DEMO_FINN.newVersion)!.hasNewVersion).toBe(true);
  });
});
