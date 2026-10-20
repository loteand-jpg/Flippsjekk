import type { Breakdown } from '../../../calc/engine';
import type { RiskBand } from '../../../domain/assessment';
import type { FeasibilityStatus } from '../../../domain/enums';
import { formatNOK } from '../../../lib/format';
import type { Tone } from '../../shared/present';

/**
 * Case-scorecard: seks adskilte vurderinger i stedet for ett ugjennomsiktig tall. Hver vurdering utledes av tall og status som
 * allerede finnes (kalkylemotoren, risikoaggregatet, scenarioets gjennomførbarhet, markedsmotorens sikkerhet) med eksplisitte,
 * enkle regler som står i denne filen og vises som «hvorfor» ved siden av hvert nivå. Ingen nye økonomiske beregninger.
 */
export type Level = 'sterk' | 'god' | 'middels' | 'svak' | 'uavklart';
export type ScoreDimId = 'okonomi' | 'marked' | 'gjennomforbarhet' | 'kapital' | 'risiko' | 'arbeid';

export interface ScoreDim {
  id: ScoreDimId;
  label: string;
  level: Level;
  /** Nivået som ord – status står alltid som tekst, ikke bare som farge. */
  text: string;
  tone: Tone;
  /** Hvorfor nivået er satt, med tallene det bygger på. */
  why: string;
  /** Hvilken regel som ble brukt (kort). */
  rule: string;
}

/** Grenser for presentasjonsreglene. Samles her så de er lette å finne, endre og teste. */
export const SCORE_RULES = {
  /** Sikkerhet for salgsverdi (0–1, fra rangeringens saleCertainty). */
  marketStrong: 0.9,
  marketGood: 0.7,
  marketMedium: 0.35,
  /** Egenkapital: dekket, men over denne andelen av tilgjengelig egenkapital regnes som «tett». */
  equityTight: 0.9,
  /** Egeninnsats i timer per prosjektmåned. */
  workLow: 25,
  workMedium: 60,
} as const;

export interface ScorecardInput {
  base: Breakdown | null;
  /** Anbefalt maksbud (kr) fra motoren, ikke avrundet. */
  maxBid: number | null;
  maxBidStatus: 'ok' | 'none' | 'capped' | null;
  risk: { band: RiskBand; score: number | null; top: string | null };
  feasibility: FeasibilityStatus | null;
  /** Fra rangeringen for scenarioet i bruk: 0–1 og tekst. */
  saleCertainty: number | null;
  saleCertaintyLabel: string | null;
}

const TONE: Record<Level, Tone> = { sterk: 'pos', god: 'pos', middels: 'warn', svak: 'neg', uavklart: 'neutral' };
const dim = (id: ScoreDimId, label: string, level: Level, text: string, why: string, rule: string): ScoreDim => ({ id, label, level, text, tone: TONE[level], why, rule });

function economy(i: ScorecardInput): ScoreDim {
  const rule = 'Sterk når kjøpsprisen er på eller under anbefalt maksbud (alle mål oppfylt). Middels når fortjenesten er positiv, men kjøpsprisen er over maksbudet. Svak når fortjenesten ikke er positiv.';
  const b = i.base;
  if (!b) return dim('okonomi', 'Økonomi', 'uavklart', 'Ikke beregnet', 'Kalkylen er ufullstendig. Ukjent er ikke 0 kr, så ingen fortjeneste vises.', rule);
  if (b.profit <= 0) return dim('okonomi', 'Økonomi', 'svak', 'Svak', `Forventet fortjeneste er ${formatNOK(b.profit)} – ikke positiv.`, rule);
  if (i.maxBidStatus === 'none') return dim('okonomi', 'Økonomi', 'svak', 'Svak', 'Ingen kjøpspris innen søkeområdet oppfyller målene dine.', rule);
  if (i.maxBid === null) return dim('okonomi', 'Økonomi', 'middels', 'Middels', `Positiv fortjeneste (${formatNOK(b.profit)}), men uten mål å måle den mot.`, rule);
  const over = b.P - Math.floor(i.maxBid / 1000) * 1000;
  return over <= 0
    ? dim('okonomi', 'Økonomi', 'sterk', 'Sterk', `Kjøpsprisen ${formatNOK(b.P)} er ${formatNOK(-over)} under anbefalt maksbud, så målene dine er oppfylt.`, rule)
    : dim('okonomi', 'Økonomi', 'middels', 'Middels', `Fortjenesten er positiv, men kjøpsprisen ${formatNOK(b.P)} er ${formatNOK(over)} over anbefalt maksbud.`, rule);
}

function market(i: ScorecardInput): ScoreDim {
  const rule = 'Fra markedsmotorens sikkerhet for salgsverdien (sterk ≥ 0,90, godt ≥ 0,70, middels ≥ 0,35). Agentens estimat uten markedsverifisering regnes aldri som sikrere enn middels.';
  if (i.saleCertainty === null || !i.saleCertaintyLabel) return dim('marked', 'Markedsgrunnlag', 'uavklart', 'Ikke vurdert', 'Salgsverdiens sikkerhet kan ikke vurderes uten et komplett scenario.', rule);
  if (i.saleCertaintyLabel === 'Uavklart') return dim('marked', 'Markedsgrunnlag', 'uavklart', 'Uavklart', 'Scenarioet mangler grunnlag for salgsverdien.', rule);
  const v = i.saleCertainty;
  const level: Level = v >= SCORE_RULES.marketStrong ? 'sterk' : v >= SCORE_RULES.marketGood ? 'god' : v >= SCORE_RULES.marketMedium ? 'middels' : 'svak';
  const text = { sterk: 'Sterkt', god: 'Godt', middels: 'Middels', svak: 'Svakt', uavklart: 'Uavklart' }[level];
  return dim('marked', 'Markedsgrunnlag', level, text, `${i.saleCertaintyLabel} for salgsverdien i scenarioet.`, rule);
}

function feasibility(i: ScorecardInput): ScoreDim {
  const rule = 'Følger scenarioets gjennomførbarhetsstatus: gjennomførbart = høy, betinget = middels, uavklart = uavklart, ikke gjennomførbart = lav.';
  const f = i.feasibility;
  if (f === null) return dim('gjennomforbarhet', 'Gjennomførbarhet', 'uavklart', 'Uavklart', 'Scenarioet har ingen gjennomførbarhetsvurdering.', rule);
  if (f === 'klar') return dim('gjennomforbarhet', 'Gjennomførbarhet', 'sterk', 'Høy', 'Scenarioet er vurdert som gjennomførbart uten uavklarte krav.', rule);
  if (f === 'betinget') return dim('gjennomforbarhet', 'Gjennomførbarhet', 'middels', 'Middels', 'Betinget: krav må avklares før scenarioet kan regnes som gjennomførbart. Anbefales ikke før da.', rule);
  if (f === 'ikke_gjennomforbar') return dim('gjennomforbarhet', 'Gjennomførbarhet', 'svak', 'Lav', 'Scenarioet er vurdert som ikke gjennomførbart.', rule);
  return dim('gjennomforbarhet', 'Gjennomførbarhet', 'uavklart', 'Uavklart', 'Gjennomførbarheten er ikke avklart. Scenarioet kan ikke anbefales ennå.', rule);
}

function capital(i: ScorecardInput): ScoreDim {
  const rule = `Høyt når egenkapitalbehovet overstiger tilgjengelig egenkapital. Middels når det er dekket, men over ${Math.round(SCORE_RULES.equityTight * 100)} % av det som er tilgjengelig. Ellers dekket. Ukjent egenkapital er uavklart, ikke 0.`;
  const b = i.base;
  if (!b) return dim('kapital', 'Kapitalbehov', 'uavklart', 'Ikke beregnet', 'Kalkylen er ufullstendig.', rule);
  if (b.availableEquity === null || b.equityGap === null) return dim('kapital', 'Kapitalbehov', 'uavklart', 'Uavklart', `Egenkapitalbehov ${formatNOK(b.equityNeed)}, men tilgjengelig egenkapital er ikke oppgitt.`, rule);
  if (b.equityGap > 0) return dim('kapital', 'Kapitalbehov', 'svak', 'Høyt', `Behov ${formatNOK(b.equityNeed)} mot ${formatNOK(b.availableEquity)} tilgjengelig – finansieringsgap ${formatNOK(b.equityGap)}.`, rule);
  const tight = b.availableEquity > 0 && b.equityNeed / b.availableEquity >= SCORE_RULES.equityTight;
  return tight
    ? dim('kapital', 'Kapitalbehov', 'middels', 'Middels', `Dekket, men tett: ${formatNOK(b.equityNeed)} av ${formatNOK(b.availableEquity)} tilgjengelig.`, rule)
    : dim('kapital', 'Kapitalbehov', 'god', 'Dekket', `Behov ${formatNOK(b.equityNeed)} mot ${formatNOK(b.availableEquity)} tilgjengelig.`, rule);
}

function riskDim(i: ScorecardInput): ScoreDim {
  const rule = 'Følger objektets samlede risiko (høyeste kjente alvorlighet): lav 1–3, middels 4–6, høy 7–10. Uten vurderte risikoer er nivået uavklart, ikke lavt.';
  const { band, score, top } = i.risk;
  const topText = top ? ` Største: ${top}.` : '';
  if (band === 'uavklart' || score === null) return dim('risiko', 'Risiko', 'uavklart', 'Uavklart', `Ingen risikoer med kjent alvorlighet.${topText}`, rule);
  if (band === 'lav') return dim('risiko', 'Risiko', 'sterk', 'Lav', `Høyeste alvorlighet ${score}/10.${topText}`, rule);
  if (band === 'middels') return dim('risiko', 'Risiko', 'middels', 'Middels', `Høyeste alvorlighet ${score}/10.${topText}`, rule);
  return dim('risiko', 'Risiko', 'svak', 'Høy', `Høyeste alvorlighet ${score}/10.${topText}`, rule);
}

function work(i: ScorecardInput): ScoreDim {
  const rule = `Egne timer per prosjektmåned: lav under ${SCORE_RULES.workLow}, middels under ${SCORE_RULES.workMedium}, ellers høy. Ingen egne timer = ingen egeninnsats. Ukjent er uavklart.`;
  const b = i.base;
  if (!b) return dim('arbeid', 'Arbeidsintensitet', 'uavklart', 'Ikke beregnet', 'Kalkylen er ufullstendig.', rule);
  if (b.ownHours === null) return dim('arbeid', 'Arbeidsintensitet', 'uavklart', 'Uavklart', 'Egne timer er ikke avklart i kalkylen.', rule);
  if (b.ownHours === 0) return dim('arbeid', 'Arbeidsintensitet', 'sterk', 'Ingen egeninnsats', 'Ingen egne timer i kalkylen – alt arbeid er innleid.', rule);
  const perMonth = b.months > 0 ? b.ownHours / b.months : null;
  const hours = `${Math.round(b.ownHours).toLocaleString('nb-NO')} timer`;
  if (perMonth === null) return dim('arbeid', 'Arbeidsintensitet', 'uavklart', 'Uavklart', `${hours}, men prosjektvarigheten er ikke satt.`, rule);
  const per = `ca. ${Math.round(perMonth).toLocaleString('nb-NO')} t per måned over ${b.months.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} måneder`;
  if (perMonth < SCORE_RULES.workLow) return dim('arbeid', 'Arbeidsintensitet', 'sterk', 'Lav', `${hours}, ${per}.`, rule);
  if (perMonth < SCORE_RULES.workMedium) return dim('arbeid', 'Arbeidsintensitet', 'middels', 'Middels', `${hours}, ${per}.`, rule);
  return dim('arbeid', 'Arbeidsintensitet', 'svak', 'Høy', `${hours}, ${per}.`, rule);
}

export function buildScorecard(i: ScorecardInput): ScoreDim[] {
  return [economy(i), market(i), feasibility(i), capital(i), riskDim(i), work(i)];
}
