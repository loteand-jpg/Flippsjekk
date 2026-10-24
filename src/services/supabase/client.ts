import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';
import { ServiceError } from '../types';
import { readSupabaseConfig, supabaseConfigFromEnv, type SupabaseConfig } from './config';

/**
 * Supabase-klient for nettleseren. Pakken lastes dynamisk (`import()`), så den ikke havner i demoens hovedbunt, og ingenting kobler til
 * Supabase før noen eksplisitt ber om en klient. Klienten bruker alltid den offentlige nøkkelen: alt den kan gjøre, bestemmes av RLS.
 *
 * TODO: erstatt `SupabaseClient` med en klient typet av genererte databasetyper (`Database`) når ChatGPT har generert dem fra det
 * live-verifiserte prosjektet (se docs/supabase.md). Inntil da bruker adapterne smale, eksplisitte rad-typer ved grensen (f.eks. `ProfileRow`).
 * Auth og profil bruker klienten fra backend fase 2A; øvrige tjenester er ikke koblet til ennå.
 */
export type FlippsjekkSupabaseClient = SupabaseClient;

/** Gir tjenestene en klient når de trenger den. Klienten lages først da (lat), siden pakken lastes dynamisk. Tester sender inn en stubbet klient. */
export type SupabaseClientProvider = () => Promise<FlippsjekkSupabaseClient>;

/**
 * Standardvalg for innlogging i en nettleser-SPA. PKCE returnerer `?code=…` i spørringen (ikke tokens i URL-hashen), noe som
 * fungerer sammen med hash-ruteren. Valget må verifiseres sammen med faktisk Google-OAuth i Auth-fasen.
 */
export const DEFAULT_AUTH_OPTIONS = { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } as const;

export async function createSupabaseClient(config: SupabaseConfig, options: SupabaseClientOptions<'public'> = {}): Promise<FlippsjekkSupabaseClient> {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(config.url, config.publishableKey, { ...options, auth: { ...DEFAULT_AUTH_OPTIONS, ...options.auth } });
}

let cached: Promise<FlippsjekkSupabaseClient> | null = null;

/**
 * Delt klient. Avviser med `ServiceError('not_configured')` når URL eller nøkkel mangler eller er ugyldig (inkludert hemmelige nøkler).
 * `env` kan sendes inn i tester; i appen leses `import.meta.env`.
 */
export function getSupabaseClient(env?: Record<string, string | undefined>): Promise<FlippsjekkSupabaseClient> {
  const result = env ? readSupabaseConfig(env) : supabaseConfigFromEnv();
  if (!result.ok) return Promise.reject(new ServiceError('not_configured', `Supabase er ikke konfigurert. ${result.problems.join(' ')}`, result.problems));
  if (!cached) cached = createSupabaseClient(result.config);
  return cached;
}

/** Nullstiller den delte klienten (kun for tester). */
export function resetSupabaseClientForTests(): void {
  cached = null;
}
