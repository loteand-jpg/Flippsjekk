import { buildBaseValues } from '../../calc/scenario';
import { getPlan } from '../../config/plans';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import type { MockDatabase, DbState } from '../../data/db';
import type { Scenario, SharedAnalysis, UserProperty } from '../../domain/schemas';
import type { Clock } from '../../lib/clock';
import { uuid } from '../../lib/ids';
import { latestSnapshot } from '../shared/readModel';
import { ServiceError, type Entitlements } from '../types';

// Lesemodellen (bygger PropertyBundle/MyPropertyItem, oppfriskingsinndata osv.) er delt med produksjon og bor i services/shared/readModel.ts.
export {
  analysisMeta,
  buildBundle,
  buildMyItem,
  canReadAnalysis,
  decideRefreshFor,
  isModelCompatible,
  latestSharedAnalysis,
  latestSnapshot,
  refreshInputFor,
  staleness,
  technicalSignals,
} from '../shared/readModel';

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
