import type { Viewing } from '../domain/schemas';
import { nextBusinessDayAfter, nonBusinessReason } from './holidays';
import { addDaysToKey, localDateKey, osloAt } from './time';

export const BID_DAY_RULE_VERSION = 'buddag-regel-1';
export const BID_DAY_HOUR = 12;

/**
 * Produktets planleggingsprognose for forventet buddag.
 * Ikke en bekreftet budstart eller juridisk akseptfrist.
 */
export interface BidDayPrognosis {
  /** Stabil ID – én prognose per eiendom, uansett hvor mange visninger. */
  id: string;
  propertyId: string;
  start: string;
  dateKey: string;
  basedOnViewingId: string;
  basedOnViewingStart: string;
  basedOnVerifiedAt: string;
  /** Satt når dagen etter siste visning er helg eller helligdag. */
  nonBusinessDay: string | null;
  /** Første virkedag etter siste annonserte visning (relevant for akseptfrist i forbrukerforhold). */
  firstBusinessDayAfterViewing: string;
  ruleVersion: string;
}

export function bidDayEventId(propertyId: string): string {
  return `bidday-${propertyId}`;
}

/**
 * Regel: Etter siste kjente, ikke avlyste offisielt annonserte visning opprettes
 * én «Forventet buddag» kl. 12:00 dagen etter, lokal tid Europe/Oslo.
 * Ingen kjent offisiell visning → ingen prognose. Private visninger påvirker ikke regelen.
 */
export function deriveBidDay(propertyId: string, viewings: readonly Viewing[]): BidDayPrognosis | null {
  const candidates = viewings.filter(
    (v) => v.propertyId === propertyId && v.kind === 'official' && v.status !== 'avlyst',
  );
  if (candidates.length === 0) return null;
  const last = candidates.reduce((a, b) => (Date.parse(b.start) > Date.parse(a.start) ? b : a));
  const viewingKey = localDateKey(last.start);
  const bidKey = addDaysToKey(viewingKey, 1);
  return {
    id: bidDayEventId(propertyId),
    propertyId,
    start: osloAt(bidKey, BID_DAY_HOUR).toISOString(),
    dateKey: bidKey,
    basedOnViewingId: last.id,
    basedOnViewingStart: last.start,
    basedOnVerifiedAt: last.verifiedAt,
    nonBusinessDay: nonBusinessReason(bidKey),
    firstBusinessDayAfterViewing: nextBusinessDayAfter(viewingKey),
    ruleVersion: BID_DAY_RULE_VERSION,
  };
}
