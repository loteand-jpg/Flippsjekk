import { evaluateScenario, type ScenarioEvaluation } from '../calc/scenario';
import type { ScenarioValues } from '../domain/schemas';

/**
 * Kursversjon 2 bruker samme ordinære beregningsmodell som objektsidene.
 * Kjøpslånet beregnes av kontant kjøpesum, ikke av kjøpskostnadene.
 * Verken eldre lånegrunnlag eller egne kurssatser overstyrer standardmotoren.
 */
export function evaluateCourseScenario(values: ScenarioValues, options: { detailed?: boolean } = {}): ScenarioEvaluation {
  return evaluateScenario(values, options);
}

/** Samme mål og motor i hvert salgsscenario, uten en egen maksbudmodell for kurset. */
export function evaluateCourseSaleCases(values: ScenarioValues) {
  const complete = evaluateCourseScenario(values, { detailed: false }).evaluation.status === 'complete';
  return (['low', 'base', 'high'] as const).map((key) => {
    const sale = values[key === 'low' ? 'saleLow' : key === 'base' ? 'saleBase' : 'saleHigh'];
    return {
      key,
      sale,
      evaluation: !complete || sale === null ? null : evaluateCourseScenario({ ...values, saleBase: sale, saleLow: null, saleHigh: null }, { detailed: false }).evaluation,
    };
  });
}
