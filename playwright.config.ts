import { defineConfig, devices } from '@playwright/test';

/** Ende-til-ende-test av hovedflyten på desktop og mobil mot utviklingsserveren. */
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
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobil', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite --port 5198 --strictPort',
    url: 'http://localhost:5198/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
