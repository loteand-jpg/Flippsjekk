import { DEMO_JOB } from '../../config/freshness';
import { MockDatabase } from '../../data/db';
import { createSeed, DEMO_USERS } from '../../data/seed';
import { DEMO_FINN } from '../../data/seedProperties';
import type { StorageLike } from '../../data/storage';
import type { Subscription } from '../../domain/schemas';
import type { Clock } from '../../lib/clock';
import { canonicalFinnUrl } from '../../lib/finn';
import { uuid } from '../../lib/ids';
import { ServiceError, type DemoService, type Services, type SubscriptionPreset } from '../types';
import { MockAuthService, MockProfileService, MockSubscriptionService, SIMULATED_GOOGLE_ACCOUNTS } from './accountServices';
import { createPropertyIdentity, MockAnalysisService } from './analysisService';
import { MockCourseService } from './courseServices';
import { MockCalendarService, MockImportService } from './calendarImportServices';
import { computeEntitlements, latestSharedAnalysis, MockContext } from './context';
import { MockComparableRepository, MockPropertyRepository, MockRiskRepository, MockScenarioRepository } from './dataServices';
import { healMissingAnalyses } from './heal';
import { createJob } from './jobs';

export interface MockServiceOptions {
  storage: StorageLike;
  clock: Clock;
  latencyMs?: number;
  stepMs?: number;
  refreshStepMs?: number;
  storageKey?: string;
}

const DAY = 86_400_000;

export interface MockServices extends Services {
  demo: DemoService;
  db: MockDatabase;
}

export function createMockServices(opts: MockServiceOptions): MockServices {
  const db = new MockDatabase({ storage: opts.storage, clock: opts.clock, seed: createSeed, storageKey: opts.storageKey });
  // En felles analyse skal aldri mangle for et objekt som finnes – gjenopprett automatisk om den er tapt.
  const healed = healMissingAnalyses(db, opts.clock);
  if (healed > 0) {
    db.loadReport.status = 'repaired';
    db.loadReport.message = [db.loadReport.message, `${healed} objekt${healed === 1 ? '' : 'er'} manglet grunnanalyse og er gjenopprettet automatisk. Privat data er uendret.`].filter(Boolean).join(' ');
  }
  const ctx = new MockContext(db, opts.clock, opts.latencyMs ?? 0, {
    stepMs: opts.stepMs ?? DEMO_JOB.stepDurationMs,
    refreshStepMs: opts.refreshStepMs ?? DEMO_JOB.refreshStepDurationMs,
  });
  const analysis = new MockAnalysisService(ctx);
  const subscriptionService = new MockSubscriptionService(ctx);
  const courseService = new MockCourseService(ctx);

  const mutateSub = (fn: (s: Subscription) => void): Subscription => {
    const uid = ctx.uid();
    return db.transaction((d) => {
      const sub = d.subscriptions.find((s) => s.userId === uid);
      if (!sub) throw new ServiceError('not_found', 'Du har ikke noe abonnement å administrere.');
      fn(sub);
      sub.updatedAt = opts.clock.now().toISOString();
      return sub;
    });
  };

  const demo: DemoService = {
    async signInAsProfile(email) {
      const target = email.trim().toLowerCase();
      const user = db.read((s) => s.users.find((u) => u.email.toLowerCase() === target) ?? null);
      if (!user) throw new ServiceError('not_found', 'Fant ingen testprofil med denne e-postadressen.');
      db.transaction((d) => {
        d.session = { userId: user.id };
      });
      return { user, kind: 'demo' as const };
    },
    googleAccounts() {
      return SIMULATED_GOOGLE_ACCOUNTS;
    },
    vipps: {
      decide: (id, outcome) => (courseService.hasPending(id) ? courseService.decideVipps(id, outcome) : subscriptionService.decideVipps(id, outcome)),
    },
    async listAccounts() {
      return db.read((s) =>
        s.users.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          label: u.id === DEMO_USERS.ada.id ? DEMO_USERS.ada.label : u.id === DEMO_USERS.bjorn.id ? DEMO_USERS.bjorn.label : 'Simulert konto',
        })),
      );
    },
    async switchUser(userId) {
      db.transaction((d) => {
        if (!d.users.some((u) => u.id === userId)) throw new ServiceError('not_found', 'Fant ikke kontoen.');
        d.session = { userId };
      });
    },
    async setSubscriptionPreset(preset: SubscriptionPreset) {
      const uid = ctx.uid();
      const now = opts.clock.now().getTime();
      const iso = (ms: number) => new Date(now + ms).toISOString();
      db.transaction((d) => {
        const existing = d.subscriptions.find((s) => s.userId === uid);
        d.subscriptions = d.subscriptions.filter((s) => s.userId !== uid);
        if (preset === 'none') return;
        const base: Subscription = {
          id: existing?.id ?? uuid(),
          userId: uid,
          planId: preset === 'low_quota' ? 'demo-lav-kvote' : 'flipprom-pro',
          interval: existing?.interval ?? 'month',
          status: 'active',
          currentPeriodStart: iso(-10 * DAY),
          currentPeriodEnd: iso(20 * DAY),
          cancelAtPeriodEnd: false,
          provider: 'vipps',
          createdAt: existing?.createdAt ?? iso(-90 * DAY),
          updatedAt: iso(0),
        };
        const presets: Record<Exclude<SubscriptionPreset, 'none'>, Partial<Subscription>> = {
          active: {},
          low_quota: {},
          trialing: { status: 'trialing', currentPeriodStart: iso(-3 * DAY), currentPeriodEnd: iso(11 * DAY) },
          canceling: { cancelAtPeriodEnd: true, currentPeriodStart: iso(-20 * DAY), currentPeriodEnd: iso(10 * DAY) },
          past_due: { status: 'past_due', currentPeriodStart: iso(-32 * DAY), currentPeriodEnd: iso(-2 * DAY) },
          expired: { status: 'canceled', cancelAtPeriodEnd: true, currentPeriodStart: iso(-40 * DAY), currentPeriodEnd: iso(-10 * DAY) },
        };
        d.subscriptions.push({ ...base, ...presets[preset] });
      });
    },
    async setFailNextJob(mode) {
      db.transaction((d) => {
        d.demo.failNextJob = mode;
      });
    },
    async getFailNextJob() {
      return db.read((s) => s.demo.failNextJob);
    },
    async startSharedJobAsOtherUser() {
      const uid = ctx.uid();
      const other = uid === DEMO_USERS.bjorn.id ? DEMO_USERS.ada : DEMO_USERS.bjorn;
      const now = opts.clock.now();
      return db.transaction((d) => {
        // Finn en FINN-ID uten analyse og uten aktiv jobb.
        let n = 0;
        let finnId: string = DEMO_FINN.sharedJob;
        const busy = (id: string) => {
          const p = d.properties.find((x) => x.finnId === id);
          return p ? latestSharedAnalysis(d, p.id) !== null || d.jobs.some((j) => j.propertyId === p.id && j.status === 'running') : false;
        };
        while (busy(finnId) && n < 50) finnId = String(900000780 + n++);
        const property = d.properties.find((x) => x.finnId === finnId) ?? createPropertyIdentity(d, finnId, now);
        const job = createJob(d, { property, type: 'full_analysis', userId: other.id, now, stepMs: Math.max(ctx.jobTiming.stepMs * 4, 1), targetVersion: 1 });
        job.simulatedFailure = null;
        d.userProperties.push({
          id: uuid(),
          userId: other.id,
          propertyId: property.id,
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
        });
        return { finnId, url: canonicalFinnUrl(finnId), byUser: other.displayName };
      });
    },
    async reset() {
      db.reset();
    },
    corruptStorageAndReload() {
      try {
        opts.storage.setItem(db.storageKey, '{"format":"flipprom-mockdb","schemaVersion":2,"state":{"users":[{"id":');
      } catch {
        /* ignorer */
      }
      if (typeof window !== 'undefined') window.location.reload();
      else db.reloadFromStorage();
    },
    loadReport() {
      const r = db.loadReport;
      return { status: r.status, message: r.message, backupKey: r.backupKey };
    },
    async seededAt() {
      return db.read((s) => s.demo.seededAt);
    },
    tick() {
      analysis.tick();
    },
    billing: {
      cancelAtPeriodEnd: async () => mutateSub((s) => (s.cancelAtPeriodEnd = true)),
      resume: async () =>
        mutateSub((s) => {
          if (s.status === 'canceled' || Date.parse(s.currentPeriodEnd) <= opts.clock.now().getTime()) {
            throw new ServiceError('conflict', 'Perioden er avsluttet. Start et nytt abonnement i stedet.');
          }
          s.cancelAtPeriodEnd = false;
        }),
      fixPayment: async () =>
        mutateSub((s) => {
          const now = opts.clock.now();
          const end = new Date(now);
          if (s.interval === 'year') end.setFullYear(end.getFullYear() + 1);
          else end.setMonth(end.getMonth() + 1);
          s.status = 'active';
          s.currentPeriodStart = now.toISOString();
          s.currentPeriodEnd = end.toISOString();
        }),
      changeInterval: async (interval) => mutateSub((s) => (s.interval = interval)),
    },
  };

  const services: MockServices = {
    mode: 'demo',
    clock: opts.clock,
    auth: new MockAuthService(ctx),
    subscription: subscriptionService,
    profile: new MockProfileService(ctx),
    properties: new MockPropertyRepository(ctx),
    scenarios: new MockScenarioRepository(ctx),
    comparables: new MockComparableRepository(ctx),
    risks: new MockRiskRepository(ctx),
    courses: courseService,
    analysis,
    calendar: new MockCalendarService(ctx),
    imports: new MockImportService(ctx),
    events: { subscribe: (l) => db.subscribe(l) },
    demo,
    db,
  };
  return services;
}

/** For tester: sjekker rettigheter direkte. */
export { computeEntitlements };
