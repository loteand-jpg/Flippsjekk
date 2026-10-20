import { describe, expect, it } from 'vitest';
import { AreaProfileSchema, createMarketIndex, marketIndexFromAreaProfile, selectAreaProfile, type AreaProfile } from './areaProfile';

const profile = (over: Partial<AreaProfile> = {}): AreaProfile => ({
  areaId: 'bydel:moellenberg',
  level: 'bydel',
  name: 'Møllenberg',
  parentAreaId: 'kommune:trondheim',
  asOf: '2026-10-01',
  periodMonths: 12,
  priceChangePct: { m1: 0.5, m3: 1.5, m6: 3, m12: 6 },
  volume: 120,
  robustPricePerM2: 68_000,
  daysOnMarket: 21,
  soldVsAskingPct: 2,
  activeListings: 30,
  priceReductionSharePct: 12,
  liquidity: 'hoy',
  sampleSize: 120,
  confidence: 'hoy',
  source: { name: 'Demo', version: '0' },
  ...over,
});

describe('områdeprofil (datamodell, uten datainnhenting)', () => {
  it('validerer, og ukjente tall er null – aldri 0', () => {
    expect(AreaProfileSchema.safeParse(profile()).success).toBe(true);
    expect(AreaProfileSchema.safeParse(profile({ priceChangePct: { m1: null, m3: null, m6: null, m12: null } })).success).toBe(true);
    expect(AreaProfileSchema.safeParse({ ...profile(), level: 'gate' }).success).toBe(false);
  });

  it('fallback: samme bygg → mikroområde → bydel → kommune → region', () => {
    const all = [
      profile({ areaId: 'bygg:1', level: 'samme_bygg', sampleSize: 2 }),
      profile({ areaId: 'mikro:1', level: 'mikroomrade', sampleSize: 3 }),
      profile({ areaId: 'bydel:1', level: 'bydel', sampleSize: 40 }),
      profile({ areaId: 'kommune:1', level: 'kommune', sampleSize: 900 }),
    ];
    const chain = { samme_bygg: 'bygg:1', mikroomrade: 'mikro:1', bydel: 'bydel:1', kommune: 'kommune:1', region: 'region:1' };
    const sel = selectAreaProfile(all, chain);
    expect(sel.usedLevel).toBe('bydel');
    expect(sel.fellBack).toBe(true);
    expect(sel.skipped.map((s) => s.level)).toEqual(['samme_bygg', 'mikroomrade']);
    expect(selectAreaProfile(all.slice(2), { bydel: 'bydel:1', kommune: 'kommune:1' }).fellBack).toBe(false);
    expect(selectAreaProfile(all, { kommune: 'kommune:1' }).usedLevel).toBe('kommune');
    expect(selectAreaProfile([], chain)).toMatchObject({ profile: null, usedLevel: null });
  });

  it('prisutviklingen kan gjøres om til en markedsindeks (interpolert, 100 nå)', () => {
    const idx = marketIndexFromAreaProfile(profile())!;
    expect(idx.indexAt('2026-10-01')).toBeCloseTo(100, 6);
    expect(idx.indexAt('2025-10-01')).toBeCloseTo(100 / 1.06, 4);
    const mid = idx.indexAt('2026-01-01')!; // mellom 12 og 6 mnd siden
    expect(mid).toBeGreaterThan(100 / 1.06);
    expect(mid).toBeLessThan(100);
    expect(idx.indexAt('2020-01-01')).toBeCloseTo(100 / 1.06, 4); // flat utenfor området
    expect(createMarketIndex([{ date: '2026-01-01', value: 100 }], '2026-10-01')).toBeNull();
    expect(marketIndexFromAreaProfile(profile({ priceChangePct: { m1: null, m3: null, m6: null, m12: null } }))).toBeNull();
  });
});
