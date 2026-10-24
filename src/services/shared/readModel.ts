import { FRESHNESS } from '../../config/freshness';
import { decideRefresh, technicalReasons, type RefreshDecision, type RefreshInput, type TechnicalChangeSignals, type ViewingChangeSignals, type ViewingEvent } from '../../domain/refreshPolicy';
import type { AnalysisJob, CalendarOverride, PrivateEvent, Property, PropertySnapshot, Scenario, SharedAnalysis, UserProperty, UserRisk, Viewing } from '../../domain/schemas';
import { deriveBidDay } from '../../lib/bidDay';
import type { AnalysisMeta, MyPropertyItem, PropertyBundle, Staleness } from '../types';

/**
 * Lesemodell: de radene som trengs for å bygge objektlisten og objektsiden. Mockens `DbState` oppfyller den strukturelt, og Supabase-laget
 * bygger en tilsvarende modell av radene det har hentet (alltid bare brukerens egne og de felles radene RLS gir tilgang til). Funksjonene
 * under er rene og delt, slik at demo og produksjon bygger `PropertyBundle`/`MyPropertyItem` på nøyaktig samme måte.
 */
/** Det som trengs for å vite hvilke analyseversjoner som finnes og hvor gamle de er – uten de tunge feltene (estimater, risikoer, rapport …). */
export type AnalysisHead = Pick<
  SharedAnalysis,
  'id' | 'propertyId' | 'version' | 'status' | 'visibility' | 'ownerId' | 'origin' | 'analysisKind' | 'schemaVersion' | 'modelVersion' | 'createdAt' | 'publishedAt' | 'recommendation'
>;

export interface ReadModel {
  properties: Property[];
  snapshots: PropertySnapshot[];
  /** Fulle analyser. I produksjon bare de som trengs (siste publiserte og grunnlaget for primærscenarioet); se `analysisHeads`. */
  analyses: SharedAnalysis[];
  /**
   * Alle analyseversjoner som kan leses, bare metadata. Mangler feltet, brukes `analyses` (demoen har alt i full form). Versjonslister og
   * oppfriskingsbeslutningen bygger på dette, så en markedsoppfriskning eller en eldre versjon alltid teller selv om den ikke er hentet i full form.
   */
  analysisHeads?: AnalysisHead[];
  viewings: Viewing[];
  jobs: AnalysisJob[];
  scenarios: Scenario[];
  calendarOverrides: CalendarOverride[];
  privateEvents: PrivateEvent[];
  userRisks: UserRisk[];
  /**
   * Signaler fra kildehentingen om endringer siden forrige kontroll (teknisk grunnlag, visninger), per FINN-ID. I demoen settes de via
   * testkontrollene; i produksjon kommer de fra kildehentingen, som ikke er koblet til ennå (da er de tomme).
   */
  demo: { technicalChangeSignals?: Record<string, TechnicalChangeSignals>; viewingChangeSignals?: Record<string, ViewingChangeSignals> };
}

const headsOf = (s: Readonly<ReadModel>): readonly AnalysisHead[] => s.analysisHeads ?? s.analyses;

export function latestSharedAnalysis(s: Readonly<ReadModel>, propertyId: string): SharedAnalysis | null {
  let best: AnalysisHead | null = null;
  for (const a of headsOf(s)) {
    if (a.propertyId !== propertyId || a.visibility !== 'shared' || a.status !== 'published') continue;
    if (!best || a.version > best.version) best = a;
  }
  // Den nyeste publiserte analysen må finnes i full form; leseren (produksjon) henter alltid den.
  return best ? s.analyses.find((a) => a.id === best.id) ?? null : null;
}

export function latestSnapshot(s: Readonly<ReadModel>, propertyId: string) {
  let best = null as PropertySnapshot | null;
  for (const sn of s.snapshots) if (sn.propertyId === propertyId && (!best || sn.version > best.version)) best = sn;
  return best;
}

export function analysisMeta(a: AnalysisHead): AnalysisMeta {
  return {
    id: a.id,
    version: a.version,
    status: a.status,
    visibility: a.visibility,
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
    schemaVersion: a.schemaVersion,
    modelVersion: a.modelVersion,
    recommendation: a.recommendation,
    origin: a.origin,
  };
}

/** Lesetilgang til en analyse: felles analyser for innloggede, private utkast kun for eier. */
export function canReadAnalysis(a: Pick<SharedAnalysis, 'visibility' | 'status' | 'ownerId'>, userId: string): boolean {
  return a.visibility === 'shared' ? a.status !== 'draft' : a.ownerId === userId;
}

export function isModelCompatible(a: Pick<SharedAnalysis, 'schemaVersion' | 'modelVersion'>): boolean {
  const major = Number(a.modelVersion.split('.')[0]);
  return FRESHNESS.compatibleSchemaVersions.includes(a.schemaVersion) && major === FRESHNESS.compatibleModelMajor;
}

/**
 * Inndata til den samlede oppfriskingsbeslutningen (`decideRefresh`), bygget fra lagrede data. Alle kodeveier bruker denne,
 * slik at reglene aldri avviker mellom forespørsel om analyse, oppfrisking, koblet analyse og varsler på objektsiden.
 */
export function refreshInputFor(s: Readonly<ReadModel>, propertyId: string, now: Date): RefreshInput {
  const latest = latestSharedAnalysis(s, propertyId);
  const snap = latestSnapshot(s, propertyId);
  let lastMain: string | null = null;
  let lastMarket: string | null = null;
  for (const a of headsOf(s)) {
    if (a.propertyId !== propertyId || a.visibility !== 'shared' || a.status === 'draft') continue;
    const at = a.publishedAt ?? a.createdAt;
    if (a.analysisKind === 'market_refresh') {
      if (lastMarket === null || at > lastMarket) lastMarket = at;
    } else if (lastMain === null || at > lastMain) lastMain = at;
  }
  const finnId = s.properties.find((p) => p.id === propertyId)?.finnId;
  const lastCheckAt = snap?.observedAt ?? null;
  // Offisielle visningshendelser siden siste kontroll: «holdt» utledes av lagrede visninger; endret/avlyst/ny kommer fra kilden.
  const viewingEvents: ViewingEvent[] = [];
  if (lastCheckAt !== null) {
    const checked = Date.parse(lastCheckAt);
    const held = s.viewings.some((v) => v.propertyId === propertyId && v.kind === 'official' && v.status !== 'avlyst' && Date.parse(v.start) > checked && Date.parse(v.start) <= now.getTime());
    if (held) viewingEvents.push('held');
  }
  const sig = finnId ? s.demo.viewingChangeSignals?.[finnId] : undefined;
  if (sig?.changed) viewingEvents.push('changed');
  if (sig?.cancelled) viewingEvents.push('cancelled');
  if (sig?.added) viewingEvents.push('added');
  return {
    now,
    hasMainAnalysis: latest !== null,
    compatible: latest !== null && isModelCompatible(latest),
    lastMainAnalysisAt: lastMain,
    lastMarketRefreshAt: lastMarket,
    lastCheckAt,
    viewingEvents,
    technical: finnId ? s.demo.technicalChangeSignals?.[finnId] ?? null : null,
    saleStatus: snap?.saleStatus ?? null,
  };
}

export function decideRefreshFor(s: Readonly<ReadModel>, propertyId: string, now: Date): RefreshDecision {
  return decideRefresh(refreshInputFor(s, propertyId, now));
}

/** Signaler om endret teknisk grunnlag for et objekt (demo: satt eksplisitt; produksjon: fra kildehentingen). */
export function technicalSignals(s: Readonly<ReadModel>, propertyId: string) {
  const finnId = s.properties.find((p) => p.id === propertyId)?.finnId;
  return finnId ? s.demo.technicalChangeSignals?.[finnId] ?? null : null;
}

export function staleness(s: Readonly<ReadModel>, a: SharedAnalysis, now: Date): Staleness {
  const analysisAgeDays = (now.getTime() - Date.parse(a.publishedAt ?? a.createdAt)) / 86_400_000;
  const snap = latestSnapshot(s, a.propertyId);
  const volatileAgeHours = snap ? (now.getTime() - Date.parse(snap.observedAt)) / 3_600_000 : null;
  const reasons = technicalReasons({ latest: a, compatible: isModelCompatible(a), signals: technicalSignals(s, a.propertyId) });
  return {
    analysisAgeDays,
    refresh: decideRefreshFor(s, a.propertyId, now),
    marketRefreshDue: analysisAgeDays > FRESHNESS.marketRefreshAfterDays,
    technicalReanalysis: { needed: reasons.length > 0, reasons },
    volatileAgeHours,
    volatileStale: volatileAgeHours === null || volatileAgeHours > FRESHNESS.volatileMaxAgeHours,
  };
}

export function buildBundle(s: Readonly<ReadModel>, propertyId: string): PropertyBundle | null {
  const property = s.properties.find((p) => p.id === propertyId);
  if (!property) return null;
  const latest = latestSharedAnalysis(s, propertyId);
  const jobs = s.jobs.filter((j) => j.propertyId === propertyId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return {
    property,
    snapshot: latestSnapshot(s, propertyId),
    snapshots: s.snapshots.filter((x) => x.propertyId === propertyId).sort((a, b) => a.version - b.version),
    viewings: s.viewings.filter((v) => v.propertyId === propertyId).sort((a, b) => a.start.localeCompare(b.start)),
    latestAnalysis: latest,
    versions: headsOf(s)
      .filter((a) => a.propertyId === propertyId && a.visibility === 'shared' && a.status !== 'draft')
      .sort((a, b) => b.version - a.version)
      .map(analysisMeta),
    // Brukerens egne «koblede» analysejobber er private og vises bare for brukeren selv (se buildMyItem).
    activeJob: jobs.find((j) => j.type !== 'linked_analysis' && (j.status === 'running' || j.status === 'queued')) ?? null,
    lastFailedJob: jobs.filter((j) => j.type !== 'linked_analysis')[0]?.status === 'failed' ? jobs.filter((j) => j.type !== 'linked_analysis')[0] : null,
  };
}

export function buildMyItem(s: Readonly<ReadModel>, userId: string, link: UserProperty, now: Date): MyPropertyItem | null {
  const bundle = buildBundle(s, link.propertyId);
  if (!bundle) return null;
  const scenarios = s.scenarios.filter((x) => x.ownerId === userId && x.propertyId === link.propertyId);
  const primary = scenarios.find((x) => x.id === link.primaryScenarioId) ?? scenarios[0] ?? null;
  const baseAnalysis = primary ? s.analyses.find((a) => a.id === primary.analysisId && canReadAnalysis(a, userId)) ?? null : bundle.latestAnalysis;
  // Brukerens egen analyse er «under arbeid» til jobben er ferdig – akkurat som for en bolig uten analyse.
  const own = s.jobs
    .filter((j) => j.type === 'linked_analysis' && j.createdBy === userId && j.propertyId === link.propertyId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const pendingOwn = own && (own.status === 'running' || own.status === 'queued') && !primary ? own : null;
  const failedOwn = own && own.status === 'failed' && !primary ? own : null;
  const masked = pendingOwn || failedOwn ? { latestAnalysis: null, snapshot: null, snapshots: [], viewings: [], versions: [] } : {};
  return {
    ...bundle,
    ...masked,
    activeJob: pendingOwn ?? bundle.activeJob,
    lastFailedJob: failedOwn ?? bundle.lastFailedJob,
    link,
    baseAnalysis: pendingOwn || failedOwn ? null : baseAnalysis,
    primaryScenario: primary,
    scenarioCount: scenarios.length,
    bidDay: deriveBidDay(link.propertyId, pendingOwn || failedOwn ? [] : bundle.viewings),
    bidOverride: s.calendarOverrides.find((o) => o.userId === userId && o.propertyId === link.propertyId) ?? null,
    privateEvents: s.privateEvents.filter((e) => e.userId === userId && e.propertyId === link.propertyId),
    riskEdits: s.userRisks.filter((r) => r.userId === userId && r.propertyId === link.propertyId),
    refreshDecision: decideRefreshFor(s, link.propertyId, now),
    technicalReanalysis: (() => {
      const reasons = technicalReasons({ latest: bundle.latestAnalysis, compatible: bundle.latestAnalysis !== null && isModelCompatible(bundle.latestAnalysis), signals: technicalSignals(s, link.propertyId) });
      return { needed: reasons.length > 0 && bundle.latestAnalysis !== null, reasons };
    })(),
  };
}
