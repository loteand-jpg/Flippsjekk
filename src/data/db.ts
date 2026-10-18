import type { ZodType } from 'zod';
import {
  AnalysisJobSchema,
  CalendarOverrideSchema,
  PrivateEventSchema,
  ProfileSchema,
  PropertySchema,
  PropertySnapshotSchema,
  ScenarioSchema,
  SharedAnalysisSchema,
  SubscriptionSchema,
  UsageEventSchema,
  UserComparableSchema,
  UserRiskSchema,
  CoursePurchaseSchema,
  UserPropertySchema,
  UserSchema,
  ViewingSchema,
  type AnalysisJob,
  type CalendarOverride,
  type PrivateEvent,
  type Profile,
  type Property,
  type PropertySnapshot,
  type Scenario,
  type SharedAnalysis,
  type Subscription,
  type UsageEvent,
  type User,
  type UserComparable,
  type UserRisk,
  type CoursePurchase,
  type UserProperty,
  type Viewing,
} from '../domain/schemas';
import { migrateLegacyComparable } from '../domain/comparables';
import { migrateProfileDefaultsRaw, migrateScenarioValuesRaw, type ProfileMigrationHints } from '../domain/migrate';
import type { SaleStatus } from '../domain/enums';
import type { Clock } from '../lib/clock';
import type { StorageLike } from './storage';

/**
 * Lokal mockdatabase. Simulerer serverens tabeller i én versjonert JSON-struktur.
 * Felles tabeller: properties, snapshots, analyses (visibility=shared), viewings, jobs.
 * Private tabeller (eieravgrenset): userProperties, scenarios, privateEvents,
 * calendarOverrides, usageEvents, analyses (visibility=private), profiles, subscriptions.
 */
export const DB_FORMAT = 'flipprom-mockdb';
export const DB_SCHEMA_VERSION = 4;
export const DB_STORAGE_KEY = 'flipprom.mockdb';

export interface RefreshScript {
  askingPrice?: number;
  saleStatus?: SaleStatus;
  saleStatusNote?: string | null;
  addViewings?: { offsetDays: number; hour: number; minute: number; durationMin: number }[];
  cancelViewingIds?: string[];
  applied: boolean;
}

export interface DemoState {
  seededAt: string;
  failNextJob: 'fetch_error' | 'invalid_result' | null;
  failFirstAttemptFinnIds: string[];
  refreshScripts: Record<string, RefreshScript>;
}

export interface DbState {
  users: User[];
  profiles: Profile[];
  subscriptions: Subscription[];
  properties: Property[];
  snapshots: PropertySnapshot[];
  analyses: SharedAnalysis[];
  viewings: Viewing[];
  userProperties: UserProperty[];
  scenarios: Scenario[];
  jobs: AnalysisJob[];
  usageEvents: UsageEvent[];
  privateEvents: PrivateEvent[];
  calendarOverrides: CalendarOverride[];
  userComparables: UserComparable[];
  userRisks: UserRisk[];
  coursePurchases: CoursePurchase[];
  session: { userId: string | null };
  demo: DemoState;
}

type TableName = Exclude<keyof DbState, 'session' | 'demo'>;

const TABLE_SCHEMAS: Record<TableName, ZodType> = {
  users: UserSchema,
  profiles: ProfileSchema,
  subscriptions: SubscriptionSchema,
  properties: PropertySchema,
  snapshots: PropertySnapshotSchema,
  analyses: SharedAnalysisSchema,
  viewings: ViewingSchema,
  userProperties: UserPropertySchema,
  scenarios: ScenarioSchema,
  jobs: AnalysisJobSchema,
  usageEvents: UsageEventSchema,
  privateEvents: PrivateEventSchema,
  calendarOverrides: CalendarOverrideSchema,
  userComparables: UserComparableSchema,
  userRisks: UserRiskSchema,
  coursePurchases: CoursePurchaseSchema,
};
export const TABLE_NAMES = Object.keys(TABLE_SCHEMAS) as TableName[];

export interface LoadReport {
  status: 'fresh' | 'loaded' | 'migrated' | 'repaired' | 'recovered';
  message: string | null;
  droppedRows: number;
  backupKey: string | null;
  fromVersion: number | null;
}

/** Migreringer: nøkkel = versjon det migreres FRA. */
export const MIGRATIONS: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
  3: (s) => {
    // v4 (modell 1.1): profilen får nye standarder (egeninnsats, egenkapital, separate lån), og scenarioer får
    // separate kjøps-/oppussingslån. Eldre `financingPct` bevares som begge deler, så eldre kalkyler gir samme resultat.
    // Ingen rader droppes. Eldre `hourValue` beholdes som utfaset felt.
    const next: Record<string, unknown> = { ...s };
    const hintsByUser = new Map<string, ProfileMigrationHints>();
    if (Array.isArray(s.profiles)) {
      next.profiles = (s.profiles as Record<string, unknown>[]).map((p) => {
        const defaults = migrateProfileDefaultsRaw(p.defaults) as Record<string, unknown> | undefined;
        if (typeof p.userId === 'string' && defaults) {
          hintsByUser.set(p.userId, {
            weeklyOwnHours: defaults.weeklyOwnHours as number,
            minProfitPerOwnHour: defaults.minProfitPerOwnHour as number,
            availableEquity: defaults.availableEquity as number,
            laborModes: defaults.laborModes,
          });
        }
        return { ...p, defaults };
      });
    }
    if (Array.isArray(s.scenarios)) {
      next.scenarios = (s.scenarios as Record<string, unknown>[]).map((sc) => ({
        ...sc,
        values: migrateScenarioValuesRaw(sc.values, hintsByUser.get(String(sc.ownerId)) ?? {}),
      }));
    }
    return next;
  },
  2: (s) => {
    // v3: sammenlignbare objekter har eksplisitte prisfelt, og brukere kan legge inn egne.
    const next: Record<string, unknown> = { ...s };
    next.userComparables = Array.isArray(s.userComparables) ? s.userComparables : [];
    if (Array.isArray(s.analyses)) {
      next.analyses = (s.analyses as Record<string, unknown>[]).map((a) =>
        Array.isArray(a.comparables) ? { ...a, comparables: (a.comparables as Record<string, unknown>[]).map(migrateLegacyComparable) } : a,
      );
    }
    return next;
  },
  1: (s) => {
    // v1 manglet private kalenderhendelser/overstyringer og private sjekklistebekreftelser.
    const next: Record<string, unknown> = { ...s };
    next.privateEvents = Array.isArray(s.privateEvents) ? s.privateEvents : [];
    next.calendarOverrides = Array.isArray(s.calendarOverrides) ? s.calendarOverrides : [];
    if (Array.isArray(s.userProperties)) {
      next.userProperties = (s.userProperties as Record<string, unknown>[]).map((up) => ({ checks: {}, ...up }));
    }
    if (Array.isArray(s.scenarios)) {
      next.scenarios = (s.scenarios as Record<string, unknown>[]).map((sc) => {
        const values = (sc.values ?? {}) as Record<string, unknown>;
        return { ...sc, values: { taxMode: 'uavklart', taxPct: null, startBid: null, walkAway: null, ...values } };
      });
    }
    return next;
  },
};

interface Envelope {
  format: string;
  schemaVersion: number;
  savedAt: string;
  state: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validerer rad for rad. Gyldige rader beholdes uendret (ukjente felt bevares), ugyldige droppes. */
export function sanitizeState(raw: Record<string, unknown>, fallback: DbState): { state: DbState; dropped: number } {
  let dropped = 0;
  const state = { ...fallback } as DbState;
  for (const name of TABLE_NAMES) {
    const rows = raw[name];
    if (!Array.isArray(rows)) {
      (state as unknown as Record<string, unknown[]>)[name] = [];
      continue;
    }
    const kept = rows.filter((row) => {
      const ok = TABLE_SCHEMAS[name].safeParse(row).success;
      if (!ok) dropped++;
      return ok;
    });
    (state as unknown as Record<string, unknown[]>)[name] = kept;
  }
  const session = raw.session;
  state.session = isObject(session) && (typeof session.userId === 'string' || session.userId === null)
    ? { userId: session.userId as string | null }
    : { userId: null };
  const demo = raw.demo;
  state.demo = isObject(demo) && typeof demo.seededAt === 'string'
    ? { ...fallback.demo, ...(demo as Partial<DemoState>) }
    : fallback.demo;

  // Referanseintegritet: private rader som peker på slettede objekter fjernes.
  const propIds = new Set(state.properties.map((p) => p.id));
  const userIds = new Set(state.users.map((u) => u.id));
  const before = state.userProperties.length + state.scenarios.length;
  state.userProperties = state.userProperties.filter((up) => propIds.has(up.propertyId) && userIds.has(up.userId));
  state.scenarios = state.scenarios.filter((s) => propIds.has(s.propertyId) && userIds.has(s.ownerId));
  dropped += before - (state.userProperties.length + state.scenarios.length);
  if (state.session.userId && !userIds.has(state.session.userId)) state.session = { userId: null };
  return { state, dropped };
}

export class MockDatabase {
  private state: DbState;
  private listeners = new Set<() => void>();
  readonly loadReport: LoadReport;
  private readonly key: string;

  constructor(
    private readonly opts: {
      storage: StorageLike;
      clock: Clock;
      seed: (now: Date) => DbState;
      storageKey?: string;
    },
  ) {
    this.key = opts.storageKey ?? DB_STORAGE_KEY;
    const { state, report } = this.load();
    this.state = state;
    this.loadReport = report;
    if (report.status !== 'loaded') this.persist();
  }

  private load(): { state: DbState; report: LoadReport } {
    const now = this.opts.clock.now();
    const fresh = (): DbState => this.opts.seed(now);
    let raw: string | null = null;
    try {
      raw = this.opts.storage.getItem(this.key);
    } catch {
      raw = null;
    }
    if (raw === null) {
      return { state: fresh(), report: { status: 'fresh', message: null, droppedRows: 0, backupKey: null, fromVersion: null } };
    }
    const recover = (message: string, fromVersion: number | null): { state: DbState; report: LoadReport } => {
      const backupKey = `${this.key}.backup.${now.getTime()}`;
      try {
        this.opts.storage.setItem(backupKey, raw as string);
      } catch {
        /* lagring full – sikkerhetskopi ikke mulig */
      }
      return { state: fresh(), report: { status: 'recovered', message, droppedRows: 0, backupKey, fromVersion } };
    };
    let env: Envelope;
    try {
      env = JSON.parse(raw) as Envelope;
    } catch {
      return recover('Lagrede demodata var skadet (ugyldig JSON) og kunne ikke leses.', null);
    }
    if (!isObject(env) || env.format !== DB_FORMAT || typeof env.schemaVersion !== 'number' || !isObject(env.state)) {
      return recover('Lagrede demodata hadde et ukjent format.', null);
    }
    if (env.schemaVersion > DB_SCHEMA_VERSION) {
      return recover(`Lagrede demodata er fra en nyere versjon (v${env.schemaVersion}) enn denne appen støtter.`, env.schemaVersion);
    }
    let stateRaw = env.state as Record<string, unknown>;
    let migrated = false;
    try {
      for (let v = env.schemaVersion; v < DB_SCHEMA_VERSION; v++) {
        const m = MIGRATIONS[v];
        if (!m) throw new Error(`Mangler migrering fra v${v}`);
        stateRaw = m(stateRaw);
        migrated = true;
      }
    } catch (e) {
      return recover(`Kunne ikke oppgradere lagrede demodata: ${(e as Error).message}`, env.schemaVersion);
    }
    const { state, dropped } = sanitizeState(stateRaw, fresh());
    const status: LoadReport['status'] = dropped > 0 ? 'repaired' : migrated ? 'migrated' : 'loaded';
    // Rader som ikke lar seg lese fjernes fra den aktive databasen – men aldri uten sikkerhetskopi.
    let backupKey: string | null = null;
    if (dropped > 0) {
      backupKey = `${this.key}.backup.${now.getTime()}`;
      try {
        this.opts.storage.setItem(backupKey, raw);
      } catch {
        backupKey = null;
      }
    }
    const parts: string[] = [];
    if (migrated) parts.push(`Lagrede demodata ble oppgradert fra v${env.schemaVersion} til v${DB_SCHEMA_VERSION}.`);
    if (dropped > 0) {
      parts.push(`${dropped} ugyldige rader i lokale demodata ble hoppet over. Objekter som mangler analyse kan hentes på nytt på objektsiden, eller du kan tilbakestille demodata under Testkontroller.`);
    }
    return { state, report: { status, message: parts.length ? parts.join(' ') : null, droppedRows: dropped, backupKey, fromVersion: env.schemaVersion } };
  }

  private persist(): void {
    const env: Envelope = {
      format: DB_FORMAT,
      schemaVersion: DB_SCHEMA_VERSION,
      savedAt: this.opts.clock.now().toISOString(),
      state: this.state,
    };
    try {
      this.opts.storage.setItem(this.key, JSON.stringify(env));
    } catch {
      /* lagring full/blokkert – data beholdes i minnet for denne økten */
    }
  }

  private emit(): void {
    for (const l of [...this.listeners]) l();
  }

  /** Lesetilgang. Returnerer intern tilstand – kall aldri mutasjoner på resultatet. */
  read<T>(fn: (s: Readonly<DbState>) => T): T {
    return structuredClone(fn(this.state));
  }

  /**
   * Atomisk skriving: endringer gjøres på en kopi og committes bare hvis funksjonen
   * fullfører uten unntak. Et kast ruller tilbake alt.
   */
  transaction<T>(fn: (draft: DbState) => T): T {
    const draft = structuredClone(this.state);
    const result = fn(draft);
    this.state = draft;
    this.persist();
    this.emit();
    return structuredClone(result);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Tilbakestill til nye demodata. */
  reset(): void {
    this.state = this.opts.seed(this.opts.clock.now());
    this.persist();
    this.emit();
  }

  /** Les inn på nytt fra lagring (f.eks. når en annen fane har endret data). */
  reloadFromStorage(): void {
    const { state } = this.load();
    this.state = state;
    this.emit();
  }

  get storageKey(): string {
    return this.key;
  }
}
