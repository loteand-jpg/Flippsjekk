import type { PropertyRow } from '../../../components/property/rowModel';
import { findAnalysisScenario } from '../../../domain/analysisScenarios';
import { STANDARD_CLASS_LABEL } from '../../../domain/enums';
import { bedroomsText } from './endProduct';

export interface RowEndProduct {
  /** Scenariotittel, f.eks. «Tre rom (nytt soverom)». */
  title: string;
  bedrooms: string;
  standard: string | null;
  /** true når analysen ikke har vurdert et bestemt sluttprodukt (eldre analyse). */
  notAssessed: boolean;
}

/**
 * Sluttproduktet som kalkylen i listen bygger på: scenarioet raden ble regnet med (brukerens primære kalkyle). Det er ikke
 * nødvendigvis det anbefalte scenarioet – anbefalingen krever en full rangering og vises på objektsiden.
 */
export function rowEndProduct(row: Pick<PropertyRow, 'item' | 'values'>): RowEndProduct | null {
  const analysis = row.item.baseAnalysis ?? row.item.latestAnalysis;
  if (!analysis) return null;
  const def = findAnalysisScenario(analysis, row.values?.analysisScenarioId ?? null);
  return {
    title: def.title,
    bedrooms: bedroomsText(def.endProduct.bedrooms),
    standard: def.endProduct.standardClass ? STANDARD_CLASS_LABEL[def.endProduct.standardClass] : null,
    notAssessed: def.saleSource === 'global',
  };
}
