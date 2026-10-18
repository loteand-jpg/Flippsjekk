import { describe, expect, it } from 'vitest';
import { NEW_ACCOUNT_DEFAULTS } from '../config/defaults';
import { buildProperty } from '../data/analysisBuilder';
import { DEMO_FINN, SEED_PROPERTIES } from '../data/seedProperties';
import { resolveAnalysisScenarios } from '../domain/analysisScenarios';
import type { ScenarioValues } from '../domain/schemas';
import { buildBaseValues, evaluateScenario } from './scenario';
import { rankScenarios, type RankInput } from './ranking';

const NOW = new Date('2026-10-16T08:00:00.000Z');

function setup() {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === DEMO_FINN.sharedAB)!;
  const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, NOW);
  const scenarios = resolveAnalysisScenarios(built.analysis);
  const valuesOf = (id: string): ScenarioValues => buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis: built.analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: id }).values;
  return { built, scenarios, valuesOf };
}

const input = (id: string, title: string, values: ScenarioValues, feasibility: RankInput['feasibility'], over: Partial<RankInput> = {}): RankInput => ({
  id,
  title,
  kind: id === 'basis' ? 'basis' : 'alternativ',
  feasibility,
  evaluation: evaluateScenario(values).evaluation,
  riskBand: 'middels',
  saleCertainty: { tier: null, uncertainty: 'lav' },
  ...over,
});

describe('scenario-rangering', () => {
  it('rangerer på flere kriterier og viser dem åpent – ikke bare nominell fortjeneste', () => {
    const { scenarios, valuesOf } = setup();
    const inputs = scenarios.map((s) => input(s.id, s.title, valuesOf(s.id), s.feasibility, { kind: s.kind, saleCertainty: { tier: null, uncertainty: s.uncertainty.level } }));
    const r = rankScenarios(inputs);
    expect(r.criteria.map((c) => c.key)).toEqual(['profit', 'projectReturn', 'profitPerHour', 'risk', 'saleCertainty', 'stress', 'equityGap', 'months']);
    expect(r.version).toBe('1.1.0');
    expect(r.criteria.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 10);
    const row = r.rows[0];
    expect(Object.keys(row.metrics)).toEqual(
      expect.arrayContaining(['profit', 'projectReturn', 'profitPerOwnHour', 'ownHours', 'months', 'riskBand', 'feasibility', 'saleCertainty', 'stressProfit', 'equityNeed', 'equityGap', 'maxBid']),
    );
    expect(r.rows.filter((x) => x.ranked).map((x) => x.position)).toEqual([1, 2, 3].slice(0, r.rows.filter((x) => x.ranked).length));
    for (const x of r.rows.filter((y) => y.ranked)) {
      expect(x.composite).not.toBeNull();
      expect(Object.keys(x.scores).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('betinget scenario styrer aldri anbefalt scenario eller anbefalt maksbud', () => {
    const { valuesOf, scenarios } = setup();
    const basisVals = valuesOf(scenarios[0].id);
    // Et betinget alternativ som ser mye bedre ut på papiret
    const rosy: ScenarioValues = { ...basisVals, saleLow: 5_000_000, saleBase: 5_400_000, saleHigh: 5_700_000 };
    const r = rankScenarios([input('basis', 'Basis', basisVals, 'klar'), input('alt', 'Betinget alternativ', rosy, 'betinget')]);
    const basis = r.rows.find((x) => x.id === 'basis')!;
    const alt = r.rows.find((x) => x.id === 'alt')!;
    expect(alt.metrics.profit!).toBeGreaterThan(basis.metrics.profit!);
    expect(alt.metrics.maxBid!).toBeGreaterThan(basis.metrics.maxBid!);
    expect(alt.position).toBe(1); // best på papiret …
    expect(alt.eligible).toBe(false);
    expect(alt.flags).toContain('betinget');
    expect(r.recommendedId).toBe('basis'); // … men anbefales ikke
    expect(r.recommendedMaxBid).toBe(basis.metrics.maxBid);
    expect(r.rows.find((x) => x.recommended)!.id).toBe('basis');
  });

  it('uavklart gjennomførbarhet anbefales heller ikke, og uten gjennomførbart scenario finnes ingen anbefaling', () => {
    const { valuesOf, scenarios } = setup();
    const v = valuesOf(scenarios[0].id);
    const r = rankScenarios([input('basis', 'Basis', v, 'uavklart')]);
    expect(r.recommendedId).toBeNull();
    expect(r.recommendedMaxBid).toBeNull();
    expect(r.rows[0].flags).toContain('uavklart_gjennomforbarhet');
  });

  it('ikke gjennomførbare og ufullstendige scenarioer rangeres ikke', () => {
    const { valuesOf, scenarios } = setup();
    const v = valuesOf(scenarios[0].id);
    const incomplete: ScenarioValues = { ...v, purchasePrice: null };
    const r = rankScenarios([input('basis', 'Basis', v, 'klar'), input('a', 'Ikke mulig', v, 'ikke_gjennomforbar'), input('b', 'Ufullstendig', incomplete, 'klar')]);
    expect(r.rows.find((x) => x.id === 'a')!.ranked).toBe(false);
    expect(r.rows.find((x) => x.id === 'b')!.ranked).toBe(false);
    expect(r.rows.find((x) => x.id === 'b')!.flags).toContain('ufullstendig_kalkyle');
    expect(r.rows.find((x) => x.id === 'basis')!.position).toBe(1);
    expect(r.recommendedId).toBe('basis');
  });

  it('flagger brudd på timekravet og finansieringsgap, og høy fortjeneste alene er ikke nok', () => {
    const { valuesOf, scenarios } = setup();
    const v = valuesOf(scenarios[0].id);
    const strictHours: ScenarioValues = { ...v, minProfitPerOwnHour: 100_000 };
    const poorEquity: ScenarioValues = { ...v, availableEquity: 1 };
    const r = rankScenarios([input('basis', 'Basis', v, 'klar'), input('t', 'Strengt timekrav', strictHours, 'klar'), input('e', 'Lite egenkapital', poorEquity, 'klar')]);
    expect(r.rows.find((x) => x.id === 't')!.flags).toContain('under_timekrav');
    // Under timekravet er ingen port: scenarioet rangeres og kan anbefales
    expect(r.rows.find((x) => x.id === 't')!.ranked).toBe(true);
    expect(r.rows.find((x) => x.id === 't')!.eligible).toBe(true);
    expect(r.rows.find((x) => x.id === 'e')!.flags).toContain('finansieringsgap');
    // Lik fortjeneste, men finansieringsgap trekker ned den samlede rangen
    expect(r.rows.find((x) => x.id === 'e')!.composite!).toBeLessThanOrEqual(r.rows.find((x) => x.id === 'basis')!.composite!);
  });

  it('en lønnsom men svært usikker løsning slår ikke en solid løsning på nominell fortjeneste alene', () => {
    const { valuesOf, scenarios } = setup();
    const v = valuesOf(scenarios[0].id);
    const bigger: ScenarioValues = { ...v, saleLow: v.saleLow! + 30_000, saleBase: v.saleBase! + 60_000, saleHigh: v.saleHigh! + 90_000 };
    const r = rankScenarios([
      input('basis', 'Solid', v, 'klar', { saleCertainty: { tier: 'svaert_godt', uncertainty: null }, riskBand: 'lav' }),
      input('alt', 'Marginalt bedre, men usikker', bigger, 'klar', { saleCertainty: { tier: 'svakt', uncertainty: null }, riskBand: 'hoy' }),
    ]);
    expect(r.rows.find((x) => x.id === 'alt')!.metrics.profit!).toBeGreaterThan(r.rows.find((x) => x.id === 'basis')!.metrics.profit!);
    expect(r.recommendedId).toBe('basis');
  });
});

describe('timekravet i rangeringen (mål- og maksbudparameter, ikke port)', () => {
  const hours = (v: ScenarioValues, h: number): ScenarioValues => ({ ...v, renovationMode: 'rundsum', renovationLumpSum: 250_000, lumpSumHours: h });

  it('et scenario under timekravet diskvalifiseres ikke: det rangeres, kan anbefales og får bare lavere maksbud', () => {
    const { valuesOf, scenarios } = setup();
    const v = hours(valuesOf(scenarios[0].id), 5_000); // svært mange timer for lite merfortjeneste
    const r = rankScenarios([input('basis', 'Mye arbeid', v, 'klar')]);
    const row = r.rows[0];
    expect(row.metrics.meetsHourlyRequirement).toBe(false);
    expect(row.flags).toContain('under_timekrav');
    expect(row.ranked).toBe(true);
    expect(row.eligible).toBe(true);
    expect(r.recommendedId).toBe('basis');
    // Timekravet gir en egen, lavere maksbudgrense
    expect(row.metrics.maxBidHourly).not.toBeNull();
    expect(row.metrics.maxBidHourly!).toBeLessThan(row.metrics.maxBidProfit!);
    expect(row.metrics.maxBid).toBe(row.metrics.maxBidHourly);
    expect(row.metrics.maxBidLimitedBy).toBe('hourly');
    expect(r.recommendedMaxBid).toBe(row.metrics.maxBidHourly);
  });

  it('kjøpspris kan være lav nok til at et scenario under timekravet fortsatt er attraktivt (ikke utestengt)', () => {
    const { valuesOf, scenarios } = setup();
    const cheap = { ...hours(valuesOf(scenarios[0].id), 5_000), purchasePrice: 1_500_000 };
    const row = rankScenarios([input('basis', 'Lav kjøpspris', cheap, 'klar')]).rows[0];
    expect(row.metrics.profit!).toBeGreaterThan(400_000);
    expect(row.metrics.meetsHourlyRequirement).toBe(row.metrics.profitPerOwnHour! >= 500);
    expect(row.eligible).toBe(true);
  });

  it('ved samme kjøpspris og fortjeneste rangeres scenarioet som krever mye mer arbeid svakere', () => {
    const { valuesOf, scenarios } = setup();
    const v = valuesOf(scenarios[0].id);
    const easy = hours(v, 100);
    const hard = hours(v, 2_000);
    const r = rankScenarios([input('hard', 'Krever mye arbeid', hard, 'klar'), input('easy', 'Enkelt', easy, 'klar')]);
    const e = r.rows.find((x) => x.id === 'easy')!;
    const h = r.rows.find((x) => x.id === 'hard')!;
    expect(e.metrics.profit).toBe(h.metrics.profit);
    expect(e.metrics.profitPerOwnHour!).toBeGreaterThan(h.metrics.profitPerOwnHour!);
    expect(e.composite!).toBeGreaterThan(h.composite!);
    expect(e.position).toBe(1);
    expect(r.recommendedId).toBe('easy');
    // Uten egne timer finnes ingen timesats, og kriteriet gjelder ikke (vekten fordeles på de øvrige)
    const none = rankScenarios([input('a', 'A', hours(v, 0), 'klar'), input('b', 'B', hours(v, 0), 'klar')]);
    expect(none.rows[0].scores.profitPerHour).toBeUndefined();
  });

  it('et scenario med høy fortjeneste og mye arbeid kan fortsatt slå et enkelt scenario med lav fortjeneste', () => {
    const { valuesOf, scenarios } = setup();
    const v = valuesOf(scenarios[0].id);
    const bigButHard: ScenarioValues = { ...hours(v, 600), saleLow: v.saleLow! + 400_000, saleBase: v.saleBase! + 500_000, saleHigh: v.saleHigh! + 600_000 };
    const smallEasy = hours(v, 50);
    const r = rankScenarios([input('big', 'Stor og tung', bigButHard, 'klar'), input('small', 'Liten og enkel', smallEasy, 'klar')]);
    expect(r.rows.find((x) => x.id === 'big')!.metrics.profit!).toBeGreaterThan(r.rows.find((x) => x.id === 'small')!.metrics.profit!);
    expect(r.rows.find((x) => x.id === 'big')!.eligible).toBe(true);
  });
});

describe('scenario-spesifikk risiko i rangeringen', () => {
  const risk = (lvl: 'lav' | 'middels' | 'hoy' | 'uavklart') => ({ technical: lvl, cost: lvl, time: lvl, approval: lvl, note: '' });

  it('samme objektrisiko, men ulik scenariorisiko, gir ulik rangering og synlige poeng', () => {
    const { valuesOf, scenarios } = setup();
    const v = valuesOf(scenarios[0].id);
    const r = rankScenarios([input('safe', 'Trygt', v, 'klar', { scenarioRisk: risk('lav') }), input('risky', 'Risikabelt', v, 'klar', { scenarioRisk: risk('hoy') })]);
    const safe = r.rows.find((x) => x.id === 'safe')!;
    const risky = r.rows.find((x) => x.id === 'risky')!;
    expect(safe.metrics.profit).toBe(risky.metrics.profit);
    expect(safe.metrics.objectRiskPoints).toBe(risky.metrics.objectRiskPoints);
    expect(safe.metrics.scenarioRiskPoints).toBe(0);
    expect(risky.metrics.scenarioRiskPoints).toBe(4);
    expect(safe.composite!).toBeGreaterThan(risky.composite!);
    expect(r.recommendedId).toBe('safe');
    expect(risky.flags).toContain('hoy_scenariorisiko');
    expect(Object.keys(risky.metrics.scenarioRiskLevels)).toEqual(['technical', 'cost', 'time', 'approval']);
  });

  it('hver dimensjon teller: kostnads-, tids-, teknisk og myndighetsrisiko påvirker hver for seg', () => {
    const { valuesOf, scenarios } = setup();
    const v = valuesOf(scenarios[0].id);
    for (const dim of ['technical', 'cost', 'time', 'approval'] as const) {
      const r = rankScenarios([input('a', 'A', v, 'klar', { scenarioRisk: risk('lav') }), input('b', 'B', v, 'klar', { scenarioRisk: { ...risk('lav'), [dim]: 'hoy' } })]);
      expect(r.rows.find((x) => x.id === 'b')!.metrics.scenarioRiskPoints, dim).toBe(1);
      expect(r.rows.find((x) => x.id === 'a')!.composite!, dim).toBeGreaterThan(r.rows.find((x) => x.id === 'b')!.composite!);
    }
  });

  it('ikke vurdert scenariorisiko regnes som uavklart (konservativt), ikke som middels', () => {
    const { valuesOf, scenarios } = setup();
    const v = valuesOf(scenarios[0].id);
    const r = rankScenarios([input('mid', 'Middels', v, 'klar', { scenarioRisk: risk('middels') }), input('unk', 'Ikke vurdert', v, 'klar', { scenarioRisk: null })]);
    const unk = r.rows.find((x) => x.id === 'unk')!;
    expect(unk.metrics.scenarioRiskAssessed).toBe(false);
    expect(unk.metrics.scenarioRiskPoints).toBe(4);
    expect(unk.metrics.scenarioRiskPoints).toBeGreaterThan(r.rows.find((x) => x.id === 'mid')!.metrics.scenarioRiskPoints);
    expect(unk.flags).toContain('scenariorisiko_ikke_vurdert');
    expect(unk.composite!).toBeLessThan(r.rows.find((x) => x.id === 'mid')!.composite!);
  });

  it('betinget/uavklart scenario med lav risiko styrer fortsatt aldri anbefalt scenario eller maksbud', () => {
    const { valuesOf, scenarios } = setup();
    const v = valuesOf(scenarios[0].id);
    const rosy: ScenarioValues = { ...v, saleLow: 5_000_000, saleBase: 5_400_000, saleHigh: 5_700_000 };
    const r = rankScenarios([input('basis', 'Basis', v, 'klar', { scenarioRisk: risk('middels') }), input('alt', 'Betinget', rosy, 'betinget', { scenarioRisk: risk('lav') })]);
    expect(r.recommendedId).toBe('basis');
    expect(r.recommendedMaxBid).toBe(r.rows.find((x) => x.id === 'basis')!.metrics.maxBid);
  });

  it('p01: agentens scenariorisiko er med i grunnlaget, og tre-rom-alternativet er mer risikabelt enn basis', () => {
    const { scenarios } = setup();
    const [basis, , alt2] = scenarios;
    expect(basis.risk).toBeTruthy();
    expect(alt2.risk).toBeTruthy();
    expect(alt2.risk!.approval).toBe('hoy');
    expect(basis.risk!.approval).toBe('lav');
  });
});
