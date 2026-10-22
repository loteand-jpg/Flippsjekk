import { systemClock, type Clock } from '../../lib/clock';
import type { RedirectResult, Services } from '../types';
import { SupabaseAuthService } from './authService';
import { getSupabaseClient, type SupabaseClientProvider } from './client';
import type { SupabaseConfig } from './config';
import { SupabaseEvents } from './events';
import {
  NOT_CONFIGURED_AREAS,
  notConfiguredAnalysis,
  notConfiguredCalendar,
  notConfiguredComparables,
  notConfiguredCourses,
  notConfiguredImports,
  notConfiguredProperties,
  notConfiguredRisks,
  notConfiguredScenarios,
  notConfiguredSubscription,
} from './notConfigured';
import { SupabaseProfileService } from './profileService';
import { oauthRedirectUrl, readAuthRedirectFromLocation } from './redirect';

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
 * Produksjonskomposisjon for backend fase 2A: ekte Supabase Auth og ekte profil (`public.profiles`). Alt annet er eksplisitt «ikke koblet til»
 * (`notConfigured*`, og områdene står i `Services.unavailable`), så appen kan åpnes uten hvit skjerm og uten å late som at objekter,
 * scenarioer, kalender, abonnement osv. finnes. Ingenting kobles til Supabase før en tjeneste faktisk brukes (klienten lages lat).
 */
export function createSupabaseServices(opts: SupabaseServicesOptions = {}): Services {
  const getClient = opts.getClient ?? (() => getSupabaseClient());
  const clock = opts.clock ?? systemClock;
  const events = new SupabaseEvents(getClient);
  const notifyChanged = () => events.emit();
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
    properties: notConfiguredProperties,
    scenarios: notConfiguredScenarios,
    comparables: notConfiguredComparables,
    risks: notConfiguredRisks,
    analysis: notConfiguredAnalysis,
    calendar: notConfiguredCalendar,
    imports: notConfiguredImports,
    events,
    demo: null,
    unavailable: NOT_CONFIGURED_AREAS,
  };
}
