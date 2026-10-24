import { systemClock, type Clock } from '../../lib/clock';
import type { RedirectResult, Services } from '../types';
import { SupabaseAnalysisReader } from './analysisReader';
import { SupabaseAuthService } from './authService';
import { getSupabaseClient, type SupabaseClientProvider } from './client';
import type { SupabaseConfig } from './config';
import { SupabaseEvents } from './events';
import {
  NOT_CONFIGURED_AREAS,
  notConfiguredCalendar,
  notConfiguredComparables,
  notConfiguredCourses,
  notConfiguredImports,
  notConfiguredRisks,
  notConfiguredSubscription,
} from './notConfigured';
import { SupabaseProfileService } from './profileService';
import { SupabasePropertyRepository } from './propertyRepository';
import { oauthRedirectUrl, readAuthRedirectFromLocation } from './redirect';
import { SupabaseScenarioRepository } from './scenarioRepository';

export interface SupabaseServicesOptions {
  /** Validert offentlig konfigurasjon (URL og publishable key). Brukes til å kontrollere at Google-adressen ligger på prosjektets opprinnelse. */
  config?: SupabaseConfig;
  getClient?: SupabaseClientProvider;
  clock?: Clock;
  /** Utfallet av en retur fra Google. Standard: leses fra nettleserens adresse. */
  redirect?: RedirectResult | null;
  redirectUrl?: () => string;
}

/**
 * Produksjonskomposisjon (backend fase 2A + 2B): ekte Supabase Auth og profil (2A), og brukerens objektliste og scenarioer (2B), pluss lesing av
 * grunnanalysene objektsiden trenger. Alt annet er eksplisitt «ikke koblet til» (`notConfigured*`, og områdene står i `Services.unavailable`):
 * bestilling av analyse, abonnement, kurs, egne sammenlignbare objekter, egne risikoer, kalender og import. Appen kan dermed åpnes uten hvit skjerm
 * og uten å late som at noe finnes som ikke gjør det. Ingenting kobles til Supabase før en tjeneste faktisk brukes (klienten lages lat).
 */
export function createSupabaseServices(opts: SupabaseServicesOptions = {}): Services {
  const getClient = opts.getClient ?? (() => getSupabaseClient());
  const clock = opts.clock ?? systemClock;
  const events = new SupabaseEvents(getClient);
  const notifyChanged = () => events.emit();
  const dataDeps = { getClient, clock, notifyChanged };
  return {
    mode: 'production',
    clock,
    auth: new SupabaseAuthService({
      getClient,
      clock,
      redirectUrl: opts.redirectUrl ?? (() => oauthRedirectUrl()),
      expectedOrigin: opts.config ? new URL(opts.config.url).origin : undefined,
      redirect: opts.redirect !== undefined ? opts.redirect : readAuthRedirectFromLocation(),
      notifyChanged,
    }),
    profile: new SupabaseProfileService({ getClient, notifyChanged }),
    subscription: notConfiguredSubscription,
    courses: notConfiguredCourses,
    properties: new SupabasePropertyRepository(dataDeps),
    scenarios: new SupabaseScenarioRepository(dataDeps),
    comparables: notConfiguredComparables,
    risks: notConfiguredRisks,
    // Lesing av grunnanalyser; bestilling av analyse/oppfriskning avvises med not_configured (derfor står «analysis» fortsatt i unavailable).
    analysis: new SupabaseAnalysisReader(dataDeps),
    calendar: notConfiguredCalendar,
    imports: notConfiguredImports,
    events,
    demo: null,
    unavailable: NOT_CONFIGURED_AREAS,
  };
}
