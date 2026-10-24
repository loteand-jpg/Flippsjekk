import { ServiceError } from '../types';

/**
 * Mapper feil fra Supabase Auth (auth-js) og PostgREST til appens `ServiceError` med norske, forståelige meldinger.
 *
 * Feilene typesjekkes strukturelt (`name`, `status`, `code`) i stedet for med `instanceof`/`isAuthApiError`. Da trenger ikke denne filen å
 * importere `@supabase/supabase-js`, som ellers ville havnet i hovedbunten (pakken lastes dynamisk, se client.ts). Klassenavnene i auth-js er
 * faste strenger (ikke avledet fra minifiserte klassenavn).
 *
 * Rå feiltekster fra Supabase vises aldri til brukeren. Et trygt utdrag (navn, kode, status, melding – aldri tokens eller radinnhold) følger med
 * i `ServiceError.details.cause` for feilsøking.
 */
export type AuthErrorContext = 'otp_request' | 'otp_verify' | 'oauth' | 'session' | 'sign_out';

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
}

const asLike = (e: unknown): ErrorLike => (typeof e === 'object' && e !== null ? (e as ErrorLike) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export interface SafeCause {
  name?: string;
  code?: string;
  status?: number;
  message?: string;
}

/** Trygt utdrag av en feil til feilsøking. Inneholder aldri `details` (kan inneholde radinnhold) eller tokens. */
export function safeCause(e: unknown): SafeCause {
  const l = asLike(e);
  return { name: str(l.name), code: str(l.code) ?? (num(l.code) !== undefined ? String(l.code) : undefined), status: num(l.status), message: str(l.message)?.slice(0, 300) };
}

export function isNetworkError(e: unknown): boolean {
  const l = asLike(e);
  if (l.name === 'AuthRetryableFetchError') return true;
  if (e instanceof TypeError) return true; // fetch kaster TypeError ved nettverksfeil
  const msg = str(l.message) ?? '';
  const status = num(l.status);
  return (status === undefined || status === 0) && /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg);
}

const NOT_SIGNED_IN = 'Du er ikke innlogget. Logg inn på nytt.';
const NETWORK = 'Får ikke kontakt med innloggingstjenesten. Sjekk nettverket og prøv igjen.';
const SERVER = 'Innloggingstjenesten har en midlertidig feil. Prøv igjen om litt.';

function rateLimitMessage(message: string | undefined): string {
  // Supabase: «For security purposes, you can only request this after 59 seconds.»
  const m = /after (\d+) seconds?/i.exec(message ?? '');
  return m ? `Vent ${m[1]} sekunder før du ber om ny kode.` : 'For mange forsøk. Vent litt før du prøver igjen.';
}

/** Feil fra Supabase Auth (signInWithOtp, verifyOtp, signInWithOAuth, getSession, signOut). */
export function toAuthServiceError(err: unknown, context: AuthErrorContext): ServiceError {
  const cause = safeCause(err);
  const details = { cause, context };
  const code = cause.code;
  const status = cause.status;

  if (isNetworkError(err)) return new ServiceError('unavailable', NETWORK, details);
  if (cause.name === 'AuthSessionMissingError') return new ServiceError('not_authenticated', NOT_SIGNED_IN, details);

  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || code === 'over_sms_send_rate_limit' || status === 429) {
    return new ServiceError('rate_limited', context === 'otp_request' ? rateLimitMessage(cause.message) : 'For mange forsøk. Vent litt før du prøver igjen.', details);
  }
  switch (code) {
    case 'session_not_found':
    case 'session_expired':
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
    case 'bad_jwt':
    case 'no_authorization':
      return new ServiceError('not_authenticated', NOT_SIGNED_IN, details);
    case 'user_banned':
      return new ServiceError('forbidden', 'Kontoen kan ikke brukes til å logge inn akkurat nå.', details);
    case 'email_provider_disabled':
    case 'otp_disabled':
      return new ServiceError('not_configured', 'Innlogging med e-postkode er ikke slått på i Supabase Auth ennå.', details);
    case 'provider_disabled':
    case 'oauth_provider_not_supported':
      return new ServiceError('not_configured', 'Innlogging med Google er ikke slått på i Supabase Auth ennå.', details);
    case 'email_address_not_authorized':
      return new ServiceError('not_configured', 'E-post kan ikke sendes til denne adressen med dagens oppsett av Supabase Auth.', details);
    case 'signup_disabled':
      // Samme nøytrale tekst uansett, så meldingen ikke i seg selv forteller noe om kontoen.
      return new ServiceError('forbidden', 'Vi kunne ikke sende koden til denne e-postadressen.', details);
    case 'email_address_invalid':
    case 'validation_failed':
    case 'bad_json':
      if (context === 'otp_request') return new ServiceError('validation', 'Skriv inn en gyldig e-postadresse.', details);
      break;
    case 'captcha_failed':
      return new ServiceError('validation', 'Bekreftelsen mot roboter feilet. Prøv igjen.', details);
    case 'otp_expired':
      // Supabase svarer «Token has expired or is invalid» for BÅDE feil og utløpt kode. Vi kan ikke skille dem, og sier derfor begge deler.
      if (context === 'otp_verify') return new ServiceError('invalid_code', 'Koden er feil eller har utløpt. Sjekk koden, eller send en ny kode.', details);
      break;
    case 'flow_state_not_found':
    case 'flow_state_expired':
    case 'bad_code_verifier':
    case 'bad_oauth_state':
    case 'bad_oauth_callback':
      return new ServiceError('code_expired', 'Innloggingen utløp eller ble startet i en annen nettleser. Prøv igjen.', details);
    default:
      break;
  }

  if (status !== undefined && status >= 500) return new ServiceError('unavailable', SERVER, details);
  switch (context) {
    case 'otp_request':
      return new ServiceError('unavailable', 'Kunne ikke sende koden akkurat nå. Prøv igjen om litt.', details);
    case 'otp_verify':
      return status !== undefined && status >= 400 && status < 500
        ? new ServiceError('invalid_code', 'Koden er feil eller har utløpt. Sjekk koden, eller send en ny kode.', details)
        : new ServiceError('unavailable', SERVER, details);
    case 'oauth':
      return new ServiceError('unavailable', 'Kunne ikke starte innloggingen med Google. Prøv igjen.', details);
    case 'sign_out':
      return new ServiceError('unavailable', 'Kunne ikke logge ut akkurat nå. Prøv igjen.', details);
    default:
      return new ServiceError('unavailable', SERVER, details);
  }
}

/** Feil fra PostgREST (`from('profiles')…`). `status` er HTTP-statusen fra svaret når den finnes. */
export function toDataServiceError(error: unknown, status?: number): ServiceError {
  const cause = safeCause(error);
  const details = { cause, status };
  const code = cause.code;
  const http = status ?? cause.status;

  if (isNetworkError(error)) return new ServiceError('unavailable', 'Får ikke kontakt med databasen. Sjekk nettverket og prøv igjen.', details);
  if (http === 401 || code === 'PGRST301' || code === 'PGRST303') return new ServiceError('not_authenticated', NOT_SIGNED_IN, details);
  if (code === '42501' || http === 403) return new ServiceError('forbidden', 'Du har ikke tilgang til dette.', details);
  if (code === '23514' || code === '23502' || code === '22P02' || code === '22023') return new ServiceError('validation', 'Verdien er ikke gyldig.', details);
  if (code === 'PGRST116') return new ServiceError('not_found', 'Fant ikke profilen.', details);
  if (code === 'PGRST205' || code === 'PGRST106' || code === '42P01') {
    return new ServiceError('not_configured', 'Databasen mangler tabellen for profiler. Migrasjonene er kanskje ikke anvendt i Supabase.', details);
  }
  if (http === 429) return new ServiceError('rate_limited', 'For mange forsøk. Vent litt før du prøver igjen.', details);
  return new ServiceError('unavailable', 'Kunne ikke hente eller lagre dataene akkurat nå. Prøv igjen om litt.', details);
}

/**
 * Feil som Supabase legger i URL-en når en innlogging via Google avbrytes eller feiler (`?error=…&error_code=…&error_description=…`).
 * Teksten fra Supabase/Google vises ikke rått.
 */
export function redirectErrorMessage(p: { error?: string | null; errorCode?: string | null }): string {
  const code = p.errorCode ?? '';
  if (p.error === 'access_denied' || code === 'access_denied') return 'Innloggingen med Google ble avbrutt.';
  if (code === 'provider_disabled' || code === 'oauth_provider_not_supported') return 'Innlogging med Google er ikke slått på i Supabase Auth ennå.';
  if (code === 'signup_disabled') return 'Vi kunne ikke opprette eller logge inn kontoen.';
  if (code === 'bad_oauth_state' || code === 'bad_oauth_callback' || code === 'flow_state_expired' || code === 'flow_state_not_found') {
    return 'Innloggingen utløp eller ble startet i en annen nettleser. Prøv igjen.';
  }
  return 'Innloggingen med Google feilet. Prøv igjen.';
}
