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
  standardDocumented: true,
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
    originalAskingPrice: null,
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

  it('ukjente egenskaper gir svake poeng (ikke 0, ikke middels, aldri mer enn laveste kjente nivå)', () => {
    const { match } = physicalMatch(target, cmp({ bedrooms: null, layoutMatch: null, locationLevel: null, standardClass: null, floor: null, elevator: null, balcony: null, parking: null, propertyType: null, tenure: null }));
    expect(match.location).toBeGreaterThan(0);
    expect(match.location).toBeLessThanOrEqual(MARKET_PARAMS.location.region);
    expect(match.standard).toBeGreaterThan(0);
    expect(match.standard).toBeLessThanOrEqual(25 * MARKET_PARAMS.standardShare[3] + 0.05); // som en referanse tre trinn unna (avrundet)
    expect(match.total).toBeLessThan(50);
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
    expect(a.modelVersion).toBe('1.1.0');
  });
});


describe('ukjent er ikke middels (konservativ behandling)', () => {
  const known = () => cmp({ locationLevel: 'mikroomrade' });
  const weight = (c: MarketComparable) => {
    const e = weighMarket(target, [c], { today: TODAY });
    return byId(e, c.id);
  };

  it('ukjent lokasjon gir ikke mer enn laveste kjente nivå, lavere pålitelighet og ingen primærstatus', () => {
    const k = weight(known());
    const u = weight(cmp({ locationLevel: null }));
    expect(u.physical.location).toBeLessThanOrEqual(MARKET_PARAMS.location.region);
    expect(u.physical.location).toBeLessThan(k.physical.location);
    expect(u.reliabilityFactor).toBeLessThan(k.reliabilityFactor);
    expect(u.unknownFields).toContain('lokasjon');
    expect(u.role).toBe('sekundaer');
    expect(k.role).toBe('primaer');
    // Ukjent lokasjon er svakere enn en faktisk kjent kommune-referanse (middels kjent nivå)
    const kommune = weight(cmp({ locationLevel: 'kommune' }));
    expect(u.physical.location).toBeLessThan(kommune.physical.location);
    expect(u.effectiveWeight).toBeLessThan(kommune.effectiveWeight);
  });

  it('ukjent standard gir like lite som tre trinn unna, lavere pålitelighet og vekttak', () => {
    const k = weight(known());
    const u = weight(cmp({ standardClass: null }));
    const threeAway = weight(cmp({ standardClass: 'dagens_standard' })); // 3 trinn fra nyoppusset
    expect(u.physical.standard).toBe(threeAway.physical.standard);
    expect(u.reliabilityFactor).toBeLessThan(k.reliabilityFactor);
    expect(u.effectiveWeight).toBeLessThan(k.effectiveWeight * 0.5);
    expect(u.role).toBe('sekundaer');
    expect(u.unknownFields).toContain('standard');
  });

  it('ukjent BRA gir 0 poeng, ingen pris per m², null vekt og kan ikke brukes i ankeret', () => {
    const u = weight(cmp({ area: null }));
    expect(u.physical.area).toBe(0);
    expect(u.adjustedTotalPerM2).toBeNull();
    expect(u.effectiveWeight).toBe(0);
    expect(u.usedInAnchor).toBe(false);
    expect(u.unknownFields).toContain('areal');
    expect(u.role).toBe('sekundaer');
  });

  it('ukjent soverom gir mindre enn ett avvikende soverom og hindrer primærstatus', () => {
    const k = weight(known());
    const u = weight(cmp({ bedrooms: null }));
    const off = weight(cmp({ bedrooms: 3 }));
    expect(u.unknownFields).toContain('soverom');
    expect(u.reliabilityFactor).toBeLessThan(k.reliabilityFactor);
    expect(u.role).toBe('sekundaer');
    // Et kjent avvik på ett soverom gir 4 poeng, ukjent gir mindre
    expect(u.physical.rooms).toBeLessThan(off.physical.rooms);
  });

  it('kombinasjon av flere ukjente felt gjør referansen svak – aldri kunstig sterk', () => {
    const k = weight(known());
    const u = weight(cmp({ locationLevel: null, standardClass: null, bedrooms: null, layoutMatch: null, dataQuality: null }));
    expect(u.unknownFields).toEqual(expect.arrayContaining(['lokasjon', 'standard', 'soverom', 'planlosning']));
    expect(u.strength).toBe('svak');
    expect(u.role).toBe('sekundaer');
    expect(u.effectiveWeight).toBeLessThan(k.effectiveWeight * 0.25);
    expect(u.physical.total).toBeLessThan(k.physical.total * 0.7);
    expect(u.reasons.join(' ')).toContain('Ukjent er ikke middels');
    // Tre svakt dokumenterte referanser gir ikke «svært godt» grunnlag
    const weak = weighMarket(target, [1, 2, 3].map(() => cmp({ locationLevel: null, standardClass: null, bedrooms: null })), { today: TODAY });
    expect(weak.quality.tier).not.toBe('svaert_godt');
  });

  it('en referanse med annet antall soverom enn sluttproduktet kan aldri være primær', () => {
    expect(weight(cmp({ bedrooms: 3 })).role).toBe('sekundaer');
    expect(weight(cmp({ bedrooms: 2 })).role).toBe('primaer');
  });
});

describe('aktive annonser: ukjent fellesgjeld er aldri 0', () => {
  const sold = () => [cmp({ locationLevel: 'samme_bygg' }), cmp({ locationLevel: 'mikroomrade' }), cmp({ locationLevel: 'mikroomrade', date: '2026-09-16' })];
  const ad = (over: Partial<MarketComparable> = {}) => cmp({ kind: 'prisantydning', askingPrice: 3_800_000, soldPrice: null, soldTotalPrice: null, sharedDebt: null, tenure: 'borettslag', area: 58, date: '2026-10-01', ...over });

  it('ukjent fellesgjeld (borettslag) gir ikke totalpris per m² og senker påliteligheten', () => {
    const a = ad();
    const e = weighMarket({ ...target, tenure: 'borettslag' }, [...sold(), a], { today: TODAY });
    const r = byId(e, a.id);
    expect(r.askingPerM2).toBeNull(); // ikke 3 800 000 / 58 (som ville forutsatt gjeld 0)
    expect(r.flags).toContain('fellesgjeld_ukjent');
    const withDebtKnown = weighMarket({ ...target, tenure: 'borettslag' }, [ad({ sharedDebt: 0 })], { today: TODAY }).references[0];
    expect(r.reliabilityFactor).toBeLessThan(withDebtKnown.reliabilityFactor);
    // Annonsen beholdes som referanse (markedssignal), men gir ikke prissignal
    expect(r.role).toBe('markedsreferanse');
    expect(e.activeSignals.count).toBe(1);
    expect(e.activeSignals.priced).toBe(0);
    expect(e.activeSignals.medianAskingPerM2).toBeNull();
    expect(e.quality.notes.join(' ')).toContain('uten kjent fellesgjeld');
  });

  it('kjent fellesgjeld normaliseres til totalpris per m²; selveier uten oppgitt gjeld regnes gjeldfri', () => {
    const withDebt = ad({ sharedDebt: 500_000 });
    const e = weighMarket({ ...target, tenure: 'borettslag' }, [withDebt], { today: TODAY });
    expect(e.references[0].askingPerM2).toBe(Math.round((3_800_000 + 500_000) / 58));
    const selveier = ad({ tenure: 'selveier', sharedDebt: null });
    expect(weighMarket(target, [selveier], { today: TODAY }).references[0].askingPerM2).toBe(Math.round(3_800_000 / 58));
    // Ukjent eierform: gjelden kan ikke antas
    const unknownTenure = ad({ tenure: null, sharedDebt: null });
    expect(weighMarket(target, [unknownTenure], { today: TODAY }).references[0].askingPerM2).toBeNull();
  });
});

describe('aktive annonser som begrenset markedssignal', () => {
  const sold = () => [
    cmp({ locationLevel: 'samme_bygg', soldPrice: 4_000_000, soldTotalPrice: 4_000_000 }),
    cmp({ locationLevel: 'mikroomrade', soldPrice: 4_000_000, soldTotalPrice: 4_000_000, date: '2026-09-16' }),
    cmp({ locationLevel: 'mikroomrade', soldPrice: 4_000_000, soldTotalPrice: 4_000_000, date: '2026-08-16' }),
  ];
  const ad = (price: number, over: Partial<MarketComparable> = {}) => cmp({ kind: 'prisantydning', askingPrice: price, soldPrice: null, soldTotalPrice: null, sharedDebt: 0, locationLevel: 'samme_bygg', date: '2026-10-05', ...over });
  const base = () => weighMarket(target, sold(), { today: TODAY });

  it('ingen aktive annonser: ingen forskyvning, og aktive annonser er aldri faktiske salg', () => {
    const e = base();
    expect(e.positioning.activeSignalPct).toBe(0);
    expect(e.estimate!.base).toBe(e.positioning.anchorBase);
  });

  it('én aktiv annonse under ankeret flytter ikke normalverdien (krever minst to svært relevante)', () => {
    const e = weighMarket(target, [...sold(), ad(3_300_000)], { today: TODAY });
    expect(e.positioning.activeSignalPct).toBe(0);
  });

  it('flere svært relevante aktive annonser vesentlig under ankeret flytter normalverdien moderat ned, innenfor intervallet', () => {
    const b = base();
    const e = weighMarket(target, [...sold(), ad(3_500_000), ad(3_550_000)], { today: TODAY });
    expect(e.positioning.activeSignalPct).toBeLessThan(0);
    expect(e.positioning.activeSignalPct).toBeGreaterThanOrEqual(-MARKET_PARAMS.activeSignal.maxDownPct);
    expect(e.estimate!.base).toBeLessThan(b.estimate!.base);
    // Fortsatt innenfor det statistiske intervallet (low/high er uendret av annonsene)
    expect(e.estimate!.base).toBeGreaterThanOrEqual(e.estimate!.low);
    expect(e.estimate!.low).toBe(b.estimate!.low);
    expect(e.estimate!.high).toBe(b.estimate!.high);
    // Ankeret (basert på faktiske salg) er uendret – annonsene er ikke ny fasit
    expect(e.anchor.weightedMedianPerM2).toBe(b.anchor.weightedMedianPerM2);
    expect(e.positioning.notes.join(' ')).toContain('Aktive annonser flytter normalverdien');
  });

  it('prisnedsettelse og lang tid ute forsterker signalet, men aldri utover dokumentert maksimum', () => {
    const e = weighMarket(
      target,
      [...sold(), ad(3_400_000, { originalAskingPrice: 3_900_000, date: '2026-06-01' }), ad(3_450_000, { originalAskingPrice: 3_800_000, date: '2026-05-01' }), ad(3_300_000, { originalAskingPrice: 3_900_000, date: '2026-04-01' })],
      { today: TODAY },
    );
    expect(e.positioning.activeSignalPct).toBe(-MARKET_PARAMS.activeSignal.maxDownPct);
    expect(e.activeSignals.pointsDown).toBeGreaterThan(4);
    const refs = e.references.filter((r) => r.role === 'markedsreferanse');
    expect(refs.every((r) => r.priceReduced === true)).toBe(true);
    expect(refs.every((r) => (r.daysListed ?? 0) >= 90)).toBe(true);
  });

  it('annonser over ankeret kan flytte normalverdien opp, men mindre enn ned', () => {
    const e = weighMarket(target, [...sold(), ad(4_700_000), ad(4_650_000), ad(4_800_000)], { today: TODAY });
    expect(e.positioning.activeSignalPct).toBeGreaterThan(0);
    expect(e.positioning.activeSignalPct).toBeLessThanOrEqual(MARKET_PARAMS.activeSignal.maxUpPct);
    expect(MARKET_PARAMS.activeSignal.maxUpPct).toBeLessThan(MARKET_PARAMS.activeSignal.maxDownPct);
  });

  it('annonser med annen standard eller svak likhet teller ikke i signalet', () => {
    const e = weighMarket(target, [...sold(), ad(3_300_000, { standardClass: 'oppussingsobjekt' }), ad(3_300_000, { standardClass: null })], { today: TODAY });
    expect(e.positioning.activeSignalPct).toBe(0);
    expect(e.activeSignals.relevant).toBe(0);
  });

  it('annonser uten kjent fellesgjeld gir ikke prissignal', () => {
    const e = weighMarket({ ...target, tenure: 'borettslag' }, [...sold().map((c) => ({ ...c, tenure: 'borettslag' as const })), ad(3_300_000, { tenure: 'borettslag', sharedDebt: null }), ad(3_300_000, { tenure: 'borettslag', sharedDebt: null })], { today: TODAY });
    expect(e.positioning.activeSignalPct).toBe(0);
  });
});

describe('agentens begrensede ankerjustering og udokumentert sluttstandard', () => {
  const three = () => [cmp({ locationLevel: 'samme_bygg' }), cmp({ locationLevel: 'mikroomrade' }), cmp({ locationLevel: 'mikroomrade', date: '2026-09-16' })];

  it('begrunnet justering brukes av koden på ankeret og kappes ved ±5 %', () => {
    const base = weighMarket(target, three(), { today: TODAY });
    const plus2 = weighMarket(target, three(), { today: TODAY, anchorAdjustmentPct: 2 });
    expect(plus2.estimate!.base / base.estimate!.base).toBeCloseTo(1.02, 2);
    expect(plus2.positioning.anchorAdjustmentPct).toBe(2);
    const huge = weighMarket(target, three(), { today: TODAY, anchorAdjustmentPct: 40 });
    expect(huge.positioning.anchorAdjustmentPct).toBe(5);
    expect(huge.estimate!.base / base.estimate!.base).toBeCloseTo(1.05, 2);
    const neg = weighMarket(target, three(), { today: TODAY, anchorAdjustmentPct: -40 });
    expect(neg.positioning.anchorAdjustmentPct).toBe(-5);
  });

  it('udokumentert sluttstandard utvider intervallet og forklares', () => {
    const doc = weighMarket(target, three(), { today: TODAY });
    const undoc = weighMarket({ ...target, standardDocumented: false }, three(), { today: TODAY });
    expect(undoc.halfWidthPct!).toBeGreaterThan(doc.halfWidthPct!);
    expect(undoc.standardDocumented).toBe(false);
    expect(undoc.quality.notes.join(' ')).toContain('ikke dokumentert');
  });
});
