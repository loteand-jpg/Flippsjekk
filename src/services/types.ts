import type { RefreshDecision, TechnicalReason } from '../domain/refreshPolicy';
import type { PlanConfig } from '../config/plans';
import type {
  AnalysisJob,
  CalendarOverride,
  CoursePurchase,
  PrivateEvent,
  Profile,
  ProfileDefaults,
  Property,
  PropertySnapshot,
  Scenario,
  ScenarioValues,
  SharedAnalysis,
  Subscription,
  UsageEvent,
  User,
  UserComparable,
  UserRisk,
  UserProperty,
  Viewing,
} from '../domain/schemas';
import type { ChecklistKey, WorkStatus } from '../domain/enums';
import type { ComparableFields } from '../domain/comparables';
import type { RiskFields } from '../domain/risks';
import type { BidDayPrognosis } from '../lib/bidDay';
import type { Clock } from '../lib/clock';
import type { ImportChoice, ImportPreview, ImportResult } from '../import/types';

/**
 * Tjenestekontrakter. Brukergrensesnittet kjenner bare disse grensesnittene –
 * aldri datakilden. Mockimplementasjonen ligger i services/mock; en fremtidig
 * Supabase/Vipps-implementasjon skal oppfylle de samme kontraktene.
 *
 * Alle kall gjelder innlogget bruker. Eierskap og abonnementsrettigheter håndheves
 * av tjenesten (i produksjon: database-RLS og server), ikke av grensesnittet.
 */

export type ServiceErrorCode =
  | 'not_authenticated'
  | 'invalid_credentials'
  | 'forbidden'
  | 'not_found'
  | 'subscription_inactive'
  | 'quota_exceeded'
  | 'invalid_url'
  | 'validation'
  | 'conflict'
  | 'limit_reached'
  | 'not_configured'
  | 'invalid_code'
  | 'code_expired'
  | 'too_many_attempts'
  | 'rate_limited'
  /** Tjenesten kunne ikke nås akkurat nå (nettverksfeil, midlertidig feil hos leverandøren). Å prøve igjen kan hjelpe. */
  | 'unavailable';

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly details?: unknown;
  constructor(code: ServiceErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.details = details;
  }
}

export function isServiceError(e: unknown): e is ServiceError {
  return e instanceof ServiceError || (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'ServiceError');
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface Session {
  user: User;
  /** demo = simulert innlogging (Google-kontovelger og e-postkode vist på skjermen). */
  kind: 'demo' | 'production';
}

/** Antall sifre i e-postkoden. */
export const EMAIL_CODE_LENGTH = 6;

/** Svar når en e-postkode er bestilt. I demoen følger den simulerte e-posten med; i produksjon sendes den på e-post. */
export interface EmailChallenge {
  challengeId: string;
  email: string;
  expiresAt: string;
  /** Tidligst tidspunkt for å bestille ny kode. */
  resendAfter: string;
  /** Bare i demoen: innholdet i den e-posten som ellers ville blitt sendt. */
  simulatedEmail?: { to: string; subject: string; body: string; code: string };
}

export interface SignInResult {
  session: Session;
  /** Kontoen ble opprettet under denne innloggingen. */
  isNewUser: boolean;
}

export type GoogleSignInResult = ({ kind: 'signed_in' } & SignInResult) | { kind: 'redirect'; url: string };

/**
 * Utfallet av en retur fra en ekstern innloggingsside (Google), slik det ser ut når siden lastes på nytt.
 * `returned`: brukeren kom tilbake (sesjonen hentes som vanlig). `error`: innloggingen ble avbrutt eller feilet.
 */
export type RedirectResult = { kind: 'returned' } | { kind: 'error'; message: string };

/** Fiktiv Google-konto som kan velges i demoens kontovelger. */
export interface SimulatedGoogleAccount {
  email: string;
  name: string;
}

/**
 * Innlogging: Google eller e-post med engangskode. Det finnes ingen passord.
 * Senere: Vipps, mobilnummer og Apple som flere metoder bak samme grensesnitt.
 */
export interface AuthService {
  session(): Promise<Session | null>;
  /** Bestiller en 6-sifret kode på e-post. Avslører ikke om kontoen finnes. */
  requestEmailCode(email: string): Promise<EmailChallenge>;
  /** Bekrefter koden. Logger inn, og oppretter konto første gang. */
  verifyEmailCode(input: { challengeId: string; code: string }): Promise<SignInResult>;
  /** Google: i produksjon sendes brukeren til Google; i demoen velges en fiktiv konto. */
  signInWithGoogle(account?: SimulatedGoogleAccount): Promise<GoogleSignInResult>;
  signOut(): Promise<void>;
  /**
   * Bare for innlogging via omdirigering (produksjon): hva som skjedde da brukeren kom tilbake fra Google. Gir svaret én gang, og
   * deretter `null`. Mocken har ingen omdirigering og implementerer ikke metoden.
   */
  takeRedirectResult?(): RedirectResult | null;
}

// ---------------------------------------------------------------------------
// Abonnement
// ---------------------------------------------------------------------------

export type AccessReason =
  | 'active'
  | 'trialing'
  | 'canceling'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'incomplete'
  | 'no_subscription'
  | 'not_signed_in';

export interface Entitlements {
  access: 'full' | 'read_only';
  reason: AccessReason;
  plan: PlanConfig | null;
  periodStart: string | null;
  periodEnd: string | null;
  canRequestNewAnalysis: boolean;
  canReuseAnalysis: boolean;
  canRefresh: boolean;
  canEditScenarios: boolean;
  canExport: boolean;
  limits: { newAnalyses: number; refreshes: number; scenariosPerProperty: number };
  used: { newAnalyses: number; refreshes: number; reuses: number; pendingNewAnalyses: number };
  remaining: { newAnalyses: number; refreshes: number };
}

/**
 * Abonnement betales med Vipps (betalingsavtale). Avtalen er «pending» til brukeren har godkjent i Vipps,
 * og tilgang gis først når godkjenningen er bekreftet – aldri bare fordi brukeren kom tilbake til siden.
 */
export interface VippsPending {
  kind: 'vipps_pending';
  agreementId: string;
  /** Maskert mobilnummer, f.eks. «+47 9•• •• 123». */
  phoneMasked: string;
  planId: string;
  interval: 'month' | 'year';
  /** Hva som trekkes og når (første trekk kommer etter en eventuell gratisperiode). */
  firstChargeAt: string;
  amount: number;
  /** Avtalen utløper hvis den ikke godkjennes innen dette tidspunktet. */
  expiresAt: string;
}
/** Engangsbetaling med Vipps for et kurs. Tilgang gis først når Vipps har bekreftet betalingen. */
export interface VippsCoursePending {
  kind: 'vipps_pending';
  paymentId: string;
  phoneMasked: string;
  courseId: string;
  amount: number;
  expiresAt: string;
}
export type CoursePurchaseResult = VippsCoursePending | { kind: 'redirect'; url: string };

export interface CourseAccess {
  courseId: string;
  owned: boolean;
  purchase: CoursePurchase | null;
}

/**
 * Kurs kjøpes separat med engangsbetaling og gir varig tilgang. Tilgangen er uavhengig av abonnementet
 * og faller aldri bort (heller ikke ved avsluttet abonnement).
 */
export interface CourseService {
  getAccess(courseId: string): Promise<CourseAccess>;
  listPurchases(): Promise<CoursePurchase[]>;
  /** Oppretter en Vipps-betaling. Prisen hentes alltid fra kurskatalogen – aldri fra klienten. */
  startPurchase(input: { courseId: string; phone: string }): Promise<CoursePurchaseResult>;
}

export type CheckoutResult = VippsPending | { kind: 'redirect'; url: string };
export type PortalResult = { kind: 'simulated' } | { kind: 'redirect'; url: string };

export interface SubscriptionService {
  getSubscription(): Promise<Subscription | null>;
  getEntitlements(): Promise<Entitlements>;
  /** Oppretter en Vipps-avtale. phone = mobilnummeret som er registrert i Vipps. */
  startCheckout(input: { planId: string; interval: 'month' | 'year'; phone: string }): Promise<CheckoutResult>;
  openCustomerPortal(): Promise<PortalResult>;
  listUsage(): Promise<UsageEvent[]>;
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

export interface ProfileService {
  get(): Promise<Profile>;
  update(patch: { displayName?: string; defaults?: Partial<ProfileDefaults> }): Promise<Profile>;
}

// ---------------------------------------------------------------------------
// Eiendommer
// ---------------------------------------------------------------------------

export interface AnalysisMeta {
  id: string;
  version: number;
  status: SharedAnalysis['status'];
  visibility: SharedAnalysis['visibility'];
  publishedAt: string | null;
  createdAt: string;
  schemaVersion: number;
  modelVersion: string;
  recommendation: SharedAnalysis['recommendation'];
  origin: SharedAnalysis['origin'];
}

export interface PropertyBundle {
  property: Property;
  /** Siste observasjon av annonsen. */
  snapshot: PropertySnapshot | null;
  /** Alle versjoner, eldste først. Grunnanalysen peker på sitt eget øyeblikksbilde. */
  snapshots: PropertySnapshot[];
  viewings: Viewing[];
  latestAnalysis: SharedAnalysis | null;
  versions: AnalysisMeta[];
  activeJob: AnalysisJob | null;
  lastFailedJob: AnalysisJob | null;
}

export interface MyPropertyItem extends PropertyBundle {
  link: UserProperty;
  /** Grunnanalysen brukerens primære scenario bygger på (kan være eldre enn latestAnalysis). */
  baseAnalysis: SharedAnalysis | null;
  primaryScenario: Scenario | null;
  scenarioCount: number;
  bidDay: BidDayPrognosis | null;
  bidOverride: CalendarOverride | null;
  privateEvents: PrivateEvent[];
  /** Brukerens private risikoer og endringer av grunnlagets risikoer. */
  riskEdits: UserRisk[];
  /** Samlet beslutning om oppfriskning (`decideRefresh`): hendelser, 24 timer og 30 dager. Brukes til varsler på objektsiden. */
  refreshDecision: RefreshDecision;
  /** Er teknisk reanalyse nødvendig? Bare ved inkompatibel modell, nye/endrede dokumenter eller endrede kritiske fakta – aldri bare fordi tiden har gått. */
  technicalReanalysis: { needed: boolean; reasons: TechnicalReason[] };
}

export interface PersonalStatusPatch {
  workStatus?: WorkStatus;
  favorite?: boolean;
  notes?: string;
  lastSeenAnalysisVersion?: number;
  check?: { key: ChecklistKey; confirmed: boolean; note?: string };
}

export interface PropertyRepository {
  getByFinnId(finnId: string): Promise<PropertyBundle | null>;
  getById(propertyId: string): Promise<PropertyBundle | null>;
  listMine(opts?: { includeArchived?: boolean }): Promise<MyPropertyItem[]>;
  getMine(propertyId: string): Promise<MyPropertyItem | null>;
  addToMine(propertyId: string): Promise<UserProperty>;
  archiveMine(propertyId: string, archived?: boolean): Promise<UserProperty>;
  /** Sletter bare brukerens private rader for objektet. Felles data berøres aldri. */
  removeMine(propertyId: string): Promise<void>;
  updatePersonalStatus(propertyId: string, patch: PersonalStatusPatch): Promise<UserProperty>;
}

// ---------------------------------------------------------------------------
// Scenarioer (private)
// ---------------------------------------------------------------------------

export interface ScenarioRepository {
  list(propertyId: string): Promise<Scenario[]>;
  create(propertyId: string, input: { name: string; analysisId: string; values: ScenarioValues }): Promise<Scenario>;
  update(scenarioId: string, patch: { name?: string; values?: ScenarioValues; analysisId?: string }): Promise<Scenario>;
  duplicate(scenarioId: string, name?: string): Promise<Scenario>;
  remove(scenarioId: string): Promise<void>;
  setPrimary(propertyId: string, scenarioId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Egne sammenlignbare objekter (private)
// ---------------------------------------------------------------------------

export interface ComparableRepository {
  /** Brukerens egne sammenlignbare objekter for en eiendom, nyeste dato først. */
  list(propertyId: string): Promise<UserComparable[]>;
  create(propertyId: string, input: ComparableFields): Promise<UserComparable>;
  update(id: string, input: ComparableFields): Promise<UserComparable>;
  remove(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Egne risikoer og endringer av grunnlagets risikoer (private)
// ---------------------------------------------------------------------------

export interface RiskRepository {
  list(propertyId: string): Promise<UserRisk[]>;
  /** Ny egen risiko. */
  create(propertyId: string, input: RiskFields): Promise<UserRisk>;
  /** Privat endring av en risiko fra grunnlaget (opprettes første gang, oppdateres senere). */
  overrideBase(propertyId: string, baseRiskId: string, input: RiskFields): Promise<UserRisk>;
  /** Skjul en grunnlagsrisiko for deg selv (kan vises igjen). */
  hideBase(propertyId: string, baseRiskId: string, snapshot: RiskFields): Promise<UserRisk>;
  update(id: string, input: RiskFields): Promise<UserRisk>;
  /** Sletter egen risiko, eller tilbakestiller en endring/skjuling til grunnlagets verdi. */
  remove(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

export interface Staleness {
  analysisAgeDays: number;
  /** Samlet oppfriskingsbeslutning (`decideRefresh`): reuse, enkel oppfriskning, markedsoppfriskning eller full analyse. */
  refresh: RefreshDecision;
  /** Analysen er eldre enn 30 dager: grundig markedsoppfriskning er aktuelt (ikke full teknisk analyse). */
  marketRefreshDue: boolean;
  /** Teknisk reanalyse trengs bare ved inkompatibel modell, nye/endrede dokumenter eller endrede kritiske fakta. */
  technicalReanalysis: { needed: boolean; reasons: TechnicalReason[] };
  volatileAgeHours: number | null;
  volatileStale: boolean;
}

export type AnalysisRequestResult =
  | {
      outcome: 'reused';
      propertyId: string;
      finnId: string;
      analysis: SharedAnalysis;
      staleness: Staleness;
      alreadyInList: boolean;
      charged: false;
    }
  | { outcome: 'job_started'; propertyId: string; finnId: string; job: AnalysisJob; charged: false }
  | { outcome: 'job_joined'; propertyId: string; finnId: string; job: AnalysisJob; joinedOtherUser: boolean; charged: false };

export type RefreshResult =
  | { outcome: 'already_fresh'; propertyId: string; observedAt: string }
  | { outcome: 'job_started' | 'job_joined'; propertyId: string; job: AnalysisJob };

export interface AnalysisService {
  /** Hele flyten fra FINN-lenke: tilgang → oppslag → gjenbruk / deduplisering / ny jobb. */
  requestAnalysis(input: { url: string; idempotencyKey: string }): Promise<AnalysisRequestResult>;
  getJob(jobId: string): Promise<AnalysisJob | null>;
  /** Idempotent: et nytt forsøk på en vellykket jobb gir samme resultat uten nytt forbruk. */
  retryJob(jobId: string): Promise<AnalysisJob>;
  getPublishedAnalysis(propertyId: string, version?: number): Promise<SharedAnalysis | null>;
  getAnalysis(analysisId: string): Promise<SharedAnalysis | null>;
  listVersions(propertyId: string): Promise<AnalysisMeta[]>;
  /**
   * light = pris, visninger og salgsstatus. market = grundig markedsoppfriskning (analyse > 30 dager).
   * full = teknisk reanalyse – tillatt bare når analysen mangler, er inkompatibel, eller kilden melder nye dokumenter/endrede kritiske fakta.
   */
  requestRefresh(propertyId: string, kind: 'light' | 'market' | 'full', idempotencyKey: string): Promise<RefreshResult>;
}

// ---------------------------------------------------------------------------
// Kalender
// ---------------------------------------------------------------------------

export type CalendarEventKind = 'visning' | 'buddag' | 'privat_visning' | 'importert_visning';

export interface CalendarEvent {
  uid: string;
  kind: CalendarEventKind;
  propertyId: string;
  address: string;
  district: string | null;
  title: string;
  start: string;
  end: string | null;
  status: 'planlagt' | 'avlyst';
  url: string;
  sourceLabel: string;
  verifiedAt: string | null;
  isDemo: boolean;
  note: string | null;
  confirmed: boolean | null;
  prognosis: BidDayPrognosis | null;
  override: CalendarOverride | null;
  privateEventId: string | null;
}

export interface CalendarService {
  listEvents(): Promise<CalendarEvent[]>;
  setPersonalOverride(propertyId: string, input: { start: string; note: string } | null): Promise<void>;
  addPrivateViewing(propertyId: string, input: { start: string; end: string | null; note: string }): Promise<PrivateEvent>;
  removePrivateEvent(eventId: string): Promise<void>;
  exportIcs(): Promise<{ filename: string; content: string }>;
}

// ---------------------------------------------------------------------------
// Import / eksport
// ---------------------------------------------------------------------------

export interface ImportService {
  preview(text: string, byteLength: number): Promise<ImportPreview>;
  commit(preview: ImportPreview, choices: Record<number, ImportChoice>): Promise<ImportResult>;
  exportScenarios(): Promise<{ filename: string; content: string }>;
}

// ---------------------------------------------------------------------------
// Demo (finnes bare i mockimplementasjonen)
// ---------------------------------------------------------------------------

export type SubscriptionPreset = 'active' | 'trialing' | 'canceling' | 'past_due' | 'expired' | 'none' | 'low_quota';

export interface DemoAccount {
  id: string;
  email: string;
  displayName: string;
  label: string;
}

export interface DemoService {
  listAccounts(): Promise<DemoAccount[]>;
  /** Snarvei til ferdige testprofiler (hopper over e-postkode). Bare i demoen. */
  signInAsProfile(email: string): Promise<Session>;
  /** Fiktive Google-kontoer i kontovelgeren. */
  googleAccounts(): SimulatedGoogleAccount[];
  /** Simulerer brukerens valg i Vipps-appen (og Vipps' bekreftelse til serveren). */
  vipps: {
    /** Avgjør en ventende Vipps-avtale (abonnement) eller -betaling (kurs). */
    decide(id: string, outcome: 'approved' | 'rejected'): Promise<{ status: 'approved' | 'rejected'; subscription: Subscription | null; purchase: CoursePurchase | null }>;
  };
  switchUser(userId: string): Promise<void>;
  setSubscriptionPreset(preset: SubscriptionPreset): Promise<void>;
  setFailNextJob(mode: 'fetch_error' | 'invalid_result' | null): Promise<void>;
  getFailNextJob(): Promise<'fetch_error' | 'invalid_result' | null>;
  startSharedJobAsOtherUser(): Promise<{ finnId: string; url: string; byUser: string }>;
  reset(): Promise<void>;
  corruptStorageAndReload(): void;
  loadReport(): { status: string; message: string | null; backupKey: string | null };
  seededAt(): Promise<string>;
  /** Kjører jobbsimulatoren ett steg (brukes også av tester). */
  tick(): void;
  billing: {
    cancelAtPeriodEnd(): Promise<Subscription>;
    resume(): Promise<Subscription>;
    fixPayment(): Promise<Subscription>;
    changeInterval(interval: 'month' | 'year'): Promise<Subscription>;
  };
}

export interface DataEvents {
  subscribe(listener: () => void): () => void;
}

/**
 * Deler av backend som UI-et kan avhenge av. Brukes til å si ærlig fra om hva som ennå ikke er koblet til (se `Services.unavailable`).
 */
export type ServiceArea = 'subscription' | 'courses' | 'properties' | 'scenarios' | 'comparables' | 'risks' | 'analysis' | 'calendar' | 'imports';

export interface Services {
  mode: 'demo' | 'production';
  clock: Clock;
  auth: AuthService;
  subscription: SubscriptionService;
  profile: ProfileService;
  properties: PropertyRepository;
  scenarios: ScenarioRepository;
  comparables: ComparableRepository;
  risks: RiskRepository;
  courses: CourseService;
  analysis: AnalysisService;
  calendar: CalendarService;
  imports: ImportService;
  events: DataEvents;
  demo: DemoService | null;
  /**
   * Områder som ennå ikke er koblet til en backend. Tjenestene for dem kaster `ServiceError('not_configured')`, og UI-et viser da en
   * tydelig melding i stedet for tomme data. Tom i demoen (alt er simulert lokalt).
   */
  unavailable: readonly ServiceArea[];
}
