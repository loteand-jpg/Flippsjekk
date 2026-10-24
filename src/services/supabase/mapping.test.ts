import { describe, expect, it } from 'vitest';
import { isServiceError, ServiceError } from '../types';
import { redirectErrorMessage, safeCause, toAuthServiceError, toDataServiceError } from './errors';
import { oauthRedirectUrl, parseAuthRedirect, readAuthRedirectFromLocation } from './redirect';
import { displayNameFor, looksLikeNewUser, mapSession, mapUser } from './userMapping';

describe('userMapping: Supabase-bruker → domene-bruker', () => {
  const base = { id: 'u1', email: 'kari@eksempel.no', created_at: '2026-10-01T10:00:00.123456Z', user_metadata: {} };

  it('mapper id, e-post og tidspunkt; ekte kontoer er aldri demo', () => {
    expect(mapUser(base)).toEqual({ id: 'u1', email: 'kari@eksempel.no', displayName: 'kari', isDemoAccount: false, createdAt: '2026-10-01T10:00:00.123Z' });
  });

  it('visningsnavn: metadata (Google) → e-postens lokaldel → «Bruker»; kun til visning', () => {
    expect(displayNameFor({ ...base, user_metadata: { full_name: ' Kari Nordmann ' } })).toBe('Kari Nordmann');
    expect(displayNameFor({ ...base, user_metadata: { name: 'Ola' } })).toBe('Ola');
    expect(displayNameFor({ ...base, user_metadata: { full_name: '   ', name: 42 } })).toBe('kari');
    expect(displayNameFor({ id: 'x', email: null })).toBe('Bruker');
    expect(displayNameFor({ ...base, user_metadata: { full_name: 'x'.repeat(500) } })).toHaveLength(200);
  });

  it('provider-spesifikke felt og metadata lekker ikke inn i domene-brukeren', () => {
    const u = mapUser({ ...base, user_metadata: { avatar_url: 'https://x', is_admin: true, role: 'admin' } } as never) as unknown as Record<string, unknown>;
    expect(Object.keys(u).sort()).toEqual(['createdAt', 'displayName', 'email', 'id', 'isDemoAccount']);
  });

  it('ugyldig bruker (tom id) gir kontrollert feil', () => {
    let caught: unknown;
    try {
      mapUser({ ...base, id: '' });
    } catch (e) {
      caught = e;
    }
    expect(isServiceError(caught)).toBe(true);
    expect((caught as ServiceError).code).toBe('unavailable');
  });

  it('mapSession: null for ingen sesjon og for anonyme brukere', () => {
    expect(mapSession(null)).toBeNull();
    expect(mapSession(undefined)).toBeNull();
    expect(mapSession({ user: { ...base, is_anonymous: true } })).toBeNull();
    expect(mapSession({ user: base })).toEqual({ kind: 'production', user: mapUser(base) });
  });

  it('looksLikeNewUser: første bekreftelse (samtidig) er ny, senere innlogging er ikke ny, manglende data er ikke ny', () => {
    expect(looksLikeNewUser({ ...base, email_confirmed_at: '2026-10-22T12:00:00Z', last_sign_in_at: '2026-10-22T12:00:00.5Z' })).toBe(true);
    expect(looksLikeNewUser({ ...base, email_confirmed_at: '2026-10-01T12:00:00Z', last_sign_in_at: '2026-10-22T12:00:00Z' })).toBe(false);
    expect(looksLikeNewUser(base)).toBe(false);
  });
});

describe('redirect: retur fra Google med hash-ruter', () => {
  it('vellykket PKCE-retur (?code=…): returned, adressen røres ikke', () => {
    const r = parseAuthRedirect('?code=abc123', '');
    expect(r.result).toEqual({ kind: 'returned' });
    expect(r.rewrite).toBe(false);
    expect(r.cleanSearch).toBe('?code=abc123');
  });

  it('avbrutt innlogging: feil leses fra spørringen, og feilparameterne fjernes (code beholdes ikke her fordi det ikke finnes)', () => {
    const r = parseAuthRedirect('?error=access_denied&error_code=access_denied&error_description=User+denied', '#error=access_denied&error_code=access_denied');
    expect(r.result).toEqual({ kind: 'error', message: 'Innloggingen med Google ble avbrutt.' });
    expect(r.rewrite).toBe(true);
    expect(r.cleanSearch).toBe('');
  });

  it('feil som bare ligger i fragmentet (#error=…) fanges også, og andre spørringsparametere bevares', () => {
    const r = parseAuthRedirect('?x=1', '#error=server_error&error_code=unexpected_failure&error_description=Boom');
    expect(r.result).toEqual({ kind: 'error', message: 'Innloggingen med Google feilet. Prøv igjen.' });
    expect(r.cleanSearch).toBe('?x=1');
  });

  it('en vanlig hash-rute (#/konto) og ingen parametere er ikke en retur', () => {
    expect(parseAuthRedirect('', '#/konto').result).toBeNull();
    expect(parseAuthRedirect('', '#/logg-inn?error=x').result).toBeNull(); // rute med spørring i hash: ikke Supabase
    expect(parseAuthRedirect('', '').result).toBeNull();
    expect(parseAuthRedirect('?annet=1', '').result).toBeNull();
  });

  it('feilmeldinger er norske og viser ikke leverandørens tekst', () => {
    expect(redirectErrorMessage({ error: 'access_denied' })).toMatch(/avbrutt/);
    expect(redirectErrorMessage({ errorCode: 'bad_oauth_state' })).toMatch(/annen nettleser/);
    expect(redirectErrorMessage({ errorCode: 'provider_disabled' })).toMatch(/ikke slått på/);
    expect(redirectErrorMessage({ error: 'noe_ukjent' })).toMatch(/feilet/);
  });

  it('readAuthRedirectFromLocation rydder feilparametere fra adressen via history.replaceState, og rører ikke code', () => {
    const calls: unknown[][] = [];
    const history = { state: { k: 1 }, replaceState: (...a: unknown[]) => void calls.push(a) } as unknown as History;
    const err = readAuthRedirectFromLocation({ pathname: '/app/', search: '?error=access_denied&error_code=access_denied', hash: '#error=access_denied' }, history);
    expect(err).toEqual({ kind: 'error', message: 'Innloggingen med Google ble avbrutt.' });
    expect(calls).toEqual([[{ k: 1 }, '', '/app/']]);
    calls.length = 0;
    expect(readAuthRedirectFromLocation({ pathname: '/app/', search: '?code=zzz', hash: '' }, history)).toEqual({ kind: 'returned' });
    expect(calls).toEqual([]);
    expect(readAuthRedirectFromLocation(undefined)).toBeNull();
  });

  it('redirect-URL er siden selv uten hash og spørring, uten hardkodet vertsnavn', () => {
    expect(oauthRedirectUrl({ origin: 'https://min.app', pathname: '/flippsjekk/' })).toBe('https://min.app/flippsjekk/');
    expect(oauthRedirectUrl({ origin: 'http://localhost:5199', pathname: '/' })).toBe('http://localhost:5199/');
    expect(oauthRedirectUrl(undefined)).toBe('');
  });
});

describe('errors: Supabase → ServiceError', () => {
  const api = (status: number, code: string, message = 'x') => Object.assign(new Error(message), { name: 'AuthApiError', status, code });

  it('safeCause tar med navn/kode/status/melding, men aldri details eller tokens', () => {
    const c = safeCause({ name: 'AuthApiError', code: 'x', status: 400, message: 'm', details: 'radinnhold', access_token: 'jwt' });
    expect(c).toEqual({ name: 'AuthApiError', code: 'x', status: 400, message: 'm' });
    expect(JSON.stringify(c)).not.toMatch(/radinnhold|jwt/);
  });

  it('tabell over auth-feil → kode og norsk melding', () => {
    const cases: [unknown, Parameters<typeof toAuthServiceError>[1], string][] = [
      [api(429, 'over_request_rate_limit'), 'otp_verify', 'rate_limited'],
      [api(429, 'over_email_send_rate_limit', 'only request this after 59 seconds'), 'otp_request', 'rate_limited'],
      [api(403, 'otp_expired'), 'otp_verify', 'invalid_code'],
      [api(400, 'email_address_invalid'), 'otp_request', 'validation'],
      [api(422, 'email_provider_disabled'), 'otp_request', 'not_configured'],
      [api(422, 'signup_disabled'), 'otp_request', 'forbidden'],
      [api(403, 'user_banned'), 'session', 'forbidden'],
      [api(401, 'session_not_found'), 'session', 'not_authenticated'],
      [api(400, 'flow_state_expired'), 'oauth', 'code_expired'],
      [api(500, 'unexpected_failure'), 'otp_request', 'unavailable'],
      [api(418, 'noe_ukjent'), 'otp_verify', 'invalid_code'],
      [api(418, 'noe_ukjent'), 'otp_request', 'unavailable'],
      [new TypeError('Failed to fetch'), 'otp_request', 'unavailable'],
      [Object.assign(new Error('x'), { name: 'AuthRetryableFetchError', status: 0 }), 'session', 'unavailable'],
      [Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError' }), 'session', 'not_authenticated'],
    ];
    for (const [err, ctx, code] of cases) {
      const e = toAuthServiceError(err, ctx);
      expect(e.code, `${(err as { code?: string }).code ?? (err as Error).name} / ${ctx}`).toBe(code);
      expect(e.message.length).toBeGreaterThan(5);
      expect(e.message).not.toMatch(/Token has|supabase\.co|jwt/i);
    }
  });

  it('tabell over databasefeil → kode', () => {
    const pg = (code: string) => ({ message: 'm', details: 'd', hint: 'h', code });
    expect(toDataServiceError(pg('42501'), 403).code).toBe('forbidden');
    expect(toDataServiceError(pg('PGRST301'), 401).code).toBe('not_authenticated');
    expect(toDataServiceError(pg(''), 401).code).toBe('not_authenticated');
    expect(toDataServiceError(pg('23514'), 400).code).toBe('validation');
    expect(toDataServiceError(pg('PGRST116'), 406).code).toBe('not_found');
    expect(toDataServiceError(pg('PGRST205'), 404).code).toBe('not_configured');
    expect(toDataServiceError(pg(''), 429).code).toBe('rate_limited');
    expect(toDataServiceError(pg(''), 503).code).toBe('unavailable');
    expect(toDataServiceError({ message: 'TypeError: Failed to fetch', code: '' }).code).toBe('unavailable');
  });

  it('ServiceError beholder teknisk årsak i details.cause', () => {
    const e = toAuthServiceError(api(403, 'otp_expired', 'Token has expired or is invalid'), 'otp_verify');
    expect(e).toBeInstanceOf(ServiceError);
    expect((e.details as { cause: { code: string; status: number } }).cause).toMatchObject({ code: 'otp_expired', status: 403 });
  });
});
