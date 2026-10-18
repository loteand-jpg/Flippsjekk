import { describe, expect, it } from 'vitest';
import { computeCore, evaluate, recommendedBidOf, resolveInput, type EngineInput } from './engine';
import { comparablesForScenario, LEVEL_FALLBACK_STANDARD, scenarioStandard, toMarketComparable } from './market';
import { analysisDateKey, resolveScenarioSale } from './saleValue';
import { buildBaseValues, evaluateScenario, ignoredLegacyTrades, itemEconomics, normalizeScenarioValues, renovationTotals, usesLaborModel } from './scenario';
import { NEW_ACCOUNT_DEFAULTS } from '../config/defaults';
import { findAnalysisScenario, resolveAnalysisScenarios } from '../domain/analysisScenarios';
import { migrateProfileDefaultsRaw, migrateRenovationItemRaw, migrateScenarioValuesRaw, scenarioModelDefaults } from '../domain/migrate';
import { AnalysisScenarioSchema, ProfileDefaultsSchema, ScenarioValuesSchema, type RenovationItem, type ScenarioValues, type SharedAnalysis } from '../domain/schemas';
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
    expect(b.purchaseLoan).toBe(1_800_000); // 90 % av kjøpesummen P alene
    expect(b.renovationLoan).toBe(0);
    expect(b.runningLoan).toBe(0);
    expect(b.loanPeak).toBe(1_800_000);
    // Rente: kun på kjøpslånet (oppussingen er egenfinansiert)
    expect(b.I).toBe(Math.round(1_800_000 * 0.06 * 0.5));
    // EK = 10 % av kjøpesummen + HELE kjøpskostnaden + hele oppussingen med reserve + renter + drift
    expect(b.equityNeed).toBe(200_000 + 50_000 + 240_000 + b.I + b.O);
  });

  it('kjøpslånet gjelder bare P, ikke P + K', () => {
    const b = computeCore(x({ purchaseFinancingShare: 0.9 }), 2_000_000, 3_000_000);
    expect(b.K).toBe(50_000);
    expect(b.purchaseLoan).toBe(0.9 * 2_000_000);
    expect(b.purchaseLoan).not.toBe(0.9 * (2_000_000 + 50_000));
    // Renten påvirkes ikke av kjøpskostnadene: dobbel K gir samme rente
    const moreFees = computeCore(x({ purchaseFinancingShare: 0.9, buyFees: 150_000 }), 2_000_000, 3_000_000);
    expect(moreFees.I).toBe(b.I);
    expect(moreFees.purchaseLoan).toBe(b.purchaseLoan);
  });

  it('kjøpskostnader går til egenkapitalbehovet og lånefinansieres ikke automatisk', () => {
    const a = computeCore(x({ buyFees: 50_000 }), 2_000_000, 3_000_000);
    const b = computeCore(x({ buyFees: 150_000 }), 2_000_000, 3_000_000);
    expect(b.equityNeed - a.equityNeed).toBe(100_000); // hele merkostnaden, kroner for kroner
    expect(b.loanPeak).toBe(a.loanPeak);
    // Også med 100 % kjøpslån må kjøpskostnadene dekkes av egenkapital
    const full = computeCore(x({ purchaseFinancingShare: 1, renovationFinancingShare: 1 }), 2_000_000, 3_000_000);
    expect(full.equityNeed).toBe(full.K + full.I + full.O);
  });

  it('dokumentavgift øker egenkapitalbehovet, men ikke lånet', () => {
    const duty = resolveInput(input({ duty: { basis: 'kjopesum', rate: 0.025, customBase: null } })).resolved!;
    const b = computeCore(duty, 2_000_000, 3_000_000);
    expect(b.duty).toBe(50_000);
    expect(b.purchaseLoan).toBe(1_800_000);
    expect(b.equityNeed).toBe(200_000 + 50_000 + 50_000 + 240_000 + b.I + b.O);
  });

  it('oppussingslån trekkes gradvis: renter på snitt halvveis uttrekk', () => {
    const b = computeCore(x({ purchaseFinancingShare: 0.9, renovationFinancingShare: 0.5 }), 2_000_000, 3_000_000);
    expect(b.renovationLoan).toBe(120_000);
    expect(b.I).toBe(Math.round((0.9 * 2_000_000 + (0.5 * 240_000) / 2) * 0.06 * 0.5));
    expect(b.loanPeak).toBe(b.purchaseLoan + b.renovationLoan);
  });

  it('samme låneandel gir IKKE lenger tallene fra modell 1.0/1.1 – forskjellen er bevisst og lik renten på kjøpskostnadene', () => {
    const f = 0.8;
    const now = computeCore(x({ purchaseFinancingShare: f, renovationFinancingShare: f }), 2_000_000, 3_000_000);
    const old = computeCore(x({ purchaseFinancingShare: f, renovationFinancingShare: f, purchaseLoanBasis: 'kjopesum_og_kostnader' }), 2_000_000, 3_000_000);
    // Modell 1.0/1.1: I = f × (P + K + RB/2) × r × m/12
    expect(old.I).toBe(Math.round(f * (2_000_000_00 + 50_000_00 + 240_000_00 / 2) * 0.06 * 0.5) / 100);
    expect(now.I).toBe(Math.round(f * (2_000_000_00 + 240_000_00 / 2) * 0.06 * 0.5) / 100);
    expect(old.I - now.I).toBeCloseTo(f * 50_000 * 0.06 * 0.5, 2); // 1 200 kr
    expect(old.loanPeak).toBeCloseTo(f * (2_050_000 + 240_000), 2);
    expect(now.loanPeak).toBeCloseTo(f * (2_000_000 + 240_000), 2);
    // Egenkapitalbehovet øker med den delen av kjøpskostnadene som ikke lenger lånefinansieres
    expect(now.equityNeed - old.equityNeed).toBeCloseTo(f * 50_000 + (now.I - old.I), 2);
  });

  it('lånefinansierte løpende kostnader flytter drift og renter fra egenkapital til lån', () => {
    const own = computeCore(x({ financeRunningCosts: false }), 2_000_000, 3_000_000);
    const fin = computeCore(x({ financeRunningCosts: true }), 2_000_000, 3_000_000);
    expect(fin.runningLoan).toBe(fin.O + fin.I);
    expect(fin.equityNeed).toBeLessThan(own.equityNeed);
    expect(fin.equityNeed).toBe(fin.P - fin.purchaseLoan + fin.K + (fin.RB - fin.renovationLoan));
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
  const { analysisScenarioId, purchaseFinancingPct, renovationFinancingPct, financeRunningCosts, availableEquity, settlementMonths, weeklyOwnHours, minProfitPerOwnHour, laborModes, maxOwnWork, regulatedCompetence, ...rest } = {
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
  void [analysisScenarioId, purchaseFinancingPct, renovationFinancingPct, financeRunningCosts, availableEquity, settlementMonths, weeklyOwnHours, minProfitPerOwnHour, laborModes, maxOwnWork, regulatedCompetence];
  delete rest.hourValue2;
  return { ...rest, ...over };
}

describe('migrering fra modell 1.0', () => {
  it('financingPct blir både kjøps- og oppussingslån; resultatet følger ny regel (lån på P alene)', () => {
    const raw = legacyValues();
    const migrated = migrateScenarioValuesRaw(raw) as Record<string, unknown>;
    expect(migrated.purchaseFinancingPct).toBe(80);
    expect(migrated.renovationFinancingPct).toBe(80);
    expect('financingPct' in migrated).toBe(false);
    const ev = evaluateScenario(raw as unknown as ScenarioValues).evaluation.base!;
    // Modell 1.2: I = 0,8 × (2 000 000 + 120 000) × 6 % × ½ (modell 1.0 ga 0,8 × (2 050 000 + 120 000) …)
    expect(ev.I).toBe(Math.round(0.8 * (2_000_000 + 240_000 / 2) * 0.06 * 0.5));
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
const labor = { laborModes: { ...NEW_ACCOUNT_DEFAULTS.laborModes }, maxOwnWork: false, regulatedCompetence: { ror: false, elektro: false, bad_vatrom: false } };

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
    const confirmed = itemEconomics(item({ laborCategory: 'bad_vatrom', workMode: 'selv' }), { ...labor, regulatedCompetence: { ...labor.regulatedCompetence, bad_vatrom: true } });
    expect(confirmed).toMatchObject({ mode: 'selv', downgraded: false, cost: 10_000 });
  });
  it('kompetanse bekreftes per arbeidsområde: elektro-kompetanse gjør ikke rør eller våtrom gratis', () => {
    const onlyElectro = { ...labor, regulatedCompetence: { ror: false, elektro: true, bad_vatrom: false } };
    expect(itemEconomics(item({ laborCategory: 'elektro', workMode: 'selv' }), onlyElectro)).toMatchObject({ mode: 'selv', downgraded: false, cost: 10_000 });
    expect(itemEconomics(item({ laborCategory: 'ror', workMode: 'selv' }), onlyElectro)).toMatchObject({ mode: 'innleid', downgraded: true, cost: 90_000 });
    expect(itemEconomics(item({ laborCategory: 'bad_vatrom', workMode: 'selv' }), onlyElectro)).toMatchObject({ mode: 'innleid', downgraded: true, cost: 90_000 });
    // Bekreftet kompetanse tillater egeninnsats, men oppgraderer ikke automatisk via «maks egeninnsats»
    const max = itemEconomics(item({ laborCategory: 'elektro' }), { ...onlyElectro, maxOwnWork: true });
    expect(max.mode).toBe('innleid');
  });
  it('profilens arbeidsmodus «selv» for regulert område krever fortsatt bekreftelse for akkurat det området', () => {
    const modes = { ...labor.laborModes, ror: 'selv' as const, elektro: 'selv' as const };
    const ctx = { ...labor, laborModes: modes, regulatedCompetence: { ror: true, elektro: false, bad_vatrom: false } };
    expect(itemEconomics(item({ laborCategory: 'ror' }), ctx).mode).toBe('selv');
    expect(itemEconomics(item({ laborCategory: 'elektro' }), ctx)).toMatchObject({ mode: 'innleid', downgraded: true });
  });
  it('tiltak med arbeidsmodell tar ikke med eldre fagbeløp – arbeid telles aldri to ganger', () => {
    const both = item({ workMode: 'innleid', laborCostHired: 80_000, electrician: 30_000, plumber: 20_000, other: 10_000 });
    expect(usesLaborModel(both)).toBe(true);
    expect(ignoredLegacyTrades(both)).toBe(60_000);
    expect(itemEconomics(both, labor)).toMatchObject({ cost: 10_000 + 80_000, hiredLabor: 80_000 });
    const t = renovationTotals({ renovationMode: 'tiltak', renovationItems: [both], renovationLumpSum: null, lumpSumHours: null, ...labor });
    expect(t.total).toBe(90_000);
    expect(t.byCategory).toMatchObject({ materials: 10_000, electrician: 0, plumber: 0, other: 0, hiredLabor: 80_000 });
    // Eldre tiltak (uten kategori) bruker fortsatt fagfeltene som innleide kostnader
    const legacy = item({ laborCategory: null, electrician: 30_000, plumber: 20_000, other: 10_000, hours: 12 });
    expect(itemEconomics(legacy, labor)).toMatchObject({ cost: 10_000 + 60_000, ownHours: 12, mode: null });
    expect(ignoredLegacyTrades(legacy)).toBe(0);
  });
  it('migrering flytter eldre fagbeløp til innleid arbeid (hvis ukjent) og nullstiller dem – ingen dobbelttelling', () => {
    const onlyLegacy = migrateRenovationItemRaw(item({ laborCostHired: null, electrician: 30_000, plumber: 20_000, other: 10_000 })) as RenovationItem;
    expect(onlyLegacy).toMatchObject({ laborCostHired: 60_000, electrician: 0, plumber: 0, other: 0 });
    const both = migrateRenovationItemRaw(item({ laborCostHired: 80_000, electrician: 30_000 })) as RenovationItem;
    expect(both).toMatchObject({ laborCostHired: 80_000, electrician: 0 }); // ny modell styrer; eldre felt gjelder ikke i tillegg
    // Eldre tiltak uten arbeidskategori er uendret, og migreringen er idempotent
    const legacy = item({ laborCategory: null, electrician: 30_000 });
    expect(migrateRenovationItemRaw(legacy)).toEqual(legacy);
    expect(migrateRenovationItemRaw(both)).toEqual(both);
    // Evaluering av et lagret scenario normaliserer også eldre rader
    const { analysis, built } = builtAnalysis(DEMO_FINN.sharedAB);
    const base = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS }).values;
    const stored: ScenarioValues = { ...base, renovationItems: [item({ workMode: 'innleid', laborCostHired: 80_000, electrician: 5_000 })] };
    expect(evaluateScenario(stored).renovation.total).toBe(90_000);
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
    expect(new Set([basis.sale!.base, alt1.sale!.base, alt2.sale!.base]).size).toBe(3);
    expect(alt1.items.length).not.toBe(basis.items.length);
    const values = (s: typeof basis) => buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: s.id });
    const vb = values(basis);
    const v1 = values(alt1);
    // Salgsverdien fastsettes av koden (markedsmotoren) per scenario – ikke kopiert fra agenten eller den globale verdien
    expect(vb.saleResolution.source).toBe('markedsmotor');
    expect(v1.saleResolution.source).toBe('markedsmotor');
    expect(vb.values.saleBase).toBe(vb.saleResolution.sale.base);
    expect(v1.values.saleBase).toBe(v1.saleResolution.sale.base);
    expect(v1.values.saleBase).not.toBe(alt1.sale!.base);
    expect(v1.values.saleBase).not.toBe(analysis.estimates.sale.base);
    expect(values(alt2).values.saleBase).not.toBe(vb.values.saleBase);
    expect(v1.values.renovationItems).toHaveLength(alt1.items.length);
    expect(v1.values.analysisScenarioId).toBe(alt1.id);
    expect(v1.origins.saleBase).toBe('markedsmotor');
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

describe('timekravet som egen maksbudgrense (ikke kostnad, ikke port)', () => {
  const x = (o: Partial<EngineInput> = {}) => resolveInput(input(o)).resolved!;

  it('maksbud for minimum fortjeneste per egeninnsatstime: høyeste pris som oppfyller kravet, og én krone mer bryter det', () => {
    const ev = evaluate(input({ ownHours: 200, minProfitPerOwnHour: 1_500, profitTarget: 100_000 }));
    const h = ev.maxBidHourly!;
    expect(h.kind).toBe('hourly');
    expect(h.status).toBe('ok');
    const r = x({ ownHours: 200, minProfitPerOwnHour: 1_500 });
    const at = computeCore(r, h.price!, 3_000_000);
    expect(at.profit / 200).toBeGreaterThanOrEqual(1_500);
    const above = computeCore(r, h.price! + 2, 3_000_000);
    expect(above.profit / 200).toBeLessThan(1_500);
    // Tilsvarer et fortjenestemål på timekrav × timer
    const sameAsProfit = evaluate(input({ ownHours: 200, profitTarget: 300_000 })).maxBid!;
    expect(Math.abs(h.price! - sameAsProfit.price!)).toBeLessThanOrEqual(1);
  });

  it('anbefalt maksbud er den laveste grensen, og begrensende grense vises – grensene blandes ikke', () => {
    // Strengt timekrav, mildt fortjenestemål → timekravet begrenser
    const hourly = evaluate(input({ ownHours: 200, minProfitPerOwnHour: 1_500, profitTarget: 100_000 }));
    expect(hourly.recommendedMaxBid!.limitedBy).toBe('hourly');
    expect(hourly.recommendedMaxBid!.price).toBe(hourly.maxBidHourly!.price);
    expect(hourly.maxBidHourly!.price!).toBeLessThan(hourly.maxBid!.price!);
    expect(hourly.recommendedMaxBid!.limits.map((l) => l.id)).toEqual(['profit', 'hourly']);
    // Mildt timekrav, strengt fortjenestemål → fortjenestemålet begrenser
    const profit = evaluate(input({ ownHours: 100, minProfitPerOwnHour: 100, profitTarget: 700_000 }));
    expect(profit.recommendedMaxBid!.limitedBy).toBe('profit');
    expect(profit.recommendedMaxBid!.price).toBe(profit.maxBid!.price);
    expect(profit.maxBidHourly!.price!).toBeGreaterThan(profit.maxBid!.price!);
    // Avkastningsmål (i tabellen) er en egen grense og blandes ikke inn i anbefalingen
    expect(profit.maxBidTable.some((m) => m.kind === 'return')).toBe(true);
    expect(profit.recommendedMaxBid!.limits.some((l) => (l.id as string) === 'return')).toBe(false);
  });

  it('uten egne timer eller uten krav gir timekravet ingen grense, med forklaring', () => {
    const none = evaluate(input({ ownHours: 0, minProfitPerOwnHour: 500 }));
    expect(none.maxBidHourly).toBeNull();
    expect(none.recommendedMaxBid!.limits.map((l) => l.id)).toEqual(['profit']);
    expect(none.recommendedMaxBid!.notApplicable.find((n) => n.id === 'hourly')!.reason).toContain('Ingen egne timer');
    const noReq = evaluate(input({ ownHours: 100, minProfitPerOwnHour: null }));
    expect(noReq.maxBidHourly).toBeNull();
    expect(noReq.recommendedMaxBid!.notApplicable.find((n) => n.id === 'hourly')!.reason).toContain('ikke satt');
  });

  it('en grense som ikke kan nås gir ingen anbefalt pris, og viser hvilken grense det gjelder', () => {
    const ev = evaluate(input({ ownHours: 10, minProfitPerOwnHour: 1_000_000 }));
    expect(ev.maxBidHourly!.status).toBe('none');
    expect(ev.recommendedMaxBid!.price).toBeNull();
    expect(ev.recommendedMaxBid!.limitedBy).toBe('hourly');
    expect(recommendedBidOf(ev)).toMatchObject({ price: null, status: 'none', limitedBy: 'hourly' });
  });

  it('timekravet diskvalifiserer ikke og er ingen kostnad: under kravet gir fortsatt komplett kalkyle og uendret resultat', () => {
    const lenient = evaluate(input({ ownHours: 400, minProfitPerOwnHour: 100 })).base!;
    const strict = evaluate(input({ ownHours: 400, minProfitPerOwnHour: 5_000 })).base!;
    expect(strict.meetsHourlyRequirement).toBe(false);
    expect(lenient.meetsHourlyRequirement).toBe(true);
    expect(strict.profit).toBe(lenient.profit);
    expect(strict.C).toBe(lenient.C);
    expect(evaluate(input({ ownHours: 400, minProfitPerOwnHour: 5_000 })).status).toBe('complete');
    expect(strict.profit).toBeGreaterThan(0);
  });
});

describe('én autoritativ salgsverdiflyt', () => {
  const p01 = () => builtAnalysis(DEMO_FINN.sharedAB);
  const resolve = (analysis: SharedAnalysis, built: ReturnType<typeof buildProperty>, id?: string) =>
    resolveScenarioSale({ analysis, scenario: findAnalysisScenario(analysis, id), property: built.property, snapshot: built.snapshot, debtAtSale: analysis.estimates.debtAtSale ?? built.snapshot.sharedDebt });

  it('markedsmotoren fastsetter low/base/high; agentens estimat er historisk referanse og ikke fasit', () => {
    const { analysis, built } = p01();
    for (const sc of resolveAnalysisScenarios(analysis)) {
      const r = resolve(analysis, built, sc.id);
      expect(r.source).toBe('markedsmotor');
      expect(r.market!.status).toBe('ok');
      expect(r.sale.base).toBe(r.market!.estimate!.base);
      expect(r.agentEstimate).toEqual(sc.sale);
      expect(r.sale.base).not.toBe(sc.sale!.base);
      expect(r.sale.low!).toBeLessThan(r.sale.base!);
      expect(r.sale.base!).toBeLessThan(r.sale.high!);
    }
  });

  it('de tre verdiene holdes adskilt: agentens estimat endres ikke av markedsmotoren, og privat overstyring skrives aldri til analysen', () => {
    const { analysis, built } = p01();
    const before = structuredClone(analysis);
    const base = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS });
    const mine = { ...base.values, saleBase: 9_999_999 };
    expect(mine.saleBase).not.toBe(base.values.saleBase);
    expect(analysis).toEqual(before);
    expect(base.origins.saleBase).toBe('markedsmotor');
  });

  it('agentens ankerjustering brukes av koden og er begrenset til ±5 %', () => {
    const { analysis, built } = p01();
    const alt1 = resolveAnalysisScenarios(analysis)[1];
    expect(alt1.anchorAdjustment).toMatchObject({ pct: 2 });
    const withAdj = resolve(analysis, built, alt1.id);
    expect(withAdj.market!.positioning.anchorAdjustmentPct).toBe(2);
    const noAdj = structuredClone(analysis);
    noAdj.estimates.scenarios![1].anchorAdjustment = null;
    const without = resolve(noAdj, built, alt1.id);
    expect(withAdj.sale.base! / without.sale.base!).toBeGreaterThan(1.015);
    expect(withAdj.sale.base! / without.sale.base!).toBeLessThan(1.025);
    // Skjemaet avviser en justering utover grensen, og en uten konkret begrunnelse
    const bad = (a: unknown) => AnalysisScenarioSchema.safeParse({ ...analysis.estimates.scenarios![1], anchorAdjustment: a }).success;
    expect(bad({ pct: 4, category: 'planlosning_kvalitet', reason: 'Åpen løsning gir bedre lys og flyt enn lukkede planløsninger.' })).toBe(true);
    expect(bad({ pct: 9, category: 'planlosning_kvalitet', reason: 'Åpen løsning gir bedre lys og flyt enn lukkede planløsninger.' })).toBe(false);
    expect(bad({ pct: 2, category: 'planlosning_kvalitet', reason: 'bra' })).toBe(false);
  });

  it('for svakt markedsgrunnlag: agentens estimat brukes som tydelig merket fallback, ellers ingen verdi (aldri 0)', () => {
    const { analysis, built } = p01();
    const thin = structuredClone(analysis);
    thin.comparables = [];
    const fb = resolve(thin, built);
    expect(fb.source).toBe('agent_fallback');
    expect(fb.sale.base).toBe(thin.estimates.scenarios![0].sale!.base);
    expect(fb.notes.join(' ')).toContain('IKKE verifisert');
    const none = structuredClone(thin);
    delete none.estimates.scenarios![0].sale;
    const nothing = resolve(none, built);
    expect(nothing.source).toBe('ingen');
    expect([nothing.sale.low, nothing.sale.base, nothing.sale.high]).toEqual([null, null, null]);
    const values = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis: none, defaults: NEW_ACCOUNT_DEFAULTS }).values;
    expect(values.saleBase).toBeNull();
    const ev = evaluateScenario(values);
    expect(ev.evaluation.status).toBe('incomplete');
    expect(ev.missing.map((m) => m.field)).toContain('saleBase');
  });

  it('eldre analyse med global salgsverdi bruker den (fallback) og kopierer den aldri til alternativer', () => {
    const { analysis, built } = builtAnalysis(DEMO_FINN.highDebt);
    const r = resolve(analysis, built);
    expect(r.source).toBe('global_fallback');
    expect(r.sale.base).toBe(analysis.estimates.sale.base);
    expect(r.notes.join(' ')).toContain('Eldre analyse');
  });

  it('analysens dato styrer markedsvurderingen, så grunnverdiene er stabile fra dag til dag', () => {
    const { analysis, built } = p01();
    const a = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS }).values.saleBase;
    const b = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS }).values.saleBase;
    expect(a).toBe(b);
    expect(analysisDateKey(analysis)).toBe(analysis.publishedAt!.slice(0, 10));
  });
});

describe('sluttstandard i sluttproduktet brukes automatisk av markedsvektingen', () => {
  const setup = () => builtAnalysis(DEMO_FINN.sharedAB);
  const resolveWith = (analysis: SharedAnalysis, built: ReturnType<typeof buildProperty>, idx: number) =>
    resolveScenarioSale({ analysis, scenario: resolveAnalysisScenarios(analysis)[idx], property: built.property, snapshot: built.snapshot, debtAtSale: 0 });

  it('dokumentert standardClass i scenarioet gir målets standard – uten at noe antas', () => {
    const { analysis, built } = setup();
    const r = resolveWith(analysis, built, 0);
    expect(r.standardClass).toBe('nyoppusset');
    expect(r.standardDocumented).toBe(true);
    expect(scenarioStandard(resolveAnalysisScenarios(analysis)[0])).toEqual({ standardClass: 'nyoppusset', documented: true });
  });

  it('sluttstandarden styrer hvilke referanser som veier tyngst: et lettere scenario får lavere likhet, ingen primærreferanser og et dårligere grunnlag', () => {
    const { analysis, built } = setup();
    const lighter = structuredClone(analysis);
    lighter.estimates.scenarios![0].endProduct.standardClass = 'middels'; // to trinn under nyoppusset
    const full = resolveWith(analysis, built, 0);
    const light = resolveWith(lighter, built, 0);
    expect(light.standardClass).toBe('middels');
    expect(light.standardDocumented).toBe(true);
    const newest = full.market!.references.filter((r) => r.standardGap === 0 && r.kind === 'solgt');
    expect(newest.length).toBeGreaterThan(0);
    for (const r of newest) {
      const lr = light.market!.references.find((x) => x.id === r.id)!;
      expect(lr.standardGap).toBe(2);
      expect(lr.physical.standard).toBeLessThan(r.physical.standard);
      expect(lr.effectiveWeight).toBeLessThan(r.effectiveWeight);
      expect(lr.role).toBe('sekundaer');
      expect(lr.flags).toContain('gammel_standard');
    }
    expect(full.market!.references.some((r) => r.role === 'primaer')).toBe(true);
    expect(light.market!.references.some((r) => r.role === 'primaer' && r.standardGap === 2)).toBe(false);
    expect(light.market!.halfWidthPct!).toBeGreaterThanOrEqual(full.market!.halfWidthPct!);
  });

  it('manglende standard gir tydelig fallback fra oppussingsnivået – og fremstår ikke som dokumentert', () => {
    const { analysis, built } = setup();
    const undocumented = structuredClone(analysis);
    delete undocumented.estimates.scenarios![0].endProduct.standardClass;
    const r = resolveWith(undocumented, built, 0);
    expect(r.standardDocumented).toBe(false);
    expect(r.market!.standardDocumented).toBe(false);
    expect(r.standardClass).toBe(LEVEL_FALLBACK_STANDARD[undocumented.estimates.scenarios![0].level]);
    expect(r.market!.halfWidthPct!).toBeGreaterThan(resolveWith(analysis, built, 0).market!.halfWidthPct!);
    expect(r.market!.quality.notes.join(' ')).toContain('ikke dokumentert');
    // Lett oppussing antas ikke å være nyoppusset
    expect(LEVEL_FALLBACK_STANDARD.lett).toBe('oppgradert');
    // Eldre analyser (uten scenarioer) har aldri dokumentert standard
    const legacy = builtAnalysis(DEMO_FINN.highDebt);
    expect(scenarioStandard(resolveAnalysisScenarios(legacy.analysis)[0]).documented).toBe(false);
  });

  it('brukerens private overstyring av standard gir en privat vurdering og endrer ikke analysen', () => {
    const { analysis, built } = setup();
    const before = structuredClone(analysis);
    const sc = resolveAnalysisScenarios(analysis)[0];
    const own = resolveScenarioSale({ analysis, scenario: sc, property: built.property, snapshot: built.snapshot, debtAtSale: 0, standardOverride: 'middels' });
    expect(own.standardClass).toBe('middels');
    expect(own.standardDocumented).toBe(true);
    expect(own.market!.references.find((r) => r.standardGap === 2)).toBeTruthy();
    expect(resolveWith(analysis, built, 0).standardClass).toBe('nyoppusset');
    expect(analysis).toEqual(before);
  });

  it('referanseklassifisering per scenario: alternativer uten klassifisering har ukjent planløsningslikhet', () => {
    const { analysis } = setup();
    const [basis, alt1, alt2] = resolveAnalysisScenarios(analysis);
    const comps = analysis.comparables.map(toMarketComparable);
    const forBasis = comparablesForScenario(comps, basis);
    expect(forBasis.map((c) => c.layoutMatch)).toEqual(comps.map((c) => c.layoutMatch));
    const forAlt2 = comparablesForScenario(comps, alt2);
    const cls = new Map(alt2.referenceClassification!.map((c) => [c.comparableId, c.layoutMatch]));
    for (const c of forAlt2) expect(c.layoutMatch).toBe(cls.has(c.id) ? cls.get(c.id) : null);
    expect(alt1.referenceClassification!.length).toBeGreaterThan(0);
  });
});

describe('regulert kompetanse: migrering fra ett samlet flagg til kategorier', () => {
  it('det gamle flagget nullstilles konservativt og fjernes, også når det var satt til true', () => {
    const migrated = migrateScenarioValuesRaw({ ...legacyValues(), regulatedSelfWorkConfirmed: true }) as Record<string, unknown>;
    expect('regulatedSelfWorkConfirmed' in migrated).toBe(false);
    expect(migrated.regulatedCompetence).toEqual({ ror: false, elektro: false, bad_vatrom: false });
    const p = migrateProfileDefaultsRaw({ buyerTypeApartment: 'privat', buyerTypeHouse: 'as', months: 6, interestPct: 7, financingPct: 100, reservePct: 20, profitTarget: 400_000, saleFixedCost: 55_000, saleCommissionPct: 1.5, buyFees: 6_000, homeArea: 'Trondheim', regulatedSelfWorkConfirmed: true }) as Record<string, unknown>;
    expect(p.regulatedCompetence).toEqual({ ror: false, elektro: false, bad_vatrom: false });
    expect('regulatedSelfWorkConfirmed' in p).toBe(false);
  });

  it('nye rader beholder kompetanse per område, og migreringen er idempotent', () => {
    const row = { ...legacyValues(), regulatedCompetence: { ror: false, elektro: true, bad_vatrom: false } };
    const once = migrateScenarioValuesRaw(row) as Record<string, unknown>;
    expect(once.regulatedCompetence).toEqual({ ror: false, elektro: true, bad_vatrom: false });
    expect(migrateScenarioValuesRaw(once)).toEqual(once);
    const parsed = ScenarioValuesSchema.safeParse(once);
    expect(parsed.success).toBe(true);
  });

  it('ufullstendige kategorier får «ikke bekreftet» for de som mangler (aldri automatisk bekreftet)', () => {
    const once = migrateScenarioValuesRaw({ ...legacyValues(), regulatedCompetence: { elektro: true } }) as { regulatedCompetence: Record<string, boolean> };
    expect(once.regulatedCompetence).toEqual({ ror: false, elektro: true, bad_vatrom: false });
  });
});
