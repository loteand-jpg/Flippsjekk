import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Lokal etterligning av Supabase-backend for tester og e2e (ikke en del av appen): PGlite (ekte PostgreSQL) med Flippsjekks migrasjoner, og en
 * liten oversetter fra PostgREST- og GoTrue-forespørsler (det `@supabase/supabase-js` sender) til SQL. Hver forespørsel kjøres i en transaksjon som
 * rollen `authenticated` eller `anon` med brukerens JWT-claims (`request.jwt.claims`, `auth.uid()`), slik PostgREST gjør. Da gjelder ekte grants, RLS,
 * triggere og constraints – feilene som kommer tilbake har ekte SQLSTATE-koder.
 *
 * Dette er en etterligning: HTTP-laget (PostgREST/GoTrue) er forenklet til det appen bruker (select, eq/in/is/neq/gt/lt-filtre, order, limit,
 * insert/update/delete med return=representation). Faktisk Supabase må verifiseres separat.
 */
const SUPABASE_DIR = fileURLToPath(new URL('../../../../supabase/', import.meta.url));
const readSql = (rel: string) => readFileSync(`${SUPABASE_DIR}${rel}`, 'utf8');

export interface BackendRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | null;
}
export interface BackendResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (name: string): string => {
  if (!IDENT.test(name)) throw new HttpError(400, 'PGRST100', `Ugyldig identifikator: ${name}`);
  return `"${name}"`;
};

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const b64url = (s: string) => Buffer.from(s).toString('base64url');
/** Ikke-signert test-JWT. Emulatoren leser bare `sub`/`role` (PostgREST verifiserer signaturen; det gjør ikke denne). */
export function testJwt(userId: string, email = 'bruker@rls-test.invalid', expiresInSec = 3600 * 24 * 365): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  return `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated', email, exp }))}.test`;
}

function claimsOf(headers: Record<string, string>): { sub: string | null } {
  const auth = headers.authorization ?? headers.Authorization ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return { sub: null };
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub?: string; role?: string };
    return { sub: payload.role === 'authenticated' && payload.sub ? payload.sub : null };
  } catch {
    return { sub: null };
  }
}

/** Fordeler `in.(a,b,"c d")` til verdier. */
function parseInList(raw: string): string[] {
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of inner) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (inner.length > 0) out.push(cur);
  return out;
}

interface Where {
  sql: string;
  params: unknown[];
}

function buildWhere(searchParams: URLSearchParams): Where {
  const parts: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  for (const [col, raw] of searchParams.entries()) {
    if (RESERVED.has(col)) continue;
    const neg = raw.startsWith('not.');
    const body = neg ? raw.slice(4) : raw;
    const dot = body.indexOf('.');
    const op = dot < 0 ? body : body.slice(0, dot);
    const val = dot < 0 ? '' : body.slice(dot + 1);
    const c = ident(col);
    let clause: string;
    switch (op) {
      case 'eq':
        clause = `${c} = ${p(val)}`;
        break;
      case 'neq':
        clause = `${c} <> ${p(val)}`;
        break;
      case 'gt':
        clause = `${c} > ${p(val)}`;
        break;
      case 'gte':
        clause = `${c} >= ${p(val)}`;
        break;
      case 'lt':
        clause = `${c} < ${p(val)}`;
        break;
      case 'lte':
        clause = `${c} <= ${p(val)}`;
        break;
      case 'in': {
        const vals = parseInList(val);
        clause = vals.length === 0 ? 'false' : `${c} in (${vals.map(p).join(', ')})`;
        break;
      }
      case 'is':
        clause = val === 'null' ? `${c} is null` : val === 'true' ? `${c} is true` : val === 'false' ? `${c} is false` : 'false';
        break;
      default:
        throw new HttpError(400, 'PGRST100', `Filteroperatoren «${op}» støttes ikke av testemulatoren.`);
    }
    parts.push(neg ? `not (${clause})` : clause);
  }
  return { sql: parts.length ? `where ${parts.join(' and ')}` : '', params };
}

function buildOrder(raw: string | null): string {
  if (!raw) return '';
  const items = raw.split(',').map((item) => {
    const [col, ...mods] = item.split('.');
    const dir = mods.includes('desc') ? 'desc' : 'asc';
    const nulls = mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : '';
    return `${ident(col)} ${dir}${nulls}`;
  });
  return `order by ${items.join(', ')}`;
}

function buildSelect(raw: string | null): string {
  if (!raw || raw === '*') return '*';
  return raw
    .split(',')
    .map((c) => ident(c.trim()))
    .join(', ');
}

const STATUS_FOR_SQLSTATE: Record<string, number> = { '23505': 409, '23503': 409, '23514': 400, '23502': 400, '22P02': 400, '22023': 400, '54000': 400, P0001: 400 };

export interface PgliteBackend {
  db: PGlite;
  /** Basis-URL som klienten bruker (ingen ekte vert). */
  url: string;
  /** Offentlig nøkkel klienten sender som `apikey` (aksepteres uansett verdi). */
  publishableKey: string;
  handle(req: BackendRequest): Promise<BackendResponse>;
  /** `fetch` som kan sendes til `createClient(…, { global: { fetch } })`. */
  fetch: typeof fetch;
  /** Oppretter en Auth-bruker som postgres (triggeren oppretter profilen). Returnerer id. */
  createUser(email: string, id?: string): Promise<string>;
  /** Kjører SQL som postgres (superbruker): testdata og backend-handlinger (service_role omgår ikke RLS her, men rollen postgres gjør). */
  sql(text: string): Promise<void>;
  /** Kjører en spørring som postgres og gir rader. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export interface PgliteBackendOptions {
  /** Ekstra stub-filer (relativt til supabase/) etter hovedstubben, f.eks. varianter av service_role-standarder. */
  stubs?: string[];
  /** Hvilke migrasjoner som anvendes (standard: alle). */
  migrations?: string[];
  /** Basis-URL klienten bruker (e2e: samme som VITE_SUPABASE_URL til dev-serveren). */
  url?: string;
}

export async function createPgliteBackend(opts: PgliteBackendOptions = {}): Promise<PgliteBackend> {
  const db = new PGlite();
  await db.exec(readSql('tests/support/local_supabase_stub.sql'));
  for (const f of opts.stubs ?? []) await db.exec(readSql(f));
  const migrations = opts.migrations ?? readdirSync(`${SUPABASE_DIR}migrations`).filter((f) => f.endsWith('.sql')).sort();
  for (const f of migrations) await db.exec(readSql(`migrations/${f}`));

  const url = opts.url ?? 'https://flippsjekk-pglite.invalid';
  const cors = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };

  async function asClient<T>(sub: string | null, work: (tx: Pick<PGlite, 'query'>) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      const role = sub ? 'authenticated' : 'anon';
      const claims = JSON.stringify(sub ? { sub, role } : { role });
      await tx.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', $3, true)`, [claims, sub ?? '', role]);
      await tx.query(`set local role ${role}`);
      return work(tx);
    });
  }

  async function rest(req: BackendRequest, u: URL): Promise<BackendResponse> {
    const table = decodeURIComponent(u.pathname.split('/')[3] ?? '');
    const t = `public.${ident(table)}`;
    const { sub } = claimsOf(req.headers);
    const prefer = req.headers.prefer ?? '';
    const wantsRows = /return=representation/.test(prefer);
    const sel = buildSelect(u.searchParams.get('select'));
    const where = buildWhere(u.searchParams);
    const json = (status: number, data: unknown): BackendResponse => ({ status, headers: cors, body: JSON.stringify(data) });
    const wrap = (inner: string) => `select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as j from (${inner}) r`;
    /** Datamodifiserende CTE må ligge på toppnivå: «with x as (insert … returning *) select … from x». */
    const wrapCte = (cte: string, name: string) => `with ${cte} select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as j from (select ${sel} from ${name}) r`;

    return asClient(sub, async (tx) => {
      const run = async (sqlText: string, params: unknown[]) => {
        const res = await tx.query<{ j: unknown }>(sqlText, params);
        return res.rows[0]?.j ?? [];
      };
      if (req.method === 'GET' || req.method === 'HEAD') {
        const order = buildOrder(u.searchParams.get('order'));
        const limit = u.searchParams.get('limit');
        const offset = u.searchParams.get('offset');
        const tail = `${order}${limit ? ` limit ${Number(limit) | 0}` : ''}${offset ? ` offset ${Number(offset) | 0}` : ''}`;
        return json(200, await run(wrap(`select ${sel} from ${t} ${where.sql} ${tail}`), where.params));
      }
      if (req.method === 'POST') {
        const parsed = JSON.parse(req.body ?? 'null') as Record<string, unknown> | Record<string, unknown>[];
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        if (rows.length === 0) return json(201, []);
        const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        const list = cols.map(ident).join(', ');
        const out = await run(wrapCte(`ins as (insert into ${t} (${list}) select ${list} from jsonb_populate_recordset(null::${t}, $1::jsonb) returning *)`, 'ins'), [JSON.stringify(rows)]);
        return wantsRows ? json(201, out) : { status: 201, headers: cors, body: '' };
      }
      if (req.method === 'PATCH') {
        const patch = JSON.parse(req.body ?? '{}') as Record<string, unknown>;
        const cols = Object.keys(patch);
        if (cols.length === 0) return { status: 204, headers: cors, body: '' };
        const set = cols.map((c) => `${ident(c)} = (jsonb_populate_record(null::${t}, $${where.params.length + 1}::jsonb)).${ident(c)}`).join(', ');
        const out = await run(wrapCte(`upd as (update ${t} set ${set} ${where.sql} returning *)`, 'upd'), [...where.params, JSON.stringify(patch)]);
        return wantsRows ? json(200, out) : { status: 204, headers: cors, body: '' };
      }
      if (req.method === 'DELETE') {
        const out = await run(wrapCte(`del as (delete from ${t} ${where.sql} returning *)`, 'del'), where.params);
        return wantsRows ? json(200, out) : { status: 204, headers: cors, body: '' };
      }
      throw new HttpError(405, 'PGRST100', `Metoden ${req.method} støttes ikke.`);
    });
  }

  async function handle(req: BackendRequest): Promise<BackendResponse> {
    const u = new URL(req.url);
    try {
      if (req.method === 'OPTIONS') return { status: 204, headers: cors, body: '' };
      if (u.pathname === '/auth/v1/user') {
        const { sub } = claimsOf(req.headers);
        if (!sub) return { status: 401, headers: cors, body: JSON.stringify({ code: 401, error_code: 'no_authorization', msg: 'Mangler gyldig token' }) };
        const rows = await db.query<{ id: string; email: string; created_at: string }>('select id, email, created_at from auth.users where id = $1', [sub]);
        const user = rows.rows[0];
        if (!user) return { status: 404, headers: cors, body: JSON.stringify({ code: 404, error_code: 'user_not_found', msg: 'Fant ikke bruker' }) };
        const created = new Date(user.created_at).toISOString();
        return { status: 200, headers: cors, body: JSON.stringify({ id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, email_confirmed_at: created, last_sign_in_at: created, created_at: created, app_metadata: {}, user_metadata: {}, identities: [], is_anonymous: false }) };
      }
      if (u.pathname.startsWith('/auth/v1/logout')) return { status: 204, headers: cors, body: '' };
      if (u.pathname.startsWith('/rest/v1/')) return await rest(req, u);
      return { status: 404, headers: cors, body: JSON.stringify({ message: `ustubbet kall: ${req.method} ${u.pathname}` }) };
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, headers: cors, body: JSON.stringify({ code: e.code, message: e.message, details: null, hint: null }) };
      const err = e as { code?: string; message?: string; detail?: string; hint?: string };
      const code = err.code ?? 'XX000';
      const { sub } = claimsOf(req.headers);
      const status = code === '42501' ? (sub ? 403 : 401) : STATUS_FOR_SQLSTATE[code] ?? 400;
      return { status, headers: cors, body: JSON.stringify({ code, message: err.message ?? 'feil', details: err.detail ?? null, hint: err.hint ?? null }) };
    }
  }

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    const body = request.method === 'GET' || request.method === 'HEAD' ? null : await request.text();
    const res = await handle({ method: request.method, url: request.url, headers, body });
    return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: res.headers });
  }) as typeof fetch;

  return {
    db,
    url,
    publishableKey: 'sb_publishable_pglite_test',
    handle,
    fetch: fetchImpl,
    async createUser(email, id) {
      const r = await db.query<{ id: string }>(
        `insert into auth.users (id, aud, role, email, raw_user_meta_data) values (coalesce($1::uuid, gen_random_uuid()), 'authenticated', 'authenticated', $2, '{}'::jsonb) returning id`,
        [id ?? null, email],
      );
      return r.rows[0].id;
    },
    async sql(text) {
      await db.exec(text);
    },
    async query(text, params) {
      const r = await db.query(text, params as unknown[]);
      return r.rows as never;
    },
    close: () => db.close(),
  };
}

/**
 * Ekte `@supabase/supabase-js`-klient som snakker med test-backenden (via `fetch`-emulatoren) som en innlogget bruker. Sesjonen settes direkte
 * (ingen e-postkode); `auth.getSession()` virker som i appen, og PostgREST-kall bærer brukerens JWT, så RLS gjelder.
 */
export async function createUserClient(backend: PgliteBackend, userId: string, email = 'bruker@rls-test.invalid'): Promise<SupabaseClient> {
  const client = createClient(backend.url, backend.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: backend.fetch },
  });
  const { error } = await client.auth.setSession({ access_token: testJwt(userId, email), refresh_token: 'test-refresh' });
  if (error) throw error;
  return client;
}

/** En klient uten innlogging (rollen anon). */
export function createAnonClient(backend: PgliteBackend): SupabaseClient {
  return createClient(backend.url, backend.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: backend.fetch } });
}
