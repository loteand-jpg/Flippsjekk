import type { ChecklistItem, PropertySnapshot, Risk, SharedAnalysis } from './schemas';

/**
 * Dokumentert regel for samlet risikoscore i demoen:
 * høyeste kjente alvorlighetsgrad blant analysens risikoer.
 * Ingen kjente nivåer → «Uavklart». Ukjente nivåer vises separat og senker aldri scoren.
 */
export const RISK_RULE_TEXT =
  'Samlet risiko = høyeste kjente alvorlighetsgrad (1–10) blant registrerte risikoer. Risikoer med ukjent alvorlighet telles separat og gjør aldri scoren lavere. Uten kjente nivåer vises «Uavklart».';

export type RiskBand = 'lav' | 'middels' | 'hoy' | 'uavklart';
export const RISK_BAND_LABEL: Record<RiskBand, string> = {
  lav: 'Lav',
  middels: 'Middels',
  hoy: 'Høy',
  uavklart: 'Uavklart',
};

export interface RiskAggregate {
  score: number | null;
  band: RiskBand;
  knownCount: number;
  unknownCount: number;
  top: Risk | null;
}

export function riskBand(score: number | null): RiskBand {
  if (score === null) return 'uavklart';
  if (score <= 3) return 'lav';
  if (score <= 6) return 'middels';
  return 'hoy';
}

export function aggregateRisk(risks: readonly Risk[]): RiskAggregate {
  const known = risks.filter((r) => r.level !== null);
  const unknownCount = risks.length - known.length;
  if (known.length === 0) return { score: null, band: 'uavklart', knownCount: 0, unknownCount, top: risks[0] ?? null };
  const top = known.reduce((a, b) => ((b.level as number) > (a.level as number) ? b : a));
  return { score: top.level, band: riskBand(top.level), knownCount: known.length, unknownCount, top };
}

/**
 * Datadekning – hvor godt grunnlaget er dokumentert. Holdes adskilt fra risiko.
 * 70 % vekt på sjekklisten (dokumentert = 1, delvis = 0,5, mangler = 0; «ikke relevant» telles ikke),
 * 30 % vekt på nøkkelfakta i annonsegrunnlaget som er dokumentert.
 */
export const DATA_QUALITY_RULE_TEXT =
  'Datadekning = 70 % sjekkliste (dokumentert = 1, delvis = 0,5, mangler = 0, «ikke relevant» utelates) + 30 % andel dokumenterte nøkkelfakta (prisantydning, fellesgjeld, areal, byggeår, felleskostnader, eierform). Høy ≥ 75 %, middels ≥ 45 %, ellers lav.';

export type QualityGrade = 'hoy' | 'middels' | 'lav';
export const QUALITY_LABEL: Record<QualityGrade, string> = { hoy: 'Høy', middels: 'Middels', lav: 'Lav' };

export const KEY_FACTS = ['askingPrice', 'sharedDebt', 'areaBRAi', 'buildYear', 'monthlyCommonCosts', 'tenure'] as const;
export const KEY_FACT_LABEL: Record<(typeof KEY_FACTS)[number], string> = {
  askingPrice: 'Prisantydning',
  sharedDebt: 'Fellesgjeld',
  areaBRAi: 'Areal (BRA-i)',
  buildYear: 'Byggeår',
  monthlyCommonCosts: 'Felleskostnader',
  tenure: 'Eierform',
};

export interface DataQuality {
  coverage: number;
  grade: QualityGrade;
  checklistCoverage: number;
  factsCoverage: number;
  missingChecks: ChecklistItem[];
  undocumentedFacts: string[];
}

export function dataQuality(analysis: Pick<SharedAnalysis, 'checklist'>, snapshot: PropertySnapshot | null): DataQuality {
  const relevant = analysis.checklist.filter((c) => c.status !== 'ikke_relevant');
  const points = relevant.reduce((s, c) => s + (c.status === 'dokumentert' ? 1 : c.status === 'delvis' ? 0.5 : 0), 0);
  const checklistCoverage = relevant.length === 0 ? 0 : points / relevant.length;
  const undocumentedFacts: string[] = [];
  let documented = 0;
  for (const f of KEY_FACTS) {
    const prov = snapshot?.factSources[f];
    if (prov?.status === 'dokumentert') documented++;
    else undocumentedFacts.push(KEY_FACT_LABEL[f]);
  }
  const factsCoverage = documented / KEY_FACTS.length;
  const coverage = 0.7 * checklistCoverage + 0.3 * factsCoverage;
  const grade: QualityGrade = coverage >= 0.75 ? 'hoy' : coverage >= 0.45 ? 'middels' : 'lav';
  return {
    coverage,
    grade,
    checklistCoverage,
    factsCoverage,
    missingChecks: relevant.filter((c) => c.status === 'mangler'),
    undocumentedFacts,
  };
}

/** «Foreløpig» når sentrale dokumenter mangler eller salgsverdi ikke er anslått. */
export function preliminaryReasons(analysis: SharedAnalysis): string[] {
  const reasons: string[] = [];
  const get = (k: ChecklistItem['key']) => analysis.checklist.find((c) => c.key === k);
  if (get('tilstandsrapport')?.status === 'mangler') reasons.push('Tilstandsrapport mangler');
  if (get('salgsoppgave')?.status === 'mangler') reasons.push('Salgsoppgave/egenerklæring mangler');
  if (analysis.estimates.sale.base === null) reasons.push('Salgsverdi er ikke anslått');
  if (analysis.estimates.renovationOptions.length === 0) reasons.push('Oppussing er ikke vurdert');
  if (analysis.visibility === 'private') reasons.push('Privat importert utkast – ikke en publisert grunnanalyse');
  return reasons;
}
