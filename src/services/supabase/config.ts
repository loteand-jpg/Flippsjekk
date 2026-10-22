/**
 * Konfigurasjon for Supabase i nettleseren. Bare OFFENTLIGE verdier hører hjemme her: prosjekt-URL og «publishable» (offentlig) nøkkel.
 * Frontend skal aldri få `service_role`, `sb_secret_…`, database-passord eller andre hemmeligheter – tilgang styres av RLS i databasen,
 * og skriving til felles data skjer fra backend. Valideringen under avviser derfor hemmelige nøkler med en tydelig feilmelding.
 *
 * Verdiene leses fra Vite-miljøvariabler (se `.env.example`). Demomodus trenger ingen av dem, og ingenting her kjører før en kaller det.
 */
export const SUPABASE_ENV = {
  url: 'VITE_SUPABASE_URL',
  publishableKey: 'VITE_SUPABASE_PUBLISHABLE_KEY',
} as const;

export interface SupabaseConfig {
  /** Prosjekt-URL uten avsluttende skråstrek, f.eks. https://<ref>.supabase.co */
  url: string;
  /** Offentlig nøkkel: `sb_publishable_…` eller en eldre «anon»-JWT. */
  publishableKey: string;
}

export type SupabaseConfigResult = { ok: true; config: SupabaseConfig } | { ok: false; problems: string[] };

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Leser rollen («role») fra en JWT uten å verifisere signaturen – brukes bare til å avvise nøkler som ikke hører hjemme i frontend. */
export function jwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='));
    const payload = JSON.parse(json) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function checkUrl(raw: string | undefined): { url?: string; problem?: string } {
  const value = (raw ?? '').trim();
  if (!value) return { problem: `${SUPABASE_ENV.url} mangler.` };
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return { problem: `${SUPABASE_ENV.url} er ikke en gyldig URL.` };
  }
  const local = LOCAL_HOSTS.has(u.hostname);
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) {
    return { problem: `${SUPABASE_ENV.url} må bruke https (http er bare tillatt mot lokal utviklingsserver).` };
  }
  if (u.username || u.password) return { problem: `${SUPABASE_ENV.url} skal ikke inneholde brukernavn eller passord.` };
  if (u.pathname !== '/' && u.pathname !== '') return { problem: `${SUPABASE_ENV.url} skal være prosjektets rot-URL uten sti.` };
  return { url: `${u.protocol}//${u.host}` };
}

function checkKey(raw: string | undefined): { key?: string; problem?: string } {
  const value = (raw ?? '').trim();
  if (!value) return { problem: `${SUPABASE_ENV.publishableKey} mangler.` };
  // Meldingene gjengir aldri selve nøkkelen.
  if (value.startsWith('sb_secret_')) return { problem: `${SUPABASE_ENV.publishableKey} inneholder en hemmelig nøkkel (sb_secret_…). Bruk den offentlige nøkkelen (sb_publishable_…). Hemmelige nøkler skal aldri i frontend.` };
  if (value.startsWith('sb_publishable_')) return { key: value };
  const role = jwtRole(value);
  if (role === 'service_role') return { problem: `${SUPABASE_ENV.publishableKey} inneholder en service_role-nøkkel. Den omgår all tilgangskontroll og skal aldri i frontend. Bruk den offentlige nøkkelen.` };
  if (role === 'anon') return { key: value };
  return { problem: `${SUPABASE_ENV.publishableKey} har ukjent format (forventet sb_publishable_… eller en eldre anon-JWT).` };
}

/** Validerer miljøvariablene. Returnerer alle problemer samlet, uten å kaste. */
export function readSupabaseConfig(env: Env): SupabaseConfigResult {
  const u = checkUrl(env[SUPABASE_ENV.url]);
  const k = checkKey(env[SUPABASE_ENV.publishableKey]);
  const problems = [u.problem, k.problem].filter((p): p is string => Boolean(p));
  if (problems.length > 0 || !u.url || !k.key) return { ok: false, problems };
  return { ok: true, config: { url: u.url, publishableKey: k.key } };
}

/** Konfigurasjonen fra Vite-miljøet (`import.meta.env`). */
export function supabaseConfigFromEnv(): SupabaseConfigResult {
  return readSupabaseConfig((import.meta.env ?? {}) as Env);
}
