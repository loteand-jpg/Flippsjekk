import { expect, test, type Page, type Route } from '@playwright/test';
import { createSeed, DEMO_USERS } from '../src/data/seed';
import { buildDevSeed } from '../src/services/supabase/dev/devSeed';
import { createPgliteBackend, testJwt, type PgliteBackend } from '../src/services/supabase/dev/pgliteBackend';

/**
 * Produksjonsmodus, fase 2B: Oversikt og scenarioer mot en lokal etterligning av Supabase – PGlite med Flippsjekks migrasjoner, RLS, grants og triggere
 * bak `page.route`. Appen kjører med ekte `@supabase/supabase-js` i nettleseren; alle kall mot https://flippsjekk-e2e.invalid besvares av
 * PostgREST-emulatoren (src/services/supabase/dev/pgliteBackend.ts) som den innloggede brukeren, så ekte tilgangskontroll gjelder.
 * Dette beviser flyten i appen og i databasen lokalt – IKKE at det faktiske Supabase-prosjektet virker (det må verifiseres live).
 */
const SB = 'https://flippsjekk-e2e.invalid';
const CODE = '246810';
const NOW = new Date();
const state = createSeed(NOW);
const ADA = DEMO_USERS.ada;
const BJORN = DEMO_USERS.bjorn;
const adaOnly = state.properties.filter((p) => state.userProperties.some((l) => l.userId === ADA.id && l.propertyId === p.id) && !state.userProperties.some((l) => l.userId === BJORN.id && l.propertyId === p.id));
const p01 = state.properties.find((p) => p.address.includes('Elvekanten 17 B'))!;

let backend: PgliteBackend;
let nobody: { id: string; email: string };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  backend = await createPgliteBackend({ url: SB });
  await backend.createUser(ADA.email, ADA.id);
  await backend.createUser(BJORN.email, BJORN.id);
  for (const u of [ADA, BJORN]) for (const stmt of buildDevSeed(state, u.id, { sourceUserId: u.id }).statements) await backend.sql(stmt);
  const email = 'uten-liste@rls-test.invalid';
  nobody = { id: await backend.createUser(email), email };
});
test.afterAll(async () => {
  await backend?.close();
});

interface Who {
  id: string;
  email: string;
}

/** Svarer på alt mot «Supabase»: kodeinnlogging stubbes (ingen e-post), resten går til PGlite som den innloggede brukeren. */
async function install(page: Page, who: Who) {
  const calls: { method: string; path: string; status: number }[] = [];
  const session = () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const t = new Date().toISOString();
    return {
      access_token: testJwt(who.id, who.email),
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: exp,
      refresh_token: 'r-e2e',
      // Eksisterende bruker (bekreftet for lenge siden) – ikke «ny konto», så innlogging går til Oversikt.
      user: { id: who.id, aud: 'authenticated', role: 'authenticated', email: who.email, email_confirmed_at: '2026-01-01T10:00:00.000Z', last_sign_in_at: t, created_at: '2026-01-01T10:00:00.000Z', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], is_anonymous: false },
    };
  };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', 'content-type': 'application/json' };
  await page.route(`${SB}/**`, async (route: Route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/auth/v1/otp') return route.fulfill({ status: 200, headers: cors, body: '{}' });
    if (u.pathname === '/auth/v1/verify') {
      const b = req.postDataJSON() as { token: string };
      if (b.token !== CODE) return route.fulfill({ status: 403, headers: cors, body: JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }) });
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(session()) });
    }
    const body = req.method() === 'GET' || req.method() === 'HEAD' ? null : req.postData();
    const res = await backend.handle({ method: req.method(), url: req.url(), headers: req.headers(), body });
    calls.push({ method: req.method(), path: u.pathname + u.search, status: res.status });
    return route.fulfill({ status: res.status, headers: res.headers, body: res.body });
  });
  return calls;
}

async function login(page: Page, who: Who) {
  await page.goto('/#/logg-inn');
  await page.getByLabel('E-post').fill(who.email);
  await page.getByRole('button', { name: 'Send kode på e-post' }).click();
  await page.getByLabel('Bekreftelseskode').fill(CODE);
  await page.getByRole('button', { name: 'Bekreft og logg inn' }).click();
  await expect(page).toHaveURL(/#\/oversikt/);
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

const scenarioRows = (userId: string, propertyId: string) =>
  backend.query<{ id: string; name: string; locked: boolean; purchase: string | null }>(
    `select id, name, locked, "values"->>'purchasePrice' as purchase from public.scenarios where owner_id = $1 and property_id = $2 order by created_at, name`,
    [userId, propertyId],
  );

test('Oversikt: viser brukerens egne objekter fra databasen – ingen mockdata, ingen skriving, ingen demo', async ({ page }) => {
  const errors = collectErrors(page);
  const calls = await install(page, ADA);
  await login(page, ADA);

  await expect(page.getByRole('heading', { name: 'Mine objekter' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(p01.address) }).first()).toBeVisible();
  // Adas egne objekter (aktive) og ingenting fra demoens lokale mockdatabase.
  for (const p of adaOnly.filter((x) => !state.userProperties.find((l) => l.userId === ADA.id && l.propertyId === x.id)?.archivedAt).slice(0, 3)) {
    await expect(page.getByText(p.address).first()).toBeVisible();
  }
  expect(await page.evaluate(() => localStorage.getItem('flipprom.mockdb'))).toBeNull(); // mock-databasen er ikke startet (flipprom.pref.* er bare visningsvalg)
  await expect(page.getByText('Testkontroller')).toHaveCount(0);

  // Ærlig om det som ikke er koblet til
  await expect(page.getByTestId('analysis-unavailable')).toContainText('Nye analyser er ikke koblet til ennå');
  await expect(page.getByRole('link', { name: 'Importer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Eksporter scenarioer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Analyser bolig' })).toHaveCount(0);
  await expect(page.getByTestId('phase-banner')).toBeVisible();

  // Bare lesing: ingen skriving, og alle kall lyktes.
  expect(calls.filter((c) => c.method !== 'GET' && c.path.startsWith('/rest/v1/'))).toEqual([]);
  expect(calls.filter((c) => c.path.startsWith('/rest/v1/') && c.status !== 200)).toEqual([]);
  const tables = new Set(calls.filter((c) => c.path.startsWith('/rest/v1/')).map((c) => c.path.split('?')[0].split('/')[3]));
  // Profilen (sesjonen) + objektlisten med det Oversikt trenger. Ingen tabeller for ikke-koblede områder (referanser, abonnement, jobber …).
  expect([...tables].sort()).toEqual(['analyses', 'calendar_overrides', 'private_events', 'profiles', 'properties', 'property_snapshots', 'scenarios', 'user_properties', 'user_risks', 'viewings']);
  expect(errors).toEqual([]);
});

test('objektside og scenarioer: rediger og lagre, lagre som nytt, sett som primært, gi nytt navn, slett – og alt består etter oppfriskning', async ({ page }) => {
  const errors = collectErrors(page);
  const calls = await install(page, ADA);
  await login(page, ADA);
  await page.getByRole('link', { name: new RegExp(p01.address) }).first().click();
  await expect(page).toHaveURL(/#\/objekter\//);
  await page.getByRole('tab', { name: 'Min kalkyle' }).click();

  const before = await scenarioRows(ADA.id, p01.id);
  expect(before.map((s) => s.name).sort()).toEqual(['Hovedscenario', 'Høyt bud 3,1 mill.', 'Lett oppfrisking']);
  const select = page.locator('#scenario-select');
  await expect(select).toContainText('Hovedscenario (primært)');

  // 1. Rediger og lagre
  const price = page.getByLabel('Kjøpspris (kontant)', { exact: true });
  await price.fill('3 111 000');
  await price.blur();
  await expect(page.getByText('Ulagrede endringer')).toBeVisible();
  await page.getByRole('button', { name: 'Lagre', exact: true }).click();
  await expect(page.getByText('Scenarioet er lagret')).toBeVisible();
  await expect(page.getByText('Ulagrede endringer')).toHaveCount(0);
  expect((await scenarioRows(ADA.id, p01.id)).find((s) => s.name === 'Hovedscenario')!.purchase).toBe('3111000');

  // 2. Lagre som nytt (kopi med dagens forutsetninger), og det nye scenarioet velges
  await page.getByRole('button', { name: 'Lagre som nytt' }).click();
  await page.getByRole('dialog').getByLabel('Navn').fill('Mitt nye forslag');
  await page.getByRole('dialog').getByRole('button', { name: 'Lagre', exact: true }).click();
  await expect(page.getByText('Nytt scenario lagret')).toBeVisible();
  await expect(select).toContainText('Mitt nye forslag');
  expect((await scenarioRows(ADA.id, p01.id)).map((s) => s.name)).toContain('Mitt nye forslag');

  // 3. Sett som primært (også det nye scenarioet er valgt)
  await page.getByRole('button', { name: 'Sett som primært' }).click();
  await expect(page.getByText('Satt som primært scenario')).toBeVisible();
  const primary = await backend.query<{ name: string }>(`select s.name from public.user_properties up join public.scenarios s on s.id = up.primary_scenario_id where up.user_id = $1 and up.property_id = $2`, [ADA.id, p01.id]);
  expect(primary[0].name).toBe('Mitt nye forslag');

  // 4. Gi nytt navn
  await page.getByRole('button', { name: 'Gi nytt navn' }).click();
  await page.getByRole('dialog').getByLabel('Navn').fill('Omdøpt forslag');
  await page.getByRole('dialog').getByRole('button', { name: 'Lagre', exact: true }).click();
  await expect(page.getByText('Navnet er endret')).toBeVisible();
  expect((await scenarioRows(ADA.id, p01.id)).map((s) => s.name)).toContain('Omdøpt forslag');

  // 5. Oppfriskning: alt kommer fra databasen
  await page.reload();
  await page.getByRole('tab', { name: 'Min kalkyle' }).click();
  await expect(page.locator('#scenario-select')).toContainText('Omdøpt forslag');
  await expect(page.locator('#scenario-select')).toContainText('(primært)');
  await expect(page.getByLabel('Kjøpspris (kontant)', { exact: true })).toHaveValue(/^3\s111\s000$/);

  // 6. Slett det nye scenarioet (primær flyttes til et annet, aldri null)
  await page.getByRole('button', { name: 'Slett scenario' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Slett/ }).click();
  await expect.poll(async () => (await scenarioRows(ADA.id, p01.id)).map((s) => s.name)).not.toContain('Omdøpt forslag');
  const primaryAfter = await backend.query<{ id: string | null }>(`select primary_scenario_id as id from public.user_properties where user_id = $1 and property_id = $2`, [ADA.id, p01.id]);
  expect(primaryAfter[0].id).not.toBeNull();

  // Skrivingene gikk bare til scenarios og (primær) user_properties – aldri til felles data eller medlemskap.
  const writes = calls.filter((c) => c.method !== 'GET' && c.path.startsWith('/rest/v1/'));
  expect(writes.length).toBeGreaterThan(0);
  for (const w of writes) expect(w.path.split('?')[0], JSON.stringify(w)).toMatch(/\/rest\/v1\/(scenarios|user_properties)$/);
  expect(writes.some((w) => w.method === 'POST' && w.path.startsWith('/rest/v1/user_properties'))).toBe(false);
  expect(writes.every((w) => w.status < 400)).toBe(true);
  expect(errors).toEqual([]);
});

test('deler som ikke er koblet til på objektsiden er deaktivert eller forklart – ikke falske tomme data, og ingen feilside', async ({ page }) => {
  const errors = collectErrors(page);
  await install(page, ADA);
  await login(page, ADA);
  await page.getByRole('link', { name: new RegExp(p01.address) }).first().click();

  await page.getByRole('tab', { name: 'Risiko og sjekkliste' }).click();
  await expect(page.getByText('Egne risikoer er ikke koblet til ennå.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Legg til risiko/ })).toBeDisabled();

  await page.getByRole('tab', { name: 'Marked' }).click();
  await expect(page.getByText(/Egne sammenlignbare objekter er ikke koblet til ennå/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Legg til objekt' })).toBeDisabled();

  // Kalender er ikke koblet til: forsøk gir en kontrollert melding
  await page.getByRole('tab', { name: 'Visninger og bud' }).click();
  await page.getByLabel('Start (norsk tid)').fill('2026-12-01T16:00');
  await page.getByRole('button', { name: 'Legg til privat visning' }).click();
  await expect(page.getByText(/Kalender er ikke koblet til produksjonsbackend ennå/)).toBeVisible();

  // Sammenligning bruker de samme objektene (primærscenario) og virker; kalender og import er forklart
  await page.goto('/#/sammenligning');
  await expect(page.getByRole('heading', { name: /Sammenlign/ }).first()).toBeVisible();
  await page.goto('/#/kalender');
  await expect(page.getByTestId('not-available-yet')).toBeVisible();
  await expect(page.getByText('Noe gikk galt på denne siden')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('bruker B ser bare sine egne objekter og scenarioer – aldri Adas', async ({ page }) => {
  const errors = collectErrors(page);
  await install(page, BJORN);
  await login(page, BJORN);
  const mine = state.properties.filter((p) => state.userProperties.some((l) => l.userId === BJORN.id && l.propertyId === p.id));
  for (const p of mine) await expect(page.getByText(p.address).first()).toBeVisible();
  for (const p of adaOnly.slice(0, 4)) await expect(page.getByText(p.address)).toHaveCount(0);

  await page.getByRole('link', { name: new RegExp(p01.address) }).first().click();
  await page.getByRole('tab', { name: 'Min kalkyle' }).click();
  const options = await page.locator('#scenario-select option').allTextContents();
  expect(options.join('|')).toContain('Bjørns kalkyle');
  expect(options.join('|')).not.toMatch(/Hovedscenario|Lett oppfrisking|Omdøpt|Mitt nye/); // Adas scenarioer
  expect(errors).toEqual([]);
});

test('bruker uten liste: tom Oversikt, ingen vei til å legge til objekter, og direkte forsøk mot databasen avvises', async ({ page }) => {
  const errors = collectErrors(page);
  await install(page, nobody);
  await login(page, nobody);
  await expect(page.getByText('Ingen objekter ennå')).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(p01.address) })).toHaveCount(0);

  // Selv med et gyldig token og en kjent eiendoms-UUID avvises direkte innsetting (det tidligere hullet), uten å avsløre om eiendommen finnes.
  const results = await page.evaluate(
    async ({ sb, key, token, known }) => {
      const post = async (propertyId: string) => {
        const r = await fetch(`${sb}/rest/v1/user_properties`, {
          method: 'POST',
          headers: { apikey: key, authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=representation' },
          body: JSON.stringify({ property_id: propertyId }),
        });
        return { status: r.status, body: (await r.json()) as { code?: string; message?: string } };
      };
      const readProps = await fetch(`${sb}/rest/v1/properties?select=id&id=eq.${known}`, { headers: { apikey: key, authorization: `Bearer ${token}` } });
      return { known: await post(known), unknown: await post('00000000-0000-4000-8000-000000000000'), read: await readProps.json() };
    },
    { sb: SB, key: 'sb_publishable_e2e_stub_key', token: testJwt(nobody.id, nobody.email), known: p01.id },
  );
  for (const r of [results.known, results.unknown]) {
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('42501');
    expect(r.body.message).toMatch(/permission denied/);
  }
  expect(results.read).toEqual([]); // fortsatt ingen lesetilgang til eiendommen
  const n = await backend.query<{ n: number }>(`select count(*)::int as n from public.user_properties where user_id = $1`, [nobody.id]);
  expect(n[0].n).toBe(0);
  expect(errors).toEqual([]);
});
