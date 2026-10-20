import type { Breakdown, MaxBidLimitId } from '../../calc/engine';
import { formatNOK } from '../../lib/format';

/** Tone for status og tall i alle designvarianter. Status skal alltid også stå som tekst. */
export type Tone = 'neutral' | 'pos' | 'neg' | 'warn' | 'info';

/**
 * Rene presentasjonshjelpere som deles av designvariantene (Finance, Investment). De regner INGENTING nytt: de formulerer eksisterende tall fra beregningsmotoren
 * (maksbudgrenser, fortjeneste, egenkapital osv.) som tekst og tone. Økonomi og forretningsregler ligger i src/calc.
 */

/** Maksbud avrundet ned til hele tusen – samme visning som i Original og i objektlisten. */
export const floorToThousand = (n: number): number => Math.floor(n / 1000) * 1000;

/** Hva som begrenser anbefalt maksbud, formulert for brukeren. */
export function maxBidLine(args: { limitedBy: MaxBidLimitId | null; profitTarget: number | null; minPerHour: number | null }): string {
  if (args.limitedBy === 'hourly') {
    return `Maksbudet begrenses av kravet ditt om minst ${formatNOK(args.minPerHour, 'ukjent beløp')} fortjeneste per egeninnsatstime.`;
  }
  if (args.limitedBy === 'profit') {
    return args.profitTarget === null ? 'Maksbudet begrenses av ønsket minimumsfortjeneste.' : `Maksbudet begrenses av ønsket minimumsfortjeneste på ${formatNOK(args.profitTarget)}.`;
  }
  return 'Maksbudet kan ikke beregnes ennå.';
}

export interface BidMargin {
  kind: 'under' | 'over' | 'lik';
  amount: number;
  text: string;
}

/** Avstand mellom kjøpsprisen i kalkylen og maksbudet. */
export function bidMargin(bid: number, purchase: number | null): BidMargin | null {
  if (purchase === null) return null;
  const amount = Math.abs(bid - purchase);
  if (bid === purchase) return { kind: 'lik', amount: 0, text: 'Kjøpsprisen i kalkylen er lik maksbudet.' };
  return bid > purchase
    ? { kind: 'under', amount, text: `Kjøpsprisen i kalkylen (${formatNOK(purchase)}) er ${formatNOK(amount)} under maksbudet.` }
    : { kind: 'over', amount, text: `Kjøpsprisen i kalkylen (${formatNOK(purchase)}) er ${formatNOK(amount)} over maksbudet.` };
}

/** Beløp med fortegn kun for negative tall (positivt resultat skal ikke se ut som en endring). */
export function formatResult(n: number | null | undefined, fallback: string): string {
  return typeof n === 'number' && Number.isFinite(n) ? formatNOK(n) : fallback;
}

export function profitTone(n: number | null | undefined): Tone {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 'neutral';
  return n < 0 ? 'neg' : n > 0 ? 'pos' : 'neutral';
}

export interface HourlyLine {
  value: string;
  sub: string;
  tone: Tone;
  unknown: boolean;
}

/** Fortjeneste per egeninnsatstime mot brukerens krav. Uten egne timer finnes ingen timesats (ikke 0). */
export function hourlyLine(b: Pick<Breakdown, 'profitPerOwnHour' | 'minProfitPerOwnHour' | 'meetsHourlyRequirement' | 'ownHours'>): HourlyLine {
  if (b.profitPerOwnHour === null) {
    return { value: 'Ikke beregnet', sub: b.ownHours === 0 ? 'Ingen egne timer i kalkylen' : 'Egne timer er ikke avklart', tone: 'neutral', unknown: true };
  }
  const req = b.minProfitPerOwnHour;
  const value = `${formatNOK(b.profitPerOwnHour)}/t`;
  if (req === null || b.meetsHourlyRequirement === null) return { value, sub: 'Krav til timesats er ikke satt', tone: 'neutral', unknown: false };
  return b.meetsHourlyRequirement
    ? { value, sub: `Krav ${formatNOK(req)}/t – oppfylt`, tone: 'pos', unknown: false }
    : { value, sub: `Krav ${formatNOK(req)}/t – ikke oppfylt ved denne kjøpsprisen`, tone: 'warn', unknown: false };
}

export interface EquityLine {
  value: string;
  sub: string;
  tone: Tone;
}

export function equityLine(b: Pick<Breakdown, 'equityNeed' | 'equityGap' | 'availableEquity'>): EquityLine {
  const value = formatNOK(b.equityNeed);
  if (b.equityGap === null || b.availableEquity === null) return { value, sub: 'Tilgjengelig egenkapital er ikke oppgitt', tone: 'neutral' };
  return b.equityGap > 0
    ? { value, sub: `Finansieringsgap ${formatNOK(b.equityGap)} mot ${formatNOK(b.availableEquity)} tilgjengelig`, tone: 'neg' }
    : { value, sub: `Dekket av ${formatNOK(b.availableEquity)} tilgjengelig egenkapital`, tone: 'pos' };
}
