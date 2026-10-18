import { SCREENING_ASPECT_LABEL, SCREENING_ASPECTS } from './enums';
import type { AnalysisScenario, RenovationItem, ScenarioSearch, SharedAnalysis } from './schemas';

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
      endProduct: { bedrooms: null, standardClass: null, layoutNote: option?.saleEffectNote ?? '', kitchenChange: 'uavklart', bathChange: 'uavklart' },
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
 * Én kostnadsmodell per tiltak. Et tiltak med `laborCategory` bruker ny arbeidsmodell (materialer + innleid arbeid) og kan
 * ikke i tillegg ha eldre fagbeløp (elektriker, rørlegger, andre fag) – da ville arbeidet blitt talt to ganger.
 */
export function laborModelIssue(item: Pick<RenovationItem, 'title' | 'laborCategory' | 'electrician' | 'plumber' | 'other'>): string | null {
  if (!item.laborCategory) return null;
  const legacy = [item.electrician, item.plumber, item.other].some((x) => typeof x === 'number' && x !== 0);
  return legacy
    ? `Tiltaket «${item.title}» bruker både arbeidsmodell (laborCategory/laborCostHired) og eldre fagfelt (electrician/plumber/other). Bruk bare én modell, ellers telles arbeidet to ganger.`
    : null;
}

/**
 * Regler for et sett agentscenarioer: nøyaktig ett basisscenario, høyst to alternativer, unike id-er,
 * referanser til sammenlignbare objekter som finnes, scenarioer som krever godkjenning kan ikke være «gjennomførbare»,
 * og alternativene må bestå screeningen (vindu/dagslys, romgeometri, teknikk, vann/avløp, ventilasjon, myndighet, økonomi).
 */
export function validateScenarioSet(scenarios: readonly AnalysisScenario[] | undefined, comparableIds: ReadonlySet<string>, search?: ScenarioSearch): ScenarioSetIssue[] {
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
    if (s.requiresApproval && s.risk?.approval === 'lav') {
      issues.push({ path: [...base, i, 'risk', 'approval'], message: 'Et scenario som krever godkjenning kan ikke ha lav myndighets-/godkjenningsrisiko.' });
    }
    s.referenceIds.forEach((id, j) => {
      if (!comparableIds.has(id)) issues.push({ path: [...base, i, 'referenceIds', j], message: `Ukjent referanse «${id}».` });
    });
    (s.referenceClassification ?? []).forEach((c, j) => {
      if (!comparableIds.has(c.comparableId)) issues.push({ path: [...base, i, 'referenceClassification', j], message: `Ukjent referanse «${c.comparableId}».` });
    });
    s.items.forEach((it, j) => {
      const m = laborModelIssue(it);
      if (m) issues.push({ path: [...base, i, 'items', j], message: m });
    });
    const sc = s.screening;
    if (sc) {
      const covered = new Set(sc.checks.map((c) => c.aspect));
      const missing = SCREENING_ASPECTS.filter((a) => !covered.has(a));
      if (missing.length > 0) issues.push({ path: [...base, i, 'screening', 'checks'], message: `Screeningen mangler vurdering av: ${missing.map((a) => SCREENING_ASPECT_LABEL[a]).join(', ')}.` });
      if (sc.checks.some((c) => c.result === 'ikke_ok')) {
        issues.push({ path: [...base, i, 'screening', 'checks'], message: 'Et grep som ikke består screeningen skal ikke være et scenario. Før det i scenarioSearch som avvist.' });
      }
      if (s.feasibility === 'klar' && sc.checks.some((c) => c.result !== 'ok')) {
        issues.push({ path: [...base, i, 'feasibility'], message: 'Et scenario kan ikke være «gjennomførbart» når screeningen har tvil eller uavklarte punkter.' });
      }
      if (sc.concept === 'flytte_bad' && sc.existingBathNeedsFullRenovation !== true) {
        issues.push({ path: [...base, i, 'screening', 'existingBathNeedsFullRenovation'], message: 'Badflytting er bare aktuelt når eksisterende bad uansett må totalrenoveres.' });
      }
    }
  });
  if (search) {
    const altIds = new Set(alts.map((s) => s.id));
    const chosen = search.considered.filter((c) => c.outcome === 'valgt');
    if (search.status === 'stoppet_ingen_bestod' && (chosen.length > 0 || alts.length > 0)) {
      issues.push({ path: ['estimates', 'scenarioSearch'], message: 'Jakten er stoppet fordi ingen alternativer besto screeningen, men det finnes alternative scenarioer.' });
    }
    chosen.forEach((c, j) => {
      if (!c.scenarioId || !altIds.has(c.scenarioId)) issues.push({ path: ['estimates', 'scenarioSearch', 'considered', j], message: 'Et valgt grep må peke på et alternativt scenario i settet.' });
    });
    if (chosen.length > MAX_ALTERNATIVES) issues.push({ path: ['estimates', 'scenarioSearch'], message: `Maks ${MAX_ALTERNATIVES} valgte alternativer.` });
  }
  return issues;
}
