import { z } from 'zod';
import { CALC_MODEL_VERSION } from '../calc/engine';
import { canonicalFinnUrl } from '../lib/finn';
import {
  BidStepSchema,
  ChecklistItemSchema,
  ComparableSaleSchema,
  DutyRuleSchema,
  PublishableAnalysisSchema,
  RenovationOptionSchema,
  ReportSectionSchema,
  RiskSchema,
  SourceSchema,
  type Property,
  type PropertySnapshot,
  type SharedAnalysis,
  type Viewing,
} from './schemas';
import { FACT_STATUSES, PRICE_BASES, PROPERTY_TYPES, RECOMMENDATIONS, SALE_STATUSES, TENURES, VIEWING_STATUSES } from './enums';

/**
 * Kontrakt for strukturert JSON fra den fremtidige analyseagenten.
 *
 * Agenten leverer kildebelagte fakta og begrunnede ANSLAG. Den leverer aldri økonomiske
 * nøkkeltall (fortjeneste, maksbud, avkastning, nullpunkt) – de beregnes deterministisk av
 * beregningsmotoren. Manglende dokumentasjon leveres som value: null + status «uavklart».
 *
 * Ukjente felt på toppnivå bevares i `extra` (z.looseObject) slik at ingenting går tapt
 * ved fremtidige utvidelser.
 */
export const AGENT_CONTRACT = 'flipprom-agent-analysis';
export const AGENT_CONTRACT_VERSION = 1;

const SourcedNumber = z
  .object({
    value: z.number().finite().nullable(),
    status: z.enum(FACT_STATUSES),
    sourceId: z.string().nullable(),
    page: z.number().int().positive().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.value === null && v.status !== 'uavklart') ctx.addIssue({ code: 'custom', message: 'Ukjent verdi (null) må ha status «uavklart».' });
    if (v.status === 'dokumentert' && !v.sourceId) ctx.addIssue({ code: 'custom', message: 'Dokumentert opplysning må ha kildehenvisning (sourceId).' });
  });
export type SourcedNumber = z.infer<typeof SourcedNumber>;

const SourcedEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.object({ value: z.enum(values), status: z.enum(FACT_STATUSES), sourceId: z.string().nullable() });

export const FORBIDDEN_ECONOMIC_KEYS = ['profit', 'maxBid', 'projectReturn', 'breakEven', 'result', 'roi'] as const;

export const AgentAnalysisSchema = z
  .looseObject({
    contract: z.literal(AGENT_CONTRACT),
    contractVersion: z.literal(AGENT_CONTRACT_VERSION),
    analysisSchemaVersion: z.literal(1),
    finnId: z.string().regex(/^[1-9]\d{5,11}$/),
    generatedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Ugyldig tidspunkt'),
    agent: z.object({ name: z.string(), version: z.string() }),
    listing: z.object({
      observedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
      sourceUrl: z.string().url(),
      address: z.string().min(1),
      postalCode: z.string().nullable(),
      district: z.string().nullable(),
      municipality: z.string().min(1),
      propertyType: z.enum(PROPERTY_TYPES),
      tenure: SourcedEnum(TENURES),
      saleStatus: SourcedEnum(SALE_STATUSES),
      saleStatusNote: z.string().nullable(),
      askingPrice: SourcedNumber,
      sharedDebt: SourcedNumber,
      listingTotalInclCosts: SourcedNumber,
      monthlyCommonCosts: SourcedNumber,
      areaBRAi: SourcedNumber,
      rooms: SourcedNumber,
      bedrooms: SourcedNumber,
      floor: SourcedNumber,
      buildYear: SourcedNumber,
      plotArea: SourcedNumber,
      energyLabel: z.string().nullable(),
    }),
    viewings: z.array(
      z.object({
        id: z.string().min(1),
        start: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
        end: z.string().nullable(),
        status: z.enum(VIEWING_STATUSES),
        sourceId: z.string().nullable(),
      }),
    ),
    sources: z.array(SourceSchema).min(1),
    assessment: z.object({
      recommendation: z.enum(RECOMMENDATIONS),
      recommendationRationale: z.string().min(1),
      summary: z.string().min(1),
      strategy: z.string(),
      conditions: z.array(z.string()),
    }),
    estimates: z.strictObject({
      sale: z.object({
        basis: z.enum(PRICE_BASES),
        low: z.number().nullable(),
        base: z.number().nullable(),
        high: z.number().nullable(),
        rationaleLow: z.string(),
        rationaleBase: z.string(),
        rationaleHigh: z.string(),
        includesMarketGrowth: z.literal(false),
      }),
      renovationOptions: z.array(RenovationOptionSchema),
      defaultRenovationOptionId: z.string().nullable(),
      months: z.number().positive().nullable(),
      monthlyBreakdown: z.array(z.object({ label: z.string(), amount: z.number().nullable() })),
      buyFees: z.number().nullable(),
      debtAtSale: z.number().nullable(),
      suggestedPurchasePrice: z.number().nullable(),
      dutyRule: DutyRuleSchema,
    }),
    risks: z.array(RiskSchema),
    checklist: z.array(ChecklistItemSchema).length(12),
    comparables: z.array(ComparableSaleSchema),
    facts: z.array(z.object({ label: z.string(), value: z.string(), status: z.enum(FACT_STATUSES), sourceId: z.string().nullable() })),
    assumptions: z.array(z.string()),
    uncertainties: z.array(z.string()),
    report: z.array(ReportSectionSchema),
    bidSteps: z.array(BidStepSchema),
    nextSteps: z.array(z.string()),
  })
  .superRefine((o, ctx) => {
    for (const k of FORBIDDEN_ECONOMIC_KEYS) {
      if (k in o) ctx.addIssue({ code: 'custom', path: [k], message: 'Økonomiske nøkkeltall beregnes av Flippsjekks motor og skal ikke leveres av agenten.' });
    }
    const ids = new Set(o.sources.map((s) => s.id));
    const check = (id: string | null | undefined, path: (string | number)[]) => {
      if (id && !ids.has(id)) ctx.addIssue({ code: 'custom', path, message: `Ukjent kilde «${id}».` });
    };
    o.risks.forEach((r, i) => check(r.sourceId, ['risks', i, 'sourceId']));
    o.checklist.forEach((c, i) => check(c.sourceId, ['checklist', i, 'sourceId']));
    o.comparables.forEach((c, i) => check(c.sourceId, ['comparables', i, 'sourceId']));
    if (o.estimates.defaultRenovationOptionId && !o.estimates.renovationOptions.some((x) => x.id === o.estimates.defaultRenovationOptionId)) {
      ctx.addIssue({ code: 'custom', path: ['estimates', 'defaultRenovationOptionId'], message: 'Peker på et oppussingsalternativ som ikke finnes.' });
    }
  });
export type AgentAnalysisV1 = z.infer<typeof AgentAnalysisSchema>;

export type AgentParseResult =
  | { ok: true; value: AgentAnalysisV1 }
  | { ok: false; issues: { path: string; message: string }[] };

export function parseAgentOutput(raw: unknown): AgentParseResult {
  const r = AgentAnalysisSchema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, issues: r.error.issues.map((i) => ({ path: i.path.join('.') || '$', message: i.message })) };
}

const KNOWN_TOP = new Set(Object.keys(AgentAnalysisSchema.shape));

/**
 * Agentkontrakt → intern modell. Resultatet skal valideres med PublishableAnalysisSchema
 * før atomisk publisering (gjøres av jobbmotoren).
 */
export function adaptAgentOutput(
  o: AgentAnalysisV1,
  args: { propertyId: string; analysisId: string; snapshotId: string; snapshotVersion: number; version: number; now: Date; origin: SharedAnalysis['origin'] },
): { propertyPatch: Pick<Property, 'address' | 'postalCode' | 'district' | 'municipality' | 'propertyType' | 'tenure'>; snapshot: PropertySnapshot; viewings: Viewing[]; analysis: SharedAnalysis } {
  const l = o.listing;
  const nowIso = args.now.toISOString();
  const factSources: PropertySnapshot['factSources'] = {};
  const num = (key: string, v: SourcedNumber) => {
    factSources[key] = { status: v.status, sourceId: v.sourceId, page: v.page ?? null };
    return v.value;
  };
  const snapshot: PropertySnapshot = {
    id: args.snapshotId,
    propertyId: args.propertyId,
    version: args.snapshotVersion,
    observedAt: new Date(l.observedAt).toISOString(),
    fetchedAt: nowIso,
    sourceUrl: l.sourceUrl,
    origin: args.origin === 'agent' ? 'source' : args.origin === 'synthetic' ? 'synthetic' : 'demo',
    askingPrice: num('askingPrice', l.askingPrice),
    sharedDebt: num('sharedDebt', l.sharedDebt),
    listingTotalInclCosts: num('listingTotalInclCosts', l.listingTotalInclCosts),
    monthlyCommonCosts: num('monthlyCommonCosts', l.monthlyCommonCosts),
    areaBRAi: num('areaBRAi', l.areaBRAi),
    rooms: num('rooms', l.rooms),
    bedrooms: num('bedrooms', l.bedrooms),
    floor: num('floor', l.floor),
    buildYear: num('buildYear', l.buildYear),
    plotArea: num('plotArea', l.plotArea),
    saleStatus: l.saleStatus.value,
    saleStatusNote: l.saleStatusNote,
    energyLabel: l.energyLabel,
    factSources,
  };
  factSources.tenure = { status: l.tenure.status, sourceId: l.tenure.sourceId };
  factSources.saleStatus = { status: l.saleStatus.status, sourceId: l.saleStatus.sourceId };

  const viewings: Viewing[] = o.viewings.map((v) => ({
    id: v.id,
    propertyId: args.propertyId,
    kind: 'official',
    start: new Date(v.start).toISOString(),
    end: v.end ? new Date(v.end).toISOString() : null,
    status: v.status,
    sourceId: v.sourceId,
    sourceLabel: args.origin === 'agent' ? 'Annonsert visning' : args.origin === 'synthetic' ? 'Demodata – ingen annonse hentet: annonsert visning' : 'Demodata – fiktivt objekt: annonsert visning',
    verifiedAt: snapshot.observedAt,
    replacesViewingId: null,
    note: v.status === 'avlyst' ? 'Avlyst ifølge annonsen' : null,
  }));

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!KNOWN_TOP.has(k)) extra[k] = v;

  const analysis: SharedAnalysis = {
    id: args.analysisId,
    propertyId: args.propertyId,
    snapshotId: args.snapshotId,
    version: args.version,
    schemaVersion: 1,
    modelVersion: CALC_MODEL_VERSION,
    status: 'published',
    visibility: 'shared',
    ownerId: null,
    origin: args.origin,
    createdAt: nowIso,
    publishedAt: nowIso,
    ...o.assessment,
    estimates: {
      ...o.estimates,
      // Summen utledes her – ukjent post gir ukjent sum (aldri 0).
      monthlyTotal: o.estimates.monthlyBreakdown.some((m) => m.amount === null)
        ? null
        : o.estimates.monthlyBreakdown.reduce((sum, m) => sum + Math.round((m.amount ?? 0) * 100), 0) / 100,
    },
    risks: o.risks,
    checklist: o.checklist,
    comparables: o.comparables,
    sources: o.sources,
    facts: o.facts,
    assumptions: o.assumptions,
    uncertainties: o.uncertainties,
    report: o.report,
    bidSteps: o.bidSteps,
    nextSteps: o.nextSteps,
    ...(Object.keys(extra).length ? { unmappedFields: extra } : {}),
  };
  return {
    propertyPatch: { address: l.address, postalCode: l.postalCode, district: l.district, municipality: l.municipality, propertyType: l.propertyType, tenure: l.tenure.value },
    snapshot,
    viewings,
    analysis,
  };
}

/** Full validering før publisering: kontrakt → intern modell → publiseringskrav. */
export function validateForPublish(analysis: SharedAnalysis): { ok: true } | { ok: false; fields: string[] } {
  const r = PublishableAnalysisSchema.safeParse(analysis);
  return r.success ? { ok: true } : { ok: false, fields: [...new Set(r.error.issues.map((i) => i.path.join('.')))] };
}

export function canonicalSourceUrl(finnId: string): string {
  return canonicalFinnUrl(finnId);
}
