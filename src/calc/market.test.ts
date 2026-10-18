import { describe, expect, it } from 'vitest';
import { areaPoints, MARKET_PARAMS, normalizedTotalPrice, physicalMatch, weighMarket, weightedMean, weightedMedian, type MarketComparable, type MarketTarget } from './market';
import { createMarketIndex } from '../domain/areaProfile';

const TODAY = '2026-10-16';

const target: MarketTarget = {
  areaBRAi: 58,
  bedrooms: 2,
  propertyType: 'leilighet',
  tenure: 'selveier',
  standardClass: 'nyoppusset',
  floor: 2,
  elevator: false,
  balcony: false,
  parking: false,
  basis: 'kontant',
  sharedDebt: 0,
};

let n = 0;
function cmp(over: Partial<MarketComparable> = {}): MarketComparable {
  n += 1;
  return {
    id: `c${n}`,
    name: `Referanse ${n}`,
    kind: 'solgt',
    askingPrice: null,
    soldPrice: 4_000_000,
    soldTotalPrice: 4_000_000,
    sharedDebt: 0,
    area: 58,
    date: '2026-08-16',
    bedrooms: 2,
    propertyType: 'leilighet',
    tenure: 'selveier',
    locationLevel: 'mikroomrade',
    standardClass: 'nyoppusset',
    layoutMatch: 'lik',
    floor: 2,
    elevator: false,
    balcony: false,
    parking: false,
    dataQuality: 'hoy',
    marketAdjustment: null,
    ...over,
  };
}
const byId = (e: ReturnType<typeof weighMarket>, id: string) => e.references.find((r) => r.id === id)!;

describe('fysisk likhet 0–100', () => {
  it('poengfordelingen summerer til 100 (lokasjon 25, standard 25, BRA 15, soverom/planløsning 15, type 10, øvrige 10)', () => {
    const p = MARKET_PARAMS.points;
    expect(p.location + p.standard + p.area + p.rooms + p.type + p.other).toBe(100);
  });

  it('samme bygg + lik standard + lik størrelse og planløsning scorer svært høyt', () => {
    const { match } = physicalMatch(target, cmp({ locationLevel: 'samme_bygg', area: 59, floor: 3 }));
    expect(match.location).toBe(25);
    expect(match.standard).toBe(25);
    expect(match.area).toBe(15);
    expect(match.rooms).toBe(15);
    expect(match.type).toBe(10);
    expect(match.total).toBeGreaterThanOrEqual(95);
  });

  it('samme bygg i gammel standard gir lite standardpoeng', () => {
    const { match, standardGap } = physicalMatch(target, cmp({ locationLevel: 'samme_bygg', standardClass: 'oppussingsobjekt' }));
    expect(standardGap).toBe(4);
    expect(match.standard).toBe(0);
    expect(match.location).toBe(25);
  });

  it('BRA-regler: ≤5 %: 15, ≤10 %: 13, ≤15 %: 10, ≤25 %: 6, ≤35 %: 3, større: 0', () => {
    expect([0.05, 0.0501, 0.1, 0.1001, 0.15, 0.1501, 0.25, 0.2501, 0.35, 0.3501, 0.6].map(areaPoints)).toEqual([15, 13, 13, 10, 10, 6, 6, 3, 3, 0, 0]);
    expect(areaPoints(null)).toBe(0);
    // Via beregningen: 58 m² mot 58 × 1,3 = 75,4 (30 % avvik) gir 3 poeng
    expect(physicalMatch(target, cmp({ area: 75.4 })).match.area).toBe(3);
  });

  it('ukjente egenskaper gir moderate poeng, ikke full score og ikke 0', () => {
    const { match } = physicalMatch(target, cmp({ bedrooms: null, layoutMatch: null, locationLevel: null, standardClass: null, floor: null, elevator: null, balcony: null, parking: null, propertyType: null, tenure: null }));
    expect(match.location).toBeGreaterThan(0);
    expect(match.location).toBeLessThan(25);
    expect(match.standard).toBeGreaterThan(0);
    expect(match.standard).toBeLessThan(25);
    expect(match.total).toBeLessThan(70);
  });
});

describe('prisnormalisering og markedsjustering', () => {
  it('totalpris utledes fra kontantpris + fellesgjeld, og selveier uten gjeld er lik kontantprisen', () => {
    expect(normalizedTotalPrice(cmp({ soldTotalPrice: null, soldPrice: 2_000_000, sharedDebt: 1_500_000 }))).toBe(3_500_000);
    expect(normalizedTotalPrice(cmp({ soldTotalPrice: 3_500_000, soldPrice: 2_000_000, sharedDebt: null }))).toBe(3_500_000);
    expect(normalizedTotalPrice(cmp({ soldTotalPrice: null, soldPrice: 4_000_000, sharedDebt: null, tenure: 'selveier' }))).toBe(4_000_000);
    expect(normalizedTotalPrice(cmp({ soldTotalPrice: null, soldPrice: 2_000_000, sharedDebt: null, tenure: 'borettslag' }))).toBeNull();
  });

  it('markedsjustert pris = salgspris × indeks nå / indeks ved salg', () => {
    const index = createMarketIndex(
      [
        { date: '2025-01-01', value: 100 },
        { date: '2026-10-16', value: 110 },
      ],
      TODAY,
    )!;
    const old = cmp({ date: '2025-01-01', soldPrice: 4_000_000, soldTotalPrice: 4_000_000, area: 58 });
    const e = weighMarket(target, [old], { today: TODAY, index });
    const r = byId(e, old.id);
    expect(r.marketAdjusted).toBe(true);
    expect(r.marketAdjustmentFactor).toBe(1.1);
    expect(r.adjustedTotalPerM2).toBe(Math.round((4_000_000 * 1.1) / 58));
  });

  it('manuell markedsjusteringsfaktor går foran indeks', () => {
    const c = cmp({ marketAdjustment: 1.05 });
    const r = byId(weighMarket(target, [c], { today: TODAY }), c.id);
    expect(r.marketAdjustmentFactor).toBe(1.05);
    expect(r.adjustedTotalPerM2).toBe(Math.round((4_000_000 * 1.05) / 58));
  });
});

describe('vekter og roller', () => {
  it('eldre, markedsjustert salg kan ha høy vekt (men faller raskere uten indeks)', () => {
    const index = createMarketIndex(
      [
        { date: '2025-01-01', value: 100 },
        { date: '2026-10-16', value: 108 },
      ],
      TODAY,
    )!;
    const old = cmp({ date: '2025-04-16', locationLevel: 'samme_bygg', area: 59 }); // 18 måneder
    const withIdx = byId(weighMarket(target, [old], { today: TODAY, index }), old.id);
    const without = byId(weighMarket(target, [old], { today: TODAY }), old.id);
    expect(withIdx.ageMonths).toBeCloseTo(18, 0);
    expect(withIdx.effectiveWeight).toBeGreaterThanOrEqual(0.8);
    expect(without.effectiveWeight).toBeLessThan(withIdx.effectiveWeight);
    expect(without.marketTimeFactor).toBeLessThan(withIdx.marketTimeFactor);
  });

  it('effektiv vekt = fysisk/100 × pålitelighet × markedstid (adskilte faktorer)', () => {
    const c = cmp({ date: '2026-09-16', dataQuality: 'middels' });
    const r = byId(weighMarket(target, [c], { today: TODAY }), c.id);
    expect(r.effectiveWeight).toBeCloseTo((r.physical.total / 100) * r.reliabilityFactor * r.marketTimeFactor, 1);
    expect(r.reliabilityFactor).toBe(0.85);
  });

  it('dårlig datakvalitet reduserer effektiv vekt', () => {
    const good = cmp({ dataQuality: 'hoy' });
    const bad = cmp({ dataQuality: 'lav' });
    const noDate = cmp({ dataQuality: 'hoy', date: null });
    const e = weighMarket(target, [good, bad, noDate], { today: TODAY });
    expect(byId(e, bad.id).effectiveWeight).toBeLessThan(byId(e, good.id).effectiveWeight);
    expect(byId(e, noDate.id).effectiveWeight).toBeLessThan(byId(e, good.id).effectiveWeight);
    expect(byId(e, noDate.id).flags).toContain('mangler_dato');
  });

  it('samme bygg i gammel standard kan ikke dominere et nyoppusset scenario', () => {
    const oldSame = cmp({ name: 'Samme bygg – oppussingsobjekt', locationLevel: 'samme_bygg', standardClass: 'oppussingsobjekt', area: 56, soldPrice: 3_050_000, soldTotalPrice: 3_050_000, date: '2026-07-16' });
    const newNear = cmp({ name: 'Bydel – nyoppusset', locationLevel: 'bydel', standardClass: 'nyoppusset', area: 61, layoutMatch: 'delvis', soldPrice: 4_250_000, soldTotalPrice: 4_250_000, date: '2026-06-16' });
    const e = weighMarket(target, [oldSame, newNear], { today: TODAY });
    const a = byId(e, oldSame.id);
    const b = byId(e, newNear.id);
    expect(a.role).toBe('sekundaer');
    expect(a.flags).toContain('gammel_standard');
    expect(a.effectiveWeight).toBeLessThan(b.effectiveWeight);
    expect(a.effectiveWeight).toBeLessThan(0.4);
  });

  it('oppussingsobjekt i samme bygg trekker ikke ferdigverdien kunstig ned', () => {
    const goods = [
      cmp({ locationLevel: 'samme_bygg', area: 59, soldPrice: 4_100_000, soldTotalPrice: 4_100_000 }),
      cmp({ locationLevel: 'mikroomrade', area: 57, soldPrice: 4_060_000, soldTotalPrice: 4_060_000 }),
      cmp({ locationLevel: 'mikroomrade', area: 61, soldPrice: 4_250_000, soldTotalPrice: 4_250_000 }),
    ];
    const old = cmp({ locationLevel: 'samme_bygg', standardClass: 'oppussingsobjekt', area: 56, soldPrice: 3_050_000, soldTotalPrice: 3_050_000 });
    const without = weighMarket(target, goods, { today: TODAY });
    const withOld = weighMarket(target, [...goods, old], { today: TODAY });
    expect(byId(withOld, old.id).usedInAnchor).toBe(false);
    expect(withOld.estimate!.base).toBe(without.estimate!.base);
    expect(withOld.anchor.weightedMedianPerM2).toBe(without.anchor.weightedMedianPerM2);
  });

  it('primær-, sekundær- og markedsreferanse', () => {
    const prim = cmp({ locationLevel: 'samme_bygg' });
    const farArea = cmp({ locationLevel: 'bydel', area: 80 }); // > 25 % avvik
    const active = cmp({ kind: 'prisantydning', askingPrice: 4_390_000, soldPrice: null, soldTotalPrice: null });
    const noSum = cmp({ kind: 'solgt_uten_sum', soldPrice: null, soldTotalPrice: null });
    const e = weighMarket(target, [prim, farArea, active, noSum], { today: TODAY });
    expect(byId(e, prim.id).role).toBe('primaer');
    expect(byId(e, farArea.id).role).toBe('sekundaer');
    expect(byId(e, farArea.id).flags).toContain('bra_avviker_mye');
    expect(byId(e, active.id).role).toBe('markedsreferanse');
    expect(byId(e, noSum.id).role).toBe('sekundaer');
    expect(byId(e, noSum.id).effectiveWeight).toBe(0);
    expect(byId(e, noSum.id).usedInAnchor).toBe(false);
    expect(e.references.map((r) => r.role)).toEqual(['primaer', 'sekundaer', 'sekundaer', 'markedsreferanse']);
  });

  it('forklarer hvorfor en referanse er sterk eller svak', () => {
    const c = cmp({ locationLevel: 'samme_bygg', standardClass: 'oppussingsobjekt' });
    const r = byId(weighMarket(target, [c], { today: TODAY }), c.id);
    expect(r.reasons.join(' ')).toMatch(/Samme bygg/);
    expect(r.reasons.join(' ')).toMatch(/Standarden avviker/);
    expect(r.strength).not.toBe('sterk');
    expect(r.effectiveWeight).toBeLessThan(0.4);
  });
});

describe('salgsestimat', () => {
  const three = () => [
    cmp({ locationLevel: 'samme_bygg', area: 59, soldPrice: 4_100_000, soldTotalPrice: 4_100_000, date: '2026-08-16' }),
    cmp({ locationLevel: 'samme_bygg', area: 57, soldPrice: 4_020_000, soldTotalPrice: 4_020_000, date: '2026-07-16' }),
    cmp({ locationLevel: 'mikroomrade', area: 58, soldPrice: 4_060_000, soldTotalPrice: 4_060_000, date: '2026-09-16' }),
  ];
  const active = () => cmp({ kind: 'prisantydning', askingPrice: 4_390_000, soldPrice: null, soldTotalPrice: null, locationLevel: 'mikroomrade', area: 60 });

  it('aktiv annonse inngår aldri i prisankeret, og brukes bare som markedssignal', () => {
    const base = weighMarket(target, three(), { today: TODAY });
    const a = active();
    const withActive = weighMarket(target, [...three(), a], { today: TODAY });
    expect(byId(withActive, a.id).usedInAnchor).toBe(false);
    expect(byId(withActive, a.id).adjustedTotalPerM2).toBeNull();
    expect(byId(withActive, a.id).effectiveWeight).toBe(0);
    expect(withActive.anchor.weightedMedianPerM2).toBe(base.anchor.weightedMedianPerM2);
    expect(withActive.activeSignals.count).toBe(1);
    expect(withActive.activeSignals.medianAskingPerM2).toBe(Math.round(4_390_000 / 60));
    // Kun aktive annonser gir ingen verdi
    const onlyActive = weighMarket(target, [a, active()], { today: TODAY });
    expect(onlyActive.status).toBe('for_usikkert');
    expect(onlyActive.estimate).toBeNull();
  });

  it('robust vektet median er anker; vektet gjennomsnitt er kontroll', () => {
    expect(weightedMedian([{ value: 10, weight: 1 }, { value: 20, weight: 1 }, { value: 1000, weight: 1 }])).toBe(20); // robust mot uteligger
    expect(weightedMean([{ value: 10, weight: 1 }, { value: 20, weight: 1 }, { value: 1000, weight: 1 }])).toBeCloseTo(343.33, 1);
    expect(weightedMedian([{ value: 1, weight: 1 }, { value: 3, weight: 1 }])).toBe(2);
    expect(weightedMedian([])).toBeNull();
    const e = weighMarket(target, three(), { today: TODAY });
    expect(e.anchor.weightedMedianPerM2).not.toBeNull();
    expect(e.anchor.weightedMeanPerM2).not.toBeNull();
  });

  it('3 gode dokumenterte salg + 1 relevant annonse gir svært godt grunnlag og smalt intervall (~±3–4 %)', () => {
    const e = weighMarket(target, [...three(), active()], { today: TODAY });
    expect(e.quality.tier).toBe('svaert_godt');
    expect(e.quality.goodSales).toBe(3);
    expect(e.status).toBe('ok');
    expect(e.halfWidthPct!).toBeGreaterThanOrEqual(3);
    expect(e.halfWidthPct!).toBeLessThanOrEqual(5);
    const est = e.estimate!;
    expect(est.low).toBeLessThan(est.base);
    expect(est.high).toBeGreaterThan(est.base);
    expect(est.basis).toBe('kontant');
  });

  it('2 svært gode salg kan gi verdi, men med lavere sikkerhet og bredere intervall', () => {
    const strong = weighMarket(target, [...three(), active()], { today: TODAY });
    const two = weighMarket(target, three().slice(0, 2), { today: TODAY });
    expect(two.status).toBe('ok');
    expect(two.estimate).not.toBeNull();
    expect(['normalt', 'svakt']).toContain(two.quality.tier);
    expect(two.quality.score).toBeLessThan(strong.quality.score);
    expect(two.halfWidthPct!).toBeGreaterThan(strong.halfWidthPct!);
  });

  it('svakere grunnlag gir bredere salgsintervall (ikke fast ±5 %)', () => {
    const mediocre = [
      cmp({ locationLevel: 'bydel', area: 66, standardClass: 'oppgradert', layoutMatch: 'delvis', dataQuality: 'middels', soldPrice: 4_300_000, soldTotalPrice: 4_300_000, date: '2026-02-16' }),
      cmp({ locationLevel: 'kommune', area: 52, standardClass: 'oppgradert', layoutMatch: 'delvis', dataQuality: 'middels', soldPrice: 3_800_000, soldTotalPrice: 3_800_000, date: '2026-03-16' }),
      cmp({ locationLevel: 'bydel', area: 62, standardClass: 'oppgradert', layoutMatch: 'delvis', dataQuality: 'middels', soldPrice: 4_150_000, soldTotalPrice: 4_150_000, date: '2026-01-16' }),
    ];
    const strong = weighMarket(target, [...three(), active()], { today: TODAY });
    const weak = weighMarket(target, mediocre, { today: TODAY });
    expect(weak.status).toBe('ok');
    expect(weak.halfWidthPct!).toBeGreaterThan(strong.halfWidthPct! + 2);
    expect(weak.halfWidthPct!).toBeGreaterThanOrEqual(6);
    expect(['normalt', 'svakt']).toContain(weak.quality.tier);
  });

  it('utilstrekkelig grunnlag gir «for usikkert» uten tvungen normalverdi', () => {
    const one = weighMarket(target, [cmp({ locationLevel: 'kommune', area: 70, standardClass: 'middels', dataQuality: 'lav', date: '2025-06-16' })], { today: TODAY });
    expect(one.status).toBe('for_usikkert');
    expect(one.estimate).toBeNull();
    expect(one.quality.tier).toBe('utilstrekkelig');
    expect(one.reason).toBeTruthy();
    expect(weighMarket(target, [], { today: TODAY }).status).toBe('for_usikkert');
  });

  it('kontant- og totalprisgrunnlag normaliseres (fellesgjeld trekkes fra ved kontantpris)', () => {
    const borettslag: MarketTarget = { ...target, tenure: 'borettslag', basis: 'total', sharedDebt: 1_500_000 };
    const refs = [
      cmp({ tenure: 'borettslag', soldPrice: 2_000_000, soldTotalPrice: 3_500_000, sharedDebt: 1_500_000, locationLevel: 'samme_bygg' }),
      cmp({ tenure: 'borettslag', soldPrice: 2_100_000, soldTotalPrice: null, sharedDebt: 1_500_000, locationLevel: 'samme_bygg' }),
      cmp({ tenure: 'borettslag', soldPrice: 1_900_000, soldTotalPrice: 3_400_000, sharedDebt: 1_500_000, locationLevel: 'mikroomrade' }),
    ];
    const total = weighMarket(borettslag, refs, { today: TODAY });
    const cash = weighMarket({ ...borettslag, basis: 'kontant' }, refs, { today: TODAY });
    expect(total.estimate!.basis).toBe('total');
    expect(cash.estimate!.base).toBe(total.estimate!.base - 1_500_000);
    // Ukjent fellesgjeld ved salg gir ikke kontantpris
    const unknownDebt = weighMarket({ ...borettslag, basis: 'kontant', sharedDebt: null }, refs, { today: TODAY });
    expect(unknownDebt.status).toBe('for_usikkert');
  });

  it('er deterministisk og tar ikke «i dag» fra systemklokken', () => {
    const refs = [...three(), active()];
    const a = weighMarket(target, refs, { today: TODAY });
    const b = weighMarket(target, refs, { today: TODAY });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.modelVersion).toBe('1.0.0');
  });
});
