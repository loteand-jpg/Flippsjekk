import { z, type ZodType } from 'zod';
import {
  ANALYSIS_SCHEMA_VERSION,
  CalendarOverrideSchema,
  PrivateEventSchema,
  PropertySchema,
  PropertySnapshotSchema,
  ScenarioSchema,
  SharedAnalysisSchema,
  UserPropertySchema,
  UserRiskSchema,
  ViewingSchema,
  type CalendarOverride,
  type PrivateEvent,
  type Property,
  type PropertySnapshot,
  type Scenario,
  type SharedAnalysis,
  type UserProperty,
  type UserRisk,
  type Viewing,
} from '../../domain/schemas';
import { ServiceError } from '../types';

/**
 * Radlaget mot Supabase (PostgREST): snake_case-rader fra databasen ↔ appens domenemodell. ALT som kommer fra databasen er eksterne data og går
 * gjennom to trinn før det brukes i appen: (1) rad-skjemaet under (riktige kolonner og grunntyper, jsonb som `unknown`), og (2) det eksisterende
 * Zod-skjemaet for domenetypen. Rå rader sprer seg aldri videre i appen. Ugyldige data gir en kontrollert `ServiceError`, aldri korrupte domenedata.
 *
 * Radtypene er håndskrevne og smale (de utledes av rad-skjemaene), ikke genererte Supabase-typer: Claude har ikke tilgang til det faktiske
 * prosjektet. En test (rows.test.ts) kontrollerer mot det migrerte skjemaet at hver kolonne vi leser finnes, og at ingen kolonner glemmes.
 * `null` fra databasen betyr «ukjent» og blir aldri 0 eller tom streng. Beregninger (økonomi, buddag) gjøres ikke her.
 */

// --- grunntyper i rad-skjemaene ---------------------------------------------------------------------------------------------
const text = z.string();
const textN = z.string().nullable();
/** timestamptz fra PostgREST er en ISO-streng (f.eks. «2026-10-22T12:00:00.123456+00:00»). */
const ts = z.string();
const tsN = z.string().nullable();
/** numeric/integer: PostgREST leverer tall; en streng med tall godtas også (bigint/numeric kan i noen oppsett komme som tekst). */
const num = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]).transform(Number);
const numN = num.nullable();
const bool = z.boolean();
const json = z.unknown();

const iso = (v: string): string => {
  const t = Date.parse(v);
  return Number.isNaN(t) ? v : new Date(t).toISOString();
};
const isoN = (v: string | null): string | null => (v === null ? null : iso(v));

// --- rad-skjemaer ------------------------------------------------------------------------------------------------------------
export const PropertyRowSchema = z.object({
  id: text,
  finn_id: text,
  canonical_url: text,
  address: text,
  postal_code: textN,
  city: text,
  district: textN,
  municipality: text,
  country_code: text,
  property_type: text,
  tenure: text,
  data_origin: text,
  created_at: ts,
});

export const SnapshotRowSchema = z.object({
  id: text,
  property_id: text,
  version: num,
  observed_at: ts,
  fetched_at: ts,
  source_url: textN,
  origin: text,
  asking_price: numN,
  shared_debt: numN,
  listing_total_incl_costs: numN,
  monthly_common_costs: numN,
  area_bra_i: numN,
  rooms: numN,
  bedrooms: numN,
  floor: numN,
  build_year: numN,
  plot_area: numN,
  sale_status: text,
  sale_status_note: textN,
  energy_label: textN,
  fact_sources: json,
});

export const ViewingRowSchema = z.object({
  id: text,
  property_id: text,
  kind: text,
  start_at: ts,
  end_at: tsN,
  status: text,
  source_id: textN,
  source_label: text,
  verified_at: ts,
  replaces_viewing_id: textN,
  note: textN,
});

/** Metadata om en analyse (uten de tunge jsonb-feltene) – brukes til versjonslister og til å finne siste publiserte. */
export const AnalysisMetaRowSchema = z.object({
  id: text,
  property_id: text,
  version: num,
  status: text,
  visibility: text,
  owner_id: textN,
  origin: text,
  analysis_kind: textN,
  schema_version: num,
  model_version: text,
  created_at: ts,
  published_at: tsN,
  recommendation: textN,
});

export const AnalysisRowSchema = AnalysisMetaRowSchema.extend({
  snapshot_id: text,
  derived_from_version: numN,
  recommendation_rationale: text,
  summary: text,
  strategy: text,
  conditions: json,
  estimates: json,
  risks: json,
  checklist: json,
  comparables: json,
  sources: json,
  facts: json,
  assumptions: json,
  uncertainties: json,
  report: json,
  bid_steps: json,
  next_steps: json,
  raw_import: json,
  unmapped_fields: json,
  history: json,
});

export const UserPropertyRowSchema = z.object({
  id: text,
  user_id: text,
  property_id: text,
  favorite: bool,
  work_status: text,
  notes: text,
  primary_scenario_id: textN,
  label: textN,
  archived_at: tsN,
  added_at: ts,
  updated_at: ts,
  analyzed_at: tsN,
  last_seen_analysis_version: numN,
  checks: json,
});

export const ScenarioRowSchema = z.object({
  id: text,
  owner_id: text,
  property_id: text,
  analysis_id: text,
  analysis_version: num,
  name: text,
  locked: bool,
  values: json,
  created_at: ts,
  updated_at: ts,
});

export const UserRiskRowSchema = z.object({
  id: text,
  user_id: text,
  property_id: text,
  base_risk_id: textN,
  removed: bool,
  title: text,
  category: text,
  level: numN,
  cost_low: numN,
  cost_high: numN,
  rationale: text,
  action: text,
  created_at: ts,
  updated_at: ts,
});

export const PrivateEventRowSchema = z.object({
  id: text,
  user_id: text,
  property_id: text,
  kind: text,
  start_at: ts,
  end_at: tsN,
  note: text,
  confirmed: bool,
  created_at: ts,
});

export const CalendarOverrideRowSchema = z.object({
  id: text,
  user_id: text,
  property_id: text,
  event_key: text,
  start_at: ts,
  note: text,
  origin: text,
  derived_start_at_override: tsN,
  created_at: ts,
});

export type PropertyRow = z.infer<typeof PropertyRowSchema>;
export type SnapshotRow = z.infer<typeof SnapshotRowSchema>;
export type ViewingRow = z.infer<typeof ViewingRowSchema>;
export type AnalysisMetaRow = z.infer<typeof AnalysisMetaRowSchema>;
export type AnalysisRow = z.infer<typeof AnalysisRowSchema>;
export type UserPropertyRow = z.infer<typeof UserPropertyRowSchema>;
export type ScenarioRow = z.infer<typeof ScenarioRowSchema>;
export type UserRiskRow = z.infer<typeof UserRiskRowSchema>;
export type PrivateEventRow = z.infer<typeof PrivateEventRowSchema>;
export type CalendarOverrideRow = z.infer<typeof CalendarOverrideRowSchema>;

/** Tabellnavn → kolonnene vi leser (utledet av rad-skjemaet, så select og mapping aldri kan komme ut av takt). */
export const TABLES = {
  properties: PropertyRowSchema,
  property_snapshots: SnapshotRowSchema,
  viewings: ViewingRowSchema,
  analyses: AnalysisRowSchema,
  user_properties: UserPropertyRowSchema,
  scenarios: ScenarioRowSchema,
  user_risks: UserRiskRowSchema,
  private_events: PrivateEventRowSchema,
  calendar_overrides: CalendarOverrideRowSchema,
} as const;
export type TableName = keyof typeof TABLES;

const columnsOf = (schema: { shape: Record<string, unknown> }): string => Object.keys(schema.shape).join(',');
export const SELECT = {
  properties: columnsOf(PropertyRowSchema),
  property_snapshots: columnsOf(SnapshotRowSchema),
  viewings: columnsOf(ViewingRowSchema),
  analysis_meta: columnsOf(AnalysisMetaRowSchema),
  analyses: columnsOf(AnalysisRowSchema),
  user_properties: columnsOf(UserPropertyRowSchema),
  scenarios: columnsOf(ScenarioRowSchema),
  user_risks: columnsOf(UserRiskRowSchema),
  private_events: columnsOf(PrivateEventRowSchema),
  calendar_overrides: columnsOf(CalendarOverrideRowSchema),
} as const;

// --- felles parsing -------------------------------------------------------------------------------------------------------------
function invalid(table: string, stage: 'rad' | 'domene', issues: z.core.$ZodIssue[]): ServiceError {
  // Bare stier og kode i `details` – aldri verdiene (kan være private data).
  return new ServiceError('validation', `Dataene fra databasen (${table}) har et uventet format. Prøv igjen senere, eller kontakt support hvis feilen vedvarer.`, {
    table,
    stage,
    issues: issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), code: i.code })),
  });
}

function decode<Row, T>(table: string, rowSchema: ZodType<Row, unknown>, domain: ZodType<T>, build: (row: Row) => unknown, raw: unknown): T {
  const row = rowSchema.safeParse(raw);
  if (!row.success) throw invalid(table, 'rad', row.error.issues);
  const out = domain.safeParse(build(row.data));
  if (!out.success) throw invalid(table, 'domene', out.error.issues);
  return out.data;
}

// --- rad → domene --------------------------------------------------------------------------------------------------------------
export function propertyFromRow(raw: unknown): Property {
  return decode('properties', PropertyRowSchema, PropertySchema, (r) => ({
    id: r.id,
    finnId: r.finn_id,
    canonicalUrl: r.canonical_url,
    address: r.address,
    postalCode: r.postal_code,
    city: r.city,
    district: r.district,
    municipality: r.municipality,
    countryCode: r.country_code,
    propertyType: r.property_type,
    tenure: r.tenure,
    dataOrigin: r.data_origin,
    createdAt: iso(r.created_at),
  }), raw);
}

export function snapshotFromRow(raw: unknown): PropertySnapshot {
  return decode('property_snapshots', SnapshotRowSchema, PropertySnapshotSchema, (r) => ({
    id: r.id,
    propertyId: r.property_id,
    version: r.version,
    observedAt: iso(r.observed_at),
    fetchedAt: iso(r.fetched_at),
    sourceUrl: r.source_url,
    origin: r.origin,
    askingPrice: r.asking_price,
    sharedDebt: r.shared_debt,
    listingTotalInclCosts: r.listing_total_incl_costs,
    monthlyCommonCosts: r.monthly_common_costs,
    areaBRAi: r.area_bra_i,
    rooms: r.rooms,
    bedrooms: r.bedrooms,
    floor: r.floor,
    buildYear: r.build_year,
    plotArea: r.plot_area,
    saleStatus: r.sale_status,
    saleStatusNote: r.sale_status_note,
    energyLabel: r.energy_label,
    factSources: r.fact_sources,
  }), raw);
}

export function viewingFromRow(raw: unknown): Viewing {
  return decode('viewings', ViewingRowSchema, ViewingSchema, (r) => ({
    id: r.id,
    propertyId: r.property_id,
    kind: r.kind,
    start: iso(r.start_at),
    end: isoN(r.end_at),
    status: r.status,
    sourceId: r.source_id,
    sourceLabel: r.source_label,
    verifiedAt: iso(r.verified_at),
    replacesViewingId: r.replaces_viewing_id,
    note: r.note,
  }), raw);
}

/** Felt som er valgfrie (ikke nullable) i domenet utelates når databasen har null, i stedet for å bli `null`. */
const omitNull = <K extends string, V>(key: K, value: V | null): Partial<Record<K, V>> => (value === null ? {} : ({ [key]: value } as Record<K, V>));

export function analysisFromRow(raw: unknown): SharedAnalysis {
  return decode('analyses', AnalysisRowSchema, SharedAnalysisSchema, (r) => ({
    id: r.id,
    propertyId: r.property_id,
    snapshotId: r.snapshot_id,
    version: r.version,
    schemaVersion: r.schema_version,
    modelVersion: r.model_version,
    status: r.status,
    visibility: r.visibility,
    ownerId: r.owner_id,
    origin: r.origin,
    ...omitNull('analysisKind', r.analysis_kind),
    ...omitNull('derivedFromVersion', r.derived_from_version),
    createdAt: iso(r.created_at),
    publishedAt: isoN(r.published_at),
    recommendation: r.recommendation,
    recommendationRationale: r.recommendation_rationale,
    summary: r.summary,
    strategy: r.strategy,
    conditions: r.conditions,
    estimates: r.estimates,
    risks: r.risks,
    checklist: r.checklist,
    comparables: r.comparables,
    sources: r.sources,
    facts: r.facts,
    assumptions: r.assumptions,
    uncertainties: r.uncertainties,
    report: r.report,
    bidSteps: r.bid_steps,
    nextSteps: r.next_steps,
    ...omitNull('rawImport', r.raw_import === undefined ? null : r.raw_import),
    ...omitNull('unmappedFields', r.unmapped_fields === undefined ? null : r.unmapped_fields),
    ...omitNull('history', r.history === undefined ? null : r.history),
  }), raw);
}

/** Metadata om en analyseversjon (samme felt som `AnalysisHead` i den delte lesemodellen). */
export type AnalysisMetaParts = Pick<
  SharedAnalysis,
  'id' | 'propertyId' | 'version' | 'status' | 'visibility' | 'ownerId' | 'origin' | 'analysisKind' | 'schemaVersion' | 'modelVersion' | 'createdAt' | 'publishedAt' | 'recommendation'
>;

const AnalysisMetaPartsSchema = z.object({
  id: z.string().min(1),
  propertyId: z.string().min(1),
  version: z.number().int().positive(),
  status: z.enum(['published', 'superseded', 'draft']),
  visibility: z.enum(['shared', 'private']),
  ownerId: z.string().nullable(),
  origin: z.enum(['agent', 'demo', 'synthetic', 'import_v1']),
  analysisKind: z.enum(['full', 'market_refresh']).optional(),
  schemaVersion: z.literal(ANALYSIS_SCHEMA_VERSION),
  modelVersion: z.string().min(1),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
  recommendation: z.enum(['interessant', 'folg_med', 'avklar_forst', 'avsta']).nullable(),
});

export function analysisMetaFromRow(raw: unknown): AnalysisMetaParts {
  return decode('analyses', AnalysisMetaRowSchema, AnalysisMetaPartsSchema as ZodType<AnalysisMetaParts>, (r) => ({
    id: r.id,
    propertyId: r.property_id,
    version: r.version,
    status: r.status,
    visibility: r.visibility,
    ownerId: r.owner_id,
    origin: r.origin,
    ...omitNull('analysisKind', r.analysis_kind),
    schemaVersion: r.schema_version,
    modelVersion: r.model_version,
    createdAt: iso(r.created_at),
    publishedAt: isoN(r.published_at),
    recommendation: r.recommendation,
  }), raw);
}

export function userPropertyFromRow(raw: unknown): UserProperty {
  return decode('user_properties', UserPropertyRowSchema, UserPropertySchema, (r) => ({
    id: r.id,
    userId: r.user_id,
    propertyId: r.property_id,
    favorite: r.favorite,
    workStatus: r.work_status,
    notes: r.notes,
    primaryScenarioId: r.primary_scenario_id,
    label: r.label,
    archivedAt: isoN(r.archived_at),
    addedAt: iso(r.added_at),
    updatedAt: iso(r.updated_at),
    analyzedAt: isoN(r.analyzed_at),
    lastSeenAnalysisVersion: r.last_seen_analysis_version,
    checks: r.checks,
  }), raw);
}

export function scenarioFromRow(raw: unknown): Scenario {
  return decode('scenarios', ScenarioRowSchema, ScenarioSchema, (r) => ({
    id: r.id,
    ownerId: r.owner_id,
    propertyId: r.property_id,
    analysisId: r.analysis_id,
    analysisVersion: r.analysis_version,
    name: r.name,
    // Som i mocken: `locked` finnes bare på det låste scenarioet.
    ...(r.locked ? { locked: true } : {}),
    values: r.values,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }), raw);
}

export function userRiskFromRow(raw: unknown): UserRisk {
  return decode('user_risks', UserRiskRowSchema, UserRiskSchema, (r) => ({
    id: r.id,
    userId: r.user_id,
    propertyId: r.property_id,
    baseRiskId: r.base_risk_id,
    removed: r.removed,
    title: r.title,
    category: r.category,
    level: r.level,
    costLow: r.cost_low,
    costHigh: r.cost_high,
    rationale: r.rationale,
    action: r.action,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }), raw);
}

export function privateEventFromRow(raw: unknown): PrivateEvent {
  return decode('private_events', PrivateEventRowSchema, PrivateEventSchema, (r) => ({
    id: r.id,
    userId: r.user_id,
    propertyId: r.property_id,
    kind: r.kind,
    start: iso(r.start_at),
    end: isoN(r.end_at),
    note: r.note,
    confirmed: r.confirmed,
    createdAt: iso(r.created_at),
  }), raw);
}

export function calendarOverrideFromRow(raw: unknown): CalendarOverride {
  return decode('calendar_overrides', CalendarOverrideRowSchema, CalendarOverrideSchema, (r) => ({
    id: r.id,
    userId: r.user_id,
    propertyId: r.property_id,
    eventKey: r.event_key,
    start: iso(r.start_at),
    note: r.note,
    origin: r.origin,
    derivedStartAtOverride: isoN(r.derived_start_at_override),
    createdAt: iso(r.created_at),
  }), raw);
}
