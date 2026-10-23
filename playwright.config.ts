import { defineConfig, devices } from '@playwright/test';

/**
 * Ende-til-ende-test av hovedflyten på desktop og mobil mot utviklingsserveren (demo). Prosjektet «produksjon» kjører produksjonsmodus
 * (backend fase 2A: ekte `supabase-js`, men nettverket mot Supabase stubbes i testen – ingen ekstern Supabase eller Google brukes).
 */
const PRODUKSJON_PORT = 5199;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5198/',
    locale: 'nb-NO',
    timezoneId: 'Europe/Oslo',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', testIgnore: /produksjon\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobil', testIgnore: /produksjon\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    {
      name: 'produksjon',
      testMatch: /produksjon\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: `http://localhost:${PRODUKSJON_PORT}/` },
    },
  ],
  webServer: [
    {
      command: 'npx vite --port 5198 --strictPort',
      url: 'http://localhost:5198/',
      reuseExistingServer: true,
      timeout: 60_000,
      // Demoen festes eksplisitt: Vite leser ellers .env.local, og en lokal produksjonskonfigurasjon ville ødelagt alle demotestene (hvit skjerm/timeout).
      env: { VITE_FLIPPROM_MODE: 'demo', VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
    },
    {
      // Produksjonsmodus med en URL som aldri kan nås (.invalid): all trafikk mot «Supabase» fanges og besvares av testen.
      // Shell-variabler vinner over eventuelle .env-filer, så lokale ekte nøkler brukes aldri her.
      command: `npx vite --port ${PRODUKSJON_PORT} --strictPort`,
      url: `http://localhost:${PRODUKSJON_PORT}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_FLIPPROM_MODE: 'production',
        VITE_SUPABASE_URL: 'https://flippsjekk-e2e.invalid',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_stub_key',
      },
    },
  ],
});
