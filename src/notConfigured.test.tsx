// @vitest-environment jsdom
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Produksjonsmodus uten gyldig Supabase-konfigurasjon skal vise en forklaring – ikke en hvit skjerm. Forklaringssiden (`NotConfigured`)
 * rendres UTENFOR ruteren (main.tsx), så den kan ikke bruke komponenter som trenger router-kontekst (f.eks. `<Link>`). Denne feilen ble
 * først sett i en ekte lokal kjøring uten publishable key: siden ble tom og konsollen viste «Cannot destructure property 'basename'».
 */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadWithEnv(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const app = await import('./App');
  const services = await import('./app/services');
  return { NotConfigured: app.NotConfigured, createAppServices: services.createAppServices };
}

describe('NotConfigured (produksjonsmodus uten gyldig Supabase-konfigurasjon)', () => {
  it('rendres utenfor en router uten å kaste, og forklarer hva som mangler', async () => {
    const { NotConfigured } = await loadWithEnv({ VITE_FLIPPROM_MODE: 'production', VITE_SUPABASE_URL: 'https://nmprcpuayvubberbphxd.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: '' });
    const html = renderToString(<NotConfigured />);
    expect(html).toContain('Produksjonsmodus mangler Supabase-konfigurasjon');
    expect(html).toContain('VITE_SUPABASE_PUBLISHABLE_KEY mangler.');
    expect(html).toContain('Flippsjekk'); // logoen er med
    expect(html).toContain('data-testid="supabase-config-status"');
  });

  it('viser aldri verdiene fra miljøet, heller ikke en ugyldig nøkkel', async () => {
    const secret = 'sb_secret_dette_skal_aldri_vises_1234567890';
    const { NotConfigured } = await loadWithEnv({ VITE_FLIPPROM_MODE: 'production', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: secret });
    const html = renderToString(<NotConfigured />);
    expect(html).not.toContain(secret);
    expect(html).toContain('hemmelig nøkkel');
  });
});

describe('createAppServices i produksjonsmodus', () => {
  it('uten publishable key: null (appen viser forklaringen), og ingenting kobler til Supabase', async () => {
    const { createAppServices } = await loadWithEnv({ VITE_FLIPPROM_MODE: 'production', VITE_SUPABASE_URL: 'https://nmprcpuayvubberbphxd.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: '' });
    expect(createAppServices()).toBeNull();
  });

  it('med gyldig URL og publishable key: produksjonstjenester (ekte Auth og profil), uten demo', async () => {
    const { createAppServices } = await loadWithEnv({ VITE_FLIPPROM_MODE: 'production', VITE_SUPABASE_URL: 'https://nmprcpuayvubberbphxd.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_nokkel_for_enhetstest' });
    const s = createAppServices();
    expect(s?.mode).toBe('production');
    expect(s?.demo).toBeNull();
    // Fase 2B: objektlisten og scenarioer er koblet til; resten er fortsatt ikke koblet til.
    expect(s?.unavailable).not.toContain('properties');
    expect(s?.unavailable).not.toContain('scenarios');
    expect(s?.unavailable).toEqual(expect.arrayContaining(['subscription', 'analysis', 'calendar']));
  });

  it('en service_role-nøkkel i frontend avvises (appen starter ikke med den)', async () => {
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    const { createAppServices } = await loadWithEnv({ VITE_FLIPPROM_MODE: 'production', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: `aaa.${payload}.bbb` });
    expect(createAppServices()).toBeNull();
  });
});
