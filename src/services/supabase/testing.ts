import { vi } from 'vitest';
import type { FlippsjekkSupabaseClient } from './client';

/**
 * Teststøtte (brukes bare av tester, aldri av appen): en tilstandsfull etterligning av den delen av Supabase-klienten adapterne bruker –
 * Auth (e-postkode, Google, sesjon, hendelser) og tabellen `profiles` (RLS + kolonnerettigheter som i migrasjon 2). Dette er en etterligning
 * ved adaptergrensen, ikke Supabase: faktisk Auth, e-post, Google og PostgREST må verifiseres live (se docs/supabase.md).
 */
export interface FakeUser {
  id: string;
  email: string;
  created_at: string;
  email_confirmed_at?: string;
  last_sign_in_at?: string;
  user_metadata: Record<string, unknown>;
  is_anonymous?: boolean;
}

export interface FakeProfileRow {
  user_id: string;
  display_name: string;
  email: string;
  defaults: unknown;
  created_at: string;
  updated_at: string;
}

type Err = Record<string, unknown> | null;

export function authApiError(status: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { name: 'AuthApiError', status, code, __isAuthError: true });
}
export function networkError(): Error {
  return Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0, __isAuthError: true });
}
export function pgError(code: string, message = 'feil'): { message: string; details: string; hint: string; code: string } {
  return { message, details: '', hint: '', code };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export class FakeSupabase {
  readonly origin = 'https://prosjekt.supabase.co';
  users = new Map<string, FakeUser>();
  profiles = new Map<string, FakeProfileRow>();
  /** Utstedte e-postkoder (ligger bare her, ikke i appen). */
  codes = new Map<string, string>();
  session: { user: FakeUser } | null = null;
  nextCode = '123456';
  now = () => new Date('2026-10-22T12:00:00.000Z');

  /** Feil som kastes/returneres én gang av neste kall til metoden. */
  failNext: Partial<Record<'signInWithOtp' | 'verifyOtp' | 'signInWithOAuth' | 'signOut' | 'getSession' | 'select' | 'update', Err | Error>> = {};
  /** Sett til false for å simulere at profil-triggeren ikke har kjørt. */
  profileTrigger = true;

  calls: { method: string; args: unknown }[] = [];
  private listeners = new Set<(event: string, session: { user: FakeUser } | null) => void>();
  private counter = 0;

  private log(method: string, args: unknown) {
    this.calls.push({ method, args });
  }
  callsTo(method: string) {
    return this.calls.filter((c) => c.method === method);
  }

  private take<K extends keyof FakeSupabase['failNext']>(k: K): Err | Error {
    const e = this.failNext[k];
    delete this.failNext[k];
    return e ?? null;
  }

  private ensureUser(email: string, meta: Record<string, unknown> = {}): FakeUser {
    let u = this.users.get(email);
    if (!u) {
      u = { id: uuid(++this.counter), email, created_at: this.now().toISOString(), user_metadata: meta };
      this.users.set(email, u);
      if (this.profileTrigger) {
        this.profiles.set(u.id, { user_id: u.id, display_name: String(meta.full_name ?? meta.name ?? email.split('@')[0]), email, defaults: null, created_at: u.created_at, updated_at: u.created_at });
      }
    }
    return u;
  }

  /** Setter opp en bruker som allerede er innlogget (som etter en vellykket Google-retur eller en tidligere økt). */
  signedInAs(email: string, meta: Record<string, unknown> = {}): FakeUser {
    const u = this.ensureUser(email, meta);
    u.email_confirmed_at ??= '2026-10-01T10:00:00.000Z';
    u.last_sign_in_at = '2026-10-21T10:00:00.000Z';
    this.session = { user: u };
    return u;
  }

  private emit(event: string) {
    for (const l of [...this.listeners]) l(event, this.session);
  }

  readonly auth = {
    getSession: vi.fn(async () => {
      this.log('getSession', undefined);
      const err = this.take('getSession');
      if (err) return { data: { session: null }, error: err };
      return { data: { session: this.session }, error: null };
    }),
    signInWithOtp: vi.fn(async (args: { email: string; options?: { shouldCreateUser?: boolean } }) => {
      this.log('signInWithOtp', args);
      const err = this.take('signInWithOtp');
      if (err) return { data: { user: null, session: null }, error: err };
      this.ensureUser(args.email);
      this.codes.set(args.email, this.nextCode);
      return { data: { user: null, session: null }, error: null };
    }),
    verifyOtp: vi.fn(async (args: { email: string; token: string; type: string }) => {
      this.log('verifyOtp', args);
      const err = this.take('verifyOtp');
      if (err) return { data: { user: null, session: null }, error: err };
      if (args.type !== 'email' || this.codes.get(args.email) !== args.token) {
        return { data: { user: null, session: null }, error: authApiError(403, 'otp_expired', 'Token has expired or is invalid') };
      }
      this.codes.delete(args.email);
      const u = this.ensureUser(args.email);
      const first = !u.email_confirmed_at;
      const stamp = this.now().toISOString();
      u.email_confirmed_at ??= stamp;
      u.last_sign_in_at = stamp;
      if (!first) u.last_sign_in_at = new Date(this.now().getTime() + 60 * 60_000).toISOString();
      this.session = { user: u };
      this.emit('SIGNED_IN');
      return { data: { user: u, session: this.session }, error: null };
    }),
    signInWithOAuth: vi.fn(async (args: { provider: string; options?: { redirectTo?: string; skipBrowserRedirect?: boolean } }) => {
      this.log('signInWithOAuth', args);
      const err = this.take('signInWithOAuth');
      if (err) return { data: { provider: args.provider, url: null }, error: err };
      const url = `${this.origin}/auth/v1/authorize?provider=${args.provider}&redirect_to=${encodeURIComponent(args.options?.redirectTo ?? '')}`;
      return { data: { provider: args.provider, url, flowId: 'flow-1' }, error: null };
    }),
    signOut: vi.fn(async (args?: { scope?: string }) => {
      this.log('signOut', args);
      const err = this.take('signOut');
      if (err) return { error: err };
      this.session = null;
      this.emit('SIGNED_OUT');
      return { error: null };
    }),
    onAuthStateChange: vi.fn((cb: (event: string, session: { user: FakeUser } | null) => void) => {
      this.log('onAuthStateChange', undefined);
      this.listeners.add(cb);
      queueMicrotask(() => cb('INITIAL_SESSION', this.session));
      return { data: { subscription: { unsubscribe: () => this.listeners.delete(cb) } } };
    }),
  };

  /** PostgREST-etterligning for `profiles`: RLS (bare egen rad) og kolonnerettigheter (UPDATE bare på display_name og defaults). */
  from(table: string) {
    const fake = this;
    const q = {
      op: null as 'select' | 'update' | null,
      columns: '',
      payload: undefined as Record<string, unknown> | undefined,
      filters: [] as [string, unknown][],
    };
    const run = async (): Promise<{ data: unknown; error: unknown; status: number }> => {
      fake.log(`${q.op}:${table}`, { columns: q.columns, payload: q.payload, filters: q.filters });
      const failure = fake.take(q.op as 'select' | 'update');
      if (failure) return { data: null, error: failure, status: 500 };
      if (table !== 'profiles') return { data: null, error: pgError('42P01', 'relation does not exist'), status: 404 };
      const me = fake.session?.user;
      if (!me) return { data: null, error: pgError('42501', 'permission denied for table profiles'), status: 401 };
      const idFilter = q.filters.find(([c]) => c === 'user_id')?.[1];
      // RLS: bare rader der user_id = auth.uid(). Andres rader er usynlige (ingen feil, bare ingen rad).
      const visible = [...fake.profiles.values()].filter((r) => r.user_id === me.id && (idFilter === undefined || r.user_id === idFilter));
      if (q.op === 'select') return { data: visible[0] ? { ...visible[0] } : null, error: null, status: 200 };
      const allowed = new Set(['display_name', 'defaults']);
      const bad = Object.keys(q.payload ?? {}).filter((k) => !allowed.has(k));
      if (bad.length) return { data: null, error: pgError('42501', `permission denied for table profiles (kolonne ${bad.join(', ')})`), status: 403 };
      const row = visible[0];
      if (!row) return { data: null, error: null, status: 200 };
      const name = q.payload?.display_name;
      if (typeof name === 'string' && (name.trim().length < 1 || name.length > 200)) return { data: null, error: pgError('23514', 'check constraint profiles_display_name_check'), status: 400 };
      Object.assign(row, q.payload, { updated_at: new Date(fake.now().getTime() + 1000).toISOString() });
      return { data: { ...row }, error: null, status: 200 };
    };
    const builder = {
      select: (columns: string) => {
        q.columns = columns;
        q.op ??= 'select';
        return builder;
      },
      update: (payload: Record<string, unknown>) => {
        q.op = 'update';
        q.payload = payload;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        q.filters.push([column, value]);
        return builder;
      },
      maybeSingle: () => run(),
    };
    return builder;
  }

  /** Klienten adapterne får. */
  client(): FlippsjekkSupabaseClient {
    return { auth: this.auth, from: (t: string) => this.from(t) } as unknown as FlippsjekkSupabaseClient;
  }
  provider = async (): Promise<FlippsjekkSupabaseClient> => this.client();
}
