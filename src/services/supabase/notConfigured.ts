import {
  ServiceError,
  type AnalysisService,
  type CalendarService,
  type ComparableRepository,
  type CourseService,
  type ImportService,
  type PropertyRepository,
  type RiskRepository,
  type ScenarioRepository,
  type ServiceArea,
  type SubscriptionService,
} from '../types';

/**
 * Tjenester som ennå ikke er koblet til produksjonsbackend (backend fase 2A: bare innlogging og profil). Hvert kall avvises med
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
  return new ServiceError('not_configured', `${LABEL[area]} er ikke koblet til produksjonsbackend ennå. I denne versjonen er bare innlogging og profil i bruk.`, { area });
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

export const notConfiguredProperties: PropertyRepository = {
  getByFinnId: no('properties'),
  getById: no('properties'),
  listMine: no('properties'),
  getMine: no('properties'),
  addToMine: no('properties'),
  archiveMine: no('properties'),
  removeMine: no('properties'),
  updatePersonalStatus: no('properties'),
};

export const notConfiguredScenarios: ScenarioRepository = {
  list: no('scenarios'),
  create: no('scenarios'),
  update: no('scenarios'),
  duplicate: no('scenarios'),
  remove: no('scenarios'),
  setPrimary: no('scenarios'),
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

/** Alle områdene som erstattes av stand-ins i fase 2A. Må stemme med objektene over (testes). */
export const NOT_CONFIGURED_AREAS: readonly ServiceArea[] = ['subscription', 'courses', 'properties', 'scenarios', 'comparables', 'risks', 'analysis', 'calendar', 'imports'];
