import { buildBaseValues } from '../../calc/scenario';
import { FRESHNESS } from '../../config/freshness';
import { getPlan } from '../../config/plans';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import type { MockDatabase, DbState } from '../../data/db';
import { decideRefresh, technicalReasons, type RefreshDecision, type RefreshInput, type ViewingEvent } from '../../domain/refreshPolicy';
import type { Scenario, SharedAnalysis, UserProperty } from '../../domain/schemas';
import { deriveBidDay } from '../../lib/bidDay';
import type { Clock } from '../../lib/clock';
import { uuid } from '../../lib/ids';
import {
  ServiceError,
  type AnalysisMeta,
  type Entitlements,
  type MyPropertyItem,
  type PropertyBundle,
  type Staleness,
} from '../types';

/**
 * Felles kontekst for mocktjenestene. Simulerer serversiden: den kjenner innlogget
 * bruker via sesjonen og håndhever eierskap og rettigheter. Dette er demo – lokal
 * filtrering i nettleseren er ikke sikkerhet. I produksjon gjøres dette av RLS/server.
 */
export class MockContext {
  constructor(
    readonly db: MockDatabase,
    readonly clock: Clock,
    readonly latencyMs: number,
    readonly jobTiming: { stepMs: number; refreshStepMs: number },
  ) {}

  async delay(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  now(): Date {
    return this.clock.now();
  }

  maybeUid(): string | null {
    return this.db.read((s) => s.session.userId);
  }

  uid(): string {
    const id = this.maybeUid();
    if (!id) throw new ServiceError('not_authenticated', 'Du må logge inn for å fortsette.');
    return id;
  }
}

export function latestSharedAnalysis(s: Readonly<DbState>, propertyId: string): SharedAnalysis | null {
  let best: SharedAnalysis | null = null;
  for (const a of s.analyses) {
    if (a.propertyId !== propertyId || a.visibility !== 'shared' || a.status !== 'published') continue;
    if (!best || a.version > best.version) best = a;
  }
  return best;
}

export function latestSnapshot(s: Readonly<DbState>, propertyId: string) {
  let best = null as DbState['snapshots'][number] | null;
  for (const sn of s.snapshots) if (sn.propertyId === propertyId && (!best || sn.version > best.version)) best = sn;
  return best;
}

export function analysisMeta(a: SharedAnalysis): AnalysisMeta {
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
export function canReadAnalysis(a: SharedAnalysis, userId: string): boolean {
  return a.visibility === 'shared' ? a.status !== 'draft' : a.ownerId === userId;
}

export function isModelCompatible(a: SharedAnalysis): boolean {
  const major = Number(a.modelVersion.split('.')[0]);
  return FRESHNESS.compatibleSchemaVersions.includes(a.schemaVersion) && major === FRESHNESS.compatibleModelMajor;
}

/**
 * Inndata til den samlede oppfriskingsbeslutningen (`decideRefresh`), bygget fra lagrede data. Alle kodeveier bruker denne,
 * slik at reglene aldri avviker mellom forespørsel om analyse, oppfrisking, koblet analyse og varsler på objektsiden.
 */
export function refreshInputFor(s: Readonly<DbState>, propertyId: string, now: Date): RefreshInput {
  const latest = latestSharedAnalysis(s, propertyId);
  const snap = latestSnapshot(s, propertyId);
  let lastMain: string | null = null;
  let lastMarket: string | null = null;
  for (const a of s.analyses) {
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

export function decideRefreshFor(s: Readonly<DbState>, propertyId: string, now: Date): RefreshDecision {
  return decideRefresh(refreshInputFor(s, propertyId, now));
}

/** Signaler om endret teknisk grunnlag for et objekt (demo: satt eksplisitt; produksjon: fra kildehentingen). */
export function technicalSignals(s: Readonly<DbState>, propertyId: string) {
  const finnId = s.properties.find((p) => p.id === propertyId)?.finnId;
  return finnId ? s.demo.technicalChangeSignals?.[finnId] ?? null : null;
}

export function staleness(s: Readonly<DbState>, a: SharedAnalysis, now: Date): Staleness {
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

export function computeEntitlements(s: Readonly<DbState>, userId: string | null, now: Date): Entitlements {
  const none: Entitlements = {
    access: 'read_only',
    reason: userId ? 'no_subscription' : 'not_signed_in',
    plan: null,
    periodStart: null,
    periodEnd: null,
    canRequestNewAnalysis: false,
    canReuseAnalysis: false,
    canRefresh: false,
    canEditScenarios: false,
    canExport: Boolean(userId),
    limits: { newAnalyses: 0, refreshes: 0, scenariosPerProperty: 0 },
    used: { newAnalyses: 0, refreshes: 0, reuses: 0, pendingNewAnalyses: 0 },
    remaining: { newAnalyses: 0, refreshes: 0 },
  };
  if (!userId) return none;
  const sub = s.subscriptions.filter((x) => x.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!sub) return none;
  const plan = getPlan(sub.planId);
  const start = Date.parse(sub.currentPeriodStart);
  const end = Date.parse(sub.currentPeriodEnd);
  const t = now.getTime();
  const inPeriod = t >= start && t < end;

  // Tilgang vurderes etter status OG betalt periode – ikke bare oppsigelsesmarkering.
  let reason: Entitlements['reason'];
  let full = false;
  if ((sub.status === 'active' || sub.status === 'trialing') && inPeriod) {
    full = true;
    reason = sub.cancelAtPeriodEnd ? 'canceling' : sub.status === 'trialing' ? 'trialing' : 'active';
  } else if (sub.status === 'active' || sub.status === 'trialing') reason = 'expired';
  else if (sub.status === 'past_due') reason = 'past_due';
  else if (sub.status === 'canceled') reason = 'canceled';
  else reason = 'incomplete';

  const inWindow = (iso: string) => {
    const x = Date.parse(iso);
    return x >= start && x < end;
  };
  const events = s.usageEvents.filter((e) => e.userId === userId && inWindow(e.createdAt));
  const usedNew = events.filter((e) => e.kind === 'new_analysis' && e.chargeable).length;
  const usedRefresh = events.filter((e) => e.kind === 'refresh' && e.chargeable).length;
  const reuses = events.filter((e) => e.kind === 'reuse').length;
  // Hver bruker som har bedt om en analyse (egen jobb eller koblet til en pågående) belastes når den er ferdig.
  // En markedsoppfriskning som brukeren har bedt om som oppfriskning (ikke som ny analyse) teller mot oppfriskingskvoten, ikke analysekvoten.
  const pending = s.jobs.filter(
    (j) => j.type !== 'light_refresh' && j.requestedBy.includes(userId) && (j.status === 'running' || j.status === 'queued') && !(j.type === 'market_refresh' && j.charges?.[userId] === 'refresh'),
  ).length;
  const remainingNew = Math.max(0, plan.limits.newAnalysesPerPeriod - usedNew - pending);
  const remainingRefresh = Math.max(0, plan.limits.refreshesPerPeriod - usedRefresh);
  return {
    access: full ? 'full' : 'read_only',
    reason,
    plan,
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    canRequestNewAnalysis: full && remainingNew > 0,
    canReuseAnalysis: full,
    canRefresh: full && remainingRefresh > 0,
    canEditScenarios: full,
    canExport: true,
    limits: {
      newAnalyses: plan.limits.newAnalysesPerPeriod,
      refreshes: plan.limits.refreshesPerPeriod,
      scenariosPerProperty: plan.limits.scenariosPerProperty,
    },
    used: { newAnalyses: usedNew, refreshes: usedRefresh, reuses, pendingNewAnalyses: pending },
    remaining: { newAnalyses: remainingNew, refreshes: remainingRefresh },
  };
}

export function requireFullAccess(e: Entitlements, action: string): void {
  if (e.access === 'full') return;
  const why: Record<string, string> = {
    no_subscription: 'Du har ikke et aktivt abonnement.',
    past_due: 'Siste betaling gikk ikke gjennom.',
    canceled: 'Abonnementet er avsluttet.',
    expired: 'Abonnementsperioden er utløpt.',
    incomplete: 'Abonnementet er ikke fullført.',
    not_signed_in: 'Du er ikke logget inn.',
  };
  throw new ServiceError('subscription_inactive', `${why[e.reason] ?? 'Abonnementet gir ikke tilgang.'} ${action} krever aktivt abonnement. Lagrede objekter og scenarioer er tatt vare på.`);
}

export function ensureLink(draft: DbState, userId: string, propertyId: string, now: Date): UserProperty {
  let link = draft.userProperties.find((u) => u.userId === userId && u.propertyId === propertyId);
  if (!link) {
    link = {
      id: uuid(),
      userId,
      propertyId,
      favorite: false,
      workStatus: 'vurderes',
      notes: '',
      primaryScenarioId: null,
      label: null,
      archivedAt: null,
      addedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastSeenAnalysisVersion: null,
      checks: {},
    };
    draft.userProperties.push(link);
  } else if (link.archivedAt) {
    link.archivedAt = null;
    link.updatedAt = now.toISOString();
  }
  return link;
}

/** Oppretter standardscenario fra grunnanalysen dersom brukeren ikke har noen scenarioer for objektet. */
export function ensureDefaultScenario(draft: DbState, userId: string, propertyId: string, analysis: SharedAnalysis, now: Date): Scenario | null {
  const existing = draft.scenarios.filter((x) => x.ownerId === userId && x.propertyId === propertyId);
  const link = ensureLink(draft, userId, propertyId, now);
  if (existing.length > 0) {
    if (!link.primaryScenarioId) link.primaryScenarioId = existing[0].id;
    return null;
  }
  const property = draft.properties.find((p) => p.id === propertyId);
  const snapshot = latestSnapshot(draft, propertyId);
  if (!property || !snapshot) return null;
  const profile = draft.profiles.find((p) => p.userId === userId);
  const values = buildBaseValues({ property, snapshot, analysis, defaults: profile?.defaults ?? NEW_ACCOUNT_DEFAULTS }).values;
  const scenario: Scenario = {
    id: uuid(),
    ownerId: userId,
    propertyId,
    analysisId: analysis.id,
    analysisVersion: analysis.version,
    name: 'Hovedscenario',
    values,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  draft.scenarios.push(scenario);
  link.primaryScenarioId = scenario.id;
  link.lastSeenAnalysisVersion = analysis.version;
  return scenario;
}

export function buildBundle(s: Readonly<DbState>, propertyId: string): PropertyBundle | null {
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
    versions: s.analyses
      .filter((a) => a.propertyId === propertyId && a.visibility === 'shared' && a.status !== 'draft')
      .sort((a, b) => b.version - a.version)
      .map(analysisMeta),
    // Brukerens egne «koblede» analysejobber er private og vises bare for brukeren selv (se buildMyItem).
    activeJob: jobs.find((j) => j.type !== 'linked_analysis' && (j.status === 'running' || j.status === 'queued')) ?? null,
    lastFailedJob: jobs.filter((j) => j.type !== 'linked_analysis')[0]?.status === 'failed' ? jobs.filter((j) => j.type !== 'linked_analysis')[0] : null,
  };
}

export function buildMyItem(s: Readonly<DbState>, userId: string, link: UserProperty, now: Date): MyPropertyItem | null {
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
