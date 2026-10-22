import { afterEach, describe, expect, it } from 'vitest';
import { isServiceError } from '../types';
import { createSupabaseClient, getSupabaseClient, resetSupabaseClientForTests } from './client';
import { jwtRole, readSupabaseConfig, SUPABASE_ENV } from './config';

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ iss: 'supabase', ref: 'abc', role, exp: 4102444800 })}.${'x'.repeat(20)}`;

const URL_OK = 'https://abcdefghijklmnop.supabase.co';
const KEY_OK = 'sb_publishable_0123456789abcdef';
const env = (url?: string, key?: string) => ({ [SUPABASE_ENV.url]: url, [SUPABASE_ENV.publishableKey]: key });

describe('Supabase-konfigurasjon (offentlige verdier)', () => {
  it('godtar prosjekt-URL og offentlig nøkkel, og fjerner avsluttende skråstrek', () => {
    expect(readSupabaseConfig(env(URL_OK, KEY_OK))).toEqual({ ok: true, config: { url: URL_OK, publishableKey: KEY_OK } });
    expect(readSupabaseConfig(env(`${URL_OK}/`, KEY_OK))).toMatchObject({ ok: true, config: { url: URL_OK } });
    expect(readSupabaseConfig(env(`  ${URL_OK}  `, `  ${KEY_OK}  `))).toMatchObject({ ok: true });
  });

  it('godtar en eldre anon-JWT, men avviser service_role-JWT (omgår all tilgangskontroll)', () => {
    expect(readSupabaseConfig(env(URL_OK, jwt('anon')))).toMatchObject({ ok: true });
    const bad = readSupabaseConfig(env(URL_OK, jwt('service_role')));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.problems.join(' ')).toMatch(/service_role/);
  });

  it('avviser hemmelig nøkkel (sb_secret_…) og gjengir aldri nøkkelen i meldingen', () => {
    const secret = 'sb_secret_SUPERHEMMELIG_VERDI_123';
    const r = readSupabaseConfig(env(URL_OK, secret));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.join(' ')).toMatch(/hemmelig/i);
      expect(r.problems.join(' ')).not.toContain('SUPERHEMMELIG');
    }
    const svc = jwt('service_role');
    const r2 = readSupabaseConfig(env(URL_OK, svc));
    if (!r2.ok) expect(r2.problems.join(' ')).not.toContain(svc);
  });

  it('avviser JWT med annen rolle og nøkler i ukjent format', () => {
    for (const key of [jwt('authenticated'), 'abc', 'sb_something_else', 'a.b.c']) expect(readSupabaseConfig(env(URL_OK, key)).ok, key).toBe(false);
  });

  it('melder alle manglende verdier samlet, med variabelnavnene', () => {
    const r = readSupabaseConfig(env(undefined, undefined));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems).toHaveLength(2);
      expect(r.problems.join(' ')).toContain(SUPABASE_ENV.url);
      expect(r.problems.join(' ')).toContain(SUPABASE_ENV.publishableKey);
    }
    expect(readSupabaseConfig(env('', '   ')).ok).toBe(false);
  });

  it('krever https, bortsett fra lokal utviklingsserver, og avviser URL med sti eller innlogging', () => {
    for (const url of ['http://abcdefghijklmnop.supabase.co', 'ftp://x.supabase.co', 'ikke-en-url', 'https://x.supabase.co/rest/v1', 'https://bruker:pass@x.supabase.co']) {
      expect(readSupabaseConfig(env(url, KEY_OK)).ok, url).toBe(false);
    }
    expect(readSupabaseConfig(env('http://127.0.0.1:54321', KEY_OK))).toMatchObject({ ok: true, config: { url: 'http://127.0.0.1:54321' } });
    expect(readSupabaseConfig(env('http://localhost:54321', KEY_OK))).toMatchObject({ ok: true });
  });

  it('leser rollen fra en JWT uten å kaste på ugyldig innhold', () => {
    expect(jwtRole(jwt('anon'))).toBe('anon');
    expect(jwtRole('ikke.en.jwt')).toBeNull();
    expect(jwtRole('a.b')).toBeNull();
    expect(jwtRole(`${b64url({})}.${b64url({ role: 5 })}.x`)).toBeNull();
  });
});

describe('Supabase-klient (lat og bare med gyldig konfigurasjon)', () => {
  afterEach(() => resetSupabaseClientForTests());

  it('avviser med not_configured når konfigurasjonen mangler eller har hemmelig nøkkel', async () => {
    for (const e of [env(), env(URL_OK, undefined), env(URL_OK, 'sb_secret_x'), env(URL_OK, jwt('service_role'))]) {
      const err = await getSupabaseClient(e).then(
        () => null,
        (x: unknown) => x,
      );
      expect(isServiceError(err)).toBe(true);
      expect((err as { code: string }).code).toBe('not_configured');
    }
  });

  it('lager en klient med gyldig konfigurasjon uten å ta nettverkskontakt, og gjenbruker den', async () => {
    const a = await getSupabaseClient(env(URL_OK, KEY_OK));
    const b = await getSupabaseClient(env(URL_OK, KEY_OK));
    expect(a).toBe(b);
    expect(typeof a.from).toBe('function');
    expect(typeof a.auth.getSession).toBe('function');
  });

  it('bruker PKCE som standard og kan overstyres (uten timere i testen)', async () => {
    const client = await createSupabaseClient({ url: URL_OK, publishableKey: KEY_OK }, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    expect((client.auth as unknown as { flowType: string }).flowType).toBe('pkce');
  });
});
