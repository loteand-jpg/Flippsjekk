import { describe, expect, it } from 'vitest';

/**
 * Enhetstestene skal kjøre i demomodus uten Supabase-konfigurasjon, uansett hva som ligger i en lokal (git-ignorert) `.env.local`. Utviklere
 * som kobler appen til det ekte Supabase-prosjektet lokalt skal ikke få en annen testsuite. Festes i vite.config.ts (`test.env`).
 */
describe('testmiljøet er uavhengig av lokal .env.local', () => {
  it('kjører i demomodus uten URL eller nøkkel', () => {
    const env = import.meta.env as Record<string, string | undefined>;
    expect(env.VITE_FLIPPROM_MODE).toBe('demo');
    expect(env.VITE_SUPABASE_URL ?? '').toBe('');
    expect(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').toBe('');
  });
});
