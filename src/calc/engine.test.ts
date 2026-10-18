import { describe, expect, it } from 'vitest';
import { computeCore, evaluate, resolveInput, SOLVER_TOLERANCE_KR, solveMaxBid, type EngineInput } from './engine';
import { evaluateScenario, toEngineInput } from './scenario';
import { scenarioModelDefaults } from '../domain/migrate';
import type { ScenarioValues } from '../domain/schemas';

/** Kontrollregnestykket fra spesifikasjonen (syntetiske tall). */
function controlInput(overrides: Partial<EngineInput> = {}): EngineInput {
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
    purchaseFinancingShare: 1,
    renovationFinancingShare: 1,
    financeRunningCosts: false,
    availableEquity: null,
    saleFixedCost: 30_000,
    saleCommissionRate: 0.015,
    saleBasis: 'kontant',
    salePrices: { low: 2_800_000, base: 3_000_000, high: 3_200_000 },
    ownHours: 100,
    hourValue: 350,
    minProfitPerOwnHour: null,
    profitTarget: 400_000,
    tax: { mode: 'uavklart', rate: null },
    ...overrides,
  };
}

describe('kontrollregnestykke', () => {
  it('gir nøyaktig spesifiserte delsummer og resultat', () => {
    const ev = evaluate(controlInput());
    expect(ev.status).toBe('complete');
    const b = ev.base!;
    expect(b.K).toBe(50_000);
    expect(b.RB).toBe(240_000);
    expect(b.I).toBe(65_100);
    expect(b.O).toBe(30_000);
    expect(b.Csale).toBe(75_000);
    expect(b.C).toBe(2_460_100);
    expect(b.profit).toBe(539_900);
    expect(b.modelVersion).toBeTruthy();
  });

  it('Totalpris 3 300 000 med D1 300 000 gir samme kontantsalg og resultat (D1 trekkes én gang)', () => {
    const ev = evaluate(
      controlInput({ saleBasis: 'total', debtAtSale: 300_000, salePrices: { low: null, base: 3_300_000, high: null } }),
    );
    expect(ev.base!.S).toBe(3_000_000);
    expect(ev.base!.Csale).toBe(75_000);
    expect(ev.base!.profit).toBe(539_900);
  });

  it('D0 300 000 endrer kapitalgrunnlaget, men er ingen ekstra kontantkostnad', () => {
    const ev = evaluate(controlInput({ debtAtPurchase: 300_000 }));
    expect(ev.base!.C).toBe(2_460_100);
    expect(ev.base!.capitalBase).toBe(2_760_100);
    expect(ev.base!.profit).toBe(539_900);
    expect(ev.base!.projectReturn).toBeCloseTo(539_900 / 2_760_100, 12);
  });

  it('eget arbeid verdsettes separat', () => {
    const b = evaluate(controlInput()).base!;
    expect(b.ownWorkValue).toBe(35_000);
    expect(b.profitAfterOwnWork).toBe(504_900);
    expect(b.profit).toBe(539_900);
  });
});

describe('kjøpspris påvirker renter, avgiftsgrunnlag, resultat og maksbud', () => {
  const selveier = (P: number) =>
    controlInput({ purchasePrice: P, debtAtPurchase: 100_000, duty: { basis: 'kjopesum_pluss_fellesgjeld', rate: 0.025, customBase: null }, buyFees: 5_000 });

  it('avgiftsgrunnlaget følger P + D0, ikke opprinnelig prisantydning', () => {
    const a = evaluate(selveier(2_000_000)).base!;
    const b = evaluate(selveier(2_200_000)).base!;
    expect(a.dutyBase).toBe(2_100_000);
    expect(b.dutyBase).toBe(2_300_000);
    expect(a.duty).toBe(52_500);
    expect(b.duty).toBe(57_500);
    expect(b.K - a.K).toBe(5_000);
    // Renter: f × Δ(P + K) × r × m/12 = 1 × 205 000 × 0,06 × 0,5
    expect(b.I - a.I).toBeCloseTo(6_150, 2);
    expect(a.profit - b.profit).toBeCloseTo(200_000 + 5_000 + 6_150, 2);
  });

  it('maksbud når målet innen toleranse, og én krone over bryter målet', () => {
    const ev = evaluate(selveier(2_000_000));
    const mb = ev.maxBid!;
    expect(mb.status).toBe('ok');
    const x = resolveInput(selveier(2_000_000)).resolved!;
    const at = computeCore(x, mb.price!, 3_000_000);
    expect(at.profit).toBeGreaterThanOrEqual(400_000);
    const above = computeCore(x, mb.price! + SOLVER_TOLERANCE_KR + 1, 3_000_000);
    expect(above.profit).toBeLessThan(400_000);
    // Maksbud er uavhengig av valgt kjøpspris
    expect(evaluate(selveier(2_500_000)).maxBid!.price).toBe(mb.price);
  });

  it('returnerer ingen løsning når målet ikke kan nås', () => {
    const x = resolveInput(controlInput()).resolved!;
    const mb = solveMaxBid(x, 3_000_000, { kind: 'profit', value: 5_000_000 });
    expect(mb.status).toBe('none');
    expect(mb.price).toBeNull();
  });

  it('maksbud ved avkastningsmål oppfyller målet', () => {
    const ev = evaluate(controlInput());
    const r20 = ev.maxBidTable.find((r) => r.kind === 'return' && r.target === 0.2)!;
    expect(r20.status).toBe('ok');
    expect(r20.returnAtPrice!).toBeGreaterThanOrEqual(0.2);
  });
});

describe('manglende og ugyldige inngangsverdier', () => {
  it('manglende oppussing gir ufullstendig kalkyle, ikke falsk fortjeneste', () => {
    const ev = evaluate(controlInput({ renovation: null }));
    expect(ev.status).toBe('incomplete');
    expect(ev.base).toBeNull();
    expect(ev.maxBid).toBeNull();
    expect(ev.missing.map((m) => m.field)).toContain('renovation');
  });

  it('manglende salgsverdi gir ufullstendig kalkyle', () => {
    const ev = evaluate(controlInput({ salePrices: { low: 1, base: null, high: 2 } }));
    expect(ev.status).toBe('incomplete');
    expect(ev.missing.map((m) => m.field)).toContain('saleBase');
  });

  it('negative beløp og prosent utenfor grenser avvises', () => {
    const ev = evaluate(controlInput({ purchasePrice: -1, interestRate: 0.9 }));
    expect(ev.status).toBe('invalid');
    expect(ev.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['purchasePrice', 'interestRate']));
  });

  it('salgsverdi under gjeld ved salg avvises', () => {
    const ev = evaluate(controlInput({ saleBasis: 'total', debtAtSale: 4_000_000 }));
    expect(ev.status).toBe('invalid');
  });

  it('ukjent eierform gir manglende avgiftssats', () => {
    const ev = evaluate(controlInput({ duty: { basis: 'kjopesum_pluss_fellesgjeld', rate: null, customBase: null } }));
    expect(ev.missing.map((m) => m.field)).toContain('dutyRate');
  });
});

describe('prosjektavkastning', () => {
  it('er endelig ved 100 % finansiering og bruker C + D0 som kapitalgrunnlag', () => {
    const ev = evaluate(controlInput({ purchaseFinancingShare: 1, renovationFinancingShare: 1, debtAtPurchase: 300_000 }));
    expect(Number.isFinite(ev.base!.projectReturn!)).toBe(true);
    expect(ev.base!.capitalBase).toBe(ev.base!.C + 300_000);
    // Egenkapitalbehov ved 100 % finansiering = renter + drift (endelig, ikke null)
    expect(ev.base!.equityNeed).toBe(65_100 + 30_000);
  });
});

describe('nullpunkt og stresstester', () => {
  it('nullpunkt gir resultat ≈ 0', () => {
    const ev = evaluate(controlInput());
    const be = ev.breakEven!.salePrice!;
    const x = ev.resolved!;
    expect(computeCore(x, 2_000_000, be).profit).toBeGreaterThanOrEqual(0);
    expect(computeCore(x, 2_000_000, be - 2).profit).toBeLessThan(0);
  });

  it('oppussing +100 000 påvirker reserve og renter', () => {
    const ev = evaluate(controlInput());
    const row = ev.stress.find((s) => s.id === 'renovation+100k')!;
    // ΔRB = 120 000, ΔI = 1 × 60 000 × 0,06 × 0,5 = 1 800, ΔCsale = 0
    expect(row.deltaProfit).toBeCloseTo(-(120_000 + 1_800), 2);
  });

  it('gjeldsøkning ved salg har ingen effekt ved kontantgrunnlag, men full effekt ved totalpris', () => {
    const cash = evaluate(controlInput()).stress.find((s) => s.id === 'debt+100k')!;
    expect(cash.noEffect).toBe(true);
    expect(cash.deltaProfit).toBe(0);
    const total = evaluate(
      controlInput({ saleBasis: 'total', debtAtSale: 300_000, salePrices: { low: null, base: 3_300_000, high: null } }),
    ).stress.find((s) => s.id === 'debt+100k')!;
    // ΔS = −100 000, ΔCsale = −1 500
    expect(total.deltaProfit).toBeCloseTo(-98_500, 2);
  });

  it('lav/normal/høy har hver sin salgskostnad', () => {
    const ev = evaluate(controlInput());
    expect(ev.cases.low!.Csale).toBe(30_000 + 42_000);
    expect(ev.cases.high!.Csale).toBe(30_000 + 48_000);
  });
});

describe('skatt', () => {
  it('er uavklart som standard og påvirker ikke hovedresultatet', () => {
    const ev = evaluate(controlInput());
    expect(ev.tax).toEqual({ mode: 'uavklart' });
    const withTax = evaluate(controlInput({ tax: { mode: 'antatt', rate: 0.22 } }));
    expect(withTax.base!.profit).toBe(539_900);
    expect(withTax.tax).toMatchObject({ mode: 'antatt', taxAmount: 118_778 });
  });

  it('beregner ingen automatisk skattefordel ved tap', () => {
    const ev = evaluate(controlInput({ salePrices: { low: null, base: 2_200_000, high: null }, tax: { mode: 'antatt', rate: 0.22 } }));
    expect(ev.base!.profit).toBeLessThan(0);
    expect(ev.tax).toMatchObject({ taxAmount: 0 });
  });
});

describe('prosentkonvertering ved grensen til motoren', () => {
  const values: ScenarioValues = {
    ...scenarioModelDefaults(),
    buyerType: 'privat',
    purchasePrice: 2_000_000,
    debtAtPurchase: 0,
    debtAtSale: 0,
    dutyBasis: 'ingen',
    dutyPct: 0,
    dutyCustomBase: null,
    buyFees: 50_000,
    renovationMode: 'tiltak',
    renovationOptionId: null,
    renovationItems: [
      { id: 'a', room: 'Bad', title: 'Nytt bad', materials: 100_000, electrician: 20_000, plumber: 60_000, other: 20_000, hours: 40, priority: 'pakrevd', included: true },
      { id: 'b', room: 'Stue', title: 'Maling', materials: 15_000, electrician: 0, plumber: 0, other: 0, hours: 30, priority: 'valgfri', included: false },
    ],
    renovationLumpSum: 999_999,
    lumpSumHours: 1,
    vatIncluded: true,
    reservePct: 20,
    months: 6,
    monthlyCost: 5_000,
    interestPct: 6,
    purchaseFinancingPct: 100,
    renovationFinancingPct: 100,
    saleBasis: 'kontant',
    saleLow: null,
    saleBase: 3_000_000,
    saleHigh: null,
    saleFixedCost: 30_000,
    saleCommissionPct: 1.5,
    hourValue: 350,
    minProfitPerOwnHour: null,
    profitTarget: 400_000,
    taxMode: 'uavklart',
    taxPct: null,
    startBid: null,
    walkAway: null,
    notes: '',
  };

  it('prosentpoeng konverteres én gang og summering av tiltak brukes (ikke rundsum)', () => {
    const input = toEngineInput(values);
    expect(input.interestRate).toBeCloseTo(0.06, 12);
    expect(input.reserveRate).toBeCloseTo(0.2, 12);
    expect(input.renovation).toBe(200_000);
    expect(input.ownHours).toBe(40);
    expect(evaluateScenario(values).evaluation.base!.profit).toBe(539_900);
  });

  it('rundsum brukes alene når metoden er rundsum', () => {
    const input = toEngineInput({ ...values, renovationMode: 'rundsum', renovationLumpSum: 200_000, lumpSumHours: 10 });
    expect(input.renovation).toBe(200_000);
    expect(input.ownHours).toBe(10);
  });

  it('ukjent kostnad i inkludert tiltak gir manglende kalkyle', () => {
    const v = { ...values, renovationItems: [{ ...values.renovationItems[0], plumber: null }] };
    const r = evaluateScenario(v);
    expect(r.evaluation.status).toBe('incomplete');
    expect(r.missing[0].label).toContain('Nytt bad');
  });

  it('advarer når en påkrevd utbedring tas ut', () => {
    const v = { ...values, renovationItems: [{ ...values.renovationItems[0], included: false }] };
    expect(evaluateScenario(v).warnings.some((w) => w.message.includes('Påkrevd'))).toBe(true);
  });
});
