import { describe, expect, it } from 'vitest';
import { NEW_ACCOUNT_DEFAULTS } from '../config/defaults';
import { buildProperty } from '../data/analysisBuilder';
import { DEMO_FINN, SEED_PROPERTIES } from '../data/seedProperties';
import { resolveAnalysisScenarios, type ResolvedAnalysisScenario } from '../domain/analysisScenarios';
import type { ScenarioValues } from '../domain/schemas';
import { rankScenarios, type RankInput } from './ranking';
import {
  analysisScenarioValues,
  buildBaseValues,
  evaluateScenario,
  renovationMonthsOf,
  SCENARIO_FIELD_CLASS,
  scenarioHasOwnDuration,
  valuesForAnalysisScenario,
} from './scenario';
import { buildScenarioComparison, type ScenarioComparison } from './scenarioComparison';

const NOW = new Date('2026-10-16T08:00:00.000Z');

/** Elvekanten 17 B: Basis og to alternativer med ulike tiltak, timer, salgsverdier og oppussingstid (2,5 / 3,5 / 4 mnd). */
function setup(finnId: number | string = DEMO_FINN.sharedAB) {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === finnId)!;
  const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
  const defs = resolveAnalysisScenarios(built.analysis);
  const base = (id: string) => buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis: built.analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: id }).values;
  const [basis, altA, altB] = defs;
  /** Brukerens aktive kalkyle: Basis med private endringer av de felles forutsetningene. */
  const draft = (over: Partial<ScenarioValues> = {}, from: ResolvedAnalysisScenario = basis): ScenarioValues => ({ ...base(from.id), ...over });
  const compare = (d: ScenarioValues): ScenarioComparison =>
    buildScenarioComparison({ analysis: built.analysis, property: built.property, snapshot: built.snapshot, defaults: NEW_ACCOUNT_DEFAULTS, draft: d, activeName: 'Hovedscenario', riskBand: 'middels' });
  return { built, defs, basis, altA, altB, base, draft, compare };
}
const rowOf = (c: ScenarioComparison, id: string) => c.rows.find((r) => r.input.id === id)!;
const evalOf = (c: ScenarioComparison, id: string) => rowOf(c, id).input.evaluation;

describe('felt klassifisert som felles eller scenariospesifikt', () => {
  it('klassifiserer hvert eneste felt i ScenarioValues (ingen glemt)', () => {
    const { base, basis } = setup();
    expect(Object.keys(SCENARIO_FIELD_CLASS).sort()).toEqual(Object.keys(base(basis.id)).sort());
  });

  it('økonomisk ramme er felles; tiltak, salgsverdi og scenario-id er scenariospesifikke; varighet er sammensatt', () => {
    for (const k of ['purchasePrice', 'debtAtPurchase', 'dutyPct', 'buyFees', 'reservePct', 'settlementMonths', 'interestPct', 'purchaseFinancingPct', 'renovationFinancingPct', 'availableEquity', 'profitTarget', 'minProfitPerOwnHour', 'weeklyOwnHours', 'laborModes', 'maxOwnWork', 'regulatedCompetence', 'buyerType', 'taxMode', 'saleFixedCost', 'saleCommissionPct', 'startBid', 'walkAway'] as const)
      expect(SCENARIO_FIELD_CLASS[k], k).toBe('felles');
    for (const k of ['renovationItems', 'renovationMode', 'renovationOptionId', 'vatIncluded', 'saleLow', 'saleBase', 'saleHigh', 'saleBasis', 'analysisScenarioId'] as const) expect(SCENARIO_FIELD_CLASS[k], k).toBe('scenario');
    expect(SCENARIO_FIELD_CLASS.months).toBe('varighet');
  });
});

describe('A. samme kjøpspris i sammenligningen av Basis/A/B', () => {
  it('brukerens kjøpspris (2 950 000) gjelder alle – analysegrunnlaget for alternativene er 2 890 000', () => {
    const s = setup();
    expect(s.base(s.altA.id).purchasePrice).toBe(2_890_000);
    const c = s.compare(s.draft({ purchasePrice: 2_950_000 }));
    for (const d of s.defs) {
      expect(rowOf(c, d.id).values.purchasePrice, d.title).toBe(2_950_000);
      expect(evalOf(c, d.id).base?.P, d.title).toBe(2_950_000);
    }
  });

  it('gjelder også når et alternativ er det aktive scenarioet', () => {
    const s = setup();
    const draftOnA = valuesForAnalysisScenario({ user: s.draft({ purchasePrice: 3_010_000 }), scenario: s.base(s.altA.id), ownDuration: true });
    const c = s.compare(draftOnA);
    expect(c.activeId).toBe(s.altA.id);
    for (const d of s.defs) expect(evalOf(c, d.id).base?.P, d.title).toBe(3_010_000);
  });
});

describe('B–E. samme rente, finansiering, timekrav og fortjenestemål for alle', () => {
  it('B. rente 7,2 %', () => {
    const s = setup();
    const c = s.compare(s.draft({ interestPct: 7.2 }));
    for (const d of s.defs) {
      expect(rowOf(c, d.id).values.interestPct).toBe(7.2);
      expect(evalOf(c, d.id).resolved?.r, d.title).toBeCloseTo(0.072, 10);
    }
  });

  it('C. kjøpslån 85 % og oppussingslån 25 %', () => {
    const s = setup();
    const c = s.compare(s.draft({ purchaseFinancingPct: 85, renovationFinancingPct: 25 }));
    for (const d of s.defs) {
      const r = evalOf(c, d.id).resolved!;
      expect(r.fP, d.title).toBeCloseTo(0.85, 10);
      expect(r.fR, d.title).toBeCloseTo(0.25, 10);
      expect(evalOf(c, d.id).base?.purchaseLoan, d.title).toBeCloseTo(0.85 * (evalOf(c, d.id).base?.P ?? 0), 0);
    }
  });

  it('D. timekrav 700 kr/t rangeres mot samme krav og styrer maksbudgrensen likt', () => {
    const s = setup();
    const c = s.compare(s.draft({ minProfitPerOwnHour: 700 }));
    for (const d of s.defs) {
      expect(evalOf(c, d.id).base?.minProfitPerOwnHour, d.title).toBe(700);
      expect(evalOf(c, d.id).recommendedMaxBid?.limits.find((l) => l.id === 'hourly')?.target, d.title).toBe(700);
    }
  });

  it('E. fortjenestemål 500 000 kr', () => {
    const s = setup();
    const c = s.compare(s.draft({ profitTarget: 500_000 }));
    for (const d of s.defs) expect(evalOf(c, d.id).recommendedMaxBid?.limits.find((l) => l.id === 'profit')?.target, d.title).toBe(500_000);
  });

  it('øvrige felles forutsetninger (egenkapital, arbeidsmodus, kjøpertype, skatt, salgskostnader, reserve) følger brukeren', () => {
    const s = setup();
    const laborModes = { ...s.base(s.basis.id).laborModes, gulv: 'selv' as const, ror: 'innleid' as const };
    const c = s.compare(s.draft({ availableEquity: 1_250_000, laborModes, maxOwnWork: true, buyerType: 'as', taxMode: 'antatt', taxPct: 22, saleFixedCost: 80_000, saleCommissionPct: 1.5, reservePct: 35, weeklyOwnHours: 20 }));
    for (const d of s.defs) {
      const v = rowOf(c, d.id).values;
      expect(v.availableEquity).toBe(1_250_000);
      expect(v.laborModes).toEqual(laborModes);
      expect(v.maxOwnWork).toBe(true);
      expect(v.buyerType).toBe('as');
      expect(v.taxMode).toBe('antatt');
      expect(v.taxPct).toBe(22);
      expect(v.saleFixedCost).toBe(80_000);
      expect(v.saleCommissionPct).toBe(1.5);
      expect(v.reservePct).toBe(35);
      expect(v.weeklyOwnHours).toBe(20);
    }
  });
});

describe('F–H. det som er scenariospesifikt beholdes', () => {
  it('F. oppussingstiltak, kostnader og egne timer er forskjellige mellom Basis og alternativ', () => {
    const s = setup();
    const c = s.compare(s.draft({ purchasePrice: 2_950_000 }));
    expect(rowOf(c, s.altA.id).values.renovationItems).toEqual(s.base(s.altA.id).renovationItems);
    expect(rowOf(c, s.altB.id).values.renovationItems).toEqual(s.base(s.altB.id).renovationItems);
    const rb = s.defs.map((d) => evalOf(c, d.id).base?.RB);
    const hours = s.defs.map((d) => evalOf(c, d.id).base?.ownHours);
    expect(new Set(rb).size).toBe(3);
    expect(new Set(hours).size).toBeGreaterThan(1);
  });

  it('G. salgsverdi low/base/high er forskjellig per scenario', () => {
    const s = setup();
    const c = s.compare(s.draft({ purchasePrice: 2_950_000 }));
    for (const d of s.defs) {
      const b = s.base(d.id);
      const v = rowOf(c, d.id).values;
      expect([v.saleLow, v.saleBase, v.saleHigh], d.title).toEqual([b.saleLow, b.saleBase, b.saleHigh]);
    }
    expect(new Set(s.defs.map((d) => rowOf(c, d.id).values.saleBase)).size).toBe(3);
  });

  it('H. oppussingstiden varierer (2,5 / 3,5 / 4 mnd), men alle bruker brukerens private oppgjørstid (5 mnd)', () => {
    const s = setup();
    const c = s.compare(s.draft({ settlementMonths: 5, months: 2.5 + 5 }));
    const reno = s.defs.map((d) => renovationMonthsOf(rowOf(c, d.id).values));
    expect(reno).toEqual([2.5, 3.5, 4]);
    for (const d of s.defs) expect(rowOf(c, d.id).values.settlementMonths, d.title).toBe(5);
    expect(s.defs.map((d) => rowOf(c, d.id).values.months)).toEqual([7.5, 8.5, 9]);
    expect(s.defs.map((d) => evalOf(c, d.id).base?.months)).toEqual([7.5, 8.5, 9]);
  });

  it('H. uten egen oppgjørstid (null) er total varighet bare scenarioets oppussingstid', () => {
    const s = setup();
    const c = s.compare(s.draft({ settlementMonths: null, months: 2.5 }));
    expect(s.defs.map((d) => rowOf(c, d.id).values.months)).toEqual([2.5, 3.5, 4]);
  });

  it('H. aktivt scenario beholder brukerens egen kalkyle, også oppussingstid', () => {
    const s = setup();
    const d = s.draft({ months: 9, settlementMonths: 3.5 }); // brukeren har endret oppussingstiden i Basis til 5,5 mnd
    const c = s.compare(d);
    expect(rowOf(c, s.basis.id).values.months).toBe(9);
    expect(rowOf(c, s.altA.id).values.months).toBe(7); // 3,5 + 3,5
  });

  it('scenario uten egen varighet beholder brukerens varighet', () => {
    const s = setup();
    const merged = valuesForAnalysisScenario({ user: s.draft({ months: 11, settlementMonths: 3.5 }), scenario: s.base(s.altA.id), ownDuration: false });
    expect(merged.months).toBe(11);
    expect(scenarioHasOwnDuration({ suggestedMonths: null, monthsAreTotal: false })).toBe(false);
    expect(scenarioHasOwnDuration({ suggestedMonths: 3, monthsAreTotal: false })).toBe(true);
    expect(scenarioHasOwnDuration({ suggestedMonths: null, monthsAreTotal: true })).toBe(true);
  });
});

describe('I. lagrede private scenarioer og inndata berøres aldri', () => {
  it('sammenligningen endrer ikke brukerens kalkyle, grunnverdiene eller noe delt objekt', () => {
    const s = setup();
    const d = s.draft({ purchasePrice: 3_000_000, interestPct: 7.2 });
    const snapshot = structuredClone(d);
    const analysisBefore = structuredClone(s.built.analysis);
    s.compare(d);
    s.compare(d);
    expect(d).toEqual(snapshot);
    expect(s.built.analysis).toEqual(analysisBefore);
  });

  it('resultatet deler ikke objekter med grunnverdiene (endring i det ene smitter ikke over)', () => {
    const s = setup();
    const scenario = s.base(s.altA.id);
    const merged = valuesForAnalysisScenario({ user: s.draft(), scenario, ownDuration: true });
    merged.renovationItems[0].materials = 123;
    expect(scenario.renovationItems[0].materials).not.toBe(123);
    const user = s.draft();
    const out = valuesForAnalysisScenario({ user, scenario, ownDuration: true });
    expect(out).not.toBe(user);
  });

  it('to lagrede private scenarioer med ulik kjøpspris (2,8 og 3,0 mill.) påvirker ikke rangeringen – kun aktiv kalkyle gjør det', () => {
    const s = setup();
    const saved1 = s.draft({ purchasePrice: 2_800_000 });
    const saved2 = s.draft({ purchasePrice: 3_000_000 });
    const copy = structuredClone([saved1, saved2]);
    const active = s.draft({ purchasePrice: 2_950_000 });
    const c = s.compare(active);
    for (const d of s.defs) expect(evalOf(c, d.id).base?.P).toBe(2_950_000);
    // rangeringen er uavhengig av hvilke private scenarioer som ligger lagret (de er ikke inndata)
    expect([saved1, saved2]).toEqual(copy);
  });
});

describe('J. «Bruk i kalkylen» beholder private forutsetninger og bytter scenarioets egenskaper', () => {
  it('kjøpspris, rente, finansiering, egenkapital og timekrav beholdes; tiltak, salgsverdi og oppussingstid byttes', () => {
    const s = setup();
    const user = s.draft({ purchasePrice: 3_050_000, interestPct: 7.2, purchaseFinancingPct: 85, renovationFinancingPct: 25, availableEquity: 640_000, minProfitPerOwnHour: 700, profitTarget: 500_000, settlementMonths: 5, months: 7.5, notes: 'Min notis' });
    const { values, scenarioBase } = analysisScenarioValues({ property: s.built.property, snapshot: s.built.snapshot, analysis: s.built.analysis, defaults: NEW_ACCOUNT_DEFAULTS, user, analysisScenarioId: s.altA.id });
    // beholdt
    expect(values).toMatchObject({ purchasePrice: 3_050_000, interestPct: 7.2, purchaseFinancingPct: 85, renovationFinancingPct: 25, availableEquity: 640_000, minProfitPerOwnHour: 700, profitTarget: 500_000, settlementMonths: 5, notes: 'Min notis' });
    // byttet
    expect(values.analysisScenarioId).toBe(s.altA.id);
    expect(values.renovationItems).toEqual(scenarioBase.values.renovationItems);
    expect([values.saleLow, values.saleBase, values.saleHigh]).toEqual([scenarioBase.values.saleLow, scenarioBase.values.saleBase, scenarioBase.values.saleHigh]);
    expect(values.months).toBe(3.5 + 5);
    expect(values.vatIncluded).toBe(scenarioBase.values.vatIncluded);
  });

  it('å ta et scenario i bruk på en uendret kalkyle gir nøyaktig scenarioets grunnverdier (ingen utilsiktet endring)', () => {
    const s = setup();
    for (const d of s.defs) for (const e of s.defs) expect(valuesForAnalysisScenario({ user: s.base(d.id), scenario: s.base(e.id), ownDuration: scenarioHasOwnDuration(e) })).toEqual(s.base(e.id));
  });

  it('eldre analyse med total varighet: oppgjørstiden brukeren har satt legges til oppussingstiden', () => {
    const s = setup(SEED_PROPERTIES.find((p) => resolveAnalysisScenarios(buildProperty({ ...p, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW).analysis)[0].monthsAreTotal)!.finnId);
    const only = s.defs[0];
    expect(only.monthsAreTotal).toBe(true);
    const user = s.draft({ settlementMonths: 2, months: (renovationMonthsOf(s.base(only.id)) ?? 0) + 2 });
    const out = valuesForAnalysisScenario({ user, scenario: s.base(only.id), ownDuration: scenarioHasOwnDuration(only) });
    expect(out.settlementMonths).toBe(2);
    expect(out.months).toBe((renovationMonthsOf(s.base(only.id)) ?? 0) + 2);
  });
});

describe('Rangering: Alternativ A så bedre ut kun fordi kjøpsprisen var lavere', () => {
  /** Slik rangeringen gjorde det før: aktivt scenario med brukerens kalkyle, de andre med analysens grunnverdier (egen kjøpspris). */
  function legacyRank(s: ReturnType<typeof setup>, draft: ScenarioValues) {
    const inputs: RankInput[] = s.defs.map((d) => {
      const values = d.id === (draft.analysisScenarioId ?? s.basis.id) ? draft : s.base(d.id);
      return { id: d.id, title: d.title, kind: d.kind, feasibility: d.feasibility, evaluation: evaluateScenario(values).evaluation, riskBand: 'middels', scenarioRisk: d.risk ?? null, saleCertainty: { tier: null, uncertainty: d.uncertainty.level } };
    });
    return rankScenarios(inputs);
  }

  it('med kjøpspris 3 200 000 i kalkylen: før lå A over Basis kun på grunn av prisen (2 890 000 mot 3 200 000); nå vurderes begge til 3 200 000', () => {
    const s = setup();
    const draft = s.draft({ purchasePrice: 3_200_000 });
    const old = legacyRank(s, draft);
    const oldPos = (id: string) => old.rows.find((r) => r.id === id)!.position as number;
    const oldProfit = (id: string) => old.rows.find((r) => r.id === id)!.metrics.profit as number;
    // FØR: A (grunnlagspris 2,89 mill.) fortjener +127 000 mot Basis −90 000 (3,2 mill.) – kun fordi prisen er 310 000 lavere. Plass 2 mot plass 3.
    expect(oldProfit(s.altA.id)).toBeGreaterThan(oldProfit(s.basis.id));
    expect(oldPos(s.altA.id)).toBeLessThan(oldPos(s.basis.id));

    // NÅ: samme kjøpspris for alle
    const c = s.compare(draft);
    const pos = (id: string) => c.result.rows.find((r) => r.id === id)!.position as number;
    const m = (id: string) => c.result.rows.find((r) => r.id === id)!.metrics;
    for (const d of s.defs) expect(evalOf(c, d.id).base?.P).toBe(3_200_000);
    expect(m(s.altA.id).profit as number).toBeLessThan(m(s.basis.id).profit as number);
    expect(pos(s.basis.id)).toBeLessThan(pos(s.altA.id));

    // Fortjeneste, avkastning, kr/time, EK-behov, stress og maksbud er regnet av motoren ved samme pris
    for (const d of s.defs) {
      const direct = evaluateScenario(rowOf(c, d.id).values).evaluation;
      const mm = m(d.id);
      expect(mm.profit).toBe(direct.base?.profit);
      expect(mm.projectReturn).toBe(direct.base?.projectReturn);
      expect(mm.profitPerOwnHour).toBe(direct.base?.profitPerOwnHour);
      expect(mm.equityNeed).toBe(direct.base?.equityNeed);
      expect(mm.stressProfit).toBe(direct.stress.find((x) => x.id === 'combined')?.result.profit ?? null);
      expect(mm.maxBid).toBe(direct.recommendedMaxBid?.price ?? null);
    }
    // Prisforskjellen forklarer hele endringen i fortjeneste for A: ny fortjeneste er lavere enn før
    expect(m(s.altA.id).profit as number).toBeLessThan(oldProfit(s.altA.id) - 300_000);
  });

  it('forskjellen mellom scenarioene er den samme som ved å regne dem på nøyaktig samme pris (ren scenarioeffekt)', () => {
    const s = setup();
    for (const price of [2_700_000, 2_890_000, 3_300_000]) {
      const c = s.compare(s.draft({ purchasePrice: price }));
      const manual = (id: string) => evaluateScenario({ ...s.base(id), purchasePrice: price }).evaluation.base!.profit;
      for (const d of s.defs.slice(1)) {
        const delta = (evalOf(c, d.id).base?.profit ?? 0) - (evalOf(c, s.basis.id).base?.profit ?? 0);
        expect(Math.round(delta), `${d.title} @ ${price}`).toBe(Math.round(manual(d.id) - manual(s.basis.id)));
      }
    }
  });

  it('anbefalt scenario avgjøres ved samme kjøpspris', () => {
    const s = setup();
    const c = s.compare(s.draft({ purchasePrice: 3_200_000 }));
    expect(c.result.recommendedId).toBe(s.basis.id); // A og B er betingede/uavklarte og kan ikke anbefales
    expect(c.result.rows.find((r) => r.recommended)?.metrics.maxBid).toBe(c.result.recommendedMaxBid);
  });
});
