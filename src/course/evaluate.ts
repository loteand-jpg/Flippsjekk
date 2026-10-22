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
