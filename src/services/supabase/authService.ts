import { z } from 'zod';
import { EMAIL_CODE_LENGTH, ServiceError, type AuthService, type EmailChallenge, type GoogleSignInResult, type RedirectResult, type Session, type SignInResult } from '../types';
import type { Clock } from '../../lib/clock';
import type { SupabaseClientProvider } from './client';
import { toAuthServiceError } from './errors';
import { looksLikeNewUser, mapSession } from './userMapping';

/**
 * UI-/adapterinformasjon for en bestilt e-postkode. Dette er IKKE sikkerhetskontroll og er ikke verdier vi har lest fra Supabase: faktisk
 * levetid for koden, tid mellom nye koder og rate limits settes i Supabase Auth (og må kontrolleres der). Serveren er autoritativ – vi
 * avviser aldri en kode fordi `expiresAt` har passert, og `resendAfter` hindrer bare at knappen trykkes for tidlig.
 */
export const OTP_UI_HINT_TTL_MS = 10 * 60_000;
export const OTP_UI_RESEND_HINT_MS = 60_000;

const EmailSchema = z.string().trim().toLowerCase().email('Skriv inn en gyldig e-postadresse.');

const CHALLENGE_PREFIX = 'otp:';

/**
 * Supabase sin e-post-OTP har ingen «challenge»: koden bekreftes mot e-postadressen (`verifyOtp({ email, token })`). `challengeId` er derfor
 * bare e-postadressen i en nøytral innpakning. Den er ikke en hemmelighet og gir ingen rettigheter, kan gjenopprettes uten lagring (ingenting
 * må overleve en oppfrisking på serversiden), og serveren bestemmer fortsatt om koden er gyldig. Selve koden lagres aldri.
 */
export function encodeChallengeId(email: string): string {
  return `${CHALLENGE_PREFIX}${encodeURIComponent(email)}`;
}

export function decodeChallengeId(challengeId: string): string | null {
  if (!challengeId.startsWith(CHALLENGE_PREFIX)) return null;
  try {
    const parsed = EmailSchema.safeParse(decodeURIComponent(challengeId.slice(CHALLENGE_PREFIX.length)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface SupabaseAuthDeps {
  getClient: SupabaseClientProvider;
  clock: Clock;
  /** Hvor Supabase sender brukeren etter Google: denne siden uten hash og spørring. Tom streng = la Supabase bruke Site URL. */
  redirectUrl: () => string;
  /** Forventet opprinnelse (origin) for Google-adressen Supabase gir oss; en annen opprinnelse avvises. */
  expectedOrigin?: string;
  /** Utfallet av en retur fra Google, lest fra adressen da siden ble lastet. */
  redirect?: RedirectResult | null;
  /** Gir beskjed til resten av appen om at sesjonen kan ha endret seg. */
  notifyChanged?: () => void;
}

/**
 * `AuthService` mot Supabase Auth: Google (OAuth med PKCE) og e-post med engangskode. Det finnes ingen passord. Supabase er autoritativ for
 * alt som har med innlogging å gjøre; denne klassen oversetter bare mellom Supabase og appens kontrakt. Ingen tokens, koder eller sesjoner
 * lagres her – `@supabase/supabase-js` håndterer sesjonen (og oppfrisker den) i sin egen lagring.
 */
export class SupabaseAuthService implements AuthService {
  private redirect: RedirectResult | null;

  constructor(private readonly deps: SupabaseAuthDeps) {
    this.redirect = deps.redirect ?? null;
  }

  async session(): Promise<Session | null> {
    const client = await this.deps.getClient();
    const { data, error } = await client.auth.getSession();
    if (error) {
      if ((error as { name?: string }).name === 'AuthSessionMissingError') return null;
      throw toAuthServiceError(error, 'session');
    }
    return mapSession(data.session);
  }

  async requestEmailCode(rawEmail: string): Promise<EmailChallenge> {
    const parsed = EmailSchema.safeParse(rawEmail);
    if (!parsed.success) throw new ServiceError('validation', parsed.error.issues[0].message);
    const email = parsed.data;
    this.redirect = null;
    const client = await this.deps.getClient();
    // `shouldCreateUser: true` (Supabase sin standard): kontoen opprettes første gang koden bekreftes. Svaret er likt for ny og eksisterende bruker,
    // så vi sier ingenting om kontoen finnes fra før.
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw toAuthServiceError(error, 'otp_request');
    const now = this.deps.clock.now().getTime();
    return {
      challengeId: encodeChallengeId(email),
      email,
      expiresAt: new Date(now + OTP_UI_HINT_TTL_MS).toISOString(),
      resendAfter: new Date(now + OTP_UI_RESEND_HINT_MS).toISOString(),
    };
  }

  async verifyEmailCode(input: { challengeId: string; code: string }): Promise<SignInResult> {
    const email = decodeChallengeId(input.challengeId);
    if (!email) throw new ServiceError('code_expired', 'Koden er ikke lenger gyldig. Be om en ny kode.');
    const token = input.code.replace(/\s+/g, '');
    // Bare formatet sjekkes her (produktbeslutning: 6 siffer). Om koden er riktig, avgjør Supabase.
    if (!new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`).test(token)) throw new ServiceError('validation', `Koden har ${EMAIL_CODE_LENGTH} siffer.`);
    const client = await this.deps.getClient();
    const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw toAuthServiceError(error, 'otp_verify');
    const session = mapSession(data.session);
    if (!session || !data.session) throw new ServiceError('invalid_code', 'Koden er feil eller har utløpt. Sjekk koden, eller send en ny kode.', { cause: { reason: 'no_session_in_response' } });
    return { session, isNewUser: looksLikeNewUser(data.session.user) };
  }

  async signInWithGoogle(): Promise<GoogleSignInResult> {
    // Ingen simulert konto i produksjon: parameteren i kontrakten er bare for demoens kontovelger.
    this.redirect = null;
    const client = await this.deps.getClient();
    const redirectTo = this.deps.redirectUrl();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { ...(redirectTo ? { redirectTo } : {}), skipBrowserRedirect: true },
    });
    if (error) throw toAuthServiceError(error, 'oauth');
    const url = data?.url;
    if (!isTrustedAuthorizeUrl(url, this.deps.expectedOrigin)) {
      throw new ServiceError('unavailable', 'Kunne ikke starte innloggingen med Google. Prøv igjen.', { cause: { reason: 'unexpected_authorize_url' } });
    }
    return { kind: 'redirect', url };
  }

  async signOut(): Promise<void> {
    const client = await this.deps.getClient();
    this.redirect = null;
    // `local`: bare denne nettleserøkten. Supabase sin standard («global») ville logget brukeren ut på alle enheter.
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error && (error as { name?: string }).name !== 'AuthSessionMissingError') throw toAuthServiceError(error, 'sign_out');
    this.deps.notifyChanged?.();
  }

  takeRedirectResult(): RedirectResult | null {
    const r = this.redirect;
    this.redirect = null;
    return r;
  }
}

/** Google-adressen skal ligge på Supabase-prosjektets egen opprinnelse (auth-js bygger den fra prosjekt-URL-en). */
export function isTrustedAuthorizeUrl(url: unknown, expectedOrigin?: string): url is string {
  if (typeof url !== 'string' || url.length === 0) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) return false;
    return expectedOrigin ? u.origin === expectedOrigin : true;
  } catch {
    return false;
  }
}

