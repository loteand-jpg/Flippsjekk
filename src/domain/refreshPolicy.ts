import type { SharedAnalysis } from './schemas';

/**
 * Hva som skal skje når en analyse brukes igjen. Produktbeslutning:
 *
 * En analyse som er eldre enn grensen (30 dager) utløser normalt en **grundigere markedsoppfriskning**, ikke en full
 * teknisk hovedanalyse. Markedsoppfriskningen kan (senere, med ekte kilder) hente ny prisantydning, offisielle visninger og
 * salgsstatus, oppdatere markedsreferanser og områdeprofil, beregne ny salgsverdi per eksisterende scenario og kjøre
 * økonomimotoren på nytt. Den leser IKKE alle tekniske dokumenter på nytt, gjør ikke ny teknisk/juridisk analyse og lager
 * ikke nye scenarioer.
 *
 * Full (eller delvis) teknisk reanalyse skjer bare når
 *  - nye eller endrede relevante dokumenter oppdages,
 *  - kritiske fakta er endret, eller
 *  - eksisterende analyse er inkompatibel med gjeldende modell/skjema.
 */
export type TechnicalReason = 'ingen_analyse' | 'inkompatibel' | 'nye_dokumenter' | 'kritiske_fakta_endret';

export const TECHNICAL_REASON_LABEL: Record<TechnicalReason, string> = {
  ingen_analyse: 'Ingen analyse finnes',
  inkompatibel: 'Analysen er ikke kompatibel med gjeldende modell',
  nye_dokumenter: 'Nye eller endrede relevante dokumenter er oppdaget',
  kritiske_fakta_endret: 'Kritiske fakta er endret',
};

/** Signaler fra kilden om at det tekniske grunnlaget har endret seg. I demoen settes de eksplisitt; i produksjon kommer de fra kildehentingen. */
export interface TechnicalChangeSignals {
  newOrChangedDocuments?: boolean;
  criticalFactsChanged?: boolean;
}

export type AnalysisAction =
  | { kind: 'reuse' }
  | { kind: 'market_refresh'; ageDays: number }
  | { kind: 'full_analysis'; reason: TechnicalReason };

export function technicalReasons(args: { latest: SharedAnalysis | null; compatible: boolean; signals?: TechnicalChangeSignals | null }): TechnicalReason[] {
  const out: TechnicalReason[] = [];
  if (!args.latest) return ['ingen_analyse'];
  if (!args.compatible) out.push('inkompatibel');
  if (args.signals?.newOrChangedDocuments) out.push('nye_dokumenter');
  if (args.signals?.criticalFactsChanged) out.push('kritiske_fakta_endret');
  return out;
}

export function decideAnalysisAction(args: {
  latest: SharedAnalysis | null;
  compatible: boolean;
  ageDays: number;
  /** Grense i dager før markedsoppfriskning (FRESHNESS.marketRefreshAfterDays). */
  maxAgeDays: number;
  signals?: TechnicalChangeSignals | null;
}): AnalysisAction {
  const reasons = technicalReasons(args);
  if (reasons.length > 0) return { kind: 'full_analysis', reason: reasons[0] };
  if (args.ageDays > args.maxAgeDays) return { kind: 'market_refresh', ageDays: args.ageDays };
  return { kind: 'reuse' };
}
