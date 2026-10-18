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
