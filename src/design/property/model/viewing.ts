import type { ResolvedAnalysisScenario } from '../../../domain/analysisScenarios';
import { CHECKLIST_LABEL } from '../../../domain/enums';
import type { Risk, SharedAnalysis } from '../../../domain/schemas';

/**
 * «Ta med på visning»: huskelisten fra det analysen allerede har – risikoenes tiltak, sjekklistepunkter som mangler dokumentasjon og krav til
 * scenarioet. Ingen ny forretningslogikk; bare utvalg og rekkefølge.
 */
export interface PackItem {
  text: string;
  /** Hva punktet gjelder (risiko eller sjekklistepunkt). */
  context?: string;
}

export interface ViewingPack {
  lookFor: PackItem[];
  ask: PackItem[];
  clarify: PackItem[];
}

export const MAX_LOOK_FOR = 6;

export function buildViewingPack(args: {
  risks: readonly Risk[];
  checklist: SharedAnalysis['checklist'];
  conditions: readonly string[];
  scenario: Pick<ResolvedAnalysisScenario, 'requirements'>;
}): ViewingPack {
  const lookFor = args.risks
    .filter((r) => r.action.trim() !== '' || r.level !== null)
    .slice()
    .sort((a, b) => (b.level ?? -1) - (a.level ?? -1))
    .slice(0, MAX_LOOK_FOR)
    .map<PackItem>((r) => ({ text: r.action.trim() || `Sjekk: ${r.title}`, context: `${r.title}${r.level === null ? ' (ukjent alvorlighet)' : ` (${r.level}/10)`}` }));
  const ask = args.checklist
    .filter((c) => c.status === 'mangler' || c.status === 'delvis')
    .map<PackItem>((c) => ({ text: c.beforeBidTask?.trim() || `Be om dokumentasjon: ${CHECKLIST_LABEL[c.key].toLowerCase()}`, context: `${CHECKLIST_LABEL[c.key]} – ${c.status === 'mangler' ? 'mangler' : 'delvis dokumentert'}` }));
  const clarify = [
    ...args.scenario.requirements.map<PackItem>((t) => ({ text: t, context: 'Krav for valgt versjon' })),
    ...args.conditions.map<PackItem>((t) => ({ text: t, context: 'Forutsetning for bud' })),
  ];
  const seen = new Set<string>();
  const dedupe = (xs: PackItem[]) => xs.filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)));
  return { lookFor: dedupe(lookFor), ask: dedupe(ask), clarify: dedupe(clarify) };
}
