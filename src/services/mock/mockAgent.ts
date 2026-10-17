import { buildProperty } from '../../data/analysisBuilder';
import { SEED_PROPERTIES } from '../../data/seedProperties';
import { syntheticPropertySpec } from '../../data/synthetic';
import { AGENT_CONTRACT, AGENT_CONTRACT_VERSION, type AgentAnalysisV1, type SourcedNumber } from '../../domain/agentContract';
import type { PropertySnapshot } from '../../domain/schemas';

/**
 * Simulert analyseagent. Produserer strukturert JSON etter agentkontrakten fra fiktive
 * demodata (seed) eller deterministisk syntetiske data for ukjente FINN-ID-er.
 * Leser aldri noe fra FINN. En ekte agent erstatter denne funksjonen (se docs/integrasjoner.md).
 */
export function mockAgentRun(finnId: string, now: Date, version: number, runKey: string): AgentAnalysisV1 {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === finnId) ?? syntheticPropertySpec(finnId);
  const built = buildProperty({ ...spec, analysisAgeDays: 0, snapshotAgeHours: 0 }, now, { analysisVersion: version, analysisKeySuffix: `:${runKey}` });
  const s = built.snapshot;
  const a = built.analysis;
  const listingSource = a.sources.find((x) => x.kind === 'annonse')?.id ?? null;
  const sourced = (key: keyof PropertySnapshot, value: number | null): SourcedNumber => {
    const prov = s.factSources[key as string];
    if (value === null) return { value: null, status: 'uavklart', sourceId: null };
    if (prov) return { value, status: prov.status, sourceId: prov.sourceId ?? listingSource, page: prov.page ?? null };
    return { value, status: 'dokumentert', sourceId: listingSource };
  };
  return {
    contract: AGENT_CONTRACT,
    contractVersion: AGENT_CONTRACT_VERSION,
    analysisSchemaVersion: 1,
    finnId,
    generatedAt: now.toISOString(),
    agent: { name: 'flipprom-mock-agent', version: '1.0.0' },
    listing: {
      observedAt: s.observedAt,
      sourceUrl: built.property.canonicalUrl,
      address: built.property.address,
      postalCode: built.property.postalCode,
      district: built.property.district,
      municipality: built.property.municipality,
      propertyType: built.property.propertyType,
      tenure: { value: built.property.tenure, status: s.factSources.tenure?.status ?? 'uavklart', sourceId: s.factSources.tenure?.sourceId ?? null },
      saleStatus: { value: s.saleStatus, status: 'dokumentert', sourceId: listingSource },
      saleStatusNote: s.saleStatusNote,
      askingPrice: sourced('askingPrice', s.askingPrice),
      sharedDebt: sourced('sharedDebt', s.sharedDebt),
      listingTotalInclCosts: sourced('listingTotalInclCosts', s.listingTotalInclCosts),
      monthlyCommonCosts: sourced('monthlyCommonCosts', s.monthlyCommonCosts),
      areaBRAi: sourced('areaBRAi', s.areaBRAi),
      rooms: sourced('rooms', s.rooms),
      bedrooms: sourced('bedrooms', s.bedrooms),
      floor: sourced('floor', s.floor),
      buildYear: sourced('buildYear', s.buildYear),
      plotArea: sourced('plotArea', s.plotArea),
      energyLabel: s.energyLabel,
    },
    viewings: built.viewings.map((v) => ({ id: v.id, start: v.start, end: v.end, status: v.status, sourceId: v.sourceId })),
    sources: a.sources,
    assessment: {
      recommendation: a.recommendation ?? 'avklar_forst',
      recommendationRationale: a.recommendationRationale,
      summary: a.summary,
      strategy: a.strategy,
      conditions: a.conditions,
    },
    estimates: (({ monthlyTotal: _derived, ...rest }) => rest)(a.estimates),
    risks: a.risks,
    checklist: a.checklist,
    comparables: a.comparables,
    facts: a.facts,
    assumptions: a.assumptions,
    uncertainties: a.uncertainties,
    report: a.report,
    bidSteps: a.bidSteps,
    nextSteps: a.nextSteps,
  };
}
