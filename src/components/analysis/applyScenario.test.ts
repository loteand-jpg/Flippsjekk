import { describe, expect, it } from 'vitest';
import { buildBaseValues } from '../../calc/scenario';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { buildProperty } from '../../data/analysisBuilder';
import { DEMO_FINN, SEED_PROPERTIES } from '../../data/seedProperties';
import { resolveAnalysisScenarios } from '../../domain/analysisScenarios';
import type { ScenarioValues } from '../../domain/schemas';
import { applyScenarioToDraft } from './ScenarioPanel';
import type { PropertyContext } from './shared';

describe('«Bruk i kalkylen» (applyScenarioToDraft) bruker den felles overlay-funksjonen', () => {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === DEMO_FINN.sharedAB)!;
  const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, new Date('2026-10-16T08:00:00.000Z'));
  const [basis, altA] = resolveAnalysisScenarios(built.analysis);
  const base = (id: string) => buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis: built.analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: id }).values;

  function run(over: Partial<ScenarioValues>) {
    let draft: ScenarioValues = { ...base(basis.id), ...over };
    const ctx = {
      item: { property: built.property, snapshot: built.snapshot },
      baseSnapshot: built.snapshot,
      analysis: built.analysis,
      profile: null,
      get draft() {
        return draft;
      },
      setDraft: (f: ScenarioValues | ((d: ScenarioValues) => ScenarioValues)) => {
        draft = typeof f === 'function' ? f(draft) : f;
      },
    } as unknown as PropertyContext;
    applyScenarioToDraft(ctx, altA.id);
    return draft;
  }

  it('beholder private felles forutsetninger og bytter tiltak, salgsverdi og oppussingstid', () => {
    const after = run({ purchasePrice: 3_050_000, interestPct: 7.2, purchaseFinancingPct: 85, renovationFinancingPct: 25, availableEquity: 640_000, minProfitPerOwnHour: 700, profitTarget: 500_000, settlementMonths: 5, months: 7.5 });
    expect(after).toMatchObject({ purchasePrice: 3_050_000, interestPct: 7.2, purchaseFinancingPct: 85, renovationFinancingPct: 25, availableEquity: 640_000, minProfitPerOwnHour: 700, profitTarget: 500_000, settlementMonths: 5 });
    expect(after.analysisScenarioId).toBe(altA.id);
    expect(after.renovationItems).toEqual(base(altA.id).renovationItems);
    expect(after.saleBase).toBe(base(altA.id).saleBase);
    expect(after.months).toBe(3.5 + 5);
  });

  it('endrer ikke kjøpsprisen selv om alternativets grunnlag har en annen (2 890 000)', () => {
    expect(base(altA.id).purchasePrice).toBe(2_890_000);
    expect(run({ purchasePrice: 2_950_000 }).purchasePrice).toBe(2_950_000);
  });
});
