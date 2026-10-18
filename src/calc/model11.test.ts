import { describe, expect, it } from 'vitest';
import { computeCore, evaluate, resolveInput, type EngineInput } from './engine';
import { buildBaseValues, evaluateScenario, itemEconomics, normalizeScenarioValues, renovationTotals } from './scenario';
import { NEW_ACCOUNT_DEFAULTS } from '../config/defaults';
import { findAnalysisScenario, resolveAnalysisScenarios } from '../domain/analysisScenarios';
import { migrateProfileDefaultsRaw, migrateScenarioValuesRaw, scenarioModelDefaults } from '../domain/migrate';
import { ProfileDefaultsSchema, ScenarioValuesSchema, type RenovationItem, type ScenarioValues, type SharedAnalysis } from '../domain/schemas';
import { buildProperty } from '../data/analysisBuilder';
import { SEED_PROPERTIES, DEMO_FINN } from '../data/seedProperties';

const NOW = new Date('2026-10-16T08:00:00.000Z');

function input(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    purchasePrice: 2_000_000,
    debtAtPurchase: 0,
    debtAtSale: 0,
    duty: { basis: 'ingen', rate: 0, customBase: null },
    buyFees: 50_000,
    renovation: 200_000,
    reserveRate: 0.2,
    months: 6,
    monthlyCost: 5_000,
    interestRate: 0.06,
    purchaseFinancingShare: 0.9,
    renovationFinancingShare: 0,
    financeRunningCosts: false,
    availableEquity: 300_000,
    saleFixedCost: 120_000,
    saleCommissionRate: 0,
    saleBasis: 'kontant',
    salePrices: { low: 2_800_000, base: 3_000_000, high: 3_200_000 },
    ownHours: 100,
    hourValue: null,
    minProfitPerOwnHour: 500,
    profitTarget: 400_000,
    tax: { mode: 'uavklart', rate: null },
    ...overrides,
  };
}

describe('fortjeneste per egeninnsatstime (egen tid er ikke en kostnad)', () => {
  it('profitPerOwnHour = resultat før skatt / egne timer', () => {
    const b = evaluate(input()).base!;
    expect(b.profitPerOwnHour).toBeCloseTo(b.profit / 100, 6);
    expect(b.ownHours).toBe(100);
  });

  it('egne timer endrer ikke resultatet, kostnadene eller maksbudet', () => {
    const a = evaluate(input({ ownHours: 0 }));
    const b = evaluate(input({ ownHours: 400 }));
    const c = evaluate(input({ ownHours: null }));
    expect(b.base!.profit).toBe(a.base!.profit);
    expect(b.base!.C).toBe(a.base!.C);
    expect(c.base!.profit).toBe(a.base!.profit);
    expect(b.maxBid!.price).toBe(a.maxBid!.price);
  });

  it('0 og null egne timer gir ingen deling på null', () => {
    const zero = evaluate(input({ ownHours: 0 })).base!;
    const unknown = evaluate(input({ ownHours: null })).base!;
    expect(zero.profitPerOwnHour).toBeNull();
    expect(zero.meetsHourlyRequirement).toBeNull();
    expect(unknown.profitPerOwnHour).toBeNull();
    expect(Number.isNaN(zero.profit)).toBe(false);
  });

  it('sammenlignes mot minimumskravet, og ukjent krav gir ingen vurdering', () => {
    const b = evaluate(input({ ownHours: 100, minProfitPerOwnHour: 500 })).base!;
    expect(b.meetsHourlyRequirement).toBe(b.profitPerOwnHour! >= 500);
    const strict = evaluate(input({ ownHours: 100, minProfitPerOwnHour: 1_000_000 })).base!;
    expect(strict.meetsHourlyRequirement).toBe(false);
    const none = evaluate(input({ minProfitPerOwnHour: null })).base!;
    expect(none.meetsHourlyRequirement).toBeNull();
  });

  it('timeverdi (hourValue) er utfaset og påvirker ikke hovedresultatet', () => {
    const a = evaluate(input({ hourValue: null })).base!;
    const b = evaluate(input({ hourValue: 900 })).base!;
    expect(b.profit).toBe(a.profit);
  });
});

describe('kjøpslån og oppussingslån er adskilt', () => {
  const x = (o: Partial<EngineInput> = {}) => resolveInput(input(o)).resolved!;

  it('standard: 90 % kjøpslån og 0 % oppussingslån gir egenkapital til hele oppussingen', () => {
    const b = computeCore(x(), 2_000_000, 3_000_000);
    expect(b.purchaseLoan).toBe(1_845_000); // 90 % av (2 000 000 + 50 000)
    expect(b.renovationLoan).toBe(0);
    expect(b.runningLoan).toBe(0);
    expect(b.loanPeak).toBe(1_845_000);
    // Rente: kun på kjøpslånet (oppussingen er egenfinansiert)
    expect(b.I).toBe(Math.round(1_845_000 * 0.06 * 0.5));
    // EK = 10 % av kjøp + hele oppussingen med reserve + renter + drift
    expect(b.equityNeed).toBe(205_000 + 240_000 + b.I + b.O);
  });

  it('oppussingslån trekkes gradvis: renter på snitt halvveis uttrekk', () => {
    const b = computeCore(x({ purchaseFinancingShare: 0.9, renovationFinancingShare: 0.5 }), 2_000_000, 3_000_000);
    expect(b.renovationLoan).toBe(120_000);
    expect(b.I).toBe(Math.round((0.9 * 2_050_000 + (0.5 * 240_000) / 2) * 0.06 * 0.5));
    expect(b.loanPeak).toBe(b.purchaseLoan + b.renovationLoan);
  });

  it('samme låneandel på begge gir nøyaktig resultatet fra modell 1.0 (bakoverkompatibilitet)', () => {
    const f = 0.8;
    const b = computeCore(x({ purchaseFinancingShare: f, renovationFinancingShare: f }), 2_000_000, 3_000_000);
    const oldInterest = Math.round(f * (2_000_000_00 + 50_000_00 + 240_000_00 / 2) * 0.06 * 0.5) / 100;
    expect(b.I).toBe(oldInterest);
    expect(b.loanPeak).toBeCloseTo(f * (2_050_000 + 240_000), 2);
  });

  it('lånefinansierte løpende kostnader flytter drift og renter fra egenkapital til lån', () => {
    const own = computeCore(x({ financeRunningCosts: false }), 2_000_000, 3_000_000);
    const fin = computeCore(x({ financeRunningCosts: true }), 2_000_000, 3_000_000);
    expect(fin.runningLoan).toBe(fin.O + fin.I);
    expect(fin.equityNeed).toBeLessThan(own.equityNeed);
    expect(fin.equityNeed).toBe(fin.P + fin.K - fin.purchaseLoan + (fin.RB - fin.renovationLoan));
    expect(fin.I).toBeGreaterThan(own.I); // renter på lånefinansierte løpende kostnader
  });

  it('salgskostnader inngår fullt i resultatet, men ikke i egenkapitalbehovet', () => {
    const a = computeCore(x({ saleFixedCost: 0 }), 2_000_000, 3_000_000);
    const b = computeCore(x({ saleFixedCost: 200_000 }), 2_000_000, 3_000_000);
    expect(b.equityNeed).toBe(a.equityNeed);
    expect(a.profit - b.profit).toBe(200_000);
  });

  it('finansieringsgap mot tilgjengelig egenkapital', () => {
    const b = computeCore(x({ availableEquity: 300_000 }), 2_000_000, 3_000_000);
    expect(b.equityGap).toBeCloseTo(Math.max(0, b.equityNeed - 300_000), 2);
    expect(b.equityGap).toBeGreaterThan(0);
    const rich = computeCore(x({ availableEquity: 5_000_000 }), 2_000_000, 3_000_000);
    expect(rich.equityGap).toBe(0);
    const unknown = evaluate(input({ availableEquity: null })).base!;
    expect(unknown.equityGap).toBeNull();
  });

  it('manglende låneandel gir ufullstendig kalkyle med navngitte mangler (aldri 0)', () => {
    const r = resolveInput(input({ purchaseFinancingShare: null, renovationFinancingShare: null }));
    expect(r.resolved).toBeNull();
    expect(r.missing.map((m) => m.label)).toEqual(expect.arrayContaining(['Låneandel kjøp', 'Låneandel oppussing']));
  });
});

function legacyValues(over: Record<string, unknown> = {}): Record<string, unknown> {
  // Slik en lagret kalkyle (modell 1.0) så ut.
  const { analysisScenarioId, purchaseFinancingPct, renovationFinancingPct, financeRunningCosts, availableEquity, settlementMonths, weeklyOwnHours, minProfitPerOwnHour, laborModes, maxOwnWork, regulatedSelfWorkConfirmed, ...rest } = {
    ...scenarioModelDefaults(),
    buyerType: 'privat',
    purchasePrice: 2_000_000,
    debtAtPurchase: 0,
    debtAtSale: 0,
    dutyBasis: 'ingen',
    dutyPct: 0,
    dutyCustomBase: null,
    buyFees: 50_000,
    renovationMode: 'rundsum',
    renovationOptionId: null,
    renovationItems: [],
    renovationLumpSum: 200_000,
    lumpSumHours: 100,
    vatIncluded: true,
    reservePct: 20,
    months: 6,
    monthlyCost: 5_000,
    interestPct: 6,
    financingPct: 80,
    saleBasis: 'kontant',
    saleLow: 2_800_000,
    saleBase: 3_000_000,
    saleHigh: 3_200_000,
    saleFixedCost: 30_000,
    saleCommissionPct: 1.5,
    hourValue: 350,
    profitTarget: 400_000,
    taxMode: 'uavklart',
    taxPct: null,
    startBid: null,
    walkAway: null,
    notes: '',
    hourValue2: undefined,
  } as Record<string, unknown>;
  void [analysisScenarioId, purchaseFinancingPct, renovationFinancingPct, financeRunningCosts, availableEquity, settlementMonths, weeklyOwnHours, minProfitPerOwnHour, laborModes, maxOwnWork, regulatedSelfWorkConfirmed];
  delete rest.hourValue2;
  return { ...rest, ...over };
}

describe('migrering fra modell 1.0', () => {
  it('financingPct blir både kjøps- og oppussingslån, og resultatet er uendret', () => {
    const raw = legacyValues();
    const migrated = migrateScenarioValuesRaw(raw) as Record<string, unknown>;
    expect(migrated.purchaseFinancingPct).toBe(80);
    expect(migrated.renovationFinancingPct).toBe(80);
    expect('financingPct' in migrated).toBe(false);
    const ev = evaluateScenario(raw as unknown as ScenarioValues).evaluation.base!;
    // Samme resultat som modell 1.0: I = 0,8 × (2 050 000 + 120 000) × 6 % × ½
    expect(ev.I).toBe(Math.round(0.8 * (2_050_000 + 240_000 / 2) * 0.06 * 0.5));
    expect(ev.profit).toBe(3_000_000 - (2_000_000 + 50_000 + 240_000 + ev.I + 30_000 + 30_000 + 45_000));
  });

  it('gamle rader leses av skjemaet, og nye felt får nøytrale verdier (ukjent = null)', () => {
    const parsed = ScenarioValuesSchema.safeParse(legacyValues());
    expect(parsed.success).toBe(true);
    const v = parsed.success ? parsed.data : null;
    expect(v!.purchaseFinancingPct).toBe(80);
    expect(v!.minProfitPerOwnHour).toBeNull();
    expect(v!.availableEquity).toBeNull();
    expect(v!.analysisScenarioId).toBeNull();
    expect(v!.financeRunningCosts).toBe(false);
    expect(v!.hourValue).toBe(350); // beholdt som utfaset felt
  });

  it('manglende låneandel i en gammel rad forblir ukjent (null), ikke 0', () => {
    const m = migrateScenarioValuesRaw(legacyValues({ financingPct: null })) as Record<string, unknown>;
    expect(m.purchaseFinancingPct).toBeNull();
    expect(m.renovationFinancingPct).toBeNull();
  });

  it('allerede migrerte rader er uendret (idempotent)', () => {
    const once = migrateScenarioValuesRaw(legacyValues());
    expect(migrateScenarioValuesRaw(once)).toEqual(once);
    const v = normalizeScenarioValues(once as ScenarioValues);
    expect(normalizeScenarioValues(v)).toEqual(v);
  });

  it('profilens gamle standarder migreres uten å miste data', () => {
    const old = { buyerTypeApartment: 'privat', buyerTypeHouse: 'as', months: 6, interestPct: 7, financingPct: 100, reservePct: 20, hourValue: 350, profitTarget: 400_000, saleFixedCost: 55_000, saleCommissionPct: 1.5, buyFees: 6_000, homeArea: 'Trondheim' };
    const parsed = ProfileDefaultsSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    const p = parsed.success ? parsed.data : null;
    expect(p).toMatchObject({ interestPct: 7, purchaseFinancingPct: 100, renovationFinancingPct: 100, saleFixedCost: 55_000, saleCommissionPct: 1.5, hourValue: 350, weeklyOwnHours: 10, minProfitPerOwnHour: 500, availableEquity: 300_000 });
    expect(migrateProfileDefaultsRaw(old)).not.toHaveProperty('financingPct');
  });
});

describe('profilstandarder', () => {
  it('nye standarder følger kravene og validerer', () => {
    const d = NEW_ACCOUNT_DEFAULTS;
    expect(ProfileDefaultsSchema.safeParse(d).success).toBe(true);
    expect(d).toMatchObject({
      weeklyOwnHours: 10,
      minProfitPerOwnHour: 500,
      availableEquity: 300_000,
      interestPct: 6,
      purchaseFinancingPct: 90,
      renovationFinancingPct: 0,
      financeRunningCosts: false,
      saleFixedCost: 120_000,
      homeArea: 'Trondheim',
    });
    expect(d.saleSettlementMonths).toBeGreaterThanOrEqual(3);
    expect(d.saleSettlementMonths).toBeLessThanOrEqual(4);
    expect(Object.keys(d.laborModes)).toEqual(['riving', 'maling_sparkling', 'gulv', 'tomrer', 'kjokkenmontering', 'ror', 'elektro', 'bad_vatrom', 'annet']);
  });

  it('ugyldige verdier avvises', () => {
    expect(ProfileDefaultsSchema.safeParse({ ...NEW_ACCOUNT_DEFAULTS, purchaseFinancingPct: 120 }).success).toBe(false);
    expect(ProfileDefaultsSchema.safeParse({ ...NEW_ACCOUNT_DEFAULTS, weeklyOwnHours: -1 }).success).toBe(false);
    expect(ProfileDefaultsSchema.safeParse({ ...NEW_ACCOUNT_DEFAULTS, laborModes: { ...NEW_ACCOUNT_DEFAULTS.laborModes, gulv: 'gratis' } }).success).toBe(false);
  });
});

const item = (over: Partial<RenovationItem> = {}): RenovationItem => ({
  id: 'i',
  room: 'Bad',
  title: 'Tiltak',
  materials: 10_000,
  electrician: 0,
  plumber: 0,
  other: 0,
  hours: null,
  priority: 'anbefalt',
  included: true,
  laborCategory: 'maling_sparkling',
  laborHours: 100,
  laborCostHired: 80_000,
  ...over,
});
const labor = { laborModes: { ...NEW_ACCOUNT_DEFAULTS.laborModes }, maxOwnWork: false, regulatedSelfWorkConfirmed: false };

describe('arbeid: selv, delvis og innleid', () => {
  it('selv: arbeidet er gratis i kroner, og timene blir egeninnsats', () => {
    const e = itemEconomics(item({ workMode: 'selv' }), labor);
    expect(e).toMatchObject({ cost: 10_000, ownHours: 100, hiredLabor: 0, mode: 'selv' });
  });
  it('innleid: arbeidskostnaden kommer til, og ingen egne timer', () => {
    const e = itemEconomics(item({ workMode: 'innleid' }), labor);
    expect(e).toMatchObject({ cost: 90_000, ownHours: 0, hiredLabor: 80_000 });
  });
  it('delvis: fordeles etter egenandel', () => {
    const e = itemEconomics(item({ workMode: 'delvis', selfShare: 0.25 }), labor);
    expect(e).toMatchObject({ cost: 70_000, ownHours: 25, hiredLabor: 60_000 });
  });
  it('profilens arbeidsmodus brukes når tiltaket ikke har egen', () => {
    expect(itemEconomics(item({ laborCategory: 'maling_sparkling' }), labor).mode).toBe('selv');
    expect(itemEconomics(item({ laborCategory: 'tomrer' }), labor).mode).toBe('innleid');
  });
  it('ukjent arbeidskostnad for innleid arbeid gir ukjent tiltakskostnad (aldri 0)', () => {
    expect(itemEconomics(item({ workMode: 'innleid', laborCostHired: null }), labor).cost).toBeNull();
    // Men når du gjør det selv, trengs ikke prisen
    expect(itemEconomics(item({ workMode: 'selv', laborCostHired: null }), labor).cost).toBe(10_000);
    expect(itemEconomics(item({ workMode: 'selv', laborHours: null }), labor).ownHours).toBeNull();
  });
  it('eldre tiltak uten arbeidskategori følger eldre regler', () => {
    const legacy: RenovationItem = { id: 'l', room: 'Stue', title: 'Maling', materials: 15_000, electrician: 5_000, plumber: 0, other: 2_000, hours: 30, priority: 'anbefalt', included: true };
    expect(itemEconomics(legacy, labor)).toMatchObject({ cost: 22_000, ownHours: 30, mode: null });
  });
  it('maks egeninnsats gjør ikke-regulert arbeid til «selv», men aldri regulert arbeid', () => {
    const max = { ...labor, maxOwnWork: true };
    expect(itemEconomics(item({ laborCategory: 'tomrer' }), max).mode).toBe('selv');
    const elektro = itemEconomics(item({ laborCategory: 'elektro' }), max);
    expect(elektro.mode).toBe('innleid');
    expect(elektro.cost).toBe(90_000);
  });
  it('regulert arbeid regnes aldri som gratis uten bekreftet kompetanse – heller ikke når brukeren velger «selv»', () => {
    const e = itemEconomics(item({ laborCategory: 'bad_vatrom', workMode: 'selv' }), labor);
    expect(e).toMatchObject({ mode: 'innleid', downgraded: true, cost: 90_000, ownHours: 0 });
    const confirmed = itemEconomics(item({ laborCategory: 'bad_vatrom', workMode: 'selv' }), { ...labor, regulatedSelfWorkConfirmed: true });
    expect(confirmed).toMatchObject({ mode: 'selv', downgraded: false, cost: 10_000 });
  });
  it('summerer tiltak med egne timer og innleid arbeid, og varsler om nedgradert regulert arbeid', () => {
    const t = renovationTotals({
      renovationMode: 'tiltak',
      renovationItems: [item({ id: 'a', workMode: 'selv' }), item({ id: 'b', laborCategory: 'elektro', workMode: 'selv', laborHours: 20, laborCostHired: 30_000, materials: 5_000 })],
      renovationLumpSum: null,
      lumpSumHours: null,
      ...labor,
    });
    expect(t.total).toBe(10_000 + 5_000 + 30_000);
    expect(t.hours).toBe(100);
    expect(t.byLabor.elektro).toEqual({ ownHours: 0, hiredCost: 30_000 });
    expect(t.downgradedRegulated.map((i) => i.id)).toEqual(['b']);
  });
});

function builtAnalysis(finnId: string): { analysis: SharedAnalysis; built: ReturnType<typeof buildProperty> } {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === finnId)!;
  const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
  return { analysis: built.analysis, built };
}

describe('scenario-spesifikk analysemodell', () => {
  it('eldre analyse med én global salgsverdi virker via fallback – kun ett basisscenario merket «global»', () => {
    const { analysis, built } = builtAnalysis(DEMO_FINN.highDebt);
    expect(analysis.estimates.scenarios).toBeUndefined();
    const all = resolveAnalysisScenarios(analysis);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ kind: 'basis', source: 'legacy', saleSource: 'global', monthsAreTotal: true });
    expect(all[0].uncertainty.level).toBe('uavklart');
    const base = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS });
    expect(base.values.saleBase).toBe(analysis.estimates.sale.base);
    expect(base.origins.saleBase).toBe('analyse');
    expect(evaluateScenario(base.values).evaluation.status).toBe('complete');
  });

  it('nytt scenario har egne tiltak og egen salgsverdi, og alternativene får ikke kopiert den globale verdien', () => {
    const { analysis, built } = builtAnalysis(DEMO_FINN.sharedAB);
    const all = resolveAnalysisScenarios(analysis);
    expect(all.map((s) => s.kind)).toEqual(['basis', 'alternativ', 'alternativ']);
    expect(all.every((s) => s.source === 'agent' && s.saleSource === 'scenario')).toBe(true);
    const [basis, alt1, alt2] = all;
    expect(new Set([basis.sale.base, alt1.sale.base, alt2.sale.base]).size).toBe(3);
    expect(alt1.items.length).not.toBe(basis.items.length);
    const values = (s: typeof basis) => buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: s.id });
    const vb = values(basis);
    const v1 = values(alt1);
    expect(vb.values.saleBase).toBe(basis.sale.base);
    expect(v1.values.saleBase).toBe(alt1.sale.base);
    expect(v1.values.saleBase).not.toBe(analysis.estimates.sale.base);
    expect(v1.values.renovationItems).toHaveLength(alt1.items.length);
    expect(v1.values.analysisScenarioId).toBe(alt1.id);
    expect(v1.origins.saleBase).toBe('scenario');
    // Oppussingstid i scenarioet + tid til oppgjør fra profilen = total prosjektvarighet
    expect(vb.values.months).toBe(basis.suggestedMonths! + NEW_ACCOUNT_DEFAULTS.saleSettlementMonths);
    expect(vb.values.settlementMonths).toBe(NEW_ACCOUNT_DEFAULTS.saleSettlementMonths);
    expect(findAnalysisScenario(analysis, 'finnes-ikke').kind).toBe('basis');
  });

  it('privat endring påvirker aldri SharedAnalysis', () => {
    const { analysis, built } = builtAnalysis(DEMO_FINN.sharedAB);
    const before = structuredClone(analysis);
    const base = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS });
    const mine = structuredClone(base.values);
    mine.saleBase = 9_999_999;
    mine.renovationItems[0].materials = 1;
    mine.renovationItems[0].laborCostHired = 1;
    mine.purchasePrice = 1;
    mine.laborModes.elektro = 'selv';
    expect(analysis).toEqual(before);
    // Grunnverdiene bygges på nytt fra analysen og er uforandret
    const again = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS });
    expect(again.values.saleBase).toBe(base.values.saleBase);
    expect(again.values.renovationItems[0].materials).toBe(base.values.renovationItems[0].materials);
  });

  it('grunnverdier fra scenarioet kan overstyres privat per felt og beholder opprinnelsen', () => {
    const { analysis, built } = builtAnalysis(DEMO_FINN.sharedAB);
    const base = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS });
    for (const key of ['purchaseFinancingPct', 'renovationFinancingPct', 'availableEquity', 'minProfitPerOwnHour', 'weeklyOwnHours', 'saleFixedCost', 'interestPct', 'months', 'monthlyCost', 'buyFees', 'reservePct'] as const) {
      expect(base.origins[key], key).toBeTruthy();
    }
    expect(base.values.renovationFinancingPct).toBe(0);
    expect(base.values.purchaseFinancingPct).toBe(90);
    expect(base.values.hourValue).toBeNull();
  });
});
