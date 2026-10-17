import { describe, expect, it } from 'vitest';
import { migrateLegacyComparable, pricePerM2, pricesFromLegacy, soldMedians, validateComparable, type ComparableFields } from './comparables';

const base: ComparableFields = { name: 'Testveien 1', url: null, kind: 'solgt', askingPrice: null, soldPrice: null, commonCosts: null, soldTotalPrice: null, area: null, date: null, notes: '' };

describe('sammenlignbare objekter', () => {
  it('kr/m² bruker solgt totalpris, så solgt pris, så prisantydning – og er null uten areal', () => {
    expect(pricePerM2({ ...base, soldTotalPrice: 3_000_000, soldPrice: 2_000_000, area: 50 })).toEqual({ value: 60_000, basis: 'solgt_total' });
    expect(pricePerM2({ ...base, soldPrice: 2_000_000, area: 50 })).toEqual({ value: 40_000, basis: 'solgt' });
    expect(pricePerM2({ ...base, kind: 'prisantydning', askingPrice: 2_500_000, area: 50 })).toEqual({ value: 50_000, basis: 'prisantydning' });
    expect(pricePerM2({ ...base, soldPrice: 2_000_000 })).toBeNull();
    // solgt uten sum: ingen oppnådd pris å regne på
    expect(pricePerM2({ ...base, kind: 'solgt_uten_sum', area: 50 })).toBeNull();
  });

  it('median teller bare faktiske salg og blander ikke prisgrunnlag', () => {
    const m = soldMedians([
      { ...base, soldPrice: 2_000_000, soldTotalPrice: 3_000_000, area: 50 },
      { ...base, soldPrice: 4_000_000, area: 100 },
      { ...base, soldPrice: 2_400_000, soldTotalPrice: 3_300_000, area: 50 },
      { ...base, kind: 'prisantydning', askingPrice: 9_000_000, area: 50 },
      { ...base, kind: 'solgt_uten_sum', area: 50 },
    ]);
    expect(m.total).toEqual({ value: 63_000, n: 2 });
    expect(m.cash).toEqual({ value: 40_000, n: 3 });
  });

  it('validerer: faktisk salg krever sum, andre typer kan ikke ha solgt pris, ingen negative beløp', () => {
    expect(validateComparable({ ...base, name: '' }).map((i) => i.field)).toContain('name');
    expect(validateComparable(base).map((i) => i.field)).toContain('kind');
    expect(validateComparable({ ...base, soldPrice: 1 })).toEqual([]);
    expect(validateComparable({ ...base, kind: 'prisantydning', askingPrice: 1, soldPrice: 1 }).map((i) => i.field)).toContain('kind');
    expect(validateComparable({ ...base, kind: 'solgt_uten_sum' })).toEqual([]);
    expect(validateComparable({ ...base, soldPrice: -5, area: 0 }).map((i) => i.field)).toEqual(expect.arrayContaining(['soldPrice', 'area']));
    expect(validateComparable({ ...base, soldPrice: 3_000_000, soldTotalPrice: 2_000_000 }).map((i) => i.field)).toContain('soldTotalPrice');
    expect(validateComparable({ ...base, soldPrice: 1, date: '17.10.2026' }).map((i) => i.field)).toContain('date');
  });

  it('eldre «én pris + prisgrunnlag» oversettes uten å gjøre ukjent gjeld om til 0', () => {
    expect(pricesFromLegacy({ kind: 'solgt', price: 3_000_000, priceBasis: 'total', debt: 800_000 })).toEqual({ askingPrice: null, soldPrice: 2_200_000, soldTotalPrice: 3_000_000 });
    expect(pricesFromLegacy({ kind: 'solgt', price: 4_000_000, priceBasis: 'kontant', debt: null })).toEqual({ askingPrice: null, soldPrice: 4_000_000, soldTotalPrice: null });
    expect(pricesFromLegacy({ kind: 'solgt', price: 3_000_000, priceBasis: 'total', debt: null })).toEqual({ askingPrice: null, soldPrice: null, soldTotalPrice: 3_000_000 });
    expect(pricesFromLegacy({ kind: 'prisantydning', price: 3_000_000, priceBasis: 'kontant' })).toEqual({ askingPrice: 3_000_000, soldPrice: null, soldTotalPrice: null });
    expect(pricesFromLegacy({ kind: 'solgt_uten_sum', price: null, priceBasis: 'kontant' })).toEqual({ askingPrice: null, soldPrice: null, soldTotalPrice: null });
    const migrated = migrateLegacyComparable({ id: 'x', name: 'a', kind: 'solgt', price: 1_000_000, priceBasis: 'kontant', debt: null, area: 40 });
    expect(migrated).toMatchObject({ soldPrice: 1_000_000, soldTotalPrice: null, commonCosts: null, area: 40 });
    expect(migrated).not.toHaveProperty('price');
    // idempotent
    expect(migrateLegacyComparable(migrated)).toBe(migrated);
  });
});
