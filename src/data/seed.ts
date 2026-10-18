import { buildBaseValues } from '../calc/scenario';
import { EXAMPLE_PROFILE_DEFAULTS } from '../config/defaults';
import type {
  CalendarOverride,
  PrivateEvent,
  Profile,
  Scenario,
  ScenarioValues,
  SharedAnalysis,
  Subscription,
  UsageEvent,
  User,
  UserComparable,
  UserProperty,
} from '../domain/schemas';
import type { WorkStatus } from '../domain/enums';
import { deriveBidDay } from '../lib/bidDay';
import { addDaysToKey, localDateKey, osloAt } from '../lib/time';
import { buildProperty, deterministicUuid, type BuiltProperty } from './analysisBuilder';
import type { DbState, RefreshScript } from './db';
import { DEMO_FINN, SEED_PROPERTIES } from './seedProperties';

export const DEMO_USERS = {
  ada: { id: deterministicUuid('user:ada'), email: 'ada@demo.flipprom.no', displayName: 'Ada Aksnes', label: 'Bruker A' },
  bjorn: { id: deterministicUuid('user:bjorn'), email: 'bjorn@demo.flipprom.no', displayName: 'Bjørn Berg', label: 'Bruker B' },
} as const;

const DAY = 86_400_000;

export function createSeed(now: Date): DbState {
  const iso = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();

  const users: User[] = Object.values(DEMO_USERS).map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    isDemoAccount: true,
    createdAt: iso(-200 * DAY),
  }));

  const profiles: Profile[] = [
    { userId: DEMO_USERS.ada.id, displayName: DEMO_USERS.ada.displayName, email: DEMO_USERS.ada.email, defaults: { ...EXAMPLE_PROFILE_DEFAULTS }, updatedAt: iso(-30 * DAY) },
    {
      userId: DEMO_USERS.bjorn.id,
      displayName: DEMO_USERS.bjorn.displayName,
      email: DEMO_USERS.bjorn.email,
      defaults: { ...EXAMPLE_PROFILE_DEFAULTS, buyerTypeHouse: 'privat', hourValue: 500, interestPct: 6.5, profitTarget: 300_000 },
      updatedAt: iso(-60 * DAY),
    },
  ];

  const subscriptions: Subscription[] = [
    {
      id: deterministicUuid('sub:ada'),
      userId: DEMO_USERS.ada.id,
      planId: 'flipprom-pro',
      interval: 'month',
      status: 'active',
      currentPeriodStart: iso(-12 * DAY),
      currentPeriodEnd: iso(18 * DAY),
      cancelAtPeriodEnd: false,
      provider: 'vipps',
      createdAt: iso(-180 * DAY),
      updatedAt: iso(-12 * DAY),
    },
    {
      id: deterministicUuid('sub:bjorn'),
      userId: DEMO_USERS.bjorn.id,
      planId: 'flipprom-pro',
      interval: 'year',
      status: 'active',
      currentPeriodStart: iso(-100 * DAY),
      currentPeriodEnd: iso(265 * DAY),
      cancelAtPeriodEnd: false,
      provider: 'vipps',
      createdAt: iso(-100 * DAY),
      updatedAt: iso(-100 * DAY),
    },
  ];

  const built = new Map<string, BuiltProperty>();
  for (const spec of SEED_PROPERTIES) built.set(spec.key, buildProperty(spec, now));

  // p11: v1 (eldre, lavere salgsanslag, uten takrisiko) og v2 (ny, publisert)
  const p11spec = SEED_PROPERTIES.find((s) => s.key === 'p11')!;
  const p11v1 = buildProperty(p11spec, now, {
    analysisVersion: 1,
    analysisAgeDays: 25,
    analysisOverride: {
      recommendationRationale: 'God margin basert på salg fra i vår. Tak er ikke vurdert.',
      sale: { ...p11spec.analysis.sale, low: 5_350_000, base: 5_650_000, high: 5_900_000, rationaleBase: 'Faktiske salg fra i vår.' },
      risks: [p11spec.analysis.risks[1]],
      comparables: [{ name: 'Singsakerbakken 14, 4 rom', price: 5_600_000, priceBasis: 'kontant', area: 81, monthsAgo: 5, kind: 'solgt', notes: 'Faktisk salg.' }],
    },
  }).analysis;
  p11v1.status = 'superseded';
  const p11v2 = buildProperty(p11spec, now, { analysisVersion: 2 }).analysis;
  built.set('p11', { ...built.get('p11')!, analysis: p11v2 });

  const properties = [...built.values()].map((b) => b.property);
  const snapshots = [...built.values()].map((b) => b.snapshot);
  const viewings = [...built.values()].flatMap((b) => b.viewings);
  const analyses: SharedAnalysis[] = [...[...built.values()].map((b) => b.analysis), p11v1];

  const userProperties: UserProperty[] = [];
  const scenarios: Scenario[] = [];
  const profileOf = (userId: string) => profiles.find((p) => p.userId === userId)!;

  const addLink = (
    userId: string,
    key: string,
    opts: {
      workStatus?: WorkStatus;
      favorite?: boolean;
      archivedDaysAgo?: number;
      notes?: string;
      analysis?: SharedAnalysis;
      scenarios?: { name: string; patch?: (v: ScenarioValues, b: BuiltProperty) => Partial<ScenarioValues> }[];
      addedDaysAgo?: number;
    } = {},
  ) => {
    const b = built.get(key)!;
    const analysis = opts.analysis ?? b.analysis;
    const base = buildBaseValues({ property: b.property, snapshot: b.snapshot, analysis, defaults: profileOf(userId).defaults }).values;
    const defs = opts.scenarios ?? [{ name: 'Hovedscenario' }];
    const created = defs.map((d, i): Scenario => ({
      id: deterministicUuid(`scenario:${userId}:${key}:${i}`),
      ownerId: userId,
      propertyId: b.property.id,
      analysisId: analysis.id,
      analysisVersion: analysis.version,
      name: d.name,
      values: { ...base, ...(d.patch ? d.patch(base, b) : {}) },
      createdAt: iso(-(opts.addedDaysAgo ?? 3) * DAY),
      updatedAt: iso(-(opts.addedDaysAgo ?? 3) * DAY + i * 60_000),
    }));
    scenarios.push(...created);
    userProperties.push({
      id: deterministicUuid(`up:${userId}:${key}`),
      userId,
      propertyId: b.property.id,
      favorite: opts.favorite ?? false,
      workStatus: opts.workStatus ?? 'vurderes',
      notes: opts.notes ?? '',
      primaryScenarioId: created[0]?.id ?? null,
      archivedAt: opts.archivedDaysAgo === undefined ? null : iso(-opts.archivedDaysAgo * DAY),
      addedAt: iso(-(opts.addedDaysAgo ?? 3) * DAY),
      updatedAt: iso(-(opts.addedDaysAgo ?? 3) * DAY),
      lastSeenAnalysisVersion: analysis.version,
      checks: {},
    });
  };

  const A = DEMO_USERS.ada.id;
  const B = DEMO_USERS.bjorn.id;

  addLink(A, 'p01', {
    workStatus: 'visning_planlagt',
    favorite: true,
    addedDaysAgo: 6,
    notes: 'Ta med fuktmåler på visning. Spør om bjelkelaget under badet.',
    scenarios: [
      { name: 'Hovedscenario', patch: () => ({ purchasePrice: 2_950_000, startBid: 2_750_000, walkAway: 3_000_000 }) },
      {
        name: 'Lett oppfrisking',
        patch: (_v, b) => {
          const opt = b.analysis.estimates.renovationOptions.find((o) => o.level === 'lett')!;
          return { renovationOptionId: opt.id, renovationItems: opt.items.map((i) => ({ ...i })), months: 3, saleLow: 3_450_000, saleBase: 3_600_000, saleHigh: 3_750_000 };
        },
      },
      { name: 'Høyt bud 3,1 mill.', patch: () => ({ purchasePrice: 3_100_000 }) },
    ],
  });
  addLink(A, 'p02', { addedDaysAgo: 9 });
  addLink(A, 'p03', { addedDaysAgo: 4, notes: 'Kontakt takstmann før andre visning.' });
  addLink(A, 'p04', { workStatus: 'avvist', archivedDaysAgo: 3, addedDaysAgo: 12, notes: 'For liten margin.' });
  addLink(A, 'p05', { addedDaysAgo: 2 });
  addLink(A, 'p06', { addedDaysAgo: 14 });
  addLink(A, 'p07', { addedDaysAgo: 20, scenarios: [{ name: 'Hovedscenario', patch: () => ({ purchasePrice: 3_250_000 }) }] });
  addLink(A, 'p08', { addedDaysAgo: 11 });
  addLink(A, 'p09', { workStatus: 'visning_planlagt', favorite: true, addedDaysAgo: 5 });
  addLink(A, 'p10', { workStatus: 'bud_vurderes', addedDaysAgo: 40 });
  addLink(A, 'p11', { addedDaysAgo: 24, analysis: p11v1 });
  addLink(A, 'p12', { addedDaysAgo: 16 });

  addLink(B, 'p01', {
    addedDaysAgo: 5,
    scenarios: [{ name: 'Bjørns kalkyle', patch: () => ({ purchasePrice: 3_050_000, months: 5 }) }],
  });
  addLink(B, 'p03', { addedDaysAgo: 4 });
  addLink(B, 'p11', { addedDaysAgo: 2 });
  addLink(B, 'p13', { addedDaysAgo: 3 });

  // Forbruk i inneværende periode
  const usageEvents: UsageEvent[] = [];
  const usage = (userId: string, kind: UsageEvent['kind'], key: string, daysAgo: number) => {
    const b = built.get(key)!;
    usageEvents.push({
      id: deterministicUuid(`usage:${userId}:${kind}:${key}`),
      userId,
      kind,
      propertyId: b.property.id,
      jobId: null,
      analysisId: b.analysis.id,
      idempotencyKey: `seed:${kind}:${userId}:${b.property.finnId}`,
      chargeable: kind !== 'reuse',
      createdAt: iso(-daysAgo * DAY),
    });
  };
  usage(A, 'new_analysis', 'p01', 6);
  usage(A, 'new_analysis', 'p03', 4);
  usage(A, 'new_analysis', 'p09', 5);
  usage(A, 'new_analysis', 'p05', 2);
  usage(A, 'reuse', 'p02', 9);
  usage(A, 'reuse', 'p06', 11);
  usage(A, 'refresh', 'p01', 1);
  usage(A, 'refresh', 'p08', 2);
  usage(B, 'new_analysis', 'p13', 3);
  usage(B, 'reuse', 'p01', 5);
  usage(B, 'reuse', 'p03', 4);
  usage(B, 'reuse', 'p11', 2);

  // Privat visning (påvirker ikke buddag) og privat overstyring av buddag
  const todayKey = localDateKey(now);
  const p06 = built.get('p06')!;
  const privateEvents: PrivateEvent[] = [
    {
      id: deterministicUuid('pe:ada:p06'),
      userId: A,
      propertyId: p06.property.id,
      kind: 'private_viewing',
      start: osloAt(addDaysToKey(todayKey, 2), 16).toISOString(),
      end: osloAt(addDaysToKey(todayKey, 2), 16, 45).toISOString(),
      note: 'Privat visning avtalt med megler.',
      confirmed: true,
      createdAt: iso(-1 * DAY),
    },
  ];
  const p03 = built.get('p03')!;
  const p03bid = deriveBidDay(p03.property.id, p03.viewings);
  const calendarOverrides: CalendarOverride[] = p03bid
    ? [
        {
          id: deterministicUuid('ov:ada:p03'),
          userId: A,
          propertyId: p03.property.id,
          eventKey: 'bidday',
          start: osloAt(addDaysToKey(p03bid.dateKey, 1), 12).toISOString(),
          note: 'Megler sa på telefon at budrunden trolig starter mandag. Ikke skriftlig bekreftet.',
          origin: 'manual',
          derivedStartAtOverride: p03bid.start,
          createdAt: iso(-1 * DAY),
        },
      ]
    : [];

  const p01 = built.get('p01')!;
  const userComparables: UserComparable[] = [
    {
      id: deterministicUuid('uc:ada:p01:0'),
      userId: A,
      propertyId: p01.property.id,
      name: 'Elvekanten 13, 3 rom (min egen)',
      url: null,
      kind: 'solgt',
      askingPrice: 4_190_000,
      soldPrice: 4_120_000,
      commonCosts: 2_300,
      soldTotalPrice: 4_120_000,
      area: 58,
      date: addDaysToKey(todayKey, -21),
      notes: 'Fiktivt demoeksempel lagt inn av bruker A etter samtale med megler.',
      createdAt: iso(-2 * DAY),
      updatedAt: iso(-2 * DAY),
    },
  ];
  const p09 = built.get('p09')!;
  const refreshScripts: Record<string, RefreshScript> = {
    [built.get('p10')!.property.id]: { askingPrice: 2_690_000, addViewings: [{ offsetDays: 4, hour: 17, minute: 0, durationMin: 60 }], applied: false },
    [p09.property.id]: { cancelViewingIds: [p09.viewings[1].id], addViewings: [{ offsetDays: 6, hour: 18, minute: 0, durationMin: 60 }], applied: false },
    [built.get('p08')!.property.id]: { saleStatus: 'aktiv', saleStatusNote: 'Annonsen er tilgjengelig igjen.', addViewings: [{ offsetDays: 5, hour: 17, minute: 0, durationMin: 60 }], applied: false },
  };

  return {
    users,
    profiles,
    subscriptions,
    properties,
    snapshots,
    analyses,
    viewings,
    userProperties,
    scenarios,
    jobs: [],
    usageEvents,
    privateEvents,
    calendarOverrides,
    userComparables,
    userRisks: [],
    coursePurchases: [
      // Ada har kjøpt kurset (viser innhold). Bjørn har ikke kjøpt (viser betalingsmuren).
      {
        id: deterministicUuid('course:ada:flipping-privat'),
        userId: DEMO_USERS.ada.id,
        courseId: 'flipping-privat',
        amountPaid: 2999,
        provider: 'vipps',
        paymentId: 'pay_demo_ada',
        purchasedAt: iso(-60 * DAY),
      },
    ],
    session: { userId: null },
    demo: {
      seededAt: now.toISOString(),
      failNextJob: null,
      failFirstAttemptFinnIds: [DEMO_FINN.failing],
      refreshScripts,
    },
  };
}
