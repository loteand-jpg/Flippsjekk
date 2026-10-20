import { FRESHNESS } from '../config/freshness';
import type { SaleStatus } from './enums';
import type { SharedAnalysis } from './schemas';

/**
 * Hva som skal skje når en analyse brukes igjen. Produktbeslutning (se `decideRefresh` nederst for den samlede beslutningsfunksjonen):
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

/** Tekniske årsaker til full analyse (brukes også til å forklare i UI). Samme regler som i `decideRefresh`, uten salgsstatus. */
export function technicalReasons(args: { latest: SharedAnalysis | null; compatible: boolean; signals?: TechnicalChangeSignals | null }): TechnicalReason[] {
  const out: TechnicalReason[] = [];
  if (!args.latest) return ['ingen_analyse'];
  if (!args.compatible) out.push('inkompatibel');
  if (args.signals?.newOrChangedDocuments) out.push('nye_dokumenter');
  if (args.signals?.criticalFactsChanged) out.push('kritiske_fakta_endret');
  return out;
}

/**
 * Signaler fra kilden om offisielle visninger siden siste kontroll. «Visning holdt» utledes av koden fra lagrede visninger
 * (en ikke avlyst offisiell visning som har funnet sted etter siste kontroll). De øvrige kan bare oppdages ved å hente annonsen,
 * så i demoen simuleres de eksplisitt; i produksjon kommer de fra kildehentingen.
 */
export type ViewingEvent = 'held' | 'changed' | 'cancelled' | 'added';
export const VIEWING_EVENT_LABEL: Record<ViewingEvent, string> = {
  held: 'En offisiell visning har funnet sted siden siste kontroll',
  changed: 'En offisiell visning er endret',
  cancelled: 'En offisiell visning er avlyst',
  added: 'En ny offisiell visning er lagt til',
};

export interface ViewingChangeSignals {
  changed?: boolean;
  cancelled?: boolean;
  added?: boolean;
}

/**
 * Hva som skal skje når et objekt åpnes eller etterspørres. Én ren, testbar beslutningsfunksjon – alle kodeveier
 * (forespørsel om analyse, oppfrisking, koblet analyse, visning av oppfriskingsvarsler) bruker den.
 *
 * Utfall:
 *  - `reuse`: ingenting å oppfriske; analysen brukes som den er.
 *  - `lightweight_refresh`: enkel oppfriskning – pris, visninger og salgsstatus.
 *  - `market_refresh`: grundigere markedsoppfriskning = enkel oppfriskning + markedsreferanser + salgsverdi per eksisterende
 *    scenario. Tar IKKE teknisk grunnlag på nytt og lager ikke nye scenarioer.
 *  - `full_analysis`: teknisk hovedanalyse. Bare når hovedanalyse mangler, modellen er inkompatibel, eller kilden melder
 *    nye/endrede relevante dokumenter eller endrede kritiske fakta. Delvis teknisk reanalyse (`technical_partial_refresh`)
 *    støttes ikke av modellen ennå, så slike signaler gir eksplisitt full analyse.
 *
 * Prioritet (første treff vinner):
 *  1. Mangler hovedanalyse → full. 2. Inkompatibel → full.
 *  3. Annonsen er solgt/trukket → reuse (ingen ny analyse eller oppfriskning er nødvendig; salgsstatus er allerede kjent).
 *  4. Nye/endrede kritiske dokumenter eller kritiske fakta → full (aldri `reuse`).
 *  5. Mer enn 30 dager siden siste hovedanalyse/markedsoppfriskning → market_refresh. Dette vurderes FØR 24-timersregelen, så en
 *     fersk kontroll aldri blokkerer 30-dagersregelen. Markedsoppfriskningen inkluderer den enkle, så en visningshendelse
 *     behandles av den.
 *  6. Offisiell visningshendelse siden siste kontroll → lightweight_refresh, selv om siste kontroll er under 24 timer gammel.
 *  7. Ingen kontroll, eller siste kontroll er eldre enn 24 timer → lightweight_refresh.
 *  8. Ellers → reuse.
 */
export type RefreshKind = 'reuse' | 'lightweight_refresh' | 'market_refresh' | 'full_analysis';

export type RefreshReason =
  | TechnicalReason
  | 'objekt_solgt'
  | 'eldre_enn_30_dager'
  | 'visning_holdt'
  | 'visning_endret'
  | 'visning_avlyst'
  | 'visning_lagt_til'
  | 'ingen_kontroll'
  | 'kontroll_eldre_enn_24t'
  | 'fersk';

export const REFRESH_REASON_LABEL: Record<RefreshReason, string> = {
  ...TECHNICAL_REASON_LABEL,
  objekt_solgt: 'Annonsen er solgt eller trukket',
  eldre_enn_30_dager: 'Mer enn 30 dager siden siste analyse eller markedsoppfriskning',
  visning_holdt: VIEWING_EVENT_LABEL.held,
  visning_endret: VIEWING_EVENT_LABEL.changed,
  visning_avlyst: VIEWING_EVENT_LABEL.cancelled,
  visning_lagt_til: VIEWING_EVENT_LABEL.added,
  ingen_kontroll: 'Annonsen er ikke kontrollert ennå',
  kontroll_eldre_enn_24t: 'Siste kontroll av annonsen er eldre enn 24 timer',
  fersk: 'Annonsen er nylig kontrollert, og ingenting har endret seg',
};

const VIEWING_REASON: Record<ViewingEvent, RefreshReason> = {
  held: 'visning_holdt',
  changed: 'visning_endret',
  cancelled: 'visning_avlyst',
  added: 'visning_lagt_til',
};

export interface RefreshInput {
  now: Date;
  /** Finnes en publisert hovedanalyse (felles analyse) for objektet? */
  hasMainAnalysis: boolean;
  /** Er analysen kompatibel med gjeldende modell og skjema? */
  compatible: boolean;
  /** Tidspunkt for siste teknisk hovedanalyse (ISO). */
  lastMainAnalysisAt: string | null;
  /** Tidspunkt for siste grundige markedsoppfriskning (ISO). */
  lastMarketRefreshAt: string | null;
  /** Siste kontroll av annonsen (ISO): tidspunktet pris, visninger og salgsstatus sist ble hentet (enkel oppfriskning eller analyse). */
  lastCheckAt: string | null;
  /** Offisielle visningshendelser siden siste kontroll. */
  viewingEvents: readonly ViewingEvent[];
  /** Signaler om nye/endrede kritiske dokumenter eller fakta. */
  technical: TechnicalChangeSignals | null;
  /** Annonsens salgsstatus ved siste kontroll. */
  saleStatus: SaleStatus | null;
  /** Grenser. Standard: FRESHNESS. */
  limits?: { lightMaxAgeHours: number; marketAfterDays: number };
}

export interface RefreshDecision {
  kind: RefreshKind;
  reasons: RefreshReason[];
  /** Dager siden siste hovedanalyse/markedsoppfriskning (null når ukjent). */
  thoroughAgeDays: number | null;
  /** Timer siden siste kontroll av annonsen (null når aldri kontrollert). */
  checkAgeHours: number | null;
  /**
   * Er en enkel oppfriskning (pris, visninger, salgsstatus) nødvendig i seg selv? Sant ved visningshendelse siden siste kontroll,
   * ingen kontroll, eller kontroll eldre enn 24 timer. Falsk for solgte/trukne annonser. Uavhengig av 30-dagersregelen, så en
   * eksplisitt «lett oppfrisking» ikke startes unødvendig rett etter en kontroll.
   */
  lightDue: boolean;
}

const ms = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

export function decideRefresh(input: RefreshInput): RefreshDecision {
  const limits = input.limits ?? { lightMaxAgeHours: FRESHNESS.volatileMaxAgeHours, marketAfterDays: FRESHNESS.marketRefreshAfterDays };
  const now = input.now.getTime();
  const main = ms(input.lastMainAnalysisAt);
  const market = ms(input.lastMarketRefreshAt);
  const thorough = main === null ? market : market === null ? main : Math.max(main, market);
  const check = ms(input.lastCheckAt);
  const thoroughAgeDays = thorough === null ? null : (now - thorough) / 86_400_000;
  const checkAgeHours = check === null ? null : (now - check) / 3_600_000;
  const lightDue = input.saleStatus === 'solgt' || input.saleStatus === 'trukket' ? false : input.viewingEvents.length > 0 || checkAgeHours === null || checkAgeHours > limits.lightMaxAgeHours;
  const out = (kind: RefreshKind, reasons: RefreshReason[]): RefreshDecision => ({ kind, reasons, thoroughAgeDays, checkAgeHours, lightDue });

  // 1–2. Hovedanalyse mangler eller er inkompatibel: eneste tilfellene (sammen med kritiske signaler) som gir full analyse.
  if (!input.hasMainAnalysis) return out('full_analysis', ['ingen_analyse']);
  if (!input.compatible) return out('full_analysis', ['inkompatibel']);
  // 3. Solgt/trukket annonse: ingenting å oppfriske, og aldri unødvendig full analyse.
  if (input.saleStatus === 'solgt' || input.saleStatus === 'trukket') return out('reuse', ['objekt_solgt']);
  // 4. Nye/endrede kritiske dokumenter eller fakta: eksplisitt full analyse (delvis teknisk reanalyse støttes ikke ennå).
  const technical: TechnicalReason[] = [];
  if (input.technical?.newOrChangedDocuments) technical.push('nye_dokumenter');
  if (input.technical?.criticalFactsChanged) technical.push('kritiske_fakta_endret');
  if (technical.length > 0) return out('full_analysis', technical);
  // 5. 30-dagersregelen vurderes før 24-timersregelen. Ukjent analysedato regnes som gammel.
  if (thoroughAgeDays === null || thoroughAgeDays > limits.marketAfterDays) {
    const reasons: RefreshReason[] = ['eldre_enn_30_dager', ...input.viewingEvents.map((e) => VIEWING_REASON[e])];
    return out('market_refresh', reasons);
  }
  // 6. Visningshendelse siden siste kontroll: enkel oppfriskning selv om kontrollen er under 24 timer gammel.
  if (input.viewingEvents.length > 0) return out('lightweight_refresh', input.viewingEvents.map((e) => VIEWING_REASON[e]));
  // 7–8. Ordinær freshness-regel.
  if (checkAgeHours === null) return out('lightweight_refresh', ['ingen_kontroll']);
  if (checkAgeHours > limits.lightMaxAgeHours) return out('lightweight_refresh', ['kontroll_eldre_enn_24t']);
  return out('reuse', ['fersk']);
}
