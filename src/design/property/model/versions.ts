import { recommendedBidOf, type Breakdown, type Evaluation } from '../../../calc/engine';
import type { RankRow, RankingResult } from '../../../calc/ranking';
import type { ScenarioComparisonRow } from '../../../calc/scenarioComparison';
import type { ResolvedAnalysisScenario } from '../../../domain/analysisScenarios';
import { formatNOK } from '../../../lib/format';
import { floorToThousand, type Tone } from '../../shared/present';
import { scenarioDelta, type ScenarioDelta } from '../../shared/scenarioDelta';
import { signedNOK, signedNumber } from '../../shared/signed';

/**
 * «Versjoner av boligen»: Basis, Alternativ A og Alternativ B slik Property viser dem. Alt kommer fra den delte scenariosammenligningen
 * (`buildScenarioComparison`): samme kjøpspris, finansiering, egenkapital, mål, timekrav og oppgjørstid for alle tre. Her settes bare
 * visningsetiketter og deltaer sammen av eksisterende motorresultater – ingen egen kalkyle.
 */
export interface VersionView {
  id: string;
  def: ResolvedAnalysisScenario;
  /** «Basis», «Alternativ A», «Alternativ B». */
  label: string;
  /** Kortform til smale flater: «Basis», «Alt A», «Alt B». */
  short: string;
  row: ScenarioComparisonRow;
  ranked: RankRow | undefined;
  ev: Evaluation;
  b: Breakdown | null;
  bidPrice: number | null;
  bidStatus: ReturnType<typeof recommendedBidOf>['status'];
  bidLimitedBy: ReturnType<typeof recommendedBidOf>['limitedBy'];
  /** Maksbud avrundet ned til hele tusen (samme visning som resten av appen). */
  bidFloor: number | null;
  recommended: boolean;
  /** Scenarioet som er brukerens kalkyle. */
  active: boolean;
}

const ALT_LETTER = ['A', 'B', 'C'];

export function buildVersions(args: { defs: readonly ResolvedAnalysisScenario[]; rows: readonly ScenarioComparisonRow[]; result: RankingResult; activeId: string }): VersionView[] {
  const alts = args.defs.filter((d) => d.kind === 'alternativ');
  const out: VersionView[] = [];
  for (const def of args.defs) {
    const row = args.rows.find((r) => r.input.id === def.id);
    if (!row) continue;
    const ev = row.input.evaluation;
    const bid = recommendedBidOf(ev);
    const ranked = args.result.rows.find((r) => r.id === def.id);
    const letter = def.kind === 'alternativ' ? ALT_LETTER[alts.findIndex((a) => a.id === def.id)] : '';
    out.push({
      id: def.id,
      def,
      label: def.kind === 'basis' ? 'Basis' : `Alternativ ${letter}`.trim(),
      short: def.kind === 'basis' ? 'Basis' : `Alt ${letter}`.trim(),
      row,
      ranked,
      ev,
      b: ev.base,
      bidPrice: bid.price,
      bidStatus: bid.status,
      bidLimitedBy: bid.limitedBy,
      bidFloor: bid.price === null ? null : floorToThousand(bid.price),
      recommended: Boolean(ranked?.recommended),
      active: def.id === args.activeId,
    });
  }
  return out;
}

export interface DeltaFact {
  id: 'invest' | 'hours' | 'months' | 'sale' | 'profit' | 'risk';
  label: string;
  /** Kort, selvstendig tekst («+ 120 000 kr i oppussing»). */
  text: string;
  tone: Tone;
}

export interface VersionDelta {
  facts: DeltaFact[];
  raw: ScenarioDelta;
}

/**
 * Hva en versjon koster og gir mot Basis. Differanser av eksisterende motorresultater (`scenarioDelta`); null når en av kalkylene er ufullstendig
 * (ukjent er ikke 0 kr).
 */
export function versionDelta(alt: VersionView, base: VersionView): VersionDelta | null {
  if (!alt.b || !base.b || alt.id === base.id) return null;
  const d = scenarioDelta(alt.b, base.b);
  const facts: DeltaFact[] = [];
  facts.push({
    id: 'invest',
    label: 'Ekstra oppussing',
    text: d.renovation === 0 ? 'Samme oppussing som Basis' : d.renovation > 0 ? `${signedNOK(d.renovation)} mer i oppussing` : `${signedNOK(d.renovation)} i oppussing`,
    tone: 'neutral',
  });
  facts.push({
    id: 'hours',
    label: 'Egeninnsats',
    text: d.ownHours === null ? 'Egne timer ikke avklart' : d.ownHours === 0 ? 'Like mange egne timer' : `${signedNumber(d.ownHours, 'egne timer')}`,
    tone: 'neutral',
  });
  facts.push({ id: 'months', label: 'Tid', text: d.months === 0 ? 'Like lang tid' : `${signedNumber(d.months, 'mnd')}`, tone: 'neutral' });
  facts.push({ id: 'sale', label: 'Salgsverdi', text: d.sale === 0 ? 'Lik salgsverdi' : signedNOK(d.sale), tone: d.sale === 0 ? 'neutral' : d.sale > 0 ? 'pos' : 'neg' });
  facts.push({ id: 'profit', label: 'Fortjeneste', text: d.netProfit === 0 ? 'Lik fortjeneste' : signedNOK(d.netProfit), tone: d.netProfit === 0 ? 'neutral' : d.netProfit > 0 ? 'pos' : 'neg' });
  if (alt.ranked && base.ranked) {
    const r = alt.ranked.metrics.riskPoints - base.ranked.metrics.riskPoints;
    facts.push({ id: 'risk', label: 'Risiko', text: r === 0 ? 'Lik risiko' : r > 0 ? 'Høyere risiko' : 'Lavere risiko', tone: r === 0 ? 'neutral' : r > 0 ? 'neg' : 'pos' });
  }
  return { facts, raw: d };
}

/** Én linje som oppsummerer endringen mot Basis, til smale kort. Ukjent kalkyle gir tekst, ikke 0. */
export function deltaLine(alt: VersionView, base: VersionView): string {
  if (alt.id === base.id) return 'Utgangspunktet';
  const d = versionDelta(alt, base);
  if (!d) return 'Kan ikke sammenlignes: kalkylen er ufullstendig';
  return `${signedNOK(d.raw.renovation)} oppussing · ${signedNOK(d.raw.sale)} salgsverdi · ${signedNOK(d.raw.netProfit)} fortjeneste`;
}

export const money = (n: number | null | undefined, fallback = 'Ikke beregnet') => (n === null || n === undefined ? fallback : formatNOK(n));
