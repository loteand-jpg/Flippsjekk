import { evaluateScenario, type ScenarioEvaluation } from '../calc/scenario';
import type { ScenarioValues } from '../domain/schemas';

/**
 * Kursets kalkyle. Kursteksten og regneeksemplene (Case A–C, sluttcase) forutsetter at finansieringsandelen gjelder
 * kjøpesum og kjøpskostnader samlet. Analysene i appen bruker i stedet kjøpslån på kjøpesummen alene (modell 1.2).
 * Kurset beholder den eldre regelen slik at innholdet ikke endres; alt annet er samme motor.
 */
export function evaluateCourseScenario(values: ScenarioValues, options: { detailed?: boolean } = {}): ScenarioEvaluation {
  return evaluateScenario(values, { ...options, purchaseLoanBasis: 'kjopesum_og_kostnader' });
}
