import { z } from 'zod';
import {
  ANCHOR_ADJUSTMENT_CATEGORIES,
  ANCHOR_ADJUSTMENT_MAX_PCT,
  BUYER_TYPES,
  CHANGE_LEVELS,
  CHECK_STATUSES,
  CHECKLIST_KEYS,
  COMPARABLE_KINDS,
  DATA_QUALITY_LEVELS,
  DUTY_BASES,
  FACT_STATUSES,
  FEASIBILITY_STATUSES,
  JOB_STATUSES,
  JOB_TYPES,
  LABOR_CATEGORIES,
  LAYOUT_MATCHES,
  LOCATION_LEVELS,
  PRICE_BASES,
  PRIORITIES,
  PROPERTY_TYPES,
  RECOMMENDATIONS,
  REGULATED_LABOR_CATEGORIES,
  RENOVATION_LEVELS,
  RENOVATION_MODES,
  RISK_CATEGORIES,
  SALE_STATUSES,
  SCENARIO_KINDS,
  SCENARIO_SEARCH_STATUSES,
  SCREENING_ASPECTS,
  SCREENING_CONCEPTS,
  SCREENING_RESULTS,
  SOURCE_KINDS,
  STANDARD_CLASSES,
  SUBSCRIPTION_STATUSES,
  TAX_MODES,
  TENURES,
  UNCERTAINTY_LEVELS,
  USAGE_KINDS,
  VIEWING_STATUSES,
  WORK_MODES,
  WORK_STATUSES,
} from './enums';
import { validateScenarioSet } from './analysisScenarios';
import { migrateProfileDefaultsRaw, migrateScenarioValuesRaw } from './migrate';

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
  /**
   * Arbeidsmodell (valgfri, bakoverkompatibel). Uten `laborCategory` gjelder eldre regler:
   * `electrician`/`plumber`/`other` er innleide fag og `hours` er egne timer.
   * Med `laborCategory` kan arbeid skilles fra materialer og fordeles på selv/delvis/innleid.
   *
   * ÉN kostnadsmodell per tiltak: et tiltak med `laborCategory` bruker `materials` + `laborCostHired`, og
   * `electrician`/`plumber`/`other` skal da være null eller 0. Motoren ignorerer dem for slike tiltak (aldri
   * dobbelttelling), og agentkontrakten avviser tiltak som fyller ut begge (se `laborModelIssues`).
   */
  laborCategory: z.enum(LABOR_CATEGORIES).nullable().optional(),
  /** Totalt antall arbeidstimer for tiltaket, uavhengig av hvem som utfører det. */
  laborHours: z.number().finite().nonnegative().nullable().optional(),
  /** Pris for arbeidet dersom det er innleid (hele tiltaket). Ukjent = null. */
  laborCostHired: nullableMoney.optional(),
  /** Overstyrer profilens arbeidsmodell for dette tiltaket. */
  workMode: z.enum(WORK_MODES).nullable().optional(),
  /** Egenandel (0–1) når arbeidsmodus er «delvis». */
  selfShare: z.number().min(0).max(1).nullable().optional(),
  /** Hvor prisene kommer fra – klargjør for prisbank med versjon senere. */
  priceSource: z.object({ kind: z.enum(['agent', 'prisbank', 'bruker']), version: z.string().nullable() }).optional(),
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
  // Valgfrie felt for markedsvekting (modell 1.1). Mangler de, regnes egenskapen som ukjent.
  bedrooms: z.number().int().nonnegative().nullable().optional(),
  propertyType: z.enum(PROPERTY_TYPES).nullable().optional(),
  tenure: z.enum(TENURES).nullable().optional(),
  /** Fellesgjeld ved salget (kr). Brukes til å normalisere mellom kontant- og totalpris. */
  sharedDebt: nullableMoney.optional(),
  locationLevel: z.enum(LOCATION_LEVELS).nullable().optional(),
  standardClass: z.enum(STANDARD_CLASSES).nullable().optional(),
  layoutMatch: z.enum(LAYOUT_MATCHES).nullable().optional(),
  floor: z.number().int().nullable().optional(),
  elevator: z.boolean().nullable().optional(),
  balcony: z.boolean().nullable().optional(),
  parking: z.boolean().nullable().optional(),
  /** Utsikt/sol eller annen generisk egenskapsmatch (tekst brukes bare til visning). */
  viewNote: z.string().nullable().optional(),
  dataQuality: z.enum(DATA_QUALITY_LEVELS).nullable().optional(),
  /** Manuell markedsjusteringsfaktor for denne referansen (1 = ingen justering). */
  marketAdjustment: z.number().positive().nullable().optional(),
  /** Aktive annonser: opprinnelig prisantydning (kontant). Lavere nåværende pris betyr at annonsen er prisnedsatt. */
  originalAskingPrice: nullableMoney.optional(),
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

/** Sluttproduktets egenskaper i et scenario. */
export const ScenarioEndProductSchema = z.object({
  bedrooms: z.number().int().nonnegative().nullable(),
  /**
   * Sluttstandard etter scenarioet. Brukes automatisk av markedsvektingen. null/mangler = ikke dokumentert; markedsvektingen
   * bruker da en tydelig merket fallback utledet fra oppussingsnivået, og leder aldri til at verdien fremstår som dokumentert.
   */
  standardClass: z.enum(STANDARD_CLASSES).nullable().optional(),
  layoutNote: z.string(),
  kitchenChange: z.enum(CHANGE_LEVELS),
  bathChange: z.enum(CHANGE_LEVELS),
});
export type ScenarioEndProduct = z.infer<typeof ScenarioEndProductSchema>;

/**
 * Scenarioets egen risiko. Kommer i tillegg til objektets generelle risiko og brukes i scenario-rangeringen.
 * Enkelt og etterprøvbart: fire nivåer med kort begrunnelse – ingen egen risikomotor.
 * Et nivå som ikke er vurdert regnes som «uavklart» (konservativt), ikke som «middels».
 */
export const ScenarioRiskSchema = z.object({
  technical: z.enum(UNCERTAINTY_LEVELS),
  cost: z.enum(UNCERTAINTY_LEVELS),
  time: z.enum(UNCERTAINTY_LEVELS),
  approval: z.enum(UNCERTAINTY_LEVELS),
  note: z.string(),
});
export type ScenarioRisk = z.infer<typeof ScenarioRiskSchema>;

/**
 * Agentens begrunnede, begrensede justering av markedsankeret for kvalitative forhold modellen ikke fanger.
 * Agenten leverer ikke en egen salgsverdi – koden bruker justeringen (maks ±5 %) på ankeret og fastsetter low/base/high.
 */
export const AnchorAdjustmentSchema = z.object({
  pct: z.number().finite().min(-ANCHOR_ADJUSTMENT_MAX_PCT).max(ANCHOR_ADJUSTMENT_MAX_PCT),
  category: z.enum(ANCHOR_ADJUSTMENT_CATEGORIES),
  reason: z.string().min(20, 'Begrunn justeringen konkret (minst 20 tegn).'),
});
export type AnchorAdjustment = z.infer<typeof AnchorAdjustmentSchema>;

/** Agentens klassifisering av en referanse mot DETTE scenarioets sluttprodukt (planløsningslikhet varierer per scenario). */
export const ReferenceClassificationSchema = z.object({
  comparableId: z.string().min(1),
  layoutMatch: z.enum(LAYOUT_MATCHES).nullable(),
  note: z.string(),
});
export type ReferenceClassification = z.infer<typeof ReferenceClassificationSchema>;

/** Screening av et alternativt grep: hvert aspekt vurderes. Består ikke screeningen, tas grepet ikke med som scenario. */
export const ScenarioScreeningSchema = z.object({
  concept: z.enum(SCREENING_CONCEPTS),
  /** Antall ekstra gode soverom grepet gir. */
  addedBedrooms: z.number().int().nonnegative().nullable(),
  /** Badflytting er bare aktuelt når eksisterende bad uansett må totalrenoveres. */
  existingBathNeedsFullRenovation: z.boolean().nullable().optional(),
  checks: z.array(z.object({ aspect: z.enum(SCREENING_ASPECTS), result: z.enum(SCREENING_RESULTS), note: z.string() })),
});
export type ScenarioScreening = z.infer<typeof ScenarioScreeningSchema>;

/** Oversikt over scenariojakten: hva som ble vurdert og hvorfor det ble valgt eller avvist. */
export const ScenarioSearchSchema = z.object({
  status: z.enum(SCENARIO_SEARCH_STATUSES),
  considered: z.array(
    z.object({
      concept: z.enum(SCREENING_CONCEPTS),
      outcome: z.enum(['valgt', 'avvist']),
      reason: z.string(),
      scenarioId: z.string().nullable(),
    }),
  ),
});
export type ScenarioSearch = z.infer<typeof ScenarioSearchSchema>;

/**
 * Agentdefinert scenario: basis eller et alternativ (inntil to) med egne oppussingstiltak og sluttprodukt.
 * Eksisterende analyser uten `scenarios` virker via fallback (se `resolveAnalysisScenarios`).
 * Strengt skjema: økonomiske nøkkeltall (fortjeneste, maksbud osv.) kan ikke ligge i et scenario – de beregnes av motoren.
 *
 * Salgsverdi: koden fastsetter low/base/high (`resolveScenarioSale`) fra markedsreferanser, sluttprodukt og eventuell
 * begrenset `anchorAdjustment`. `sale` er agentens/fellesanalysens HISTORISKE estimat. Det brukes ikke som fasit når
 * markedsmotoren gir en verdi – bare som tydelig merket fallback når motoren ikke kan regne.
 */
export const AnalysisScenarioSchema = z.strictObject({
  id,
  kind: z.enum(SCENARIO_KINDS),
  level: z.enum(RENOVATION_LEVELS),
  title: z.string().min(1),
  description: z.string(),
  feasibility: z.enum(FEASIBILITY_STATUSES),
  feasibilityRationale: z.string(),
  /** Krav til avklaring/godkjenning før scenarioet kan regnes som gjennomførbart. */
  requirements: z.array(z.string()),
  requiresApproval: z.boolean(),
  endProduct: ScenarioEndProductSchema,
  items: z.array(RenovationItemSchema),
  /** Foreslått varighet for selve oppussingen (uten tid til økonomisk oppgjør). */
  suggestedMonths: z.number().positive().nullable(),
  vatIncluded: z.boolean(),
  /** Agentens/fellesanalysens historiske salgsestimat for sluttproduktet. Ikke fasit når markedsmotoren kan regne. */
  sale: SaleEstimateSchema.nullable().optional(),
  /** Begrenset, begrunnet justering av markedsankeret (maks ±5 %). */
  anchorAdjustment: AnchorAdjustmentSchema.nullable().optional(),
  /** Scenarioets egen risiko (teknisk, kostnad, tid, myndighet). Mangler = ikke vurdert (regnes som uavklart). */
  risk: ScenarioRiskSchema.optional(),
  uncertainty: z.object({ level: z.enum(UNCERTAINTY_LEVELS), note: z.string() }),
  /** Referansegrunnlag: id-er på sammenlignbare objekter i analysen som støtter salgsverdien. */
  referenceIds: z.array(z.string()),
  referenceNote: z.string(),
  /** Referanseklassifisering mot dette scenarioets sluttprodukt. */
  referenceClassification: z.array(ReferenceClassificationSchema).optional(),
  /** Screening av et alternativt grep (påkrevd i praksis for alternativer fra scenariojakten). */
  screening: ScenarioScreeningSchema.optional(),
});
export type AnalysisScenario = z.infer<typeof AnalysisScenarioSchema>;

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
  /** full = teknisk hovedanalyse. market_refresh = grundig markedsoppfriskning av en tidligere analyse (samme tekniske grunnlag). */
  analysisKind: z.enum(['full', 'market_refresh']).optional(),
  /** Hvilken analyseversjon en markedsoppfriskning bygger på. */
  derivedFromVersion: z.number().int().positive().nullable().optional(),
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
    /** Basis + inntil to alternativer. Mangler på eldre analyser (da brukes global `sale` som fallback). */
    scenarios: z.array(AnalysisScenarioSchema).max(3).optional(),
    defaultScenarioId: z.string().nullable().optional(),
    /** Hva scenariojakten vurderte og avviste. */
    scenarioSearch: ScenarioSearchSchema.optional(),
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
}).superRefine((a, ctx) => {
  for (const issue of validateScenarioSet(a.estimates.scenarios, new Set(a.comparables.map((c) => c.id)), a.estimates.scenarioSearch)) {
    ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
  }
});

const LaborModesSchema = z.object(Object.fromEntries(LABOR_CATEGORIES.map((c) => [c, z.enum(WORK_MODES)])) as Record<(typeof LABOR_CATEGORIES)[number], z.ZodEnum<{ selv: 'selv'; delvis: 'delvis'; innleid: 'innleid' }>>);

/** Kompetanse/ansvar for regulert arbeid, bekreftet per arbeidsområde. Ingen bekreftelse = arbeidet regnes som innleid. */
export const RegulatedCompetenceSchema = z.object(
  Object.fromEntries(REGULATED_LABOR_CATEGORIES.map((c) => [c, z.boolean()])) as Record<(typeof REGULATED_LABOR_CATEGORIES)[number], z.ZodBoolean>,
);
export type RegulatedCompetence = z.infer<typeof RegulatedCompetenceSchema>;

const ScenarioValuesObject = z.object({
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
  /** Total prosjektvarighet i måneder (oppussing + tid til økonomisk oppgjør). */
  months: z.number().finite().nullable(),
  /** Hvor mye av `months` som er tid fra ferdig oppussing til økonomisk oppgjør. null = ikke delt opp. */
  settlementMonths: z.number().finite().nullable(),
  monthlyCost: nullableMoney,
  interestPct: z.number().finite().nullable(),
  /** Låneandel (prosentpoeng) av kjøpesum og kjøpskostnader. */
  purchaseFinancingPct: z.number().finite().nullable(),
  /** Låneandel (prosentpoeng) av oppussing inkl. reserve. Gradvis trekk, snitt halvveis. */
  renovationFinancingPct: z.number().finite().nullable(),
  /** Om løpende kostnader (drift og renter) lånefinansieres. Standard: nei. */
  financeRunningCosts: z.boolean(),
  /** Tilgjengelig egenkapital – brukes til å vise finansieringsgap. */
  availableEquity: nullableMoney,
  saleBasis: z.enum(PRICE_BASES),
  saleLow: nullableMoney,
  saleBase: nullableMoney,
  saleHigh: nullableMoney,
  saleFixedCost: nullableMoney,
  saleCommissionPct: z.number().finite().nullable(),
  /** @deprecated Timeverdi (eldre modell). Styrer ikke lenger hovedøkonomien; egen tid er ikke en kostnad. */
  hourValue: nullableMoney,
  /** Minimum ønsket fortjeneste per egeninnsatstime (kr/t). */
  minProfitPerOwnHour: nullableMoney,
  /** Samlet team-innsats per uke (timer). */
  weeklyOwnHours: z.number().finite().nullable(),
  laborModes: LaborModesSchema,
  /** Maks egeninnsats: oppgrader ikke-regulert arbeid til «selv». Regulert arbeid er aldri gratis automatisk. */
  maxOwnWork: z.boolean(),
  /** Relevant kompetanse/ansvar bekreftet for dette arbeidsområdet (rør, elektro, bad/våtrom). Gis per område. */
  regulatedCompetence: RegulatedCompetenceSchema,
  /** Hvilket agentscenario (basis/alternativ) kalkylen er basert på. null = analysens basis. */
  analysisScenarioId: z.string().nullable(),
  profitTarget: nullableMoney,
  taxMode: z.enum(TAX_MODES),
  taxPct: z.number().finite().nullable(),
  startBid: nullableMoney,
  walkAway: nullableMoney,
  notes: z.string(),
});
/** Eldre rader (med `financingPct` osv.) migreres eksplisitt før validering – se `migrateScenarioValuesRaw`. */
export const ScenarioValuesSchema = z.preprocess((raw) => migrateScenarioValuesRaw(raw), ScenarioValuesObject);
export type ScenarioValues = z.infer<typeof ScenarioValuesObject>;

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
  /** Når brukerens analyse ble gjort (vises som analysedato). Mangler for eldre rader – da brukes analysens egen dato. */
  analyzedAt: isoDateTime.nullable().optional(),
  /** Siste analyseversjon brukeren har sett – brukes til varsel om oppdaterte data. */
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

const ProfileDefaultsObject = z.object({
  buyerTypeApartment: z.enum(BUYER_TYPES),
  buyerTypeHouse: z.enum(BUYER_TYPES),
  /** Standard total prosjektvarighet (måneder), inkludert tid til økonomisk oppgjør. */
  months: z.number().positive(),
  /** Tid fra ferdig oppussing til økonomisk oppgjør (måneder). Standard 3–4. */
  saleSettlementMonths: z.number().min(0).max(12),
  interestPct: z.number().min(0),
  purchaseFinancingPct: z.number().min(0).max(100),
  renovationFinancingPct: z.number().min(0).max(100),
  financeRunningCosts: z.boolean(),
  availableEquity: z.number().min(0),
  weeklyOwnHours: z.number().min(0).max(168),
  minProfitPerOwnHour: z.number().min(0),
  laborModes: LaborModesSchema,
  maxOwnWork: z.boolean(),
  regulatedCompetence: RegulatedCompetenceSchema,
  reservePct: z.number().min(0),
  /** @deprecated Eldre timeverdi. Ikke i bruk i hovedøkonomien. */
  hourValue: z.number().min(0).optional(),
  profitTarget: z.number(),
  saleFixedCost: z.number().min(0),
  saleCommissionPct: z.number().min(0),
  buyFees: z.number().min(0),
  homeArea: z.string(),
});
export const ProfileDefaultsSchema = z.preprocess((raw) => migrateProfileDefaultsRaw(raw), ProfileDefaultsObject);
export type ProfileDefaults = z.infer<typeof ProfileDefaultsObject>;

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

/** Kjøp av kurs. Engangsbetaling som gir varig tilgang – uavhengig av abonnementet. */
export const CoursePurchaseSchema = z.object({
  id,
  userId: id,
  courseId: z.string(),
  /** Beløp betalt i hele kroner. */
  amountPaid: z.number().int().min(0),
  provider: z.literal('vipps'),
  /** Vipps' betalings-ID (reference). */
  paymentId: z.string(),
  purchasedAt: isoDateTime,
});
export type CoursePurchase = z.infer<typeof CoursePurchaseSchema>;

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
  /** Hvordan hver bruker belastes når jobben er ferdig (markedsoppfriskning). Mangler = ny analyse. */
  charges: z.record(z.string(), z.enum(['new_analysis', 'refresh'])).optional(),
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
