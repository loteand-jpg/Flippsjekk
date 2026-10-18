import { CALC_MODEL_VERSION } from '../calc/engine';
import { evaluateScenario } from '../calc/scenario';
import type { Property, Scenario, ScenarioValues } from '../domain/schemas';

/**
 * Eksportformat for private scenarioer (dokumentert i docs/formater.md).
 * Inneholder bare brukerens egne inngangsverdier og beregnede resultater –
 * ikke felles analyseinnhold.
 */
export const SCENARIO_EXPORT_FORMAT = 'flipprom-scenarios';
export const SCENARIO_EXPORT_VERSION = 1;

export interface ScenarioExportV1 {
  format: typeof SCENARIO_EXPORT_FORMAT;
  version: typeof SCENARIO_EXPORT_VERSION;
  exportedAt: string;
  calcModelVersion: string;
  /** Prosentfelt i values er prosentpoeng (7 = 7 %). Beløp i NOK. Ukjent = null. */
  units: { percent: 'prosentpoeng'; currency: 'NOK' };
  scenarios: {
    finnId: string;
    canonicalUrl: string;
    address: string;
    name: string;
    isPrimary: boolean;
    baseAnalysis: { id: string; version: number };
    updatedAt: string;
    values: ScenarioValues;
    result: {
      status: 'complete' | 'incomplete' | 'invalid';
      profitBeforeTaxAndOwnWork: number | null;
      projectReturn: number | null;
      /** Modell 1.1: fortjeneste per egeninnsatstime (egen tid er ikke en kostnad). */
      profitPerOwnHour: number | null;
      /** Modell 1.1: egenkapitalbehov og eventuelt gap mot tilgjengelig egenkapital. */
      equityNeed: number | null;
      equityGap: number | null;
      cashSale: number | null;
      totalCosts: number | null;
      maxBid: number | null;
      missing: string[];
    };
  }[];
}

export function buildScenarioExport(
  rows: { scenario: Scenario; property: Property; isPrimary: boolean }[],
  now: Date,
): ScenarioExportV1 {
  return {
    format: SCENARIO_EXPORT_FORMAT,
    version: SCENARIO_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    calcModelVersion: CALC_MODEL_VERSION,
    units: { percent: 'prosentpoeng', currency: 'NOK' },
    scenarios: rows.map(({ scenario, property, isPrimary }) => {
      const ev = evaluateScenario(scenario.values, { detailed: false });
      const b = ev.evaluation.base;
      return {
        finnId: property.finnId,
        canonicalUrl: property.canonicalUrl,
        address: property.address,
        name: scenario.name,
        isPrimary,
        baseAnalysis: { id: scenario.analysisId, version: scenario.analysisVersion },
        updatedAt: scenario.updatedAt,
        values: scenario.values,
        result: {
          status: ev.evaluation.status,
          profitBeforeTaxAndOwnWork: b?.profit ?? null,
          projectReturn: b?.projectReturn ?? null,
          profitPerOwnHour: b?.profitPerOwnHour ?? null,
          equityNeed: b?.equityNeed ?? null,
          equityGap: b?.equityGap ?? null,
          cashSale: b?.S ?? null,
          totalCosts: b?.C ?? null,
          maxBid: ev.evaluation.maxBid?.price ?? null,
          missing: ev.missing.map((m) => m.label),
        },
      };
    }),
  };
}
