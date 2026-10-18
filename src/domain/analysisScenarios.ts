import type { AnalysisScenario, SharedAnalysis } from './schemas';

/**
 * Agentdefinerte scenarioer (basis + inntil to alternativer) – med fallback for eldre analyser.
 *
 * Eldre analyser har bare én global `estimates.sale` og tre oppussingsnivåer. De får ÉTT basisscenario
 * (analysens hovedvalg) som bruker den globale salgsverdien, tydelig merket `saleSource: 'global'`.
 * Den globale salgsverdien kopieres aldri til alternative planløsninger som om den var vurdert for dem.
 */
export const LEGACY_BASIS_ID = 'basis';

export interface ResolvedAnalysisScenario extends AnalysisScenario {
  /** agent = definert i analysen. legacy = utledet fra eldre analyse uten scenarioer. */
  source: 'agent' | 'legacy';
  /** scenario = egen salgsverdi for dette sluttproduktet. global = analysens ene salgsverdi (eldre analyse). */
  saleSource: 'scenario' | 'global';
  /** true når `suggestedMonths` er total prosjektvarighet (eldre analyser) og ikke bare oppussingstid. */
  monthsAreTotal: boolean;
}

export const MAX_ALTERNATIVES = 2;

export function resolveAnalysisScenarios(analysis: SharedAnalysis): ResolvedAnalysisScenario[] {
  const est = analysis.estimates;
  if (est.scenarios && est.scenarios.length > 0) {
    // Basis først, deretter alternativene i opprinnelig rekkefølge (maks to).
    const basis = est.scenarios.filter((s) => s.kind === 'basis').slice(0, 1);
    const alts = est.scenarios.filter((s) => s.kind === 'alternativ').slice(0, MAX_ALTERNATIVES);
    return [...basis, ...alts].map((s) => ({ ...s, source: 'agent' as const, saleSource: 'scenario' as const, monthsAreTotal: false }));
  }
  const option = est.renovationOptions.find((o) => o.id === est.defaultRenovationOptionId) ?? est.renovationOptions[0] ?? null;
  return [
    {
      id: LEGACY_BASIS_ID,
      kind: 'basis',
      level: option?.level ?? 'hoved',
      title: option?.title ?? 'Basis',
      description: option?.description ?? '',
      feasibility: option?.requiresApproval ? 'betinget' : 'klar',
      feasibilityRationale: option?.requiresApproval
        ? 'Analysens hovedvalg krever godkjenning som ikke er avklart.'
        : 'Analysens hovedvalg (eldre analyse uten egen scenariovurdering).',
      requirements: option?.requiresApproval ? ['Avklar tillatelse/godkjenning før verdiøkningen regnes med.'] : [],
      requiresApproval: option?.requiresApproval ?? false,
      endProduct: { bedrooms: null, layoutNote: option?.saleEffectNote ?? '', kitchenChange: 'uavklart', bathChange: 'uavklart' },
      items: option?.items ?? [],
      suggestedMonths: option?.suggestedMonths ?? null,
      vatIncluded: option?.vatIncluded ?? true,
      sale: est.sale,
      uncertainty: { level: 'uavklart', note: 'Eldre analyse: salgsverdien er ikke vurdert for et bestemt sluttprodukt.' },
      referenceIds: [],
      referenceNote: '',
      source: 'legacy',
      saleSource: 'global',
      monthsAreTotal: true,
    },
  ];
}

/** Finner scenarioet. null/ukjent id gir analysens basis (eller første scenario). */
export function findAnalysisScenario(analysis: SharedAnalysis, id: string | null | undefined): ResolvedAnalysisScenario {
  const all = resolveAnalysisScenarios(analysis);
  return (id ? all.find((s) => s.id === id) : undefined) ?? all.find((s) => s.id === analysis.estimates.defaultScenarioId) ?? all.find((s) => s.kind === 'basis') ?? all[0];
}

export interface ScenarioSetIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Regler for et sett agentscenarioer: nøyaktig ett basisscenario, høyst to alternativer, unike id-er,
 * referanser til sammenlignbare objekter som finnes, og scenarioer som krever godkjenning kan ikke være «gjennomførbare».
 */
export function validateScenarioSet(scenarios: readonly AnalysisScenario[] | undefined, comparableIds: ReadonlySet<string>): ScenarioSetIssue[] {
  if (!scenarios || scenarios.length === 0) return [];
  const issues: ScenarioSetIssue[] = [];
  const base = ['estimates', 'scenarios'] as const;
  const basis = scenarios.filter((s) => s.kind === 'basis');
  const alts = scenarios.filter((s) => s.kind === 'alternativ');
  if (basis.length !== 1) issues.push({ path: [...base], message: 'Scenariosettet må ha nøyaktig ett basisscenario.' });
  if (alts.length > MAX_ALTERNATIVES) issues.push({ path: [...base], message: `Maks ${MAX_ALTERNATIVES} alternative planløsninger.` });
  if (new Set(scenarios.map((s) => s.id)).size !== scenarios.length) issues.push({ path: [...base], message: 'Scenario-ID-er må være unike.' });
  scenarios.forEach((s, i) => {
    if (s.requiresApproval && s.feasibility === 'klar') {
      issues.push({ path: [...base, i, 'feasibility'], message: 'Et scenario som krever godkjenning kan ikke være merket som gjennomførbart.' });
    }
    s.referenceIds.forEach((id, j) => {
      if (!comparableIds.has(id)) issues.push({ path: [...base, i, 'referenceIds', j], message: `Ukjent referanse «${id}».` });
    });
  });
  return issues;
}
