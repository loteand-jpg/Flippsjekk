import { z } from 'zod';
import {
  BUYER_TYPES,
  CHECK_STATUSES,
  CHECKLIST_KEYS,
  COMPARABLE_KINDS,
  DUTY_BASES,
  FACT_STATUSES,
  JOB_STATUSES,
  JOB_TYPES,
  PRICE_BASES,
  PRIORITIES,
  PROPERTY_TYPES,
  RECOMMENDATIONS,
  RENOVATION_LEVELS,
  RENOVATION_MODES,
  RISK_CATEGORIES,
  SALE_STATUSES,
  SOURCE_KINDS,
  SUBSCRIPTION_STATUSES,
  TAX_MODES,
  TENURES,
  USAGE_KINDS,
  VIEWING_STATUSES,
  WORK_STATUSES,
} from './enums';

/**
 * Internt, versjonert domeneskjema. Typene i appen utledes herfra, slik at
 * validering og typer ikke kan gli fra hverandre.
 *
 * Konvensjoner:
 *  - Ukjente tall/datoer er `null` – aldri 0. 0 er en faktisk opplysning.
 *  - Tidspunkt lagres som ISO 8601 i UTC. Lokale datoer (Europe/Oslo) som `YYYY-MM-DD`.
 *  - Beløp er kroner. Prosentsatser i scenarioverdier er prosentpoeng (7 = 7 %)
 *    og konverteres én gang til desimal ved grensen til beregningsmotoren.
 */

export const ANALYSIS_SCHEMA_VERSION = 1 as const;

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Ugyldig tidspunkt');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dato må være på formatet ÅÅÅÅ-MM-DD');
const money = z.number().finite();
const nullableMoney = money.nullable();
const id = z.string().min(1);

export const SourceSchema = z.object({
  id,
  kind: z.enum(SOURCE_KINDS),
  title: z.string().min(1),
  url: z.string().nullable(),
  documentName: z.string().nullable(),
  page: z.number().int().positive().nullable(),
  fetchedAt: isoDateTime.nullable(),
  observedAt: isoDate.nullable(),
  status: z.enum(FACT_STATUSES),
  isDemo: z.boolean(),
});
export type Source = z.infer<typeof SourceSchema>;

export const FactProvenanceSchema = z.object({
  status: z.enum(FACT_STATUSES),
  sourceId: z.string().nullable(),
  page: z.number().int().positive().nullable().optional(),
  note: z.string().optional(),
});
export type FactProvenance = z.infer<typeof FactProvenanceSchema>;

export const PropertySchema = z.object({
  id,
  finnId: z.string().regex(/^\d{6,12}$/),
  canonicalUrl: z.string().url(),
  address: z.string().min(1),
  postalCode: z.string().nullable(),
  city: z.string().min(1),
  district: z.string().nullable(),
  municipality: z.string().min(1),
  countryCode: z.literal('NO'),
  propertyType: z.enum(PROPERTY_TYPES),
  tenure: z.enum(TENURES),
  /** demo = fiktivt seed-objekt, synthetic = generert fra ukjent FINN-ID, import = kun identitet fra import */
  dataOrigin: z.enum(['demo', 'synthetic', 'import', 'source']),
  createdAt: isoDateTime,
});
export type Property = z.infer<typeof PropertySchema>;

export const PropertySnapshotSchema = z.object({
  id,
  propertyId: id,
  version: z.number().int().positive(),
  observedAt: isoDateTime,
  fetchedAt: isoDateTime,
  sourceUrl: z.string().nullable(),
  origin: z.enum(['demo', 'synthetic', 'import', 'source']),
  askingPrice: nullableMoney,
  sharedDebt: nullableMoney,
  /** Annonsens eventuelle totalbeløp inkl. kjøpskostnader – ikke det samme som pris inkl. fellesgjeld. */
  listingTotalInclCosts: nullableMoney,
  monthlyCommonCosts: nullableMoney,
  areaBRAi: z.number().positive().nullable(),
  rooms: z.number().int().nonnegative().nullable(),
  bedrooms: z.number().int().nonnegative().nullable(),
  floor: z.number().int().nullable(),
  buildYear: z.number().int().min(1600).max(2100).nullable(),
  plotArea: z.number().positive().nullable(),
  saleStatus: z.enum(SALE_STATUSES),
  saleStatusNote: z.string().nullable(),
  energyLabel: z.string().nullable(),
  factSources: z.record(z.string(), FactProvenanceSchema),
});
export type PropertySnapshot = z.infer<typeof PropertySnapshotSchema>;

export const ViewingSchema = z.object({
  id,
  propertyId: id,
  kind: z.literal('official'),
  start: isoDateTime,
  end: isoDateTime.nullable(),
  status: z.enum(VIEWING_STATUSES),
  sourceId: z.string().nullable(),
  sourceLabel: z.string(),
  verifiedAt: isoDateTime,
  replacesViewingId: z.string().nullable(),
  note: z.string().nullable(),
});
export type Viewing = z.infer<typeof ViewingSchema>;

export const RenovationItemSchema = z.object({
  id,
  room: z.string(),
  title: z.string(),
  materials: nullableMoney,
  electrician: nullableMoney,
  plumber: nullableMoney,
  other: nullableMoney,
  hours: z.number().finite().nullable(),
  priority: z.enum(PRIORITIES),
  included: z.boolean(),
  note: z.string().optional(),
});
export type RenovationItem = z.infer<typeof RenovationItemSchema>;

export const RenovationOptionSchema = z.object({
  id,
  level: z.enum(RENOVATION_LEVELS),
  title: z.string().min(1),
  description: z.string(),
  items: z.array(RenovationItemSchema),
  suggestedMonths: z.number().positive().nullable(),
  saleEffectNote: z.string(),
  /** Krever tillatelse/godkjenning som ikke er avklart – verdien er da ikke innregnet. */
  requiresApproval: z.boolean(),
  vatIncluded: z.boolean(),
});
export type RenovationOption = z.infer<typeof RenovationOptionSchema>;

export const RiskSchema = z.object({
  id,
  title: z.string().min(1),
  category: z.enum(RISK_CATEGORIES),
  /** 1–10, eller null = ukjent alvorlighet. */
  level: z.number().int().min(1).max(10).nullable(),
  costLow: nullableMoney,
  costHigh: nullableMoney,
  rationale: z.string(),
  sourceId: z.string().nullable(),
  action: z.string(),
});
export type Risk = z.infer<typeof RiskSchema>;

export const ChecklistItemSchema = z.object({
  key: z.enum(CHECKLIST_KEYS),
  status: z.enum(CHECK_STATUSES),
  note: z.string(),
  sourceId: z.string().nullable(),
  beforeBidTask: z.string().nullable(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

const ComparableFieldShape = {
  name: z.string().min(1),
  url: z.string().nullable(),
  kind: z.enum(COMPARABLE_KINDS),
  askingPrice: nullableMoney,
  soldPrice: nullableMoney,
  commonCosts: nullableMoney,
  soldTotalPrice: nullableMoney,
  area: z.number().positive().nullable(),
  date: isoDate.nullable(),
  notes: z.string(),
};

/** Sammenlignbart objekt i den felles analysen (grunnlaget). */
export const ComparableSaleSchema = z.object({
  id,
  ...ComparableFieldShape,
  sourceId: z.string().nullable(),
  isDemo: z.boolean(),
});
export type ComparableSale = z.infer<typeof ComparableSaleSchema>;

/** Brukerens egne sammenlignbare objekter. Private – aldri en del av felles analyse. */
export const UserComparableSchema = z.object({
  id,
  userId: id,
  propertyId: id,
  ...ComparableFieldShape,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type UserComparable = z.infer<typeof UserComparableSchema>;

/**
 * Brukerens private risikoer. baseRiskId = null: egen risiko. Ellers en privat endring av (eller
 * skjuling av, removed) en risiko fra grunnlaget. Grunnlaget endres aldri.
 */
export const UserRiskSchema = z.object({
  id,
  userId: id,
  propertyId: id,
  baseRiskId: z.string().nullable(),
  removed: z.boolean(),
  title: z.string().min(1),
  category: z.enum(RISK_CATEGORIES),
  level: z.number().int().min(1).max(10).nullable(),
  costLow: nullableMoney,
  costHigh: nullableMoney,
  rationale: z.string(),
  action: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type UserRisk = z.infer<typeof UserRiskSchema>;

export const DutyRuleSchema = z.object({
  basis: z.enum(DUTY_BASES),
  ratePct: z.number().min(0).max(10).nullable(),
  customBase: nullableMoney,
  note: z.string(),
});
export type DutyRule = z.infer<typeof DutyRuleSchema>;

export const SaleEstimateSchema = z.object({
  basis: z.enum(PRICE_BASES),
  low: nullableMoney,
  base: nullableMoney,
  high: nullableMoney,
  rationaleLow: z.string(),
  rationaleBase: z.string(),
  rationaleHigh: z.string(),
  /** Skal alltid være false i basis: ingen udokumentert markedsvekst. */
  includesMarketGrowth: z.literal(false),
});
export type SaleEstimate = z.infer<typeof SaleEstimateSchema>;

export const BidStepSchema = z.object({
  title: z.string(),
  detail: z.string(),
  condition: z.string().nullable(),
});
export type BidStep = z.infer<typeof BidStepSchema>;

export const ReportSectionSchema = z.object({ title: z.string(), body: z.string() });
export type ReportSection = z.infer<typeof ReportSectionSchema>;

export const AnalysisFactSchema = z.object({
  label: z.string(),
  value: z.string(),
  status: z.enum(FACT_STATUSES),
  sourceId: z.string().nullable(),
});
export type AnalysisFact = z.infer<typeof AnalysisFactSchema>;

export const SharedAnalysisSchema = z.object({
  id,
  propertyId: id,
  snapshotId: id,
  version: z.number().int().positive(),
  schemaVersion: z.literal(ANALYSIS_SCHEMA_VERSION),
  modelVersion: z.string().min(1),
  status: z.enum(['published', 'superseded', 'draft']),
  /** shared = felles grunnanalyse. private = brukerens importerte utkast (aldri felles). */
  visibility: z.enum(['shared', 'private']),
  ownerId: z.string().nullable(),
  origin: z.enum(['agent', 'demo', 'synthetic', 'import_v1']),
  createdAt: isoDateTime,
  publishedAt: isoDateTime.nullable(),
  /** null = ikke vurdert (kun tillatt i private utkast; publisering krever verdi). */
  recommendation: z.enum(RECOMMENDATIONS).nullable(),
  recommendationRationale: z.string(),
  summary: z.string(),
  strategy: z.string(),
  conditions: z.array(z.string()),
  estimates: z.object({
    sale: SaleEstimateSchema,
    renovationOptions: z.array(RenovationOptionSchema),
    defaultRenovationOptionId: z.string().nullable(),
    months: z.number().positive().nullable(),
    monthlyTotal: nullableMoney,
    monthlyBreakdown: z.array(z.object({ label: z.string(), amount: nullableMoney })),
    buyFees: nullableMoney,
    debtAtSale: nullableMoney,
    suggestedPurchasePrice: nullableMoney,
    dutyRule: DutyRuleSchema,
  }),
  risks: z.array(RiskSchema),
  checklist: z.array(ChecklistItemSchema),
  comparables: z.array(ComparableSaleSchema),
  sources: z.array(SourceSchema),
  facts: z.array(AnalysisFactSchema),
  assumptions: z.array(z.string()),
  uncertainties: z.array(z.string()),
  report: z.array(ReportSectionSchema),
  bidSteps: z.array(BidStepSchema),
  nextSteps: z.array(z.string()),
  /** Originalt importobjekt og felter uten kjent mapping (kun private utkast). */
  rawImport: z.unknown().optional(),
  unmappedFields: z.record(z.string(), z.unknown()).optional(),
  /** Historikk fra import (historicalMax/Profit/Sale). Ikke beregnede nøkkeltall. */
  history: z.record(z.string(), z.number().nullable()).optional(),
});
export type SharedAnalysis = z.infer<typeof SharedAnalysisSchema>;

/**
 * Strengere krav før en analyse kan publiseres som felles grunnanalyse.
 * Brukes atomisk ved publisering – en analyse som feiler her publiseres aldri.
 */
export const PublishableAnalysisSchema = SharedAnalysisSchema.extend({
  visibility: z.literal('shared'),
  ownerId: z.null(),
  status: z.literal('published'),
  recommendation: z.enum(RECOMMENDATIONS),
  recommendationRationale: z.string().min(1),
  summary: z.string().min(1),
  publishedAt: isoDateTime,
  checklist: z.array(ChecklistItemSchema).length(12),
  sources: z.array(SourceSchema).min(1),
});

export const ScenarioValuesSchema = z.object({
  buyerType: z.enum(BUYER_TYPES),
  purchasePrice: nullableMoney,
  debtAtPurchase: nullableMoney,
  debtAtSale: nullableMoney,
  dutyBasis: z.enum(DUTY_BASES),
  dutyPct: z.number().finite().nullable(),
  dutyCustomBase: nullableMoney,
  buyFees: nullableMoney,
  renovationMode: z.enum(RENOVATION_MODES),
  renovationOptionId: z.string().nullable(),
  renovationItems: z.array(RenovationItemSchema),
  renovationLumpSum: nullableMoney,
  lumpSumHours: z.number().finite().nullable(),
  vatIncluded: z.boolean(),
  reservePct: z.number().finite().nullable(),
  months: z.number().finite().nullable(),
  monthlyCost: nullableMoney,
  interestPct: z.number().finite().nullable(),
  financingPct: z.number().finite().nullable(),
  saleBasis: z.enum(PRICE_BASES),
  saleLow: nullableMoney,
  saleBase: nullableMoney,
  saleHigh: nullableMoney,
  saleFixedCost: nullableMoney,
  saleCommissionPct: z.number().finite().nullable(),
  hourValue: nullableMoney,
  profitTarget: nullableMoney,
  taxMode: z.enum(TAX_MODES),
  taxPct: z.number().finite().nullable(),
  startBid: nullableMoney,
  walkAway: nullableMoney,
  notes: z.string(),
});
export type ScenarioValues = z.infer<typeof ScenarioValuesSchema>;

export const ScenarioSchema = z.object({
  id,
  ownerId: id,
  propertyId: id,
  analysisId: id,
  analysisVersion: z.number().int().positive(),
  name: z.string().min(1).max(80),
  /** Låst scenario («Nettsidens vurdering»): opprettes av systemet og kan ikke redigeres eller slettes. */
  locked: z.boolean().optional(),
  values: ScenarioValuesSchema,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const UserPropertySchema = z.object({
  id,
  userId: id,
  propertyId: id,
  favorite: z.boolean(),
  workStatus: z.enum(WORK_STATUSES),
  notes: z.string(),
  primaryScenarioId: z.string().nullable(),
  /** Privat visningsnavn (f.eks. fra import). Endrer aldri felles adresse. */
  label: z.string().nullable().optional(),
  archivedAt: isoDateTime.nullable(),
  addedAt: isoDateTime,
  updatedAt: isoDateTime,
  /** Siste felles analyseversjon brukeren har sett – brukes til «ny versjon»-varsel. */
  lastSeenAnalysisVersion: z.number().int().nullable(),
  /** Brukerens private avkrysninger. Endrer aldri kildestatus i den felles analysen. */
  checks: z.record(z.string(), z.object({ confirmedAt: isoDateTime, note: z.string() })),
});
export type UserProperty = z.infer<typeof UserPropertySchema>;

export const PrivateEventSchema = z.object({
  id,
  userId: id,
  propertyId: id,
  kind: z.enum(['private_viewing', 'imported_viewing']),
  start: isoDateTime,
  end: isoDateTime.nullable(),
  note: z.string(),
  /** Fra importens `confirmed`. Settes aldri til true av importen selv. */
  confirmed: z.boolean(),
  createdAt: isoDateTime,
});
export type PrivateEvent = z.infer<typeof PrivateEventSchema>;

export const CalendarOverrideSchema = z.object({
  id,
  userId: id,
  propertyId: id,
  eventKey: z.literal('bidday'),
  start: isoDateTime,
  note: z.string(),
  origin: z.enum(['manual', 'import_v1']),
  /** Kildeverdien (avledet prognose) da overstyringen ble lagt inn – bevares for sporbarhet. */
  derivedStartAtOverride: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type CalendarOverride = z.infer<typeof CalendarOverrideSchema>;

export const ProfileDefaultsSchema = z.object({
  buyerTypeApartment: z.enum(BUYER_TYPES),
  buyerTypeHouse: z.enum(BUYER_TYPES),
  months: z.number().positive(),
  interestPct: z.number().min(0),
  financingPct: z.number().min(0).max(100),
  reservePct: z.number().min(0),
  hourValue: z.number().min(0),
  profitTarget: z.number(),
  saleFixedCost: z.number().min(0),
  saleCommissionPct: z.number().min(0),
  buyFees: z.number().min(0),
  homeArea: z.string(),
});
export type ProfileDefaults = z.infer<typeof ProfileDefaultsSchema>;

export const ProfileSchema = z.object({
  userId: id,
  displayName: z.string().min(1),
  email: z.string(),
  defaults: ProfileDefaultsSchema,
  updatedAt: isoDateTime,
});
export type Profile = z.infer<typeof ProfileSchema>;

export const UserSchema = z.object({
  id,
  email: z.string(),
  displayName: z.string(),
  isDemoAccount: z.boolean(),
  createdAt: isoDateTime,
});
export type User = z.infer<typeof UserSchema>;

export const SubscriptionSchema = z.object({
  id,
  userId: id,
  planId: z.string(),
  interval: z.enum(['month', 'year']),
  status: z.enum(SUBSCRIPTION_STATUSES),
  currentPeriodStart: isoDateTime,
  currentPeriodEnd: isoDateTime,
  cancelAtPeriodEnd: z.boolean(),
  /** Betalingsleverandør. «vipps» = Vipps-avtale (simulert i demoen). «mock» = eldre simulerte rader. */
  provider: z.enum(['mock', 'vipps']),
  /** Vipps-avtalens ID (agreementId) når provider er vipps. */
  agreementId: z.string().optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const AnalysisJobSchema = z.object({
  id,
  propertyId: id,
  finnId: z.string(),
  type: z.enum(JOB_TYPES),
  schemaVersion: z.number().int(),
  modelVersion: z.string(),
  targetAnalysisVersion: z.number().int().nullable(),
  dedupeKey: z.string(),
  status: z.enum(JOB_STATUSES),
  steps: z.array(z.string()),
  stepIndex: z.number().int().nonnegative(),
  stepDurationMs: z.number().nonnegative(),
  attempt: z.number().int().positive(),
  startedAt: isoDateTime,
  updatedAt: isoDateTime,
  finishedAt: isoDateTime.nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  createdBy: id,
  requestedBy: z.array(id),
  resultAnalysisId: z.string().nullable(),
  resultSnapshotId: z.string().nullable(),
  /** Kun demo: planlagt feil for et bestemt forsøk. */
  simulatedFailure: z
    .object({ attempt: z.number().int(), atStep: z.number().int(), mode: z.enum(['fetch_error', 'invalid_result']) })
    .nullable(),
});
export type AnalysisJob = z.infer<typeof AnalysisJobSchema>;

export const UsageEventSchema = z.object({
  id,
  userId: id,
  kind: z.enum(USAGE_KINDS),
  propertyId: id,
  jobId: z.string().nullable(),
  analysisId: z.string().nullable(),
  idempotencyKey: z.string().min(1),
  chargeable: z.boolean(),
  createdAt: isoDateTime,
});
export type UsageEvent = z.infer<typeof UsageEventSchema>;
