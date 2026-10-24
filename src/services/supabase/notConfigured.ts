import {
  ServiceError,
  type AnalysisService,
  type CalendarService,
  type ComparableRepository,
  type CourseService,
  type ImportService,
  type RiskRepository,
  type ServiceArea,
  type SubscriptionService,
} from '../types';

/**
 * Tjenester som ennå ikke er koblet til produksjonsbackend (etter fase 2B: alt unntatt innlogging, profil, objektliste, scenarioer og lesing av analyser). Hvert kall avvises med
 * `ServiceError('not_configured')` og en forståelig melding. De gir aldri tomme eller falske data som om backend var ferdig, og de gir
 * aldri noen tilgang (abonnementet kan for eksempel ikke «bli aktivt» av at tjenesten mangler).
 *
 * Hvert grensesnitt er skrevet ut metode for metode (ikke en Proxy), så kompilatoren sier fra når en kontrakt får nye metoder.
 */
const LABEL: Record<ServiceArea, string> = {
  subscription: 'Abonnement og betaling',
  courses: 'Kurs',
  properties: 'Objekter',
  scenarios: 'Scenarioer',
  comparables: 'Egne sammenlignbare objekter',
  risks: 'Egne risikoer',
  analysis: 'Analyse av boliger',
  calendar: 'Kalender',
  imports: 'Import og eksport',
};

export function notConfiguredError(area: ServiceArea): ServiceError {
  return new ServiceError('not_configured', `${LABEL[area]} er ikke koblet til produksjonsbackend ennå. Foreløpig er innlogging, profil, objektlisten og scenarioer i bruk.`, { area });
}

const no = (area: ServiceArea) => (): Promise<never> => Promise.reject(notConfiguredError(area));

export const notConfiguredSubscription: SubscriptionService = {
  getSubscription: no('subscription'),
  getEntitlements: no('subscription'),
  startCheckout: no('subscription'),
  openCustomerPortal: no('subscription'),
  listUsage: no('subscription'),
};

export const notConfiguredCourses: CourseService = {
  getAccess: no('courses'),
  listPurchases: no('courses'),
  startPurchase: no('courses'),
};

export const notConfiguredComparables: ComparableRepository = {
  list: no('comparables'),
  create: no('comparables'),
  update: no('comparables'),
  remove: no('comparables'),
};

export const notConfiguredRisks: RiskRepository = {
  list: no('risks'),
  create: no('risks'),
  overrideBase: no('risks'),
  hideBase: no('risks'),
  update: no('risks'),
  remove: no('risks'),
};

export const notConfiguredAnalysis: AnalysisService = {
  requestAnalysis: no('analysis'),
  getJob: no('analysis'),
  retryJob: no('analysis'),
  getPublishedAnalysis: no('analysis'),
  getAnalysis: no('analysis'),
  listVersions: no('analysis'),
  requestRefresh: no('analysis'),
};

export const notConfiguredCalendar: CalendarService = {
  listEvents: no('calendar'),
  setPersonalOverride: no('calendar'),
  addPrivateViewing: no('calendar'),
  removePrivateEvent: no('calendar'),
  exportIcs: no('calendar'),
};

export const notConfiguredImports: ImportService = {
  preview: no('imports'),
  commit: no('imports'),
  exportScenarios: no('imports'),
};

/**
 * Områdene som fortsatt ikke er koblet til produksjonsbackend (= `Services.unavailable` i produksjon). Objekter og scenarioer er koblet til i fase 2B.
 * «analysis» står her fordi BESTILLING av analyse/oppfriskning ikke finnes; lesing av grunnanalyser fungerer (SupabaseAnalysisReader).
 */
export const NOT_CONFIGURED_AREAS: readonly ServiceArea[] = ['subscription', 'courses', 'comparables', 'risks', 'analysis', 'calendar', 'imports'];
