import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Produksjonsmodus (backend fase 2A) med STUBBET Supabase-nettverk. Appen kjører med ekte `@supabase/supabase-js` (PKCE, sesjon i
 * nettleserens lagring, PostgREST-klient), men alle kall til https://flippsjekk-e2e.invalid fanges og besvares her. Ingen ekte Supabase, Google
 * eller e-post brukes. Dette beviser kodeveien i appen – IKKE at Supabase-prosjektet er riktig konfigurert (Google-provider, e-postmal,
 * redirect-URL-er, OTP-innstillinger): det må verifiseres live (se docs/supabase.md).
 */
const SB = 'https://flippsjekk-e2e.invalid';
const APP = 'http://localhost:5199';
const CODE = '246810';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub: string, exp: number) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated', exp })}.sig`;

interface Stub {
  profile: { user_id: string; display_name: string; email: string; defaults: unknown; updated_at: string };
  requests: { method: string; path: string; body: unknown }[];
  issuedFor: string | null;
  codeValid: boolean;
}

/** Fanger alle kall mot Supabase og etterligner GoTrue (otp, verify, token, logout) og PostgREST (profiles). */
async function stubSupabase(page: Page, opts: { googleLandsAs?: string } = {}): Promise<Stub> {
  const stub: Stub = {
    profile: { user_id: '11111111-1111-4111-8111-111111111111', display_name: 'Kari Nordmann', email: 'kari@eksempel.no', defaults: null, updated_at: '2026-10-22T10:00:00.000000+00:00' },
    requests: [],
    issuedFor: null,
    codeValid: true,
  };
  const cors = { 'access-control-allow-origin': APP, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', vary: 'Origin' };
  const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
    route.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: JSON.stringify(body) });
  const session = (email: string) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const now = new Date().toISOString();
    return {
      access_token: jwt(stub.profile.user_id, exp),
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: exp,
      refresh_token: 'r-e2e',
      user: { id: stub.profile.user_id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: now, last_sign_in_at: now, created_at: now, app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], is_anonymous: false },
    };
  };

  await page.route(`${SB}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    stub.requests.push({ method: req.method(), path: path + url.search, body });

    // --- GoTrue ---
    if (path === '/auth/v1/otp') {
      stub.issuedFor = (body as { email: string }).email;
      return json(route, 200, {});
    }
    if (path === '/auth/v1/verify') {
      const b = body as { email: string; token: string; type: string };
      if (b.type !== 'email' || b.token !== CODE || !stub.codeValid) return json(route, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      return json(route, 200, session(b.email));
    }
    if (path === '/auth/v1/authorize') {
      // Google: send brukeren rett tilbake til appen, slik Supabase gjør etter en vellykket (eller avbrutt) innlogging.
      return route.fulfill({ status: 302, headers: { location: opts.googleLandsAs ? `${APP}/?code=google-code-1` : `${APP}/` } });
    }
    if (path === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'pkce') return json(route, 200, session(opts.googleLandsAs ?? 'kari@eksempel.no'));
      return json(route, 200, session(stub.profile.email));
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
    if (path === '/auth/v1/user') return json(route, 200, session(stub.profile.email).user);

    // --- PostgREST: public.profiles ---
    if (path === '/rest/v1/profiles') {
      // PostgREST svarer med en matrise (0 eller 1 rad) for både GET og PATCH med return=representation; `maybeSingle()` i supabase-js normaliserer den.
      if (req.method() === 'GET') return json(route, 200, [stub.profile]);
      if (req.method() === 'PATCH') {
        expect(req.headers()['prefer'] ?? '').toContain('return=representation');
        Object.assign(stub.profile, body as object, { updated_at: new Date().toISOString() });
        return json(route, 200, [stub.profile]);
      }
    }
    return json(route, 404, { message: `ustubbet kall: ${req.method()} ${path}` });
  });
  return stub;
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Nettleseren logger 4xx-svar fra stubben (f.eks. feil kode) som «Failed to load resource»; det er forventet og ikke en appfeil.
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function loginWithEmailCode(page: Page, email = 'kari@eksempel.no') {
  await page.goto('/#/logg-inn');
  await page.getByLabel('E-post').fill(email);
  await page.getByRole('button', { name: 'Send kode på e-post' }).click();
  await expect(page.getByLabel('Bekreftelseskode')).toBeVisible();
  await page.getByLabel('Bekreftelseskode').fill(CODE);
  await page.getByRole('button', { name: 'Bekreft og logg inn' }).click();
  await expect(page).toHaveURL(/#\/konto/);
}

test('produksjonsmodus starter med Supabase-konfigurasjon: forsiden og innloggingssiden er ærlige og uten demo', async ({ page }) => {
  const errors = collectErrors(page);
  await stubSupabase(page);
  await page.goto('/');
  await expect(page.getByText('Tidlig produksjonsversjon: innlogging og profil er koblet til.')).toBeVisible();
  await expect(page.getByText('Demoversjon – fiktive data.')).toHaveCount(0);
  await expect(page.getByText('Produksjonsmodus mangler Supabase-konfigurasjon')).toHaveCount(0);

  await page.goto('/#/logg-inn');
  await expect(page.getByRole('button', { name: 'Fortsett med Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send kode på e-post' })).toBeVisible();
  await expect(page.getByText('Simulert innlogging')).toHaveCount(0);
  await expect(page.getByText('Testprofiler')).toHaveCount(0);
  await expect(page.getByLabel(/passord/i)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('beskyttet side uten innlogging sender til innloggingssiden', async ({ page }) => {
  await stubSupabase(page);
  await page.goto('/#/konto');
  await expect(page).toHaveURL(/#\/logg-inn/);
});

test('e-postkode: feil kode gir norsk melding, riktig kode logger inn og gir ekte profil på Konto', async ({ page }) => {
  const errors = collectErrors(page);
  const stub = await stubSupabase(page);
  await page.goto('/#/logg-inn');

  await page.getByLabel('E-post').fill('ikke-en-epost');
  await page.getByRole('button', { name: 'Send kode på e-post' }).click();
  await expect(page.getByText('Skriv inn en gyldig e-postadresse.')).toBeVisible();

  await page.getByLabel('E-post').fill('Kari@Eksempel.no');
  await page.getByRole('button', { name: 'Send kode på e-post' }).click();
  await expect(page.getByLabel('Bekreftelseskode')).toBeVisible();
  // Ingen simulert e-post i produksjon, og ingen påstand om hvor lenge koden varer.
  await expect(page.getByText('Simulert e-post')).toHaveCount(0);
  await expect(page.getByText(/varer i 10 minutter/)).toHaveCount(0);
  expect(stub.issuedFor).toBe('kari@eksempel.no');
  const otp = stub.requests.find((r) => r.path === '/auth/v1/otp')!;
  expect((otp.body as { create_user: boolean }).create_user).toBe(true);

  await page.getByLabel('Bekreftelseskode').fill('000000');
  await page.getByRole('button', { name: 'Bekreft og logg inn' }).click();
  await expect(page.getByText(/Koden er feil eller har utløpt/)).toBeVisible();
  await expect(page).toHaveURL(/#\/logg-inn/);
  await expect(page.getByText(/Token has expired/)).toHaveCount(0); // ikke rå Supabase-tekst

  await page.getByLabel('Bekreftelseskode').fill(CODE);
  await page.getByRole('button', { name: 'Bekreft og logg inn' }).click();
  await expect(page).toHaveURL(/#\/konto/);
  const verify = stub.requests.filter((r) => r.path === '/auth/v1/verify').at(-1)!;
  expect(verify.body).toMatchObject({ email: 'kari@eksempel.no', token: CODE, type: 'email' });

  // Ekte profil fra «databasen»
  await expect(page.getByRole('heading', { name: 'Konto' })).toBeVisible();
  await expect(page.getByLabel('Navn')).toHaveValue('Kari Nordmann');
  await expect(page.getByText('E-post: kari@eksempel.no')).toBeVisible();
  await expect(page.getByTestId('phase-banner')).toBeVisible();
  // Abonnement er ikke koblet til: ærlig melding, ingen «gratis abonnement», ingen kjøpsknapp
  await expect(page.getByTestId('subscription-unavailable')).toContainText('Abonnement og betaling er ikke koblet til ennå');
  await expect(page.getByRole('button', { name: 'Velg abonnement' })).toHaveCount(0);
  await expect(page.getByText('Aktivt', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Du har ikke et abonnement')).toHaveCount(0);
  await expect(page.getByText('Kontoen er opprettet')).toBeVisible();
  // Standardforutsetninger er komplette selv om defaults = null i databasen
  await expect(page.getByText('Standardforutsetninger')).toBeVisible();
  const get = stub.requests.find((r) => r.method === 'GET' && r.path.startsWith('/rest/v1/profiles'))!;
  expect(get.path).toContain('select=user_id%2Cdisplay_name%2Cemail%2Cdefaults%2Cupdated_at');
  expect(get.path).toContain(`user_id=eq.${stub.profile.user_id}`);
  expect(errors).toEqual([]);
});

test('profil: navn og forutsetninger lagres bare i tillatte kolonner, og sesjon og profil består oppfrisking', async ({ page }) => {
  const errors = collectErrors(page);
  const stub = await stubSupabase(page);
  await loginWithEmailCode(page);

  await page.getByLabel('Navn').fill('Kari Ola Nordmann');
  await page.getByRole('button', { name: 'Lagre navn' }).click();
  await expect(page.getByText('Navnet er lagret')).toBeVisible();
  const patch = stub.requests.filter((r) => r.method === 'PATCH');
  expect(patch).toHaveLength(1);
  expect(patch[0].body).toEqual({ display_name: 'Kari Ola Nordmann' }); // aldri user_id, email, created_at, updated_at
  expect(patch[0].path).toContain(`user_id=eq.${stub.profile.user_id}`);
  await expect(page.locator('header').getByText('Kari Ola Nordmann')).toBeVisible();

  const months = page.getByLabel('Prosjektvarighet totalt');
  await months.fill('9');
  await page.getByRole('button', { name: 'Lagre forutsetninger' }).click();
  await expect(page.getByText('Forutsetningene er lagret')).toBeVisible();
  const second = stub.requests.filter((r) => r.method === 'PATCH').at(-1)!;
  expect(Object.keys(second.body as object)).toEqual(['defaults']);
  expect((second.body as { defaults: { months: number; interestPct: number } }).defaults).toMatchObject({ months: 9, interestPct: 6 });

  // Oppfrisking: sesjonen gjenopprettes av Supabase, og profilen hentes på nytt
  await page.reload();
  await expect(page).toHaveURL(/#\/konto/);
  await expect(page.getByLabel('Navn')).toHaveValue('Kari Ola Nordmann');
  await expect(page.getByLabel('Prosjektvarighet totalt')).toHaveValue('9');
  expect(errors).toEqual([]);
});

test('utlogging fjerner sesjonen, og beskyttede sider krever innlogging igjen', async ({ page }) => {
  const errors = collectErrors(page);
  const stub = await stubSupabase(page);
  await loginWithEmailCode(page);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-')).length)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Logg ut' }).first().click();
  // Som i demoen er både forsiden og innloggingssiden riktig (navigasjonen og RequireAuth sin omdirigering kommer i vilkårlig rekkefølge).
  await expect(page).toHaveURL(/#\/(logg-inn)?$/);
  const logout = stub.requests.find((r) => r.path.startsWith('/auth/v1/logout'))!;
  expect(logout.path).toContain('scope=local');
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-') && !k.endsWith('code-verifier')).length)).toBe(0);

  await page.goto('/#/konto');
  await expect(page).toHaveURL(/#\/logg-inn/);
  await page.reload();
  await expect(page).toHaveURL(/#\/logg-inn/); // fortsatt utlogget etter oppfrisking
  expect(errors).toEqual([]);
});

test('deler som ikke er koblet til gir en kontrollert melding – ikke tomme data, feilside eller hvit skjerm', async ({ page }) => {
  const errors = collectErrors(page);
  await stubSupabase(page);
  await loginWithEmailCode(page);
  for (const route of ['#/oversikt', '#/objekter/abc', '#/kalender', '#/sammenligning', '#/kurs', '#/kurs/flipping-privat', '#/import']) {
    await page.goto(`/${route}`);
    await expect(page.getByTestId('not-available-yet'), route).toContainText('Denne delen er ikke koblet til ennå');
    await expect(page.getByText('Noe gikk galt på denne siden')).toHaveCount(0);
    await expect(page.getByText('Ingen objekter ennå')).toHaveCount(0);
  }
  // Ingen analyseknapp når analyse ikke finnes
  await expect(page.getByRole('button', { name: 'Analyser bolig' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Til kontoen' }).click();
  await expect(page).toHaveURL(/#\/konto/);
  expect(errors).toEqual([]);
});

test('Google: sender brukeren til Supabase med PKCE og retur uten hash, og logger inn når koden byttes', async ({ page }) => {
  const errors = collectErrors(page);
  const stub = await stubSupabase(page, { googleLandsAs: 'kari@eksempel.no' });
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: 'Fortsett med Google' }).click();
  // Via Supabase sin authorize-adresse og tilbake til appen med ?code=…
  await expect(page).toHaveURL(/#\/konto/);
  const authorize = stub.requests.find((r) => r.path.startsWith('/auth/v1/authorize'))!;
  const q = new URL(`${SB}${authorize.path}`).searchParams;
  expect(q.get('provider')).toBe('google');
  expect(q.get('code_challenge')).toBeTruthy(); // PKCE
  expect(q.get('code_challenge_method')).toBe('s256');
  expect(q.get('redirect_to')).toBe(`${APP}/`); // siden selv, uten hash og spørring
  const exchange = stub.requests.find((r) => r.path.includes('grant_type=pkce'))!;
  expect(exchange.body).toMatchObject({ auth_code: 'google-code-1' });
  expect(typeof (exchange.body as { code_verifier: string }).code_verifier).toBe('string');
  await expect(page.getByLabel('Navn')).toHaveValue('Kari Nordmann');
  expect(page.url()).not.toContain('code=');
  expect(errors).toEqual([]);
});

test('Google avbrutt: feilen vises på innloggingssiden, adressen ryddes, og ingen sesjon opprettes', async ({ page }) => {
  const errors = collectErrors(page);
  await stubSupabase(page);
  // Supabase sender brukeren tilbake med feil både i spørringen og i fragmentet.
  await page.route(`${SB}/auth/v1/authorize**`, (route) =>
    route.fulfill({
      status: 302,
      headers: { location: `${APP}/?error=access_denied&error_code=access_denied&error_description=User+denied+access#error=access_denied&error_code=access_denied&error_description=User+denied+access` },
    }),
  );
  await page.goto('/#/logg-inn');
  await page.getByRole('button', { name: 'Fortsett med Google' }).click();
  await expect(page.getByText('Innloggingen med Google ble avbrutt.')).toBeVisible();
  await expect(page).toHaveURL(/#\/logg-inn/);
  expect(page.url()).not.toContain('error=');
  await expect(page.getByText('Siden finnes ikke')).toHaveCount(0);
  await page.goto('/#/konto');
  await expect(page).toHaveURL(/#\/logg-inn/);
  expect(errors).toEqual([]);
});
