import type { RiskBand } from '../domain/assessment';
import { resolveAnalysisScenarios, type ResolvedAnalysisScenario } from '../domain/analysisScenarios';
import type { Property, PropertySnapshot, ProfileDefaults, ScenarioValues, SharedAnalysis } from '../domain/schemas';
import { QUALITY_TIER_LABEL, type MarketComparable } from './market';
import { rankScenarios, type RankInput, type RankingResult } from './ranking';
import { resolveScenarioSale } from './saleValue';
import { analysisScenarioValues, evaluateScenario } from './scenario';

/**
 * Automatisk sammenligning av analysens scenarioer (Basis, Alternativ A, Alternativ B) under ÉN felles økonomisk ramme.
 *
 * Rammen er brukerens aktive kalkyle (`draft`): kjøpspris, kjøpskostnader, finansiering, rente, egenkapital, mål, timekrav,
 * arbeidsmodus, kompetanse, salgskostnader, skatt og oppgjørstid er like for alle scenarioene. Bare det som faktisk er
 * scenariospesifikt (tiltak, salgsverdi, oppussingstid, risiko, gjennomførbarhet) varierer – se `SCENARIO_FIELD_CLASS`.
 * Dermed svarer rangeringen på «hvilket scenario er best ved samme kjøpspris og samme brukerforutsetninger?».
 *
 * Brukerens lagrede private scenarioer leses aldri her og endres aldri: de kan ha helt andre kjøpspriser og er en annen
 * sammenligning enn denne. Funksjonen er ren og brukes av alle designvarianter via `useScenarioRanking`.
 */
export interface ScenarioComparisonRow {
  input: RankInput;
  /** Hvilke verdier raden er regnet av (for visning). */
  source: string;
  marketTier: string | null;
  /** Fullt sett verdier scenarioet er evaluert med. */
  values: ScenarioValues;
}

export interface ScenarioComparison {
  defs: ResolvedAnalysisScenario[];
  rows: ScenarioComparisonRow[];
  result: RankingResult;
  /** Scenarioet som er brukerens aktive kalkyle. */
  activeId: string;
}

export function buildScenarioComparison(args: {
  analysis: SharedAnalysis;
  property: Property;
  snapshot: PropertySnapshot | null;
  defaults: ProfileDefaults;
  /** Brukerens aktive kalkyle: den felles økonomiske rammen. */
  draft: ScenarioValues;
  /** Navnet på brukerens aktive kalkyle (kun til visning). */
  activeName: string;
  riskBand: RiskBand;
  /** Brukerens egne referanser (kun til markedsvurderingens sikkerhet, ikke til salgsverdien i grunnverdiene). */
  ownComparables?: readonly MarketComparable[];
}): ScenarioComparison {
  const { analysis, property, snapshot, defaults, draft, activeName, riskBand } = args;
  const defs = resolveAnalysisScenarios(analysis);
  const activeId = draft.analysisScenarioId ?? defs.find((x) => x.kind === 'basis')?.id ?? defs[0].id;
  const rows: ScenarioComparisonRow[] = [];
  for (const d of defs) {
    let values: ScenarioValues | null = null;
    let source = '';
    if (activeId === d.id) {
      // Scenarioet brukeren jobber i: kalkylen hennes (også eventuelle private endringer i selve scenarioet).
      values = draft;
      source = `Din kalkyle: ${activeName}`;
    } else if (snapshot) {
      // De andre scenarioene: samme felles forutsetninger som kalkylen din, med scenarioets egne tiltak, salgsverdi og oppussingstid.
      values = analysisScenarioValues({ property, snapshot, analysis, defaults, user: draft, analysisScenarioId: d.id }).values;
      source = 'Scenarioets egne tall med dine forutsetninger';
    }
    if (!values) continue;
    const evaluation = evaluateScenario(values).evaluation;
    // Salgsverdiens sikkerhet: markedsmotorens datakvalitet når den regner verdien. Agentens estimat uten markedsverifisering
    // regnes aldri som sikrere enn «middels». Eldre global verdi og manglende verdi følger scenarioets egen usikkerhet.
    const res = resolveScenarioSale({ analysis, scenario: d, property, snapshot, debtAtSale: values.debtAtSale, extraComparables: args.ownComparables });
    const tier = res.source === 'markedsmotor' && res.market?.status === 'ok' ? res.market.quality.tier : null;
    const uncertainty = res.source === 'agent_fallback' && d.uncertainty.level === 'lav' ? 'middels' : d.uncertainty.level;
    rows.push({
      input: { id: d.id, title: d.title, kind: d.kind, feasibility: d.feasibility, evaluation, riskBand, scenarioRisk: d.risk ?? null, saleCertainty: { tier, uncertainty: res.source === 'ingen' ? 'uavklart' : uncertainty } },
      source,
      marketTier: tier ? QUALITY_TIER_LABEL[tier] : null,
      values,
    });
  }
  return { defs, rows, result: rankScenarios(rows.map((r) => r.input)), activeId };
}
