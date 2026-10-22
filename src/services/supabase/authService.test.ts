import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../lib/clock';
import { isServiceError, type ServiceError } from '../types';
import { SupabaseAuthService, decodeChallengeId, encodeChallengeId, isTrustedAuthorizeUrl, OTP_UI_HINT_TTL_MS, OTP_UI_RESEND_HINT_MS } from './authService';
import { FakeSupabase, authApiError, networkError } from './testing';

const NOW = '2026-10-22T12:00:00.000Z';

function setup(over: Partial<ConstructorParameters<typeof SupabaseAuthService>[0]> = {}) {
  const fake = new FakeSupabase();
  const notified: number[] = [];
  const auth = new SupabaseAuthService({
    getClient: fake.provider,
    clock: new ManualClock(NOW),
    redirectUrl: () => 'https://app.example/flippsjekk/',
    expectedOrigin: fake.origin,
    notifyChanged: () => notified.push(1),
    ...over,
  });
  return { fake, auth, notified };
}

async function rejection(p: Promise<unknown>): Promise<ServiceError> {
  try {
    await p;
  } catch (e) {
    expect(isServiceError(e), String(e)).toBe(true);
    return e as ServiceError;
  }
  throw new Error('Forventet at kallet ble avvist');
}

describe('SupabaseAuthService: sesjon', () => {
  it('uten sesjon: null', async () => {
    const { auth } = setup();
    expect(await auth.session()).toBeNull();
  });

  it('med eksisterende sesjon: domene-bruker (ikke Supabase-bruker), kind production', async () => {
    const { auth, fake } = setup();
    const u = fake.signedInAs('kari@eksempel.no', { full_name: 'Kari Nordmann' });
    const s = await auth.session();
    expect(s).toEqual({ kind: 'production', user: { id: u.id, email: 'kari@eksempel.no', displayName: 'Kari Nordmann', isDemoAccount: false, createdAt: u.created_at } });
    // Supabase-spesifikke felt lekker ikke videre.
    expect(Object.keys(s!.user).sort()).toEqual(['createdAt', 'displayName', 'email', 'id', 'isDemoAccount']);
  });

  it('anonym Auth-bruker regnes ikke som innlogget', async () => {
    const { auth, fake } = setup();
    fake.signedInAs('anon@eksempel.no').is_anonymous = true;
    expect(await auth.session()).toBeNull();
  });

  it('manglende sesjon-feil fra Supabase gir null; andre feil gir kontrollert ServiceError', async () => {
    const { auth, fake } = setup();
    fake.failNext.getSession = Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError', status: 400 });
    expect(await auth.session()).toBeNull();
    fake.failNext.getSession = networkError();
    const e = await rejection(auth.session());
    expect(e.code).toBe('unavailable');
    expect(e.message).toMatch(/kontakt/);
  });
});

describe('SupabaseAuthService: e-post med engangskode', () => {
  it('bestiller kode: normalisert e-post, shouldCreateUser, challenge uten hemmeligheter og uten simulert e-post', async () => {
    const { auth, fake } = setup();
    const c = await auth.requestEmailCode('  Test.Bruker@Eksempel.NO ');
    expect(fake.callsTo('signInWithOtp')[0].args).toEqual({ email: 'test.bruker@eksempel.no', options: { shouldCreateUser: true } });
    expect(c.email).toBe('test.bruker@eksempel.no');
    expect(c.simulatedEmail).toBeUndefined();
    // Koden finnes bare hos «Supabase» – aldri i svaret til UI.
    expect(JSON.stringify(c)).not.toContain(fake.nextCode);
    // expiresAt/resendAfter er UI-hint fra adapteren, ikke fra Supabase.
    expect(Date.parse(c.expiresAt) - Date.parse(NOW)).toBe(OTP_UI_HINT_TTL_MS);
    expect(Date.parse(c.resendAfter) - Date.parse(NOW)).toBe(OTP_UI_RESEND_HINT_MS);
  });

  it('ugyldig e-post avvises før noe sendes til Supabase', async () => {
    const { auth, fake } = setup();
    const e = await rejection(auth.requestEmailCode('ikke-en-epost'));
    expect(e.code).toBe('validation');
    expect(e.message).toBe('Skriv inn en gyldig e-postadresse.');
    expect(fake.callsTo('signInWithOtp')).toHaveLength(0);
  });

  it('svaret er likt for ny og eksisterende konto (ingen kontoeksistens i UI)', async () => {
    const { auth, fake } = setup();
    fake.signedInAs('finnes@eksempel.no');
    fake.session = null;
    const a = await auth.requestEmailCode('finnes@eksempel.no');
    const b = await auth.requestEmailCode('ny@eksempel.no');
    const strip = (c: { challengeId: string; email: string }) => Object.keys(c).sort();
    expect(strip(a)).toEqual(strip(b));
  });

  it('challengeId er ikke en hemmelighet, kan gjenopprettes uten lagring og gir ingen tilgang alene', async () => {
    expect(decodeChallengeId(encodeChallengeId('a@b.no'))).toBe('a@b.no');
    expect(decodeChallengeId('otp:a%40b.no')).toBe('a@b.no');
    expect(decodeChallengeId('ukjent')).toBeNull();
    expect(decodeChallengeId('otp:ikke-epost')).toBeNull();
    expect(decodeChallengeId('otp:%E0%A4%A')).toBeNull(); // ugyldig prosentkoding
    // «Oppfriskning»: en NY tjenesteinstans (som etter reload) kan bekrefte en kode bestilt av en annen – challengeId bærer alt som trengs.
    const first = setup();
    const c = await first.auth.requestEmailCode('refresh@eksempel.no');
    const reloaded = new SupabaseAuthService({ getClient: first.fake.provider, clock: new ManualClock(NOW), redirectUrl: () => '' });
    const r = await reloaded.verifyEmailCode({ challengeId: c.challengeId, code: first.fake.nextCode });
    expect(r.session.user.email).toBe('refresh@eksempel.no');
  });

  it('riktig kode logger inn: Supabase avgjør, koden sendes som token med type email, og kontoen er ny første gang', async () => {
    const { auth, fake } = setup();
    const c = await auth.requestEmailCode('ny.bruker@eksempel.no');
    const r = await auth.verifyEmailCode({ challengeId: c.challengeId, code: '123 456' });
    expect(fake.callsTo('verifyOtp')[0].args).toEqual({ email: 'ny.bruker@eksempel.no', token: '123456', type: 'email' });
    expect(r.session.kind).toBe('production');
    expect(r.session.user.email).toBe('ny.bruker@eksempel.no');
    expect(r.isNewUser).toBe(true);
    expect((await auth.session())?.user.id).toBe(r.session.user.id);
  });

  it('en eksisterende bruker som logger inn igjen er ikke ny', async () => {
    const { auth, fake } = setup();
    fake.signedInAs('gammel@eksempel.no');
    fake.session = null;
    const c = await auth.requestEmailCode('gammel@eksempel.no');
    expect((await auth.verifyEmailCode({ challengeId: c.challengeId, code: '123456' })).isNewUser).toBe(false);
  });

  it('feil kode: Supabase sier «feil eller utløpt» – vi kan ikke skille, så meldingen nevner begge, og brukeren kan prøve igjen', async () => {
    const { auth } = setup();
    const c = await auth.requestEmailCode('a@eksempel.no');
    const e = await rejection(auth.verifyEmailCode({ challengeId: c.challengeId, code: '000000' }));
    expect(e.code).toBe('invalid_code');
    expect(e.message).toMatch(/feil/);
    expect(e.message).toMatch(/utløpt/);
    expect(e.message).not.toMatch(/token/i); // ingen rå Supabase-tekst
    expect(JSON.stringify(e.details)).toContain('otp_expired'); // teknisk årsak bevares til feilsøking
  });

  it('utløpt kode (samme svar fra Supabase) gir samme kontrollerte feil, og ingen sesjon opprettes', async () => {
    const { auth, fake } = setup();
    const c = await auth.requestEmailCode('b@eksempel.no');
    fake.codes.delete('b@eksempel.no'); // koden er utløpt hos Supabase
    const e = await rejection(auth.verifyEmailCode({ challengeId: c.challengeId, code: fake.nextCode }));
    expect(['invalid_code', 'code_expired']).toContain(e.code);
    expect(await auth.session()).toBeNull();
  });

  it('feil format avvises lokalt (6 siffer), uten å bruke et forsøk hos Supabase', async () => {
    const { auth, fake } = setup();
    const c = await auth.requestEmailCode('c@eksempel.no');
    for (const code of ['12345', '1234567', 'abcdef', '']) {
      expect((await rejection(auth.verifyEmailCode({ challengeId: c.challengeId, code }))).code).toBe('validation');
    }
    expect(fake.callsTo('verifyOtp')).toHaveLength(0);
  });

  it('ukjent challengeId gir «ikke lenger gyldig» uten å kalle Supabase', async () => {
    const { auth, fake } = setup();
    const e = await rejection(auth.verifyEmailCode({ challengeId: 'finnes-ikke', code: '123456' }));
    expect(e.code).toBe('code_expired');
    expect(fake.callsTo('verifyOtp')).toHaveLength(0);
  });

  it('rate limit ved bestilling: viser ventetiden Supabase oppgir', async () => {
    const { auth, fake } = setup();
    fake.failNext.signInWithOtp = authApiError(429, 'over_email_send_rate_limit', 'For security purposes, you can only request this after 42 seconds.');
    const e = await rejection(auth.requestEmailCode('d@eksempel.no'));
    expect(e.code).toBe('rate_limited');
    expect(e.message).toBe('Vent 42 sekunder før du ber om ny kode.');
  });

  it('rate limit ved bekreftelse og nettverksfeil gir norske meldinger', async () => {
    const { auth, fake } = setup();
    const c = await auth.requestEmailCode('e@eksempel.no');
    fake.failNext.verifyOtp = authApiError(429, 'over_request_rate_limit', 'Request rate limit reached');
    expect((await rejection(auth.verifyEmailCode({ challengeId: c.challengeId, code: '123456' }))).code).toBe('rate_limited');
    fake.failNext.verifyOtp = networkError();
    const net = await rejection(auth.verifyEmailCode({ challengeId: c.challengeId, code: '123456' }));
    expect(net.code).toBe('unavailable');
    expect(net.message).toMatch(/nettverket/);
  });

  it('e-postinnlogging avslått i Supabase gir not_configured med forklaring', async () => {
    const { auth, fake } = setup();
    fake.failNext.signInWithOtp = authApiError(422, 'email_provider_disabled', 'Email logins are disabled');
    const e = await rejection(auth.requestEmailCode('f@eksempel.no'));
    expect(e.code).toBe('not_configured');
    expect(e.message).toMatch(/Supabase Auth/);
  });

  it('lagrer ingen kode, token eller sesjon selv (ingen localStorage/sessionStorage)', async () => {
    const { auth } = setup();
    const store: string[] = [];
    const g = globalThis as unknown as { localStorage?: unknown; sessionStorage?: unknown };
    const prev = [g.localStorage, g.sessionStorage];
    const spy = { setItem: (k: string, v: string) => void store.push(`${k}=${v}`), getItem: () => null, removeItem: () => undefined };
    g.localStorage = spy;
    g.sessionStorage = spy;
    try {
      const c = await auth.requestEmailCode('g@eksempel.no');
      await auth.verifyEmailCode({ challengeId: c.challengeId, code: '123456' });
      await auth.signOut();
    } finally {
      [g.localStorage, g.sessionStorage] = prev;
    }
    expect(store).toEqual([]);
  });
});

describe('SupabaseAuthService: Google', () => {
  it('gir en redirect til Supabase sin authorize-URL; ingen automatisk nettleser-redirect og redirectTo uten hash', async () => {
    const { auth, fake } = setup();
    const r = await auth.signInWithGoogle();
    expect(r.kind).toBe('redirect');
    if (r.kind !== 'redirect') return;
    expect(r.url.startsWith(`${fake.origin}/auth/v1/authorize`)).toBe(true);
    expect(fake.callsTo('signInWithOAuth')[0].args).toEqual({ provider: 'google', options: { redirectTo: 'https://app.example/flippsjekk/', skipBrowserRedirect: true } });
    expect(new URL(r.url).searchParams.get('redirect_to')).not.toContain('#');
  });

  it('ignorerer demoens simulerte konto (parameteren finnes bare i demoen)', async () => {
    const { auth, fake } = setup();
    await auth.signInWithGoogle();
    expect(JSON.stringify(fake.callsTo('signInWithOAuth')[0].args)).not.toContain('@');
  });

  it('en authorize-URL på en annen opprinnelse (eller http) avvises', async () => {
    expect(isTrustedAuthorizeUrl('https://prosjekt.supabase.co/auth/v1/authorize?x=1', 'https://prosjekt.supabase.co')).toBe(true);
    expect(isTrustedAuthorizeUrl('https://ond.example/auth/v1/authorize', 'https://prosjekt.supabase.co')).toBe(false);
    expect(isTrustedAuthorizeUrl('http://prosjekt.supabase.co/auth', 'http://prosjekt.supabase.co')).toBe(false);
    expect(isTrustedAuthorizeUrl('http://localhost:54321/auth/v1/authorize', 'http://localhost:54321')).toBe(true);
    expect(isTrustedAuthorizeUrl('javascript:alert(1)')).toBe(false);
    expect(isTrustedAuthorizeUrl(undefined)).toBe(false);
    const { auth, fake } = setup({ expectedOrigin: 'https://noe-annet.supabase.co' });
    expect(fake.origin).not.toBe('https://noe-annet.supabase.co');
    expect((await rejection(auth.signInWithGoogle())).code).toBe('unavailable');
  });

  it('Google ikke slått på i Supabase gir not_configured', async () => {
    const { auth, fake } = setup();
    fake.failNext.signInWithOAuth = authApiError(400, 'validation_failed', 'Unsupported provider: provider is not enabled');
    expect((await rejection(auth.signInWithGoogle())).code).toBe('unavailable'); // ukjent kode = ikke gjett konfigurasjon
    fake.failNext.signInWithOAuth = authApiError(400, 'provider_disabled', 'Provider disabled');
    expect((await rejection(auth.signInWithGoogle())).code).toBe('not_configured');
  });

  it('retur fra Google: utfallet leses én gang', () => {
    const returned = setup({ redirect: { kind: 'returned' } }).auth;
    expect(returned.takeRedirectResult()).toEqual({ kind: 'returned' });
    expect(returned.takeRedirectResult()).toBeNull();
    const failed = setup({ redirect: { kind: 'error', message: 'Innloggingen med Google ble avbrutt.' } }).auth;
    expect(failed.takeRedirectResult()).toEqual({ kind: 'error', message: 'Innloggingen med Google ble avbrutt.' });
    expect(failed.takeRedirectResult()).toBeNull();
  });

  it('en ny innloggingsforsøk nullstiller en gammel retur-feil', async () => {
    const { auth } = setup({ redirect: { kind: 'error', message: 'gammel feil' } });
    await auth.requestEmailCode('h@eksempel.no');
    expect(auth.takeRedirectResult()).toBeNull();
  });
});

describe('SupabaseAuthService: utlogging', () => {
  it('fjerner sesjonen i Supabase, bare for denne nettleseren (scope local), og varsler appen', async () => {
    const { auth, fake, notified } = setup();
    fake.signedInAs('i@eksempel.no');
    await auth.signOut();
    expect(fake.callsTo('signOut')[0].args).toEqual({ scope: 'local' });
    expect(fake.session).toBeNull();
    expect(await auth.session()).toBeNull();
    expect(notified).toHaveLength(1);
  });

  it('utlogging uten sesjon er ikke en feil; andre feil meldes', async () => {
    const { auth, fake } = setup();
    fake.failNext.signOut = Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError', status: 400 });
    await expect(auth.signOut()).resolves.toBeUndefined();
    fake.failNext.signOut = networkError();
    expect((await rejection(auth.signOut())).code).toBe('unavailable');
  });
});

describe('SupabaseAuthService: konfigurasjon', () => {
  it('manglende Supabase-konfigurasjon gir ServiceError(not_configured) på alle metoder', async () => {
    const { ServiceError } = await import('../types');
    const auth = new SupabaseAuthService({
      getClient: () => Promise.reject(new ServiceError('not_configured', 'Supabase er ikke konfigurert. VITE_SUPABASE_URL mangler.')),
      clock: new ManualClock(NOW),
      redirectUrl: () => '',
    });
    for (const call of [() => auth.session(), () => auth.requestEmailCode('a@b.no'), () => auth.signInWithGoogle(), () => auth.signOut()]) {
      expect((await rejection(call())).code).toBe('not_configured');
    }
    const c = encodeChallengeId('a@b.no');
    expect((await rejection(auth.verifyEmailCode({ challengeId: c, code: '123456' }))).code).toBe('not_configured');
  });
});
