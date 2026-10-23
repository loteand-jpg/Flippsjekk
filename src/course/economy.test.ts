import { describe, expect, it } from 'vitest';
import { computeCore } from '../calc/engine';
import { evaluateScenario } from '../calc/scenario';
import type { ScenarioValues } from '../domain/schemas';
import { CASE_A, CASE_B, CASE_C } from './caseData';
import { evaluateCourseSaleCases, evaluateCourseScenario } from './evaluate';
import { defaultFinalCase, defaultState, sanitizeState, storageKeyFor } from './progress';
import { finalCaseValues } from './widgets/Finish';

const course = (v: ScenarioValues) => evaluateCourseScenario(v).evaluation;

describe('kursøkonomi – paritet og uavhengig kontrollregning', () => {
  for (const [purchase, renovation] of [[90, 0], [90, 90], [75, 20]]) {
    it(`kontrollerer renter, resultat, avkastning og kapital ved ${purchase}/${renovation} % lån`, () => {
      const v = { ...CASE_A, purchaseFinancingPct: purchase, renovationFinancingPct: renovation, availableEquity: 600_000 };
      const ev = course(v);
      expect(ev).toEqual(evaluateScenario(v).evaluation);
      const purchaseLoan = 3_000_000 * purchase / 100;
      const renovationLoan = 264_000 * renovation / 100;
      const interest = Math.round((purchaseLoan + renovationLoan / 2) * 0.058 * 6 / 12 * 100) / 100;
      const costs = 3_000_000 + 77_000 + 264_000 + interest + 30_000 + 132_500;
      expect(ev.base).toMatchObject({ purchaseLoan, renovationLoan, I: interest, C: costs, profit: Math.round((3_500_000 - costs) * 100) / 100 });
      expect(ev.base!.projectReturn).toBeCloseTo((3_500_000 - costs) / costs, 10);
      const equity = 3_000_000 - purchaseLoan + 77_000 + 264_000 - renovationLoan + interest + 30_000;
      expect(ev.base!.equityNeed).toBeCloseTo(equity, 2);
      expect(ev.base!.equityGap).toBeCloseTo(Math.max(0, equity - 600_000), 2);
      expect(ev.base!.profitAfterOwnWork).toBeCloseTo(ev.base!.profit - 87_500, 2);
    });
  }

  it('fellesgjeld trekkes én gang fra totalsalget og inngår kun i kapitalgrunnlaget ved kjøp', () => {
    const total = course({ ...CASE_A, dutyBasis: 'ingen', dutyPct: 0, debtAtPurchase: 800_000, debtAtSale: 800_000, saleBasis: 'total', saleLow: 4_100_000, saleBase: 4_300_000, saleHigh: 4_600_000 });
    const cash = course({ ...CASE_A, dutyBasis: 'ingen', dutyPct: 0, debtAtPurchase: 800_000, debtAtSale: 800_000 });
    expect(total.base!.P).toBe(3_000_000);
    expect(total.base!.S).toBe(3_500_000);
    expect(total.base!.profit).toBe(cash.base!.profit);
    expect(total.base!.equityNeed).toBe(cash.base!.equityNeed);
    expect(total.base!.projectReturn).toBe(total.base!.profit / (total.base!.C + 800_000));
    expect(total.recommendedMaxBid).toEqual(cash.recommendedMaxBid);
  });

  it('lånefinansiert drift og skatt bruker standardmodellen uten å endre hovedresultatet for egen tid', () => {
    const v = { ...CASE_A, financeRunningCosts: true, taxMode: 'antatt' as const, taxPct: 22, saleBase: 3_800_000, saleHigh: null };
    expect(course(v)).toEqual(evaluateScenario(v).evaluation);
    const changedTime = course({ ...v, hourValue: 20_000, minProfitPerOwnHour: 40_000 });
    expect(changedTime.base!.profit).toBe(course(v).base!.profit);
    expect(changedTime.base!.equityNeed).toBe(course(v).base!.equityNeed);
    expect(changedTime.tax).toEqual(course(v).tax);
  });

  it.each([CASE_B, CASE_C, { ...CASE_A, debtAtSale: null, saleBasis: 'total' as const }, { ...CASE_A, renovationFinancingPct: null }, { ...CASE_A, monthlyCost: null }])('ukjente påkrevde verdier gir ingen fortjeneste eller maksbud', (v) => {
    const ev = course(v);
    expect(ev.status).toBe('incomplete');
    expect(ev.base).toBeNull();
    expect(ev.recommendedMaxBid).toBeNull();
    expect(ev.missing.length).toBeGreaterThan(0);
    expect(ev).toEqual(evaluateScenario(v).evaluation);
  });
});

describe('separate maksbudgrenser i alle salgsscenarioene', () => {
  it.each([
    { target: 100_000, hourly: 2_000, limitedBy: 'hourly' },
    { target: 700_000, hourly: 500, limitedBy: 'profit' },
    { target: null, hourly: 2_000, limitedBy: 'hourly' },
  ] as const)('$limitedBy begrenser når fortjenestemål=$target og timekrav=$hourly', ({ target, hourly, limitedBy }) => {
    const values = { ...CASE_A, profitTarget: target, minProfitPerOwnHour: hourly };
    for (const { sale, evaluation: ev } of evaluateCourseSaleCases(values)) {
      expect(ev!.recommendedMaxBid!.limitedBy).toBe(limitedBy);
      expect(ev).toEqual(evaluateScenario({ ...values, saleBase: sale, saleLow: null, saleHigh: null }, { detailed: false }).evaluation);
      const rec = ev!.recommendedMaxBid!;
      expect(rec.price).toBe(Math.min(...rec.limits.map((l) => l.result.price!)));
      const atBid = computeCore(ev!.resolved!, rec.price!, sale!);
      if (target !== null) expect(atBid.profit).toBeGreaterThanOrEqual(target);
      expect(atBid.profitPerOwnHour!).toBeGreaterThanOrEqual(hourly);
    }
  });

  it.each([0, null])('timekravet blokkerer ikke fortjenestemålet når egne timer er %s', (hours) => {
    const ev = course({ ...CASE_A, lumpSumHours: hours, minProfitPerOwnHour: 1_000_000 });
    expect(ev.status).toBe('complete');
    expect(ev.maxBidHourly).toBeNull();
    expect(ev.base!.profitPerOwnHour).toBeNull();
    expect(ev.recommendedMaxBid!.price).toBe(ev.maxBid!.price);
  });

  it('ufullstendig eller ugyldig hovedkalkyle gir ikke tilsynelatende gyldige delanbefalinger', () => {
    for (const values of [{ ...CASE_A, saleBase: null }, { ...CASE_A, purchasePrice: -1 }]) {
      expect(evaluateCourseSaleCases(values).every((row) => row.evaluation === null)).toBe(true);
    }
  });

  it('ukjent timekrav og begge usatte mål blir ikke et bud på 0 kr', () => {
    expect(course({ ...CASE_A, minProfitPerOwnHour: null }).recommendedMaxBid!.price).toBe(course(CASE_A).maxBid!.price);
    const ev = course({ ...CASE_A, minProfitPerOwnHour: null, profitTarget: null });
    expect(ev.recommendedMaxBid).toMatchObject({ price: null, limitedBy: null, limits: [] });
  });

  it.each([{ minProfitPerOwnHour: 1_000_000 }, { profitTarget: 100_000_000 }])('umulig mål har ingen gjennomførbar pris', (patch) => {
    const ev = course({ ...CASE_A, ...patch });
    expect(ev.status).toBe('complete');
    expect(ev.recommendedMaxBid!.price).toBeNull();
    expect(ev.recommendedMaxBid!.limits.some((l) => l.result.status === 'none')).toBe(true);
  });

  it('positivt resultat under timekravet forblir positivt, og lavere bud oppfyller kravet', () => {
    const values = { ...CASE_A, saleBase: 3_800_000, saleHigh: null, profitTarget: 100_000, minProfitPerOwnHour: 2_000 };
    const ev = course(values);
    expect(ev.base!.profit).toBeGreaterThan(0);
    expect(ev.base!.meetsHourlyRequirement).toBe(false);
    expect(ev.recommendedMaxBid!.price!).toBeLessThan(values.purchasePrice!);
    expect(course({ ...values, purchasePrice: ev.recommendedMaxBid!.price }).base!.meetsHourlyRequirement).toBe(true);
  });
});

describe('bevaring av privat kurslagring', () => {
  it('overfører eldre timekrav og bevarer kurs, fremdrift, quiz, arbeidsark og sluttcase', () => {
    const original = defaultState();
    original.read = ['1:0', '8:0'];
    original.quiz = { 'k1-1': 1 };
    original.final = { q1: 0 };
    original.checks = { beforeBid: ['eierform'] };
    original.calc.purchaseFinancingPct = 75;
    original.calc.renovationFinancingPct = 20;
    original.budget.lines['o-bad'] = { amount: 123_456, tag: 'mine', include: true };
    original.finalCase.items = [{ id: 'behold', label: 'Mitt kjøkken', amount: 234_567 }];
    const { hourlyRequirementVersion: _version, ...legacy } = original;
    const migrated = sanitizeState({ ...legacy, calc: { ...legacy.calc, minProfitPerOwnHour: null }, hurdle: { minReturnPct: 19, minHourValue: 875 } });
    expect(migrated.calc).toEqual({ ...original.calc, minProfitPerOwnHour: 875 });
    expect(migrated.read).toEqual(original.read);
    expect(migrated.quiz).toEqual(original.quiz);
    expect(migrated.final).toEqual(original.final);
    expect(migrated.checks).toEqual(original.checks);
    expect(migrated.budget).toEqual(original.budget);
    expect(migrated.finalCase).toEqual(original.finalCase);
    expect(migrated.hurdle).toEqual({ minReturnPct: 19, minHourValue: 875 });
    expect(sanitizeState(migrated)).toEqual(migrated);
    expect(storageKeyFor('bruker')).toBe('bruker.course.flipping-privat.v2');
  });

  it.each([null, 0, 725])('bevisst satt timekrav %s overlever omlasting uten å erstattes av eldre verdi', (value) => {
    const current = { ...defaultState(), calc: { ...CASE_A, minProfitPerOwnHour: value }, hurdle: { minHourValue: 900, minReturnPct: 15 } };
    expect(sanitizeState(current).calc.minProfitPerOwnHour).toBe(value);
  });

  it('konflikt mellom to eldre krav bevarer begge og prioriterer standardmodellens eksplisitte verdi', () => {
    const { hourlyRequirementVersion: _version, ...legacy } = defaultState();
    const migrated = sanitizeState({ ...legacy, calc: { ...CASE_A, minProfitPerOwnHour: 800 }, hurdle: { minHourValue: 700, minReturnPct: 15 } });
    expect(migrated.calc.minProfitPerOwnHour).toBe(800);
    expect(migrated.hurdle.minHourValue).toBe(700);
  });

  it('eldre null eller 0 i timekrav beholdes', () => {
    for (const value of [null, 0]) {
      const migrated = sanitizeState({ calc: { ...CASE_A, minProfitPerOwnHour: null }, hurdle: { minHourValue: value } });
      expect(migrated.calc.minProfitPerOwnHour).toBe(value);
    }
  });

  it('eldre felles finansiering i sluttcase blir to uavhengige andeler, også når ukjent', () => {
    for (const value of [75, 0, null]) {
      const state = sanitizeState({ finalCase: { financingPct: value, target: 123_000, hourValue: 450 } });
      expect(state.finalCase).toMatchObject({ financingPct: value, purchaseFinancingPct: value, renovationFinancingPct: value, target: 123_000, hourValue: 450 });
      const updated = { ...state, finalCase: { ...state.finalCase, renovationFinancingPct: 20 } };
      expect(sanitizeState(updated).finalCase.purchaseFinancingPct).toBe(value);
      expect(sanitizeState(updated).finalCase.renovationFinancingPct).toBe(20);
    }
  });

  it('informativt avkastningsmål påvirker ikke standardmotorens maksbud', () => {
    const state = defaultState();
    const changed = sanitizeState({ ...state, hurdle: { ...state.hurdle, minReturnPct: 99 } });
    expect(course(changed.calc).recommendedMaxBid).toEqual(course(state.calc).recommendedMaxBid);
  });
});

describe('sluttcase', () => {
  it('bruker standardøkonomi, egne låneandeler, separat timekrav og eksplisitt risikoscenario', () => {
    const fc = { ...defaultFinalCase(), low: 3_100_000, base: 3_300_000, high: 3_500_000, pipeRisk: 100_000, purchaseFinancingPct: 75, renovationFinancingPct: 20 };
    const values = finalCaseValues(fc, 'total', 2_650_000);
    const ev = course(values);
    expect(ev).toEqual(evaluateScenario(values).evaluation);
    expect(ev.base!.purchaseLoan).toBe(1_987_500);
    expect(ev.base!.renovationLoan).toBe(92_000);
    expect(ev.base!.RB).toBe(460_000); // 300 000 × 1,2 + 100 000 identifisert risiko, uten dobbel reserve.
    expect(ev.base!.S).toBe(2_950_000);
    expect(ev.maxBidHourly).not.toBeNull();
    expect(ev.recommendedMaxBid!.price).toBe(Math.min(ev.maxBid!.price!, ev.maxBidHourly!.price!));
  });
});
