import { describe, expect, it } from 'vitest';
import { NEW_ACCOUNT_DEFAULTS } from '../config/defaults';
import { buildProperty } from '../data/analysisBuilder';
import { DEMO_FINN, SEED_PROPERTIES } from '../data/seedProperties';
import { resolveAnalysisScenarios } from '../domain/analysisScenarios';
import type { SharedAnalysis } from '../domain/schemas';
import type { ScenarioValues } from '../domain/schemas';
import { resolveSalePricesForDebt, resolveScenarioSale } from './saleValue';
import { analysisScenarioValues, buildBaseValues, evaluateScenario, saleValuesAfterDebtChange, valuesForAnalysisScenario } from './scenario';
import { buildScenarioComparison } from './scenarioComparison';

const NOW = new Date('2026-10-16T08:00:00.000Z');
const total = (low: number, base: number, high: number) => ({ low, base, high });

describe('resolveSalePricesForDebt: totalpris, kontantpris og fellesgjeld henger alltid sammen', () => {
  it('A. totalpris 4 000 000, gjeld 300 000 → 200 000: kontant 3 800 000 (totalverdien beholdes)', () => {
    const before = resolveSalePricesForDebt({ basis: 'total', prices: total(3_800_000, 4_000_000, 4_200_000), derivedWithDebt: null, debtAtSale: 300_000 });
    expect(before.cash.base).toBe(3_700_000);
    const after = resolveSalePricesForDebt({ basis: 'total', prices: total(3_800_000, 4_000_000, 4_200_000), derivedWithDebt: null, debtAtSale: 200_000 });
    expect(after.cash.base).toBe(3_800_000);
    expect(after.total?.base).toBe(4_000_000); // totalverdien er uendret
    expect(after.prices.base).toBe(4_000_000); // representasjonen til kalkylen er fortsatt totalpris
    expect(after.issues).toEqual([]);
  });

  it('B. gjelden økes til 450 000: kontant 3 550 000', () => {
    const r = resolveSalePricesForDebt({ basis: 'total', prices: total(3_800_000, 4_000_000, 4_200_000), derivedWithDebt: null, debtAtSale: 450_000 });
    expect(r.cash.base).toBe(3_550_000);
    expect(r.total?.base).toBe(4_000_000);
  });

  it('C. kontantpris oppgitt direkte (3 700 000): endring i gjeld endrer ikke kontantprisen', () => {
    for (const debt of [0, 200_000, 300_000, 900_000]) {
      const r = resolveSalePricesForDebt({ basis: 'kontant', prices: total(3_500_000, 3_700_000, 3_900_000), derivedWithDebt: null, debtAtSale: debt });
      expect(r.prices.base, `gjeld ${debt}`).toBe(3_700_000);
      expect(r.cash.base).toBe(3_700_000);
      expect(r.issues).toEqual([]);
    }
  });

  it('D. low, base og high håndteres likt – ikke bare base', () => {
    const t = resolveSalePricesForDebt({ basis: 'total', prices: total(3_800_000, 4_000_000, 4_300_000), derivedWithDebt: null, debtAtSale: 200_000 });
    expect(t.cash).toEqual(total(3_600_000, 3_800_000, 4_100_000));
    // kontantpris avledet av totalverdi med gjeld 300 000: totalverdi = kontant + 300 000, ny kontant = totalverdi − 200 000
    const d = resolveSalePricesForDebt({ basis: 'kontant', prices: total(3_500_000, 3_700_000, 4_000_000), derivedWithDebt: 300_000, debtAtSale: 200_000 });
    expect(d.total).toEqual(total(3_800_000, 4_000_000, 4_300_000));
    expect(d.prices).toEqual(total(3_600_000, 3_800_000, 4_100_000));
  });

  it('E. null fellesgjeld: kontantprisen er hele totalprisen', () => {
    const r = resolveSalePricesForDebt({ basis: 'total', prices: total(3_800_000, 4_000_000, 4_200_000), derivedWithDebt: null, debtAtSale: 0 });
    expect(r.cash).toEqual(total(3_800_000, 4_000_000, 4_200_000));
    const d = resolveSalePricesForDebt({ basis: 'kontant', prices: total(3_500_000, 3_700_000, 3_900_000), derivedWithDebt: 300_000, debtAtSale: 0 });
    expect(d.prices.base).toBe(4_000_000);
  });

  it('F. ukjent gjeld gir aldri falsk 0: verdiene beholdes og det meldes tydelig', () => {
    const t = resolveSalePricesForDebt({ basis: 'total', prices: total(3_800_000, 4_000_000, 4_200_000), derivedWithDebt: null, debtAtSale: null });
    expect(t.cash).toEqual({ low: null, base: null, high: null });
    expect(t.prices.base).toBe(4_000_000);
    expect(t.issues.map((i) => i.kind)).toEqual(['gjeld_ukjent']);
    const d = resolveSalePricesForDebt({ basis: 'kontant', prices: total(3_500_000, 3_700_000, 3_900_000), derivedWithDebt: 300_000, debtAtSale: null });
    expect(d.prices).toEqual(total(3_500_000, 3_700_000, 3_900_000)); // uendret, ikke 0 og ikke totalverdi
    expect(d.issues.map((i) => i.kind)).toEqual(['gjeld_ukjent']);
    // kontantpris uten avledning trenger ikke gjelden
    expect(resolveSalePricesForDebt({ basis: 'kontant', prices: total(1, 2, 3), derivedWithDebt: null, debtAtSale: null }).issues).toEqual([]);
    // ukjent verdi forblir ukjent
    const u = resolveSalePricesForDebt({ basis: 'total', prices: { low: null, base: 4_000_000, high: null }, derivedWithDebt: null, debtAtSale: 300_000 });
    expect(u.cash).toEqual({ low: null, base: 3_700_000, high: null });
  });

  it('G. gjeld større enn totalverdien gir ingen meningsløs negativ pris, men en tydelig melding', () => {
    const t = resolveSalePricesForDebt({ basis: 'total', prices: total(3_800_000, 4_000_000, 4_200_000), derivedWithDebt: null, debtAtSale: 4_100_000 });
    expect(t.cash).toEqual({ low: null, base: null, high: 100_000 });
    expect(t.issues).toEqual([expect.objectContaining({ kind: 'gjeld_over_totalverdi', keys: ['low', 'base'] })]);
    const d = resolveSalePricesForDebt({ basis: 'kontant', prices: total(3_500_000, 3_700_000, 3_900_000), derivedWithDebt: 300_000, debtAtSale: 4_100_000 });
    expect(d.prices).toEqual({ low: null, base: null, high: 100_000 }); // 3,9 mill. + 0,3 mill. − 4,1 mill.
    expect(d.issues[0]).toMatchObject({ kind: 'gjeld_over_totalverdi', keys: ['low', 'base'] });
  });

  it('kalkylemotoren melder også en feil når totalpris < gjeld (eksisterende valideringsmønster), og regner S = V − gjeld ellers', () => {
    const spec = SEED_PROPERTIES.find((s) => s.finnId === DEMO_FINN.sharedAB)!;
    const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
    const base = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis: built.analysis, defaults: NEW_ACCOUNT_DEFAULTS }).values;
    const asTotal = (debt: number): ScenarioValues => ({ ...base, saleBasis: 'total', saleLow: 3_800_000, saleBase: 4_000_000, saleHigh: 4_200_000, debtAtSale: debt });
    expect(evaluateScenario(asTotal(200_000)).evaluation.base?.S).toBe(3_800_000);
    expect(evaluateScenario(asTotal(450_000)).evaluation.base?.S).toBe(3_550_000);
    expect(evaluateScenario(asTotal(0)).evaluation.base?.S).toBe(4_000_000);
    expect(evaluateScenario(asTotal(4_100_000)).evaluation.status).toBe('invalid');
    expect(evaluateScenario({ ...asTotal(0), debtAtSale: null }).evaluation.status).toBe('incomplete');
  });
});

describe('markedsmotoren oppgir hvilken gjeld kontantverdiene er avledet med', () => {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === DEMO_FINN.sharedAB)!;
  const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
  const [basis] = resolveAnalysisScenarios(built.analysis);
  const resolve = (debt: number | null) => resolveScenarioSale({ analysis: built.analysis, scenario: basis, property: built.property, snapshot: built.snapshot, debtAtSale: debt });

  it('kontantgrunnlag: kontant = totalverdi − gjeld, og gjelden som ble trukket fra er oppgitt (debtBasis)', () => {
    const r0 = resolve(0);
    const r300 = resolve(300_000);
    expect(r0.source).toBe('markedsmotor');
    expect(r0.sale.basis).toBe('kontant');
    expect(r0.sale.debtBasis).toBe(0);
    expect(r300.sale.debtBasis).toBe(300_000);
    // totalverdien (kontant + gjeld) er den samme uansett hvilken gjeld som ble brukt (avrundet til nærmeste 1 000)
    for (const k of ['low', 'base', 'high'] as const) expect(Math.abs((r300.sale[k] as number) + 300_000 - (r0.sale[k] as number))).toBeLessThanOrEqual(1000);
  });

  it('rebalansering av markedsmotorens kontantverdi tilsvarer å la markedsmotoren regne med den nye gjelden', () => {
    const r0 = resolve(0);
    const reb = resolveSalePricesForDebt({ basis: r0.sale.basis, prices: { low: r0.sale.low, base: r0.sale.base, high: r0.sale.high }, derivedWithDebt: r0.sale.debtBasis, debtAtSale: 300_000 });
    const direct = resolve(300_000);
    for (const k of ['low', 'base', 'high'] as const) expect(Math.abs((reb.prices[k] as number) - (direct.sale[k] as number)), k).toBeLessThanOrEqual(1000);
  });
});

/** En analyse der markedsmotoren regner totalverdi og leverer kontantverdier med analysens fellesgjeld (300 000) trukket fra. */
function withDebt(debt: number, basis: 'kontant' | 'total'): SharedAnalysis {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === DEMO_FINN.sharedAB)!;
  const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
  const a = structuredClone(built.analysis);
  a.estimates.debtAtSale = debt;
  for (const s of a.estimates.scenarios ?? []) if (s.sale) s.sale.basis = basis;
  return a;
}

describe('scenarioer og brukerens fellesgjeld ved salg', () => {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === DEMO_FINN.sharedAB)!;
  const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
  const run = (analysis: SharedAnalysis, userDebt: number | null) => {
    const defs = resolveAnalysisScenarios(analysis);
    const base = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: defs[0].id });
    // Brukeren skriver gjelden i kalkylen: salgsverdier som er avledet av en totalverdi følger med.
    const draft: ScenarioValues = { ...base.values, ...saleValuesAfterDebtChange({ draft: base.values, nextDebt: userDebt, baseSale: { basis: base.values.saleBasis, low: base.values.saleLow, base: base.values.saleBase, high: base.values.saleHigh, debtBasis: base.saleResolution.sale.debtBasis } }) };
    const c = buildScenarioComparison({ analysis, property: built.property, snapshot: built.snapshot, defaults: NEW_ACCOUNT_DEFAULTS, draft, activeName: 'x', riskBand: 'middels' });
    return { defs, base, draft, c };
  };

  it('13. totalpris: Basis 4,0 mill. og Alt A 4,3 mill. med brukerens gjeld 200 000 → kontant 3,8 og 4,1 mill., forskjell 300 000', () => {
    const [basis, altA] = resolveAnalysisScenarios(built.analysis);
    const baseB = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis: built.analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: basis.id }).values;
    const baseA = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis: built.analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: altA.id }).values;
    const asTotal = (v: ScenarioValues, t: [number, number, number]): ScenarioValues => ({ ...v, saleBasis: 'total', saleLow: t[0], saleBase: t[1], saleHigh: t[2] });
    const user = { ...asTotal(baseB, [3_800_000, 4_000_000, 4_200_000]), debtAtSale: 200_000 };
    const alt = valuesForAnalysisScenario({ user, scenario: asTotal(baseA, [4_100_000, 4_300_000, 4_500_000]), ownDuration: true, saleDebtBasis: null });
    expect(alt.debtAtSale).toBe(200_000); // brukerens gjeld, ikke analysens
    const sB = evaluateScenario(user).evaluation.base!;
    const sA = evaluateScenario(alt).evaluation.base!;
    expect(sB.S).toBe(3_800_000);
    expect(sA.S).toBe(4_100_000);
    expect(sA.S - sB.S).toBe(300_000); // fellesgjelden forvrenger ikke deltaet
    // og med en annen gjeld forblir forskjellen den samme
    for (const debt of [0, 450_000]) {
      const u = { ...user, debtAtSale: debt };
      const a = valuesForAnalysisScenario({ user: u, scenario: asTotal(baseA, [4_100_000, 4_300_000, 4_500_000]), ownDuration: true, saleDebtBasis: null });
      expect(evaluateScenario(a).evaluation.base!.S - evaluateScenario(u).evaluation.base!.S).toBe(300_000);
    }
  });

  it('kontantgrunnlag avledet av totalverdi (analysens gjeld 300 000): brukerens gjeld 200 000 gir 100 000 høyere kontant i alle scenarioer, og totalverdien er uendret', () => {
    const analysis = withDebt(300_000, 'kontant');
    const same = run(analysis, 300_000);
    const user200 = run(analysis, 200_000);
    expect(same.defs.length).toBe(3);
    for (const d of same.defs) {
      const a = same.c.rows.find((r) => r.input.id === d.id)!.values;
      const b = user200.c.rows.find((r) => r.input.id === d.id)!.values;
      for (const k of ['saleLow', 'saleBase', 'saleHigh'] as const) {
        expect((b[k] as number) - (a[k] as number), `${d.title} ${k}`).toBe(100_000);
        // total = kontant + gjeld er konstant
        expect((b[k] as number) + 200_000, `${d.title} ${k} total`).toBe((a[k] as number) + 300_000);
      }
    }
    // scenarioforskjellen i salgsverdi er den samme med begge gjeldene
    const diff = (r: typeof same) => (r.c.rows[2].values.saleBase as number) - (r.c.rows[0].values.saleBase as number);
    expect(diff(user200)).toBe(diff(same));
    // aktivt scenario er brukerens kalkyle, uendret
    expect(user200.c.rows[0].values.saleBase).toBe(user200.draft.saleBase);
  });

  it('totalgrunnlag (agentens totalpris): totalverdiene er like, og kontant = totalpris − brukerens gjeld for alle scenarioer', () => {
    const analysis = withDebt(300_000, 'total');
    const r = run(analysis, 200_000);
    for (const row of r.c.rows) {
      const v = row.values;
      expect(v.saleBasis).toBe('total');
      expect(row.input.evaluation.base?.S).toBe((v.saleBase as number) - 200_000);
      expect(row.input.evaluation.base?.D1).toBe(200_000);
    }
    // samme totalverdi uansett gjeld
    const r2 = run(analysis, 450_000);
    r.c.rows.forEach((row, i) => expect(row.values.saleBase).toBe(r2.c.rows[i].values.saleBase));
  });

  it('gjeld større enn totalverdien gir en tydelig melding på scenarioet, ikke en negativ salgspris', () => {
    const analysis = withDebt(300_000, 'kontant');
    const r = run(analysis, 9_000_000);
    const alt = r.c.rows[1];
    expect(alt.saleIssues.map((i) => i.kind)).toEqual(['gjeld_over_totalverdi']);
    expect(alt.values.saleBase).toBeNull();
    expect(alt.input.evaluation.status).not.toBe('complete');
  });

  it('ukjent gjeld hos brukeren: scenarioene beholder verdiene og meldingen er tydelig (ingen falsk 0)', () => {
    const analysis = withDebt(300_000, 'kontant');
    const r = run(analysis, null);
    const alt = r.c.rows[1];
    expect(alt.saleIssues.map((i) => i.kind)).toEqual(['gjeld_ukjent']);
    expect(alt.values.saleBase).not.toBe(0);
    expect(alt.values.saleBase).not.toBeNull();
  });
});

describe('14. private overstyringer og delte data', () => {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === DEMO_FINN.sharedAB)!;
  const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
  const defs = resolveAnalysisScenarios(built.analysis);

  it('brukerens private fellesgjeld beholdes i kalkylen, og grunnanalysen og andre brukere påvirkes ikke', () => {
    const analysis = withDebt(300_000, 'kontant');
    const frozen = structuredClone(analysis);
    const snapshotBefore = structuredClone(built.snapshot);
    const user = { ...buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: defs[1].id }).values, debtAtSale: 120_000 };
    const out = analysisScenarioValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS, user, analysisScenarioId: defs[2].id });
    expect(out.values.debtAtSale).toBe(120_000); // privat verdi beholdes
    expect(analysis).toEqual(frozen); // delt analyse uendret
    expect(built.snapshot).toEqual(snapshotBefore);
    // en annen bruker med analysens gjeld får grunnverdiene uendret
    const other = analysisScenarioValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS, user: { ...user, debtAtSale: 300_000 }, analysisScenarioId: defs[2].id });
    expect(other.scenarioBase.values.saleBase).toBe(out.scenarioBase.values.saleBase);
    expect(out.values.saleBase).toBe((other.values.saleBase as number) + 180_000);
  });

  it('endring av fellesgjeld i kalkylen flytter bare verdier som er uendret fra grunnlaget – egne overstyringer beholdes', () => {
    const analysis = withDebt(300_000, 'kontant');
    const baseV = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: defs[0].id });
    const baseSale = { basis: baseV.values.saleBasis, low: baseV.values.saleLow, base: baseV.values.saleBase, high: baseV.values.saleHigh, debtBasis: baseV.saleResolution.sale.debtBasis };
    expect(baseSale.debtBasis).toBe(300_000);
    const untouched = baseV.values;
    const after = saleValuesAfterDebtChange({ draft: untouched, nextDebt: 200_000, baseSale });
    expect(after.debtAtSale).toBe(200_000);
    expect(after.saleLow).toBe((untouched.saleLow as number) + 100_000);
    expect(after.saleBase).toBe((untouched.saleBase as number) + 100_000);
    expect(after.saleHigh).toBe((untouched.saleHigh as number) + 100_000);
    // brukeren har skrevet sin egen normalverdi: den røres ikke, mens lav/høy som ikke er overstyrt følger med
    const own = { ...untouched, saleBase: 4_321_000 };
    const afterOwn = saleValuesAfterDebtChange({ draft: own, nextDebt: 200_000, baseSale });
    expect(afterOwn.saleBase).toBe(4_321_000);
    expect(afterOwn.saleLow).toBe((untouched.saleLow as number) + 100_000);
    // tilbake til opprinnelig gjeld gir tilbake grunnverdiene
    const roundTrip = { ...untouched, ...after };
    const back = saleValuesAfterDebtChange({ draft: roundTrip, nextDebt: 300_000, baseSale });
    expect(back.saleBase).toBe(untouched.saleBase);
    // ukjent eller umulig gjeld endrer ikke salgsverdiene (ingen falsk 0, ingen negativ pris)
    const keep = { saleLow: untouched.saleLow, saleBase: untouched.saleBase, saleHigh: untouched.saleHigh };
    expect(saleValuesAfterDebtChange({ draft: untouched, nextDebt: null, baseSale })).toEqual({ debtAtSale: null, ...keep });
    expect(saleValuesAfterDebtChange({ draft: untouched, nextDebt: 99_000_000, baseSale })).toEqual({ debtAtSale: 99_000_000, ...keep });
  });

  it('kontantpris oppgitt direkte (agentens estimat, eldre analyse) endres aldri av fellesgjeld', () => {
    const legacy = SEED_PROPERTIES.find((s) => s.finnId === '900000106')!; // Ladeveien 9 A: kontantpris, gjeld 85 000
    const b = buildProperty({ ...legacy, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
    const base = buildBaseValues({ property: b.property, snapshot: b.snapshot, analysis: b.analysis, defaults: NEW_ACCOUNT_DEFAULTS });
    expect(base.saleResolution.sale.debtBasis).toBeNull();
    const changed = saleValuesAfterDebtChange({ draft: base.values, nextDebt: 0, baseSale: { basis: base.values.saleBasis, low: base.values.saleLow, base: base.values.saleBase, high: base.values.saleHigh, debtBasis: null } });
    expect(changed).toEqual({ debtAtSale: 0, saleLow: base.values.saleLow, saleBase: base.values.saleBase, saleHigh: base.values.saleHigh });
  });
});
