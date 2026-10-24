import { describe, expect, it, vi } from 'vitest';
import { ManualClock } from '../../lib/clock';
import { isServiceError, type Services } from '../types';
import { createSupabaseServices } from './compose';
import { NOT_CONFIGURED_AREAS, notConfiguredError } from './notConfigured';
import { SupabaseEvents } from './events';
import { FakeSupabase } from './testing';

const config = { url: 'https://prosjekt.supabase.co', publishableKey: 'sb_publishable_test' };

function build() {
  const fake = new FakeSupabase();
  const services = createSupabaseServices({ config, getClient: fake.provider, clock: new ManualClock('2026-10-22T12:00:00.000Z'), redirect: null, redirectUrl: () => 'https://app.example/' });
  return { fake, services };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(isServiceError(e)).toBe(true);
    return (e as { code: string }).code;
  }
  return 'lyktes';
}

describe('produksjonskomposisjon (backend fase 2A)', () => {
  it('er i produksjonsmodus uten demo, med ekte auth og profil', () => {
    const { services } = build();
    expect(services.mode).toBe('production');
    expect(services.demo).toBeNull();
    expect(services.auth.constructor.name).toBe('SupabaseAuthService');
    expect(services.profile.constructor.name).toBe('SupabaseProfileService');
  });

  it('alle andre områder er eksplisitt utilgjengelige, og listen stemmer med stand-ins', () => {
    const { services } = build();
    expect([...services.unavailable].sort()).toEqual(['analysis', 'calendar', 'comparables', 'courses', 'imports', 'properties', 'risks', 'scenarios', 'subscription']);
    expect(services.unavailable).toBe(NOT_CONFIGURED_AREAS);
  });

  it('hver metode i hvert uimplementerte område avvises med not_configured – aldri tomme data', async () => {
    const { services } = build();
    const areas: [keyof Services, string[]][] = [
      ['subscription', ['getSubscription', 'getEntitlements', 'openCustomerPortal', 'listUsage']],
      ['courses', ['listPurchases']],
      ['properties', ['listMine', 'getMine', 'getById', 'getByFinnId']],
      ['scenarios', ['list']],
      ['comparables', ['list']],
      ['risks', ['list']],
      ['calendar', ['listEvents', 'exportIcs']],
      ['imports', ['exportScenarios']],
    ];
    for (const [area, methods] of areas) {
      for (const m of methods) {
        const svc = services[area] as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
        expect(await code(svc[m]('x')), `${String(area)}.${m}`).toBe('not_configured');
      }
    }
    expect(await code(services.analysis.requestAnalysis({ url: 'https://finn.no/1', idempotencyKey: 'k' }))).toBe('not_configured');
    expect(await code(services.subscription.startCheckout({ planId: 'p', interval: 'month', phone: '91234567' }))).toBe('not_configured');
  });

  it('abonnement gir aldri tilgang: ingen aktiv status, ingen entitlements (ikke «gratis abonnement»)', async () => {
    const { services } = build();
    await expect(services.subscription.getEntitlements()).rejects.toMatchObject({ code: 'not_configured' });
    await expect(services.subscription.getSubscription()).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('meldingen forklarer hva som mangler uten tekniske detaljer', () => {
    expect(notConfiguredError('properties').message).toMatch(/Objekter er ikke koblet til produksjonsbackend ennå/);
    expect(notConfiguredError('subscription').message).toMatch(/bare innlogging og profil/);
  });

  it('ingenting kobler til Supabase før noe brukes (klienten lages lat)', () => {
    const getClient = vi.fn(async () => new FakeSupabase().client());
    createSupabaseServices({ config, getClient, redirect: null });
    expect(getClient).not.toHaveBeenCalled();
  });

  it('profil-lagring varsler appen via events, slik at sesjon og profil hentes på nytt', async () => {
    vi.useFakeTimers();
    try {
      const { services, fake } = build();
      fake.signedInAs('kari@eksempel.no');
      const seen: number[] = [];
      services.events.subscribe(() => seen.push(1));
      await vi.runAllTimersAsync();
      seen.length = 0;
      await services.profile.update({ displayName: 'Kari Ola' });
      await vi.runAllTimersAsync();
      expect(seen).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('SupabaseEvents: auth state changes', () => {
  function events() {
    const fake = new FakeSupabase();
    const ev = new SupabaseEvents(fake.provider, (fn) => fn()); // synkron planlegging i test
    const seen: string[] = [];
    ev.subscribe(() => seen.push('endret'));
    return { fake, ev, seen };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('abonnerer lat på Supabase Auth første gang noen lytter, og bare én gang', async () => {
    const { fake, ev } = events();
    ev.subscribe(() => undefined);
    await tick();
    expect(fake.callsTo('onAuthStateChange')).toHaveLength(1);
  });

  it('innlogging og utlogging varsler lytterne; token-fornyelse og initial sesjon gjør det ikke', async () => {
    const { ev, seen } = events();
    await tick();
    expect(seen).toEqual([]); // INITIAL_SESSION ignoreres
    ev.handleAuthEvent('TOKEN_REFRESHED', null);
    expect(seen).toEqual([]);
    ev.handleAuthEvent('SIGNED_IN', 'u1');
    expect(seen).toEqual(['endret']);
    ev.handleAuthEvent('SIGNED_IN', 'u1'); // samme bruker (f.eks. fane får fokus): ingen ny henting
    ev.handleAuthEvent('TOKEN_REFRESHED', 'u1');
    expect(seen).toEqual(['endret']);
    ev.handleAuthEvent('USER_UPDATED', 'u1');
    ev.handleAuthEvent('SIGNED_OUT', null);
    expect(seen).toEqual(['endret', 'endret', 'endret']);
  });

  it('en ekte innlogging fra Supabase når lytterne', async () => {
    const { fake, seen } = events();
    await tick();
    fake.signedInAs('a@b.no');
    fake.auth.verifyOtp.mockClear();
    fake.codes.set('a@b.no', '111111');
    await fake.auth.verifyOtp({ email: 'a@b.no', token: '111111', type: 'email' });
    expect(seen).toEqual(['endret']);
  });

  it('lytterne kalles utenfor Supabase sin kallstakk (ikke synkront)', async () => {
    const fake = new FakeSupabase();
    const ev = new SupabaseEvents(fake.provider);
    const seen: string[] = [];
    ev.subscribe(() => seen.push('x'));
    ev.emit();
    expect(seen).toEqual([]);
    await tick();
    expect(seen).toEqual(['x']);
  });

  it('avmelding stopper varsler; konfigurasjonsfeil gir ingen krasj', async () => {
    const { ev } = events();
    const seen: string[] = [];
    const off = ev.subscribe(() => seen.push('a'));
    off();
    ev.emit();
    expect(seen).toEqual([]);
    const broken = new SupabaseEvents(() => Promise.reject(new Error('ikke konfigurert')));
    broken.subscribe(() => undefined);
    await tick();
  });
});
