import { describe, expect, it } from 'vitest';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { memoryStorage } from '../../data/storage';
import { ProfileSchema } from '../../domain/schemas';
import { ManualClock } from '../../lib/clock';
import { createMockServices } from '../mock';
import { isServiceError, type EmailChallenge, type Services } from '../types';
import { createSupabaseServices } from './compose';
import { FakeSupabase } from './testing';

/**
 * Kontraktparitet: samme tester mot mocken (demo) og mot Supabase-adapterne (produksjon, stubbet klient). UI-et skal ikke trenge å vite hvilken
 * backend som brukes. Testene bruker bare `AuthService`/`ProfileService`/`DataEvents`-kontraktene fra services/types.ts.
 * Forskjeller som er bevisste (f.eks. demoens simulerte e-post, og at Supabase ikke skiller feil fra utløpt kode) er uttrykt i fabrikkene.
 */
interface Harness {
  services: Pick<Services, 'auth' | 'profile' | 'events'>;
  /** Koden brukeren ville fått i innboksen (demo: den simulerte e-posten; Supabase-fake: den utstedte koden). */
  codeFor(c: EmailChallenge): string;
  /** Tillater en ny kodebestilling for samme e-post (mock har en ventetid). */
  allowResend(): void;
  /** Lar asynkrone varsler (events) slå gjennom. */
  settle(): Promise<void>;
  kind: 'demo' | 'production';
}

function mockHarness(): Harness {
  const clock = new ManualClock('2026-10-22T12:00:00.000Z');
  const s = createMockServices({ storage: memoryStorage(), clock, latencyMs: 0 });
  return { services: s, kind: 'demo', codeFor: (c) => c.simulatedEmail!.code, allowResend: () => clock.advance(60_000), settle: () => new Promise((r) => setTimeout(r, 5)) };
}

function supabaseHarness(): Harness {
  const fake = new FakeSupabase();
  const clock = new ManualClock('2026-10-22T12:00:00.000Z');
  const s = createSupabaseServices({ config: { url: fake.origin, publishableKey: 'sb_publishable_t' }, getClient: fake.provider, clock, redirect: null, redirectUrl: () => '' });
  // Samme tidslinje som mocken: kodebestilling uten ventetid.
  return { services: s, kind: 'production', codeFor: () => fake.nextCode, allowResend: () => undefined, settle: () => new Promise((r) => setTimeout(r, 5)) };
}

async function err(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    expect(isServiceError(e), String(e)).toBe(true);
    return e as { code: string; message: string };
  }
  throw new Error('Forventet feil');
}

for (const [name, make] of [
  ['mock (demo)', mockHarness],
  ['Supabase-adapter (produksjon, stubbet klient)', supabaseHarness],
] as const) {
  describe(`AuthService + ProfileService-kontrakt: ${name}`, () => {
    it('ingen sesjon i starten; profil krever innlogging', async () => {
      const { services } = make();
      expect(await services.auth.session()).toBeNull();
      expect((await err(services.profile.get())).code).toBe('not_authenticated');
    });

    it('e-postkode: ugyldig e-post → validation; gyldig → challenge med normalisert e-post og ISO-tidspunkt', async () => {
      const { services } = make();
      expect((await err(services.auth.requestEmailCode('ikke-en-epost'))).code).toBe('validation');
      const c = await services.auth.requestEmailCode(' Ny.Bruker@Eksempel.no ');
      expect(c.email).toBe('ny.bruker@eksempel.no');
      expect(typeof c.challengeId).toBe('string');
      expect(Number.isNaN(Date.parse(c.expiresAt))).toBe(false);
      expect(Date.parse(c.resendAfter)).toBeGreaterThan(Date.parse('2026-10-22T11:59:59Z'));
    });

    it('feil kode gir en kontrollert feil og ingen sesjon; riktig kode logger inn og oppretter kontoen', async () => {
      const h = make();
      const { services } = h;
      const c = await services.auth.requestEmailCode('ny.bruker@eksempel.no');
      const wrong = await err(services.auth.verifyEmailCode({ challengeId: c.challengeId, code: '000000' }));
      expect(['invalid_code', 'code_expired']).toContain(wrong.code);
      expect(await services.auth.session()).toBeNull();
      const r = await services.auth.verifyEmailCode({ challengeId: c.challengeId, code: h.codeFor(c) });
      expect(r.isNewUser).toBe(true);
      expect(r.session.user.email).toBe('ny.bruker@eksempel.no');
      expect(r.session.user.isDemoAccount).toBe(false);
      expect(r.session.kind).toBe(h.kind);
      expect((await services.auth.session())?.user.id).toBe(r.session.user.id);
    });

    it('profilen finnes etter første innlogging, er gyldig og har komplette standarder', async () => {
      const h = make();
      const c = await h.services.auth.requestEmailCode('kari.nordmann@eksempel.no');
      const { session } = await h.services.auth.verifyEmailCode({ challengeId: c.challengeId, code: h.codeFor(c) });
      const p = await h.services.profile.get();
      expect(ProfileSchema.safeParse(p).success).toBe(true);
      expect(p.userId).toBe(session.user.id);
      expect(p.email).toBe('kari.nordmann@eksempel.no');
      expect(p.defaults).toEqual(NEW_ACCOUNT_DEFAULTS);
    });

    it('oppdatering av navn og forutsetninger, med validering og varsel til appen', async () => {
      const h = make();
      const c = await h.services.auth.requestEmailCode('kari@eksempel.no');
      await h.services.auth.verifyEmailCode({ challengeId: c.challengeId, code: h.codeFor(c) });
      let notified = 0;
      h.services.events.subscribe(() => notified++);
      await h.settle();
      notified = 0;

      expect((await h.services.profile.update({ displayName: 'Kari Ola' })).displayName).toBe('Kari Ola');
      expect((await h.services.profile.get()).displayName).toBe('Kari Ola');
      const d = await h.services.profile.update({ defaults: { months: 9, interestPct: 7 } });
      expect(d.defaults).toEqual({ ...NEW_ACCOUNT_DEFAULTS, months: 9, interestPct: 7 });
      expect((await h.services.profile.update({ defaults: { availableEquity: 111_000 } })).defaults.months).toBe(9);
      await h.settle();
      expect(notified).toBeGreaterThan(0);

      expect((await err(h.services.profile.update({ displayName: 'K' }))).code).toBe('validation');
      const bad = await err(h.services.profile.update({ defaults: { interestPct: -1 } }));
      expect(bad.code).toBe('validation');
      expect(bad.message).toMatch(/^Ugyldig profilverdi: interestPct/);
      expect((await h.services.profile.get()).defaults.interestPct).toBe(7); // avvist endring ble ikke lagret
    });

    it('utlogging fjerner sesjonen, og profilen er da utilgjengelig; ny innlogging er ikke «ny bruker»', async () => {
      const h = make();
      const c = await h.services.auth.requestEmailCode('kari@eksempel.no');
      await h.services.auth.verifyEmailCode({ challengeId: c.challengeId, code: h.codeFor(c) });
      await h.services.auth.signOut();
      expect(await h.services.auth.session()).toBeNull();
      expect((await err(h.services.profile.get())).code).toBe('not_authenticated');

      h.allowResend();
      const c2 = await h.services.auth.requestEmailCode('kari@eksempel.no');
      const again = await h.services.auth.verifyEmailCode({ challengeId: c2.challengeId, code: h.codeFor(c2) });
      expect(again.isNewUser).toBe(false);
    });
  });
}
