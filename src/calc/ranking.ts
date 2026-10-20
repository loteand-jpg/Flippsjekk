import type { RiskBand } from '../domain/assessment';
import { SCENARIO_RISK_DIMENSIONS, type FeasibilityStatus, type ScenarioKind, type ScenarioRiskDimension, type UncertaintyLevel } from '../domain/enums';
import type { ScenarioRisk } from '../domain/schemas';
import { MAX_BID_LIMIT_LABEL, type Evaluation, type MaxBidLimitId } from './engine';
import type { QualityTier } from './market';

/**
 * Scenario-rangering. Sammenligner scenarioer på flere kriterier – ikke bare nominell fortjeneste – og viser
 * hvert kriterium åpent. Den samlede rangen er et vektet snitt av normaliserte kriteriescorer (vektene vises),
 * ikke et ugjennomsiktig AI-tall.
 *
 * Regler:
 *  - Bare scenarioer som er gjennomførbare («klar») og har komplett kalkyle kan anbefales.
 *  - Betingede og uavklarte scenarioer vises og rangeres for sammenligning, men styrer aldri anbefalt scenario eller anbefalt maksbud.
 *  - Scenarioer som ikke er gjennomførbare, eller har ufullstendig kalkyle, rangeres ikke.
 *  - Timekravet (minimum fortjeneste per egeninnsatstime) er en MÅL-/maksbudparameter og en rangeringsfaktor – ikke en port.
 *    Et scenario under kravet kan fortsatt anbefales; det gir da et lavere maksbud (egen maksbudgrense), ikke utestengelse.
 *  - Risiko er objektets generelle risiko PLUSS scenarioets egen risiko (teknisk, kostnad, tid, myndighet). Ikke vurdert = uavklart.
 */
export const RANKING_VERSION = '1.1.0';

export type CriterionKey = 'profit' | 'projectReturn' | 'profitPerHour' | 'risk' | 'saleCertainty' | 'stress' | 'equityGap' | 'months';

export const CRITERIA: { key: CriterionKey; label: string; weight: number; better: 'high' | 'low' }[] = [
  { key: 'profit', label: 'Forventet fortjeneste', weight: 0.25, better: 'high' },
  { key: 'projectReturn', label: 'Prosjektavkastning', weight: 0.15, better: 'high' },
  { key: 'profitPerHour', label: 'Fortjeneste per egeninnsatstime', weight: 0.15, better: 'high' },
  { key: 'risk', label: 'Risiko (objekt + scenario)', weight: 0.15, better: 'low' },
  { key: 'saleCertainty', label: 'Salgsverdiens sikkerhet', weight: 0.1, better: 'high' },
  { key: 'stress', label: 'Stresstest (kombinert)', weight: 0.1, better: 'high' },
  { key: 'equityGap', label: 'Finansieringsgap', weight: 0.05, better: 'low' },
  { key: 'months', label: 'Prosjektvarighet', weight: 0.05, better: 'low' },
];

export interface RankInput {
  id: string;
  title: string;
  kind: ScenarioKind;
  feasibility: FeasibilityStatus;
  evaluation: Evaluation;
  /** Risikonivå for objektet (samlet risiko, ev. med brukerens endringer). */
  riskBand: RiskBand | null;
  /** Scenarioets egen risiko. null = ikke vurdert (regnes som uavklart på alle dimensjoner). */
  scenarioRisk?: ScenarioRisk | null;
  /** Hvor sikker salgsverdien er: fra markedsvekting hvis tilgjengelig, ellers fra scenarioets egen usikkerhetsvurdering. */
  saleCertainty: { tier: QualityTier | null; uncertainty: UncertaintyLevel | null };
}

export type RankFlag =
  | 'under_timekrav'
  | 'finansieringsgap'
  | 'betinget'
  | 'uavklart_gjennomforbarhet'
  | 'ufullstendig_kalkyle'
  | 'ikke_gjennomforbart'
  | 'usikker_salgsverdi'
  | 'negativt_resultat'
  | 'hoy_scenariorisiko'
  | 'scenariorisiko_ikke_vurdert';
export const RANK_FLAG_LABEL: Record<RankFlag, string> = {
  under_timekrav: 'Under timekravet ved dette kjøpsbudet – påvirker rangering og maksbud, ikke anbefalbarhet',
  hoy_scenariorisiko: 'Høy scenariorisiko',
  scenariorisiko_ikke_vurdert: 'Scenariorisiko er ikke vurdert (regnes som uavklart)',
  finansieringsgap: 'Egenkapitalen dekker ikke behovet',
  betinget: 'Betinget – styrer ikke anbefalt maksbud',
  uavklart_gjennomforbarhet: 'Gjennomførbarhet er uavklart – styrer ikke anbefalt maksbud',
  ufullstendig_kalkyle: 'Ufullstendig kalkyle – rangeres ikke',
  ikke_gjennomforbart: 'Ikke gjennomførbart – rangeres ikke',
  usikker_salgsverdi: 'Usikker salgsverdi',
  negativt_resultat: 'Negativt resultat',
};

export interface RankMetrics {
  profit: number | null;
  projectReturn: number | null;
  profitPerOwnHour: number | null;
  meetsHourlyRequirement: boolean | null;
  ownHours: number | null;
  months: number | null;
  riskBand: RiskBand | null;
  /** Sum: objektrisiko (1–3, +1 når scenarioet ikke er gjennomførbart) + scenariorisiko (0–4). */
  riskPoints: number;
  objectRiskPoints: number;
  scenarioRiskPoints: number;
  /** Nivå per dimensjon i scenariorisikoen (uavklart når ikke vurdert). */
  scenarioRiskLevels: Record<ScenarioRiskDimension, UncertaintyLevel>;
  scenarioRiskAssessed: boolean;
  feasibility: FeasibilityStatus;
  saleCertainty: number;
  saleCertaintyLabel: string;
  stressProfit: number | null;
  equityNeed: number | null;
  equityGap: number | null;
  /** Anbefalt maksbud = laveste av grensene (fortjenestemål, timekrav). */
  maxBid: number | null;
  /** Grensen som begrenser anbefalt maksbud. */
  maxBidLimitedBy: MaxBidLimitId | null;
  maxBidLimitedByLabel: string | null;
  /** Maksbud for fortjenestemålet alene og for timekravet alene (vises adskilt, aldri blandet). */
  maxBidProfit: number | null;
  maxBidHourly: number | null;
}

export interface RankRow {
  id: string;
  title: string;
  kind: ScenarioKind;
  metrics: RankMetrics;
  /** Rangeres: komplett kalkyle og ikke «ikke gjennomførbart». */
  ranked: boolean;
  /** Kan anbefales: gjennomførbart («klar») og komplett kalkyle. */
  eligible: boolean;
  /** Normaliserte kriteriescorer 0–1 (1 = best blant de rangerte). null når kriteriet ikke gjelder. */
  scores: Partial<Record<CriterionKey, number>>;
  /** Samlet vektet score 0–100, bare blant rangerte scenarioer. */
  composite: number | null;
  /** Plassering blant rangerte (1 = best). */
  position: number | null;
  recommended: boolean;
  flags: RankFlag[];
}

export interface RankingResult {
  version: string;
  rows: RankRow[];
  recommendedId: string | null;
  /** Maksbud for anbefalt scenario. Betingede scenarioer påvirker aldri dette tallet. */
  recommendedMaxBid: number | null;
  criteria: typeof CRITERIA;
}

const RISK_POINTS: Record<RiskBand, number> = { lav: 1, middels: 2, hoy: 3, uavklart: 3 };
const TIER_CERTAINTY: Record<QualityTier, { v: number; label: string }> = {
  svaert_godt: { v: 1, label: 'Svært godt grunnlag' },
  normalt: { v: 0.75, label: 'Normalt grunnlag' },
  svakt: { v: 0.4, label: 'Svakt grunnlag' },
  utilstrekkelig: { v: 0.1, label: 'For usikkert' },
};
/** Poeng per nivå i scenariorisikoen. Ukjent er ikke middels: uavklart teller som høy. */
const SCENARIO_RISK_POINTS: Record<UncertaintyLevel, number> = { lav: 0, middels: 0.5, hoy: 1, uavklart: 1 };
const UNC_CERTAINTY: Record<UncertaintyLevel, { v: number; label: string }> = {
  lav: { v: 0.9, label: 'Lav usikkerhet' },
  middels: { v: 0.6, label: 'Middels usikkerhet' },
  hoy: { v: 0.25, label: 'Høy usikkerhet' },
  uavklart: { v: 0.3, label: 'Uavklart' },
};

function metricsOf(i: RankInput): RankMetrics {
  const ev = i.evaluation;
  const b = ev.base;
  const combined = ev.stress.find((s) => s.id === 'combined');
  const cert = i.saleCertainty.tier ? TIER_CERTAINTY[i.saleCertainty.tier] : i.saleCertainty.uncertainty ? UNC_CERTAINTY[i.saleCertainty.uncertainty] : { v: 0.3, label: 'Uavklart' };
  // Betingelser gjør scenarioet mer usikkert å regne med, også når salgsverdien i seg selv er godt belagt.
  const objectRiskPoints = (i.riskBand ? RISK_POINTS[i.riskBand] : 3) + (i.feasibility === 'klar' ? 0 : 1);
  const risk = i.scenarioRisk ?? null;
  const scenarioRiskLevels = Object.fromEntries(SCENARIO_RISK_DIMENSIONS.map((d) => [d, risk ? risk[d] : 'uavklart'])) as Record<ScenarioRiskDimension, UncertaintyLevel>;
  const scenarioRiskPoints = SCENARIO_RISK_DIMENSIONS.reduce((s, d) => s + SCENARIO_RISK_POINTS[scenarioRiskLevels[d]], 0);
  const riskPoints = objectRiskPoints + scenarioRiskPoints;
  const rec = ev.recommendedMaxBid;
  return {
    profit: b?.profit ?? null,
    projectReturn: b?.projectReturn ?? null,
    profitPerOwnHour: b?.profitPerOwnHour ?? null,
    meetsHourlyRequirement: b?.meetsHourlyRequirement ?? null,
    ownHours: b?.ownHours ?? null,
    months: b?.months ?? null,
    riskBand: i.riskBand,
    riskPoints,
    objectRiskPoints,
    scenarioRiskPoints,
    scenarioRiskLevels,
    scenarioRiskAssessed: risk !== null,
    feasibility: i.feasibility,
    saleCertainty: cert.v,
    saleCertaintyLabel: cert.label,
    stressProfit: combined?.result.profit ?? null,
    equityNeed: b?.equityNeed ?? null,
    equityGap: b?.equityGap ?? null,
    maxBid: rec?.price ?? null,
    maxBidLimitedBy: rec?.limitedBy ?? null,
    maxBidLimitedByLabel: rec?.limitedBy ? MAX_BID_LIMIT_LABEL[rec.limitedBy] : null,
    maxBidProfit: ev.maxBid?.price ?? null,
    maxBidHourly: ev.maxBidHourly?.price ?? null,
  };
}

/**
 * Vesentlighetsgrense per kriterium: forskjeller mindre enn dette teller forholdsmessig mindre. Uten denne ville en
 * forskjell på noen få tusen kroner gi full uttelling på et kriterium, bare fordi to scenarioer ligger tett.
 */
const MATERIALITY: Record<CriterionKey, number> = {
  profit: 250_000,
  projectReturn: 0.1,
  profitPerHour: 1_000,
  risk: 2,
  saleCertainty: 0.5,
  stress: 250_000,
  equityGap: 150_000,
  months: 3,
};

function normalize(values: (number | null)[], better: 'high' | 'low', materiality: number): (number | null)[] {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return values.map(() => null);
  const min = Math.min(...known);
  const max = Math.max(...known);
  const mid = (min + max) / 2;
  const denom = Math.max(max - min, materiality);
  return values.map((v) => {
    if (v === null) return null;
    const t = 0.5 + (v - mid) / denom;
    return better === 'high' ? t : 1 - t;
  });
}

export function rankScenarios(inputs: readonly RankInput[]): RankingResult {
  const rows: RankRow[] = inputs.map((i) => {
    const m = metricsOf(i);
    const complete = i.evaluation.status === 'complete' && m.profit !== null;
    const ranked = complete && i.feasibility !== 'ikke_gjennomforbar';
    const eligible = complete && i.feasibility === 'klar';
    const flags: RankFlag[] = [];
    if (!complete) flags.push('ufullstendig_kalkyle');
    if (i.feasibility === 'ikke_gjennomforbar') flags.push('ikke_gjennomforbart');
    if (i.feasibility === 'betinget') flags.push('betinget');
    if (i.feasibility === 'uavklart') flags.push('uavklart_gjennomforbarhet');
    if (m.meetsHourlyRequirement === false) flags.push('under_timekrav');
    if (SCENARIO_RISK_DIMENSIONS.some((d) => m.scenarioRiskLevels[d] === 'hoy')) flags.push('hoy_scenariorisiko');
    if (!m.scenarioRiskAssessed) flags.push('scenariorisiko_ikke_vurdert');
    if (m.equityGap !== null && m.equityGap > 0) flags.push('finansieringsgap');
    if (m.saleCertainty < 0.4) flags.push('usikker_salgsverdi');
    if (m.profit !== null && m.profit < 0) flags.push('negativt_resultat');
    return { id: i.id, title: i.title, kind: i.kind, metrics: m, ranked, eligible, scores: {}, composite: null, position: null, recommended: false, flags };
  });

  const rankedRows = rows.filter((r) => r.ranked);
  const raw: Record<CriterionKey, (number | null)[]> = {
    profit: rankedRows.map((r) => r.metrics.profit),
    projectReturn: rankedRows.map((r) => r.metrics.projectReturn),
    // Uten egne timer finnes ingen timesats. Kriteriet gjelder da ikke, og vekten fordeles på de øvrige.
    profitPerHour: rankedRows.map((r) => r.metrics.profitPerOwnHour),
    risk: rankedRows.map((r) => r.metrics.riskPoints),
    saleCertainty: rankedRows.map((r) => r.metrics.saleCertainty),
    stress: rankedRows.map((r) => r.metrics.stressProfit),
    equityGap: rankedRows.map((r) => r.metrics.equityGap),
    months: rankedRows.map((r) => r.metrics.months),
  };
  const norm: Record<CriterionKey, (number | null)[]> = {} as never;
  for (const c of CRITERIA) norm[c.key] = normalize(raw[c.key], c.better, MATERIALITY[c.key]);
  rankedRows.forEach((r, idx) => {
    let sum = 0;
    let wsum = 0;
    for (const c of CRITERIA) {
      const s = norm[c.key][idx];
      if (s === null) continue;
      r.scores[c.key] = Math.round(s * 100) / 100;
      sum += s * c.weight;
      wsum += c.weight;
    }
    r.composite = wsum > 0 ? Math.round((sum / wsum) * 1000) / 10 : null;
  });
  [...rankedRows]
    .sort((a, b) => (b.composite ?? -1) - (a.composite ?? -1) || (b.metrics.profit ?? 0) - (a.metrics.profit ?? 0) || a.title.localeCompare(b.title, 'nb'))
    .forEach((r, i) => {
      r.position = i + 1;
    });

  // Anbefaling: best rangerte blant de som kan anbefales (gjennomførbare med komplett kalkyle).
  const best = rankedRows.filter((r) => r.eligible).sort((a, b) => (a.position ?? 99) - (b.position ?? 99))[0] ?? null;
  if (best) best.recommended = true;
  return {
    version: RANKING_VERSION,
    rows: [...rows].sort((a, b) => (a.position ?? 999) - (b.position ?? 999)),
    recommendedId: best?.id ?? null,
    recommendedMaxBid: best?.metrics.maxBid ?? null,
    criteria: CRITERIA,
  };
}
