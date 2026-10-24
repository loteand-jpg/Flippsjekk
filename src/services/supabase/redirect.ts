import { redirectErrorMessage } from './errors';
import type { RedirectResult } from '../types';

/**
 * Retur fra Google (OAuth med PKCE) til en SPA med hash-ruter.
 *
 * Supabase sender nettleseren tilbake til `redirectTo` med enten `?code=…` (vellykket, PKCE) eller feilparametere: `?error=…&error_code=…
 * &error_description=…` i spørringen OG i fragmentet (`#error=…`). Hash-ruteren ville tolket `#error=…` som en rute (404), og
 * `@supabase/supabase-js` lar feilparameterne stå i URL-en. Derfor leses utfallet her når siden lastes (før klienten og ruteren rekker
 * å røre det), feilparameterne fjernes fra adressen, og appen sender brukeren til innloggingssiden, som viser feilen eller – ved
 * suksess – sender videre når sesjonen er på plass (klienten bytter koden mot en sesjon selv, `detectSessionInUrl`).
 *
 * `redirectTo` er alltid denne siden uten hash og uten spørring. Den eksakte URL-en må være lagt til under «Redirect URLs» i
 * Supabase Auth (se docs/supabase.md).
 */
export interface ParsedRedirect {
  result: RedirectResult | null;
  /** Spørringen uten feilparametere. `code` beholdes (klienten trenger den). */
  cleanSearch: string;
  /** Må adressen skrives om (feilparametere fjernes)? */
  rewrite: boolean;
}

const ERROR_KEYS = ['error', 'error_code', 'error_description'] as const;

/** Ren funksjon (testbar): leser retur-utfallet fra `search` (f.eks. «?code=…») og `hash` (f.eks. «#error=…»). */
export function parseAuthRedirect(search: string, hash: string): ParsedRedirect {
  const query = new URLSearchParams(search);
  // Bare et fragment som ser ut som parametere (ikke en rute som «#/konto») kan være en Supabase-retur.
  const fragment = hash.startsWith('#') && hash.includes('=') && !hash.startsWith('#/') ? new URLSearchParams(hash.slice(1)) : new URLSearchParams();
  const pick = (key: string) => query.get(key) ?? fragment.get(key);

  const error = pick('error');
  const errorCode = pick('error_code');
  const hasError = Boolean(error || errorCode || pick('error_description'));
  if (hasError) {
    for (const k of ERROR_KEYS) query.delete(k);
    const rest = query.toString();
    return { result: { kind: 'error', message: redirectErrorMessage({ error, errorCode }) }, cleanSearch: rest ? `?${rest}` : '', rewrite: true };
  }
  if (query.has('code')) return { result: { kind: 'returned' }, cleanSearch: search, rewrite: false };
  return { result: null, cleanSearch: search, rewrite: false };
}

/** Leser utfallet fra nettleserens adresse og rydder bort feilparametere. Gjør ingenting utenfor nettleseren. */
export function readAuthRedirectFromLocation(loc: Pick<Location, 'pathname' | 'search' | 'hash'> | undefined = typeof window !== 'undefined' ? window.location : undefined, history?: Pick<History, 'replaceState' | 'state'>): RedirectResult | null {
  if (!loc) return null;
  const parsed = parseAuthRedirect(loc.search, loc.hash);
  if (parsed.rewrite) {
    try {
      // Hash settes til «#/logg-inn» av appen etterpå; her fjernes bare Supabase sine feilparametere fra adressen.
      (history ?? window.history).replaceState((history ?? window.history).state, '', `${loc.pathname}${parsed.cleanSearch}`);
    } catch {
      /* adressen er kosmetikk; utfallet er allerede lest */
    }
  }
  return parsed.result;
}

/** URL Supabase sender brukeren tilbake til etter Google: denne siden, uten hash og spørring. Bygges alltid ut fra gjeldende adresse. */
export function oauthRedirectUrl(loc: Pick<Location, 'origin' | 'pathname'> | undefined = typeof window !== 'undefined' ? window.location : undefined): string {
  if (!loc) return '';
  return `${loc.origin}${loc.pathname}`;
}
