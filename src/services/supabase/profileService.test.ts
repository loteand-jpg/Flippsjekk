import { describe, expect, it } from 'vitest';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { ProfileSchema } from '../../domain/schemas';
import { isServiceError, type ServiceError } from '../types';
import { SupabaseProfileService, PROFILE_COLUMNS, profileFromRow, resolveProfileDefaults } from './profileService';
import { FakeSupabase, networkError, pgError } from './testing';

function setup(signedIn = true) {
  const fake = new FakeSupabase();
  const user = signedIn ? fake.signedInAs('kari@eksempel.no', { full_name: 'Kari Nordmann' }) : null;
  const changed: number[] = [];
  const profile = new SupabaseProfileService({ getClient: fake.provider, notifyChanged: () => changed.push(1) });
  return { fake, user, profile, changed };
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

describe('standardforutsetninger: resolveProfileDefaults', () => {
  it('null → NEW_ACCOUNT_DEFAULTS (en kopi, ikke samme objekt)', () => {
    const d = resolveProfileDefaults(null);
    expect(d).toEqual(NEW_ACCOUNT_DEFAULTS);
    expect(d).not.toBe(NEW_ACCOUNT_DEFAULTS);
    d.laborModes = { ...d.laborModes };
    expect(resolveProfileDefaults(undefined)).toEqual(NEW_ACCOUNT_DEFAULTS);
  });

  it('økonomiske standardverdier er uendret', () => {
    const d = resolveProfileDefaults(null);
    expect([d.interestPct, d.purchaseFinancingPct, d.renovationFinancingPct, d.availableEquity, d.months, d.saleFixedCost]).toEqual([6, 90, 0, 300_000, 6, 120_000]);
  });

  it('komplett lagret objekt beholdes', () => {
    const stored = { ...NEW_ACCOUNT_DEFAULTS, months: 9, interestPct: 7.5, homeArea: 'Bergen' };
    expect(resolveProfileDefaults(stored)).toEqual(stored);
  });

  it('delvis objekt: lagrede verdier ligger oppå standardene, og resultatet er komplett', () => {
    const d = resolveProfileDefaults({ months: 12, buyerTypeHouse: 'as' });
    expect(d.months).toBe(12);
    expect(d.buyerTypeHouse).toBe('as');
    expect(d.interestPct).toBe(NEW_ACCOUNT_DEFAULTS.interestPct);
    expect(d.laborModes).toEqual(NEW_ACCOUNT_DEFAULTS.laborModes);
  });

  it('ugyldige verdier og feil format gir kontrollert feil – aldri halvferdige standarder', () => {
    for (const bad of [{ interestPct: -3 }, { months: 'seks' }, { buyerTypeApartment: 'konge' }, 'streng', 42, [1, 2], { purchaseFinancingPct: 250 }]) {
      let caught: unknown;
      try {
        resolveProfileDefaults(bad);
      } catch (e) {
        caught = e;
      }
      expect(isServiceError(caught), JSON.stringify(bad)).toBe(true);
      expect((caught as ServiceError).code).toBe('validation');
    }
  });

  it('ukjente felt i jsonb slippes ikke inn i domenet', () => {
    const d = resolveProfileDefaults({ months: 7, hemmelig: 'x', __proto_test: 1 }) as unknown as Record<string, unknown>;
    expect(d.hemmelig).toBeUndefined();
    expect(d.__proto_test).toBeUndefined();
  });
});

describe('profileFromRow: DB-rad → domene', () => {
  const row = { user_id: 'u1', display_name: 'Kari', email: 'k@e.no', defaults: null, updated_at: '2026-10-22T12:00:00.123456+00:00' };

  it('mapper feltnavn, normaliserer tidspunkt og validerer mot ProfileSchema', () => {
    const p = profileFromRow(row);
    expect(p).toEqual({ userId: 'u1', displayName: 'Kari', email: 'k@e.no', defaults: NEW_ACCOUNT_DEFAULTS, updatedAt: '2026-10-22T12:00:00.123Z' });
    expect(ProfileSchema.safeParse(p).success).toBe(true);
    // Radfeltene user_id/created_at lekker ikke videre
    expect(Object.keys(p).sort()).toEqual(['defaults', 'displayName', 'email', 'updatedAt', 'userId']);
  });

  it('ugyldig rad gir kontrollert feil (ingen as Profile)', () => {
    for (const bad of [null, undefined, 'x', {}, { ...row, user_id: '' }, { ...row, display_name: 5 }, { ...row, updated_at: undefined }, { ...row, display_name: '' }, { ...row, updated_at: 'ikke-en-dato' }, { ...row, defaults: { months: -1 } }]) {
      let caught: unknown;
      try {
        profileFromRow(bad);
      } catch (e) {
        caught = e;
      }
      expect(isServiceError(caught), JSON.stringify(bad)).toBe(true);
      expect((caught as ServiceError).code).toBe('validation');
    }
  });
});

describe('SupabaseProfileService.get', () => {
  it('leser egen rad: bare de smale kolonnene, filtrert på innlogget bruker', async () => {
    const { profile, fake, user } = setup();
    const p = await profile.get();
    expect(p).toMatchObject({ userId: user!.id, displayName: 'Kari Nordmann', email: 'kari@eksempel.no' });
    const call = fake.callsTo('select:profiles')[0].args as { columns: string; filters: [string, unknown][] };
    expect(call.columns).toBe(PROFILE_COLUMNS);
    expect(call.filters).toEqual([['user_id', user!.id]]);
  });

  it('defaults = null gir komplette standarder', async () => {
    const { profile } = setup();
    expect((await profile.get()).defaults).toEqual(NEW_ACCOUNT_DEFAULTS);
  });

  it('lagrede delvise standarder blir komplette', async () => {
    const { profile, fake, user } = setup();
    fake.profiles.get(user!.id)!.defaults = { months: 10 };
    const p = await profile.get();
    expect(p.defaults.months).toBe(10);
    expect(p.defaults.interestPct).toBe(6);
  });

  it('korrupt jsonb i databasen gir kontrollert feil, ikke korrupte domenedata', async () => {
    const { profile, fake, user } = setup();
    fake.profiles.get(user!.id)!.defaults = { months: 'mange' };
    expect((await rejection(profile.get())).code).toBe('validation');
  });

  it('ikke innlogget: not_authenticated (ingen forespørsel mot tabellen)', async () => {
    const { profile, fake } = setup(false);
    expect((await rejection(profile.get())).code).toBe('not_authenticated');
    expect(fake.callsTo('select:profiles')).toHaveLength(0);
  });

  it('profil-raden mangler: not_found med forklaring (frontend oppretter aldri profil selv)', async () => {
    const { profile, fake, user } = setup();
    fake.profiles.delete(user!.id);
    const e = await rejection(profile.get());
    expect(e.code).toBe('not_found');
    expect(fake.callsTo('select:profiles')).toHaveLength(1);
    expect(fake.calls.some((c) => c.method.startsWith('insert'))).toBe(false);
    expect(fake.profiles.size).toBe(0); // ingen duplikatprofil
  });

  it('RLS: en annen brukers rad er usynlig, selv om id-en er kjent', async () => {
    const { profile, fake } = setup();
    const other = fake.signedInAs('annen@eksempel.no');
    fake.signedInAs('kari@eksempel.no');
    fake.profiles.get(other.id)!.display_name = 'Annen';
    const p = await profile.get();
    expect(p.displayName).toBe('Kari Nordmann'); // egen rad, aldri den andres
  });

  it('feil fra databasen mappes: rettighet, JWT, nett, manglende tabell', async () => {
    const { profile, fake } = setup();
    fake.failNext.select = pgError('42501', 'permission denied for table profiles');
    expect((await rejection(profile.get())).code).toBe('forbidden');
    fake.failNext.select = pgError('PGRST301', 'JWT expired');
    expect((await rejection(profile.get())).code).toBe('not_authenticated');
    fake.failNext.select = networkError();
    expect((await rejection(profile.get())).code).toBe('unavailable');
    fake.failNext.select = pgError('PGRST205', "Could not find the table 'public.profiles' in the schema cache");
    const missing = await rejection(profile.get());
    expect(missing.code).toBe('not_configured');
    expect(missing.message).toMatch(/migrasjonene/i);
  });

  it('feilmeldinger lekker ikke rå databasetekst eller radinnhold til brukeren', async () => {
    const { profile, fake } = setup();
    fake.failNext.select = { message: 'duplicate key value violates unique constraint "x" Key (email)=(hemmelig@x.no)', details: 'Failing row contains (hemmelig)', hint: '', code: '23505' };
    const e = await rejection(profile.get());
    expect(e.message).not.toMatch(/hemmelig|constraint|Key \(/);
    expect(JSON.stringify(e.details)).not.toMatch(/Failing row/);
  });
});

describe('SupabaseProfileService.update', () => {
  it('oppdaterer visningsnavn: sender BARE display_name (aldri user_id, email, created_at, updated_at), trimmer navnet og varsler appen', async () => {
    const { profile, fake, user, changed } = setup();
    const p = await profile.update({ displayName: '  Kari Ola  ' });
    expect(p.displayName).toBe('Kari Ola');
    const call = fake.callsTo('update:profiles')[0].args as { payload: Record<string, unknown>; filters: [string, unknown][] };
    expect(call.payload).toEqual({ display_name: 'Kari Ola' });
    expect(call.filters).toEqual([['user_id', user!.id]]);
    expect(changed).toHaveLength(1);
    expect(fake.profiles.get(user!.id)!.display_name).toBe('Kari Ola');
    expect(fake.callsTo('select:profiles')).toHaveLength(0); // UPDATE returnerer raden – ingen ekstra lesing for navn alene
  });

  it('oppdaterer defaults: leser gjeldende, legger endringen oppå, validerer og skriver hele settet (bare defaults)', async () => {
    const { profile, fake, user } = setup();
    const p = await profile.update({ defaults: { months: 9, interestPct: 7 } });
    expect(p.defaults).toEqual({ ...NEW_ACCOUNT_DEFAULTS, months: 9, interestPct: 7 });
    const call = fake.callsTo('update:profiles')[0].args as { payload: Record<string, unknown> };
    expect(Object.keys(call.payload)).toEqual(['defaults']);
    expect(fake.profiles.get(user!.id)!.defaults).toEqual({ ...NEW_ACCOUNT_DEFAULTS, months: 9, interestPct: 7 });
    // En påfølgende delvis endring beholder det som allerede er lagret.
    const p2 = await profile.update({ defaults: { availableEquity: 123_000 } });
    expect(p2.defaults.months).toBe(9);
    expect(p2.defaults.availableEquity).toBe(123_000);
  });

  it('navn og defaults samtidig: én skriving med bare de to kolonnene', async () => {
    const { profile, fake } = setup();
    await profile.update({ displayName: 'Nytt Navn', defaults: { months: 8 } });
    expect(fake.callsTo('update:profiles')).toHaveLength(1);
    expect(Object.keys((fake.callsTo('update:profiles')[0].args as { payload: object }).payload).sort()).toEqual(['defaults', 'display_name']);
  });

  it('ugyldig navn eller ugyldige defaults avvises før noe skrives', async () => {
    const { profile, fake } = setup();
    expect((await rejection(profile.update({ displayName: 'K' }))).code).toBe('validation');
    expect((await rejection(profile.update({ displayName: '   ' }))).code).toBe('validation');
    expect((await rejection(profile.update({ displayName: 'x'.repeat(201) }))).code).toBe('validation');
    const bad = await rejection(profile.update({ defaults: { interestPct: -1 } }));
    expect(bad.code).toBe('validation');
    expect(bad.message).toMatch(/Ugyldig profilverdi: interestPct/);
    expect(fake.callsTo('update:profiles')).toHaveLength(0);
  });

  it('udefinerte verdier i en delvis endring overskriver ikke lagrede verdier', async () => {
    const { profile } = setup();
    await profile.update({ defaults: { months: 11 } });
    const p = await profile.update({ defaults: { months: undefined, interestPct: 8 } });
    expect(p.defaults.months).toBe(11);
    expect(p.defaults.interestPct).toBe(8);
  });

  it('tom endring skriver ingenting', async () => {
    const { profile, fake } = setup();
    await profile.update({});
    expect(fake.callsTo('update:profiles')).toHaveLength(0);
  });

  it('RLS/kolonnerettigheter: databasen avviser andre kolonner (kontroll av at adapteren ikke sender dem)', async () => {
    const { fake } = setup();
    const client = fake.client();
    const res = await client.from('profiles').update({ email: 'hacker@x.no' }).eq('user_id', 'x').select('x').maybeSingle();
    expect((res.error as { code?: string }).code).toBe('42501');
  });

  it('Supabase/RLS-feil ved lagring mappes til ServiceError, og appen varsles ikke', async () => {
    const { profile, fake, changed } = setup();
    fake.failNext.update = pgError('42501', 'new row violates row-level security policy');
    expect((await rejection(profile.update({ displayName: 'Kari Ola' }))).code).toBe('forbidden');
    fake.failNext.update = pgError('23514', 'check constraint');
    expect((await rejection(profile.update({ displayName: 'Kari Ola' }))).code).toBe('validation');
    fake.failNext.update = networkError();
    expect((await rejection(profile.update({ displayName: 'Kari Ola' }))).code).toBe('unavailable');
    expect(changed).toHaveLength(0);
  });

  it('ingen rad oppdatert (raden mangler eller er ikke din): feil, ikke stille suksess', async () => {
    const { profile, fake, user, changed } = setup();
    fake.profiles.delete(user!.id);
    const e = await rejection(profile.update({ displayName: 'Kari Ola' }));
    expect(e.code).toBe('not_found');
    expect(changed).toHaveLength(0);
  });

  it('ikke innlogget: not_authenticated', async () => {
    const { profile } = setup(false);
    expect((await rejection(profile.update({ displayName: 'Kari Ola' }))).code).toBe('not_authenticated');
  });
});
